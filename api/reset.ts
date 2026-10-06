import type { VercelRequest, VercelResponse } from '@vercel/node'
import { safeEq } from './inbound'
import { CONFIG } from '../lib/config'
import { logExec } from '../lib/execlog'
import { contactName, findContactByPhone, getContact } from '../lib/ghl'
import { podeResetar, resetar } from '../lib/reset'

/**
 * Reset de teste sem mandar mensagem no WhatsApp:
 *   POST /api/reset?secret=<WEBHOOK_SECRET>&contact_id=<id>
 *   POST /api/reset?secret=<WEBHOOK_SECRET>&phone=11999999999
 * Só contatos de teste (RESET_PHONES / TEST_CONTACT_IDS). Para outro contato: &forcar=1.
 * Faz o mesmo que mandar "reset" pelo WhatsApp: tags, CPF/CNPJ, memória e histórico.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'use POST' })
  if (!safeEq(String(req.headers['x-webhook-secret'] || req.query.secret || ''), CONFIG.webhookSecret)) return res.status(401).json({ error: 'unauthorized' })
  const id = String(req.query.contact_id || '')
  const phone = String(req.query.phone || '')
  const contato = id ? await getContact(id) : phone ? await findContactByPhone(phone) : null
  if (!contato) return res.status(404).json({ ok: false, error: 'contato não encontrado (passe contact_id ou phone)' })
  if (!podeResetar(contato) && req.query.forcar !== '1') return res.status(403).json({ ok: false, error: 'contato não é de teste (RESET_PHONES/TEST_CONTACT_IDS). Use &forcar=1 se tiver certeza.' })
  const detalhe = await resetar(contato.id)
  await logExec({ tipo: 'reset', leadId: contato.id, nome: contactName(contato), detalhe: `${detalhe} (via endpoint)` })
  return res.status(200).json({ ok: true, contactId: contato.id, detalhe })
}
