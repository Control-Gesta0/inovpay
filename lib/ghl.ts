import { CONFIG } from './config'

/**
 * Client da API do GHL (LeadConnector v2).
 * - Version 2021-07-28 em tudo, exceto conversa marcada como não lida (2021-04-15).
 * - User-Agent de browser sempre: sem ele o Cloudflare responde 403 "Error 1010".
 * - Retry com backoff 2/4/8s em 429 (~100 req/10s por location) e 5xx.
 *   O envio de mensagem NÃO repete em 5xx: um 502 pode ter enviado, e repetir
 *   duplicaria a mensagem pro lead.
 */

export const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

interface ReqOpts { version?: string; retries?: number; retry5xx?: boolean }

export async function ghl<T>(method: string, path: string, body?: unknown, opts: ReqOpts = {}): Promise<T> {
  const retries = opts.retries ?? 3
  const retry5xx = opts.retry5xx ?? true
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${CONFIG.ghlBaseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${CONFIG.ghlToken}`,
        Version: opts.version || '2021-07-28',
        Accept: 'application/json',
        'User-Agent': UA,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const text = await res.text()
    if (res.ok) return (text ? JSON.parse(text) : {}) as T
    const retryable = res.status === 429 || (retry5xx && res.status >= 500)
    if (retryable && attempt < retries) {
      await sleep(2000 * 2 ** attempt)
      continue
    }
    throw new Error(`GHL ${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`)
  }
}

const loc = () => encodeURIComponent(CONFIG.ghlLocationId)

// ---------- Contato ----------

export interface GhlCustomValue { id: string; value?: unknown; field_value?: unknown; fieldValue?: unknown }

export interface GhlContact {
  id: string
  firstName?: string
  lastName?: string
  name?: string
  contactName?: string
  phone?: string
  tags?: string[]
  customFields?: GhlCustomValue[]
  dateAdded?: string
}

export const contactName = (c: GhlContact) =>
  (c.contactName || c.name || [c.firstName, c.lastName].filter(Boolean).join(' ') || '').trim()

export const contactTags = (c: GhlContact) => (c.tags || []).map(t => String(t))

/**
 * GET /contacts/{id} às vezes devolve customFields: [] mesmo com dado (ghl §A.12).
 * Para LER campos, o POST /contacts/search é o confiável: fazemos os dois e juntamos.
 */
export async function getContact(contactId: string): Promise<GhlContact> {
  const r = await ghl<{ contact: GhlContact }>('GET', `/contacts/${encodeURIComponent(contactId)}`)
  const c = r.contact
  if (!c.customFields?.length) {
    try {
      const s = await ghl<{ contacts?: GhlContact[] }>('POST', '/contacts/search', {
        locationId: CONFIG.ghlLocationId, pageLimit: 1,
        filters: [{ field: 'id', operator: 'eq', value: contactId }],
      })
      const hit = s.contacts?.find(x => x.id === contactId)
      if (hit?.customFields?.length) c.customFields = hit.customFields
    } catch { /* leitura extra é best-effort */ }
  }
  return c
}

export function customValue(list: GhlCustomValue[] | undefined, id: string): string {
  const f = (list || []).find(v => v.id === id)
  if (!f) return ''
  const v = f.value ?? f.field_value ?? f.fieldValue
  return v == null ? '' : String(v).trim()
}

export async function updateContactFields(contactId: string, values: Array<{ id: string; value: unknown }>): Promise<void> {
  if (!values.length) return
  await ghl('PUT', `/contacts/${encodeURIComponent(contactId)}`, {
    customFields: values.map(v => ({ id: v.id, field_value: v.value, value: v.value })),
  })
}

/** Tags no GHL têm endpoint próprio de add/remove (não substitui o conjunto). */
export async function addContactTags(contactId: string, tags: string[]): Promise<void> {
  if (!tags.length) return
  await ghl('POST', `/contacts/${encodeURIComponent(contactId)}/tags`, { tags })
}

export async function removeContactTags(contactId: string, tags: string[]): Promise<void> {
  if (!tags.length) return
  await ghl('DELETE', `/contacts/${encodeURIComponent(contactId)}/tags`, { tags })
  // Prova: relê. Tag que "saiu com 200" e continua lá = IA que não desliga.
  const drop = new Set(tags.map(t => t.toLowerCase()))
  const still = contactTags(await getContact(contactId)).filter(t => drop.has(t.toLowerCase()))
  if (still.length) throw new Error(`tags não removidas do contato ${contactId}: ${still.join(', ')}`)
}

export async function addContactNote(contactId: string, body: string): Promise<void> {
  await ghl('POST', `/contacts/${encodeURIComponent(contactId)}/notes`, { body })
}

/** Contato pelo telefone (para o reset pelo endpoint). */
export async function findContactByPhone(phone: string): Promise<GhlContact | null> {
  const digits = phone.replace(/\D/g, '')
  if (!digits) return null
  const number = digits.startsWith('55') ? `+${digits}` : `+55${digits}`
  const r = await ghl<{ contact?: GhlContact | null }>('GET', `/contacts/search/duplicate?locationId=${loc()}&number=${encodeURIComponent(number)}`)
  return r.contact || null
}

// ---------- Conversa ----------

export interface GhlMessage {
  id: string
  direction?: 'inbound' | 'outbound' | string
  messageType?: string
  type?: number
  body?: string
  attachments?: string[]
  dateAdded?: string
  userId?: string
  source?: string
}

export async function findConversationId(contactId: string): Promise<string | null> {
  const r = await ghl<{ conversations?: Array<{ id: string }> }>('GET', `/conversations/search?locationId=${loc()}&contactId=${encodeURIComponent(contactId)}&limit=1`)
  return r.conversations?.[0]?.id || null
}

/** Últimas mensagens da conversa, da mais ANTIGA para a mais nova. */
export async function getConversationMessages(conversationId: string, limit = 40): Promise<GhlMessage[]> {
  const r = await ghl<{ messages?: { messages?: GhlMessage[] } | GhlMessage[] }>('GET', `/conversations/${encodeURIComponent(conversationId)}/messages?limit=${limit}`)
  const raw = Array.isArray(r.messages) ? r.messages : r.messages?.messages || []
  return [...raw].sort((a, b) => Date.parse(a.dateAdded || '') - Date.parse(b.dateAdded || ''))
}

/** Conversa NÃO lida: o time vê que tem atendimento esperando, mesmo com a última mensagem sendo da IA. */
export async function marcarNaoLida(conversationId: string | null): Promise<void> {
  if (!conversationId) return
  await ghl('PUT', `/conversations/${encodeURIComponent(conversationId)}`, { locationId: CONFIG.ghlLocationId, unreadCount: 1 }, { version: '2021-04-15' })
}

/** Envio de texto. Sem retry em 5xx (ver topo do arquivo). */
export async function sendMessage(contactId: string, message: string): Promise<{ messageId?: string; conversationId?: string }> {
  return ghl('POST', '/conversations/messages', { type: CONFIG.ghlChannel, contactId, message }, { retry5xx: false })
}

// ---------- Validação ----------

export interface GhlField { id: string; name: string; dataType: string; model?: string }

export async function listCustomFields(model: 'contact' | 'opportunity'): Promise<GhlField[]> {
  return (await ghl<{ customFields?: GhlField[] }>('GET', `/locations/${loc()}/customFields?model=${model}`)).customFields || []
}
