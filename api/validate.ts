import type { VercelRequest, VercelResponse } from '@vercel/node'
import { safeEq } from './inbound'
import { CONFIG } from '../lib/config'
import { CRM_MAP } from '../lib/crm-map'
import { ghl, listCustomFields } from '../lib/ghl'
import { loadPrompt } from '../lib/llm'
import { redis } from '../lib/redis'

/**
 * GET /api/validate?secret=<WEBHOOK_SECRET>
 * Prova o mapa contra o GHL VIVO antes de ligar (e depois de cada mudança na conta):
 * o GHL grava em campo apagado devolvendo 200, então campo errado = dado perdido sem erro.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!safeEq(String(req.headers['x-webhook-secret'] || req.query.secret || ''), CONFIG.webhookSecret)) return res.status(401).json({ error: 'unauthorized' })
  const checks: Array<{ item: string; ok: boolean; detalhe: string }> = []
  const add = (item: string, ok: boolean, detalhe: string) => checks.push({ item, ok, detalhe })

  try {
    const r = await ghl<{ location?: { name?: string } }>('GET', `/locations/${encodeURIComponent(CONFIG.ghlLocationId)}`)
    add('token GHL e location', true, r.location?.name || '(sem nome)')
  } catch (e) { add('token GHL e location', false, e instanceof Error ? e.message : String(e)) }

  try {
    const campos = await listCustomFields('contact')
    const f = campos.find(c => c.id === CRM_MAP.campoDocumento.id)
    add(`campo do contato "${CRM_MAP.campoDocumento.nome}"`, !!f && f.dataType === 'TEXT', f ? `${f.name} (${f.dataType})` : `id ${CRM_MAP.campoDocumento.id} NÃO existe mais`)
  } catch (e) { add('campos do contato', false, e instanceof Error ? e.message : String(e)) }

  try { add('redis', (await redis.ping()) === 'PONG', `prefixo ${CONFIG.redisPrefix}`) } catch (e) { add('redis', false, e instanceof Error ? e.message : String(e)) }
  try { add('prompt no bundle', loadPrompt().length > 1000, `${loadPrompt().length} caracteres`) } catch (e) { add('prompt no bundle', false, e instanceof Error ? e.message : String(e)) }
  add('gate', !!CONFIG.gateTag, `tag "${CONFIG.gateTag}", modo ${CONFIG.modoGate}`)
  add('contatos de teste para reset', CONFIG.resetPhones.length + CONFIG.testContactIds.length > 0, `${CONFIG.resetPhones.length} telefone(s), ${CONFIG.testContactIds.length} id(s)`)

  const ok = checks.every(c => c.ok)
  return res.status(ok ? 200 : 500).json({ ok, checks })
}
