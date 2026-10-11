import { CONFIG } from './config'
import { CRM_MAP } from './crm-map'
import { ghl } from './ghl'
import { k, redis } from './redis'

/**
 * CARD DE SUPORTE: na passagem de um cliente para a equipe de suporte, a IA
 * garante um card no funil "Suporte InovPay" (etapa "Entrou no suporte"). A
 * equipe move para "Em atendimento" e "Finalizado" e preenche Número do
 * chamado e Parceiro no card. A IA só cria; nunca move.
 *
 * Regra da skill (ghl §GHL-17): reaproveita 1 · cria quando 0 · trava com 2+,
 * contando só os cards abertos que ainda não chegaram em "Finalizado".
 * O funil é achado pelo NOME: enquanto ele não existir no GHL, nada acontece.
 */

export const MOTIVOS_SUPORTE = ['suporte_maquininha', 'estorno', 'estorno_anterior', 'portal_app', 'pediu_atendente'] as const

export type QualFunil = 'suporte' | 'comercial'

/** Cliente indo para o suporte → suporte ("pediu uma pessoa" só se já sabemos que é cliente). Não cliente qualificado → comercial. "Outro" não ganha card. */
export function qualFunil(motivo: string, tipo?: string): QualFunil | null {
  if ((MOTIVOS_SUPORTE as readonly string[]).includes(motivo) || (motivo === 'pediu_humano' && tipo === 'cliente')) return 'suporte'
  if (motivo === 'qualificacao_concluida') return 'comercial'
  return null
}
export const precisaCard = (motivo: string, tipo?: string) => qualFunil(motivo, tipo) === 'suporte'

export interface CardAberto { id: string; pipelineStageId: string }

export type Decisao = { acao: 'criar' } | { acao: 'reaproveitar'; id: string } | { acao: 'travar'; n: number }

/** Puro (testado): cards abertos do contato no funil → o que fazer. Card em "Finalizado" é chamado antigo. */
export function decidirCard(abertos: CardAberto[], etapaFinalId: string): Decisao {
  const vivos = abertos.filter(c => c.pipelineStageId !== etapaFinalId)
  if (!vivos.length) return { acao: 'criar' }
  if (vivos.length === 1) return { acao: 'reaproveitar', id: vivos[0].id }
  return { acao: 'travar', n: vivos.length }
}

export const nomeDoCard = (contato: string, motivo: string) => `${(contato || 'Contato').trim()} · ${motivo}`.slice(0, 120)

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()

export interface Funil { pipelineId: string; entradaId: string; finalId: string }

interface Pipeline { id: string; name: string; stages: Array<{ id: string; name: string }> }

/** Puro (testado): acha o funil e as etapas pelo nome, sem ligar para acento e maiúscula. */
export function acharFunil(pipelines: Pipeline[], cfg: { nome: string; entrada: string; final: string } = CRM_MAP.funilSuporte): Funil | null {
  const p = pipelines.find(x => norm(x.name) === norm(cfg.nome))
  if (!p) return null
  const etapa = (nome: string) => p.stages.find(s => norm(s.name) === norm(nome))?.id
  const entradaId = etapa(cfg.entrada) || p.stages[0]?.id
  // sem etapa final configurada (comercial): nenhum card aberto conta como "chamado antigo"
  const finalId = cfg.final ? etapa(cfg.final) || p.stages[p.stages.length - 1]?.id : ''
  return entradaId && (finalId || !cfg.final) ? { pipelineId: p.id, entradaId, finalId: finalId || '' } : null
}

const CFG: Record<QualFunil, { nome: string; entrada: string; final: string }> = { suporte: CRM_MAP.funilSuporte, comercial: CRM_MAP.funilComercial }
const cacheFunil: Partial<Record<QualFunil, { em: number; funil: Funil | null }>> = {}

export async function lerFunil(qual: QualFunil = 'suporte'): Promise<Funil | null> {
  const c = cacheFunil[qual]
  if (c && Date.now() - c.em < 5 * 60_000) return c.funil
  const r = await ghl<{ pipelines: Pipeline[] }>('GET', `/opportunities/pipelines?locationId=${encodeURIComponent(CONFIG.ghlLocationId)}`)
  cacheFunil[qual] = { em: Date.now(), funil: acharFunil(r.pipelines || [], CFG[qual]) }
  return cacheFunil[qual]!.funil
}

async function abertosDoContato(funil: Funil, contactId: string): Promise<CardAberto[]> {
  const q = new URLSearchParams({ location_id: CONFIG.ghlLocationId, pipeline_id: funil.pipelineId, contact_id: contactId, status: 'open', limit: '20' })
  const r = await ghl<{ opportunities?: Array<{ id: string; pipelineStageId: string; contactId?: string; contact?: { id?: string } }> }>('GET', `/opportunities/search?${q}`)
  // o filtro do GHL por contato já falhou em outras contas: confere de novo aqui
  return (r.opportunities || []).filter(o => (o.contactId || o.contact?.id) === contactId).map(o => ({ id: o.id, pipelineStageId: o.pipelineStageId }))
}

/** Garante o card e devolve o que aconteceu (vai para o diário). Nunca derruba a passagem. */
export async function garantirCard(qual: QualFunil, contactId: string, contato: string, motivo: string): Promise<string> {
  const funil = await lerFunil(qual)
  if (!funil) return `sem card: o funil "${CFG[qual].nome}" não existe no GHL`
  // trava curta: duas mensagens seguidas não podem criar dois cards
  if (!(await redis.set(k('card', qual, contactId), '1', { nx: true, ex: 60 }))) return 'card: outra execução já está cuidando'
  try {
    const d = decidirCard(await abertosDoContato(funil, contactId), funil.finalId)
    if (d.acao === 'reaproveitar') return `card: reaproveitado o que já estava aberto (${d.id})`
    if (d.acao === 'travar') return `card: NÃO criado, o contato já tem ${d.n} cards abertos em "${CFG[qual].nome}" (conferir duplicados)`
    try {
      const r = await ghl<{ opportunity?: { id: string } }>('POST', '/opportunities/', {
        locationId: CONFIG.ghlLocationId, pipelineId: funil.pipelineId, pipelineStageId: funil.entradaId,
        // comercial segue o padrão do funil (só o nome do contato); suporte leva o motivo
        name: qual === 'comercial' ? (contato || 'Contato').trim().slice(0, 120) : nomeDoCard(contato, motivo), status: 'open', contactId,
      }, { retry5xx: false })
      return `card: criado em "${CFG[qual].nome} › ${CFG[qual].entrada}" (${r.opportunity?.id || 'sem id'})`
    } catch (e) {
      // POST não se repete às cegas: relê o CRM antes de concluir que falhou
      const depois = await abertosDoContato(funil, contactId).catch(() => [])
      if (depois.some(c => c.pipelineStageId !== funil.finalId)) return 'card: criado (confirmado relendo o CRM)'
      throw e
    }
  } finally {
    await redis.del(k('card', qual, contactId))
  }
}
