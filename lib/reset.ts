import { CONFIG } from './config'
import { CRM_MAP } from './crm-map'
import { addContactTags, contactTags, getContact, removeContactTags, updateContactFields, type GhlContact } from './ghl'
import { k, redis } from './redis'

/**
 * RESET de teste: deixa o contato como se nunca tivesse falado com a IA.
 *  1. tira as tags que a IA coloca (atendimento-humano, em contato)
 *  2. põe a tag de gate (ia) de volta
 *  3. limpa o campo CPF/CNPJ (para testar a pergunta do documento)
 *  4. apaga a memória da IA no Redis
 *  5. grava o CORTE: o histórico anterior deixa de existir para a IA
 *
 * A conversa no GHL NÃO é apagada (ghl §A.6: conversa recriada faz o
 * "Customer Replied" falhar na 1ª mensagem). O corte tem o mesmo efeito para a IA.
 *
 * SÓ para contatos de teste (RESET_PHONES ou TEST_CONTACT_IDS): cliente que
 * digitar "reset" não muda nada.
 */

const digitos = (t: string | null | undefined) => String(t || '').replace(/\D/g, '')

export const ehComandoReset = (texto: string) => /^\s*#?reset\s*$/i.test(texto)

export function podeResetar(c: Pick<GhlContact, 'id' | 'phone'>, cfg = { ids: CONFIG.testContactIds, phones: CONFIG.resetPhones }): boolean {
  if (cfg.ids.includes(c.id)) return true
  const tel = digitos(c.phone)
  return !!tel && cfg.phones.some(t => {
    const d = digitos(t)
    return !!d && (d === tel || `55${d}` === tel || d === `55${tel}`)
  })
}

/** Chaves do Redis deste contato (todas com o prefixo do cliente). */
export const chavesDoContato = (contactId: string) =>
  ['state', 'done', 'token', 'lock', 'rl'].map(p => k(p, contactId))

export async function resetar(contactId: string): Promise<string> {
  const c = await getContact(contactId)
  const atuais = contactTags(c).map(t => t.toLowerCase())
  const tirar = [CONFIG.humanTag, CRM_MAP.tagEmContato].filter(t => atuais.includes(t))
  if (tirar.length) await removeContactTags(contactId, tirar)
  if (CONFIG.gateTag && !atuais.includes(CONFIG.gateTag)) await addContactTags(contactId, [CONFIG.gateTag])
  await updateContactFields(contactId, [{ id: CRM_MAP.campoDocumento.id, value: '' }])
  await redis.del(...chavesDoContato(contactId))
  // +1s: a confirmação do reset (enviada antes) também fica fora do histórico
  await redis.set(k('corte', contactId), String(Date.now() + 1000), { ex: 365 * 86400 })
  return `reset: tags tiradas [${tirar.join(', ') || 'nenhuma'}], tag "${CONFIG.gateTag}" colocada, CPF/CNPJ limpo, memória e histórico zerados`
}
