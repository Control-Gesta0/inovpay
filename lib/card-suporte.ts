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

/** Cliente indo para o suporte. "Pediu uma pessoa" só conta se já sabemos que é cliente. Comercial e "outro" não ganham card. */
export function precisaCard(motivo: string, tipo?: string): boolean {
  return (MOTIVOS_SUPORTE as readonly string[]).includes(motivo) || (motivo === 'pediu_humano' && tipo === 'cliente')
}

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
export function acharFunil(pipelines: Pipeline[], cfg = CRM_MAP.funilSuporte): Funil | null {
  const p = pipelines.find(x => norm(x.name) === norm(cfg.nome))
  if (!p) return null
  const etapa = (nome: string) => p.stages.find(s => norm(s.name) === norm(nome))?.id
  const entradaId = etapa(cfg.entrada) || p.stages[0]?.id
  const finalId = etapa(cfg.final) || p.stages[p.stages.length - 1]?.id
  return entradaId && finalId ? { pipelineId: p.id, entradaId, finalId } : null
}

let cacheFunil: { em: number; funil: Funil | null } | null = null

export async function lerFunil(): Promise<Funil | null> {
  if (cacheFunil && Date.now() - cacheFunil.em < 5 * 60_000) return cacheFunil.funil
  const r = await ghl<{ pipelines: Pipeline[] }>('GET', `/opportunities/pipelines?locationId=${encodeURIComponent(CONFIG.ghlLocationId)}`)
  cacheFunil = { em: Date.now(), funil: acharFunil(r.pipelines || []) }
  return cacheFunil.funil
}

async function abertosDoContato(funil: Funil, contactId: string): Promise<CardAberto[]> {
  const q = new URLSearchParams({ location_id: CONFIG.ghlLocationId, pipeline_id: funil.pipelineId, contact_id: contactId, status: 'open', limit: '20' })
  const r = await ghl<{ opportunities?: Array<{ id: string; pipelineStageId: string; contactId?: string; contact?: { id?: string } }> }>('GET', `/opportunities/search?${q}`)
  // o filtro do GHL por contato já falhou em outras contas: confere de novo aqui
  return (r.opportunities || []).filter(o => (o.contactId || o.contact?.id) === contactId).map(o => ({ id: o.id, pipelineStageId: o.pipelineStageId }))
}

/** Garante o card e devolve o que aconteceu (vai para o diário). Nunca derruba a passagem. */
export async function garantirCardSuporte(contactId: string, contato: string, motivo: string): Promise<string> {
  const funil = await lerFunil()
  if (!funil) return `sem card: o funil "${CRM_MAP.funilSuporte.nome}" ainda não existe no GHL`
  // trava curta: duas mensagens seguidas não podem criar dois cards
  if (!(await redis.set(k('card', contactId), '1', { nx: true, ex: 60 }))) return 'card: outra execução já está cuidando'
  try {
    const d = decidirCard(await abertosDoContato(funil, contactId), funil.finalId)
    if (d.acao === 'reaproveitar') return `card: reaproveitado o que já estava aberto (${d.id})`
    if (d.acao === 'travar') return `card: NÃO criado, o contato já tem ${d.n} cards abertos no suporte (conferir duplicados)`
    try {
      const r = await ghl<{ opportunity?: { id: string } }>('POST', '/opportunities/', {
        locationId: CONFIG.ghlLocationId, pipelineId: funil.pipelineId, pipelineStageId: funil.entradaId,
        name: nomeDoCard(contato, motivo), status: 'open', contactId,
      }, { retry5xx: false })
      return `card: criado em "${CRM_MAP.funilSuporte.entrada}" (${r.opportunity?.id || 'sem id'})`
    } catch (e) {
      // POST não se repete às cegas: relê o CRM antes de concluir que falhou
      const depois = await abertosDoContato(funil, contactId).catch(() => [])
      if (depois.some(c => c.pipelineStageId !== funil.finalId)) return 'card: criado (confirmado relendo o CRM)'
      throw e
    }
  } finally {
    await redis.del(k('card', contactId))
  }
}
