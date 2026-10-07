import { CONFIG } from './config'
import type { GhlEtapa } from './central-data'
import { CRM_MAP } from './crm-map'
import { ghl, listCustomFields } from './ghl'

/**
 * Confere o mapa contra o GHL AO VIVO (o GHL grava em campo apagado com 200 OK).
 * Usado pela Central: problema aqui nunca aparece como "saudável".
 */
export async function checkCrmMap(): Promise<{ problemas: string[]; etapas: GhlEtapa[] }> {
  const problemas: string[] = []
  let etapas: GhlEtapa[] = []

  try {
    const campos = await listCustomFields('contact')
    const f = campos.find(c => c.id === CRM_MAP.campoDocumento.id)
    if (!f) problemas.push(`O campo do contato "${CRM_MAP.campoDocumento.nome}" (${CRM_MAP.campoDocumento.id}) não existe mais: o CPF/CNPJ informado se perde sem aviso.`)
    else if (f.dataType !== 'TEXT') problemas.push(`O campo "${f.name}" mudou de tipo (${f.dataType}); a assistente grava texto.`)
  } catch (e) {
    problemas.push(`Não consegui ler os campos do contato: ${msg(e)}`)
  }

  try {
    const pd = await ghl<{ pipelines?: Array<{ id: string; name: string; stages: GhlEtapa[] }> }>(
      'GET', `/opportunities/pipelines?locationId=${encodeURIComponent(CONFIG.ghlLocationId)}`)
    const p = (pd.pipelines || []).find(x => x.id === CRM_MAP.pipeline.id)
    if (!p) problemas.push(`O pipeline "${CRM_MAP.pipeline.nome}" (${CRM_MAP.pipeline.id}) não existe mais.`)
    else etapas = p.stages || []
  } catch (e) {
    problemas.push(`Não consegui ler o pipeline: ${msg(e)}`)
  }

  return { problemas, etapas }
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 160)
