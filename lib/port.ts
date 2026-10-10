import { CONFIG } from './config'
import { CRM_MAP } from './crm-map'
import { garantirCardSuporte } from './card-suporte'
import { addContactNote, addContactTags, contactName, contactTags, customValue, getContact, marcarNaoLida, removeContactTags, updateContactFields } from './ghl'
import { getState, patchState, type Estado } from './state'

/**
 * Porta = tudo que as ferramentas fazem no mundo. Em produção, GHL + Redis.
 * No exame (evals), uma porta em memória: zero efeito no CRM.
 */
export interface Port {
  /** documento já gravado no campo CPF/CNPJ do contato ('' se vazio) */
  documento(): Promise<string>
  gravarDocumento(valor: string): Promise<void>
  tags(): Promise<string[]>
  addTags(tags: string[]): Promise<void>
  removeTags(tags: string[]): Promise<void>
  addNote(body: string): Promise<void>
  marcarNaoLida(): Promise<void>
  /** garante o card no funil de suporte; devolve o que aconteceu (vai para o diário) */
  cardSuporte(motivo: string): Promise<string>
  getState(): Promise<Estado>
  patchState(p: Partial<Estado>): Promise<Estado>
}

export function ghlPort(contactId: string, conversationId: string | null): Port {
  return {
    async documento() { return customValue((await getContact(contactId)).customFields, CRM_MAP.campoDocumento.id) },
    async gravarDocumento(valor) { await updateContactFields(contactId, [{ id: CRM_MAP.campoDocumento.id, value: valor }]) },
    async tags() { return contactTags(await getContact(contactId)).map(t => t.toLowerCase()) },
    async addTags(tags) { await addContactTags(contactId, tags) },
    async removeTags(tags) {
      const atuais = contactTags(await getContact(contactId)).map(t => t.toLowerCase())
      const tirar = tags.filter(t => atuais.includes(t.toLowerCase()))
      if (tirar.length) await removeContactTags(contactId, tirar)
    },
    async addNote(body) { await addContactNote(contactId, body) },
    async marcarNaoLida() { await marcarNaoLida(conversationId) },
    async cardSuporte(motivo) { return garantirCardSuporte(contactId, contactName(await getContact(contactId)), motivo) },
    getState: () => getState(contactId),
    patchState: p => patchState(contactId, p),
  }
}

export const GATE = () => CONFIG.gateTag
export const HUMANO = () => CONFIG.humanTag
