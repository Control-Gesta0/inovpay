import { findConversationId, getConversationMessages, sleep, type GhlMessage } from './ghl'
import { mediaKindFromUrl, mediaToText } from './media'
import { k, redis } from './redis'

/**
 * Histórico: no GHL a fonte da verdade é o PRÓPRIO CRM (o agente é stateless).
 * O Redis guarda só o que o GHL não guarda: a transcrição da mídia (feita UMA
 * vez), os ids do que a IA enviou (para distinguir humano × IA) e o CORTE do
 * reset de teste (a conversa no GHL nunca é apagada: ghl §A.6).
 *
 * Regras que vêm de cicatriz (ghl/PEGADINHAS):
 *  - ALLOWLIST de messageType: nota interna NUNCA entra no contexto (§A.11)
 *  - inbound vazio NÃO é descartado: vira "[mídia recebida sem texto]" (§A.3)
 *  - hidratação: o GHL processa o anexo DEPOIS do webhook → espera explícita
 */

export interface ChatMsg { id: string; dir: 'in' | 'out'; text: string; ts: number }

const TYPE_OK = /WHATSAPP|SMS|CUSTOM|LIVE_CHAT|INSTAGRAM|FACEBOOK/i
const TYPE_NUNCA = /INTERNAL|COMMENT|ACTIVITY|EMAIL|CALL|VOICEMAIL|REVIEW|NOTE/i
const TTL_S = 90 * 86400

export function isChatMessage(m: GhlMessage): boolean {
  if (m.messageType) return TYPE_OK.test(m.messageType) && !TYPE_NUNCA.test(m.messageType)
  return m.type === 19 || m.type === 2
}

/** Último inbound ainda "placeholder" (sem texto e sem anexo) = anexo não hidratado. */
export function lastInboundPending(msgs: GhlMessage[]): boolean {
  const last = [...msgs.filter(isChatMessage)].reverse().find(m => m.direction === 'inbound')
  return !!last && !(last.body || '').trim() && !(last.attachments || []).length
}

async function mediaText(m: GhlMessage, allowProcess: boolean): Promise<string> {
  const url = (m.attachments || [])[0]
  if (!url) return ''
  const cacheKey = k('midia', m.id)
  const cached = await redis.get<string>(cacheKey)
  if (cached) return cached
  const kind = mediaKindFromUrl(url)
  if (!allowProcess || !kind) return `[${kind === 'audio' ? 'áudio' : kind === 'image' ? 'imagem' : kind === 'video' ? 'vídeo' : 'arquivo'} enviado]`
  const text = await mediaToText(kind, url, '')
  await redis.set(cacheKey, text, { ex: TTL_S })
  return text
}

export async function toChatMsgs(raw: GhlMessage[], opts: { corteMs?: number } = {}): Promise<ChatMsg[]> {
  const out: ChatMsg[] = []
  const chat = raw.filter(isChatMessage).filter(m => !opts.corteMs || (Date.parse(m.dateAdded || '') || 0) >= opts.corteMs)
  const processarDesde = Math.max(0, chat.length - 6)
  for (let i = 0; i < chat.length; i++) {
    const m = chat[i]
    const dir: 'in' | 'out' = m.direction === 'inbound' ? 'in' : 'out'
    let text = (m.body || '').trim()
    if ((m.attachments || []).length) {
      const midia = dir === 'in' ? await mediaText(m, i >= processarDesde) : '[arquivo enviado]'
      text = text ? `${text}\n${midia}` : midia
    }
    if (!text) text = dir === 'in' ? '[mídia recebida sem texto]' : '[mensagem enviada por áudio ou arquivo aqui]'
    out.push({ id: m.id, dir, text, ts: Date.parse(m.dateAdded || '') || 0 })
  }
  return out
}

export interface Conversa { conversationId: string | null; raw: GhlMessage[]; msgs: ChatMsg[]; corteMs: number }

export const lerCorte = async (contactId: string) => Number(await redis.get<string>(k('corte', contactId))) || 0

/** Lê a conversa do GHL esperando a hidratação do anexo (backoff 12×2s ≈ 24s). */
export async function getHydratedHistory(contactId: string): Promise<Conversa> {
  const conversationId = await findConversationId(contactId)
  const corteMs = await lerCorte(contactId)
  if (!conversationId) return { conversationId: null, raw: [], msgs: [], corteMs }
  let raw = await getConversationMessages(conversationId)
  for (let i = 0; i < 12 && lastInboundPending(raw); i++) {
    await sleep(2000)
    raw = await getConversationMessages(conversationId)
  }
  return { conversationId, raw, msgs: await toChatMsgs(raw, { corteMs }), corteMs }
}

export function lastInbound(msgs: ChatMsg[]): ChatMsg | null {
  for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].dir === 'in') return msgs[i]
  return null
}

export async function alreadyAnswered(contactId: string, inboundId: string): Promise<boolean> {
  return (await redis.get<string>(k('done', contactId))) === inboundId
}

export async function markAnswered(contactId: string, inboundId: string): Promise<void> {
  await redis.set(k('done', contactId), inboundId, { ex: 86400 })
}

// ---------- Quem enviou: IA × humano ----------

export async function rememberSent(messageId: string | undefined): Promise<void> {
  if (messageId) await redis.set(k('enviada', messageId), '1', { ex: TTL_S })
}

const HUMANO_JANELA_MS = 6 * 3600 * 1000

/**
 * Uma pessoa do time respondeu pelo GHL nas últimas 6h? A IA recua.
 * Humano = outbound com userId que NÃO foi enviado pela IA.
 * Mensagem de workflow (bot antigo) não tem userId e não conta como humano.
 * `desdeMs`: o corte do reset (mensagem do time antes do reset não conta).
 */
export async function humanSpokeRecently(raw: GhlMessage[], now = Date.now(), desdeMs = 0): Promise<boolean> {
  const recentes = raw.filter(m => {
    const t = Date.parse(m.dateAdded || '') || 0
    return isChatMessage(m) && m.direction === 'outbound' && !!m.userId && now - t < HUMANO_JANELA_MS && t >= desdeMs
  })
  for (const m of recentes) {
    if (!(await redis.get(k('enviada', m.id)))) return true
  }
  return false
}
