import type { VercelRequest, VercelResponse } from '@vercel/node'
import { safeEq } from './inbound'
import {
  buildConversas, buildExecutionData, buildFunil, buildRecovery, type GhlOppResumo, type LiveData,
} from '../lib/central-data'
import { CONFIG } from '../lib/config'
import { CRM_MAP } from '../lib/crm-map'
import { checkCrmMap } from '../lib/crm-check'
import { readExecs } from '../lib/execlog'
import { ghl } from '../lib/ghl'

/**
 * Leitura da Central (painel). Só leitura, zero tokens.
 * GET /api/central?recurso=execucoes|live|recuperacao  (header x-central-secret)
 * Aceita CENTRAL_SECRET; sem ela, o WEBHOOK_SECRET (Central só da agência).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const provided = String(req.headers['x-central-secret'] || '')
  const segredos = [process.env.CENTRAL_SECRET, CONFIG.webhookSecret].filter(Boolean) as string[]
  if (!provided || !segredos.some(s => safeEq(provided, s))) return res.status(401).json({ error: 'unauthorized' })
  res.setHeader('Cache-Control', 'no-store')

  const recurso = String(req.query.recurso || '')
  try {
    if (recurso === 'execucoes') return res.status(200).json(await execucoes())
    if (recurso === 'live') return res.status(200).json(await live())
    if (recurso === 'recuperacao') return res.status(200).json(buildRecovery())
    return res.status(400).json({ error: 'recurso inválido (execucoes | live | recuperacao)' })
  } catch (e) {
    return res.status(500).json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) })
  }
}

async function execucoes() {
  return buildExecutionData(await readExecs(2000), CONFIG.usdBrl, CONFIG.llmModel, Date.now(), CONFIG.ghlLocationId)
}

async function live(): Promise<LiveData> {
  const base = buildConversas((await execucoes()).execucoes)
  const problemas: string[] = []
  let opps: GhlOppResumo[] = []
  // Fail-closed: CRM que não responde vira atenção, nunca "saudável"
  const mapa = await checkCrmMap()
  problemas.push(...mapa.problemas)
  if (mapa.etapas.length) {
    try {
      opps = await oportunidades()
    } catch (e) {
      problemas.push(`O CRM não respondeu à leitura do funil: ${(e instanceof Error ? e.message : String(e)).slice(0, 160)}`)
    }
  }
  return {
    geradoEm: new Date().toISOString(),
    ...base,
    pipeline: { nome: CRM_MAP.pipeline.nome },
    ...buildFunil(mapa.etapas, opps, CONFIG.gateTag),
    regras: {
      modoGate: CONFIG.modoGate, gateTag: CONFIG.gateTag, humanTag: CONFIG.humanTag,
      expediente: `segunda a sexta, das ${CRM_MAP.expediente.inicio}h às ${CRM_MAP.expediente.fim}h`,
    },
    saude: { crmOk: problemas.length === 0, problemas },
  }
}

async function oportunidades(): Promise<GhlOppResumo[]> {
  const out: GhlOppResumo[] = []
  for (let page = 1; page <= 10; page++) {
    const d = await ghl<{ opportunities?: GhlOppResumo[] }>('GET',
      `/opportunities/search?location_id=${encodeURIComponent(CONFIG.ghlLocationId)}&pipeline_id=${CRM_MAP.pipeline.id}&status=all&limit=100&page=${page}`)
    const lote = d.opportunities || []
    out.push(...lote)
    if (lote.length < 100) break
  }
  return out
}
