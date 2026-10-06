import { adoptToken, currentToken, debounceAndClaim, releaseLock, renewLock } from './buffer'
import { CONFIG } from './config'
import { CRM_MAP } from './crm-map'
import { logExec } from './execlog'
import { addContactTags, contactName, contactTags, getContact, sendMessage } from './ghl'
import { ehAutoResposta } from './guards'
import { alreadyAnswered, getHydratedHistory, humanSpokeRecently, lastInbound, markAnswered, rememberSent, type ChatMsg } from './history'
import { dentroDoHorario, proximaAbertura, quandoVolta } from './horario'
import { createBrain } from './llm'
import { ghlPort } from './port'
import { k, redis } from './redis'
import { ehComandoReset, podeResetar, resetar } from './reset'
import { getState, patchState } from './state'
import type { ToolCtx } from './tools'

/**
 * Núcleo: reset de teste → gate → buffer → histórico do GHL → aviso de fora do
 * horário (código) → cérebro com ferramentas → travas → envio.
 */

const MAX_ROUNDS = 3

let brain: ReturnType<typeof createBrain> | null = null
const getBrain = () => (brain ||= createBrain({ apiKey: CONFIG.openaiApiKey, model: CONFIG.llmModel }))

/** Bloco atual do lead: mensagens dele depois da última mensagem enviada. */
export function blocoAtual(history: ChatMsg[]): ChatMsg[] {
  const i = history.map(m => m.dir).lastIndexOf('out')
  return history.slice(i + 1).filter(m => m.dir === 'in')
}

/** Grupo de WhatsApp: a IA nunca responde. */
export function ehGrupo(c: { tags?: string[]; phone?: string | null }): boolean {
  return (c.tags || []).some(t => t.toLowerCase() === 'whatsapp group') || /^\+?120363/.test(c.phone || '')
}

/** Envia pelo GHL e guarda o id (para saber depois que foi a IA, não um humano). */
export async function enviar(contactId: string, text: string): Promise<string> {
  const body = text.trim()
  if (!body) throw new Error('resposta vazia: nada enviado')
  const r = await sendMessage(contactId, body)
  await rememberSent(r.messageId)
  return `enviado (${r.messageId || 'sem id'})`
}

export async function processContact(contactId: string, webhookId: string): Promise<void> {
  const t0 = Date.now()
  let lockOwner: string | undefined
  let nome = ''
  const pular = async (motivo: string, registrar = true) => {
    console.log(`[agente] PULOU ${contactId} (${nome}): ${motivo}`)
    if (registrar) await logExec({ tipo: 'pulou', leadId: contactId, nome, detalhe: motivo })
  }
  try {
    const contato = await getContact(contactId)
    nome = contactName(contato)

    // Reset de teste: antes do gate (o contato de teste pode estar sem a tag depois de uma passagem)
    if (podeResetar(contato)) {
      const conv = await getHydratedHistory(contactId)
      const alvo = lastInbound(conv.msgs)
      if (alvo && ehComandoReset(alvo.text) && await redis.set(k('reset', alvo.id), '1', { nx: true, ex: 86400 })) {
        try { await enviar(contactId, CRM_MAP.textos.reset) } catch (e) { console.warn('[reset] confirmação não saiu:', e) }
        const detalhe = await resetar(contactId)
        await logExec({ tipo: 'reset', leadId: contactId, nome, detalhe })
        return
      }
    }

    const tags = contactTags(contato).map(t => t.toLowerCase())
    if (tags.includes(CONFIG.humanTag)) return pular(`tag "${CONFIG.humanTag}"`, false)
    if (ehGrupo(contato)) return pular('grupo de WhatsApp', false)
    if (CONFIG.modoGate === 'desligada') return pular('IA desligada (MODO_GATE)', false)
    if (CONFIG.modoGate === 'tag' && !tags.includes(CONFIG.gateTag)) return pular(`sem a tag "${CONFIG.gateTag}"`, false)

    const claim = await debounceAndClaim(contactId, webhookId)
    if (!claim.proceed) { console.log(`[debounce] ${contactId}: ${claim.reason}`); return }
    lockOwner = claim.lockOwner
    let myToken = webhookId

    for (let round = 0; round < MAX_ROUNDS; round++) {
      await renewLock(contactId, lockOwner!)
      const conv = await getHydratedHistory(contactId)
      const target = lastInbound(conv.msgs)
      if (!target) return pular('nenhuma mensagem do lead no histórico (depois do corte)')
      if (await alreadyAnswered(contactId, target.id)) return
      if (await humanSpokeRecently(conv.raw, Date.now(), conv.corteMs)) return pular('uma pessoa da equipe respondeu nas últimas 6h: a IA não atropela')

      const bloco = blocoAtual(conv.msgs)
      const textoTurno = bloco.map(m => m.text).join('\n')
      if (bloco.length && bloco.every(m => ehAutoResposta(m.text))) {
        await markAnswered(contactId, target.id)
        return pular('resposta automática do WhatsApp do lead: ignorada')
      }

      let state = await getState(contactId)
      // A tag de gate voltou depois de uma passagem (a equipe devolveu para a IA): novo ciclo, mantém o tipo
      if (state.finalizado) state = await patchState(contactId, { finalizado: undefined, dados: {} })

      const agora = new Date()
      const fora = !dentroDoHorario(agora, CONFIG.timezone)
      const volta = quandoVolta(agora, CONFIG.timezone)

      // Aviso de fora do horário: CÓDIGO, uma vez por período fechado; depois a triagem segue normal
      let avisoForaEnviado = false
      if (fora) {
        const abre = proximaAbertura(agora, CONFIG.timezone).getTime()
        if (state.avisoForaAte !== abre) {
          await enviar(contactId, CRM_MAP.textos.foraDoHorario(volta))
          state = await patchState(contactId, { avisoForaAte: abre })
          avisoForaEnviado = true
          await logExec({ tipo: 'aviso', leadId: contactId, nome, detalhe: `fora do horário: equipe volta ${volta}` })
        }
      }

      // Tag "em contato" (a automação antiga colocava em todo atendimento): uma vez
      if (!state.emContato) {
        if (!tags.includes(CRM_MAP.tagEmContato)) {
          try { await addContactTags(contactId, [CRM_MAP.tagEmContato]) } catch (e) { console.warn(`[agente] ${contactId}: tag em contato falhou:`, e) }
        }
        state = await patchState(contactId, { emContato: true })
      }

      const ctx: ToolCtx = {
        port: ghlPort(contactId, conv.conversationId),
        gateTag: CONFIG.gateTag, humanTag: CONFIG.humanTag,
        foraDoHorario: fora, quandoVolta: volta,
      }
      const reply = await getBrain().generateReply(ctx, {
        nomeContato: nome, agora, timezone: CONFIG.timezone,
        jaFalou: conv.msgs.some(m => m.dir === 'out'), avisoForaEnviado, lastLeadText: textoTurno,
      }, conv.msgs)
      if (!reply?.text) {
        await logExec({ tipo: 'erro', leadId: contactId, nome, detalhe: 'modelo não gerou resposta' })
        return
      }

      // Chegou mensagem nova durante a geração? Reprocessa com o contexto novo
      // (exceto se a IA já passou para a equipe: a despedida precisa sair)
      const tok = await currentToken(contactId)
      if (tok && tok !== myToken && !reply.handoff) {
        myToken = tok
        await adoptToken(contactId, myToken)
        continue
      }

      const detail = await enviar(contactId, reply.text)
      await markAnswered(contactId, target.id)
      if (!state.saudou) await patchState(contactId, { saudou: true })
      await logExec({
        tipo: reply.handoff ? 'passou' : 'resposta', leadId: contactId, nome, ms: Date.now() - t0,
        tools: reply.toolsUsed, guard: reply.guard, usage: reply.usage, detalhe: detail,
      })
      console.log(`[agente] RESPONDEU ${contactId} em ${Date.now() - t0}ms · tools: ${reply.toolsUsed.join(', ') || 'nenhuma'}${reply.guard.length ? ` · trava: ${reply.guard.join(' | ')}` : ''}`)
      return
    }
    await pular('MAX_ROUNDS: mensagens chegando rápido demais, o próximo webhook responde')
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 300)
    console.error(`[agente] ERRO ${contactId} após ${Date.now() - t0}ms: ${msg}`, e)
    await logExec({ tipo: 'erro', leadId: contactId, nome, ms: Date.now() - t0, detalhe: msg })
  } finally {
    await releaseLock(contactId, lockOwner)
  }
}
