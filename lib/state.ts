import { k, redis } from './redis'

/**
 * Estado da conversa (o que o modelo NÃO decide sozinho a cada turno).
 * Fica no Redis por 90 dias; o reset apaga.
 */

export type TipoContato = 'cliente' | 'nao_cliente'

/** Campos que o agente anota para a passagem ao humano (vão para a nota interna). */
export const CAMPOS_ANOTACAO = [
  'assunto',
  'estado_maquininha',
  'descricao',
  'venda_de_hoje',
  'data_venda',
  'valor_venda',
  'comprovante',
  'tema_portal',
  'repasse',
  'forma_repasse',
  'recebedores',
  'volume_mensal',
  'bitributacao',
  'decisor',
  'pedido_extra',
] as const
export type CampoAnotacao = typeof CAMPOS_ANOTACAO[number]

export interface Estado {
  tipo?: TipoContato
  dados?: Partial<Record<CampoAnotacao, string>>
  /** a IA já mandou a primeira mensagem nesta conversa */
  saudou?: boolean
  /** próxima abertura do expediente já avisada (o aviso de fora do horário sai uma vez por período) */
  avisoForaAte?: number
  /** a IA já colocou a tag "em contato" */
  emContato?: boolean
  /** passou para o humano */
  finalizado?: { motivo: string; em: string; resumo: string }
}

const TTL = 90 * 86400

export async function getState(contactId: string): Promise<Estado> {
  return (await redis.get<Estado>(k('state', contactId))) || {}
}

export async function patchState(contactId: string, patch: Partial<Estado>): Promise<Estado> {
  const next = { ...(await getState(contactId)), ...patch }
  await redis.set(k('state', contactId), next, { ex: TTL })
  return next
}
