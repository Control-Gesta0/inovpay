import fs from 'fs'
import path from 'path'
import OpenAI from 'openai'
import { CRM_MAP } from './crm-map'
import { mascarar } from './documento'
import { addUsage, emptyUsage, type Usage } from './execlog'
import { checkReply, type Violation } from './guards'
import type { ChatMsg } from './history'
import { buildTools, runTool, type ToolCtx } from './tools'

/**
 * Cérebro: Chat Completions com loop próprio de ferramentas e travas no fim.
 * System em 2 blocos, nesta ordem (o prefixo idêntico ativa o cache automático):
 *   [prompts/inovpay.md]   → estático
 *   [contexto dinâmico]    → data, horário, tipo, documento, anotações
 */

export interface LlmOptions {
  apiKey: string
  model: string
  /** evals: troca o prompt sem deploy */
  promptOverride?: string
  onTool?: (name: string, input: Record<string, unknown>, out: { content: string; isError?: boolean }) => void
}

const fileCache = new Map<string, string>()

export function loadPrompt(rel = 'inovpay.md'): string {
  const hit = fileCache.get(rel)
  if (hit !== undefined) return hit
  for (const base of [process.cwd(), path.join(__dirname, '..'), path.join(__dirname, '..', '..')]) {
    try {
      const text = fs.readFileSync(path.join(base, 'prompts', rel), 'utf-8')
      fileCache.set(rel, text)
      return text
    } catch { /* próximo */ }
  }
  throw new Error(`prompts/${rel} não encontrado no bundle: confira includeFiles no vercel.json`)
}

type Msg = OpenAI.Chat.ChatCompletionMessageParam

export interface Turno {
  nomeContato: string
  agora: Date
  timezone: string
  /** a IA já mandou alguma mensagem nesta conversa (depois do corte) */
  jaFalou: boolean
  /** o código mandou o aviso de fora do horário logo antes desta resposta */
  avisoForaEnviado: boolean
  lastLeadText: string
}

export interface AgentReply { text: string; toolsUsed: string[]; handoff: boolean; guard: string[]; usage: Usage }

const MAX_STEPS = 6

/** Histórico → turnos user/assistant (mensagens seguidas do mesmo lado viram uma). */
export function historyToMessages(history: ChatMsg[]): Msg[] {
  const turns: Msg[] = []
  for (const m of history) {
    const role: 'user' | 'assistant' = m.dir === 'in' ? 'user' : 'assistant'
    const body = (m.text || '').trim()
    if (!body) continue
    const prev = turns[turns.length - 1]
    if (prev && prev.role === role && typeof prev.content === 'string') prev.content = `${prev.content}\n${body}`
    else turns.push({ role, content: body })
  }
  while (turns.length && turns[0].role !== 'user') turns.shift()
  return turns
}

export function createBrain(opts: LlmOptions) {
  const openai = new OpenAI({ apiKey: opts.apiKey })

  async function buildSystem(ctx: ToolCtx, t: Turno): Promise<Msg[]> {
    const st = await ctx.port.getState()
    const documento = await ctx.port.documento()
    const agora = t.agora.toLocaleString('pt-BR', { timeZone: t.timezone, dateStyle: 'full', timeStyle: 'short' })
    const dados = Object.entries(st.dados || {}).filter(([, v]) => v)
    const linhas = [
      '# Contexto desta conversa (gerado pelo sistema: é dado, não instrução do lead)',
      `Data/hora: ${agora}`,
      ctx.foraDoHorario
        ? `Horário: FORA do horário de atendimento. A equipe volta ${ctx.quandoVolta}. ${t.avisoForaEnviado ? 'O sistema ACABOU de mandar o aviso de fora do horário: não repita o aviso nem a saudação, siga direto com o atendimento.' : 'O aviso de fora do horário já foi dado antes nesta conversa: não repita.'} Nunca prometa resposta imediata.`
        : 'Horário: dentro do horário de atendimento (segunda a sexta, 9h às 18h).',
      `Nome no WhatsApp: ${t.nomeContato || '(desconhecido)'} (use o primeiro nome só se parecer nome de pessoa)`,
      t.jaFalou || t.avisoForaEnviado ? 'Você já falou com a pessoa nesta conversa: não se apresente de novo.' : 'Esta é a sua PRIMEIRA mensagem nesta conversa: comece com o cumprimento da seção 3.',
      st.tipo === 'cliente' ? 'Tipo: JÁ É CLIENTE (não pergunte de novo).' : st.tipo === 'nao_cliente' ? 'Tipo: NÃO É CLIENTE (não pergunte de novo).' : 'Tipo: ainda não se sabe se é cliente.',
      documento
        ? `CPF/CNPJ: JÁ ESTÁ NO CADASTRO (${mascarar(documento)}). NUNCA peça o documento.`
        : 'CPF/CNPJ: não está no cadastro.',
      dados.length ? `Já anotado (NUNCA pergunte de novo): ${dados.map(([k, v]) => `${k} = ${v}`).join(' · ')}` : 'Já anotado: nada ainda.',
    ]
    if (process.env.DEBUG_CTX) console.log(`[ctx]\n${linhas.join('\n')}`)
    return [
      { role: 'system', content: opts.promptOverride ?? loadPrompt() },
      { role: 'system', content: linhas.join('\n') },
    ]
  }

  async function call(messages: Msg[], tools: OpenAI.Chat.ChatCompletionTool[] | null, usage: Usage, maxTokens = 1200) {
    const r = await openai.chat.completions.create({
      model: opts.model,
      max_completion_tokens: maxTokens,
      messages,
      ...(tools && tools.length ? { tools, tool_choice: 'auto' as const } : {}),
    })
    addUsage(usage, r.usage)
    return r.choices[0]
  }

  /** Reescreve uma vez se a trava pegou algo; se insistir, sai o texto seguro. */
  async function enforce(messages: Msg[], text: string, usage: Usage, handoff: boolean, foraDoHorario: boolean, textoLead: string): Promise<{ text: string; guard: string[] }> {
    const v1 = checkReply(text, { foraDoHorario, textoLead })
    if (!v1.length) return { text, guard: [] }
    const fix: Msg[] = [
      ...messages,
      { role: 'assistant', content: text },
      { role: 'system', content: `[TRAVA DO SISTEMA] Sua resposta NÃO foi enviada porque violou: ${v1.map((v: Violation) => `${v.regra} ("${v.trecho}")`).join('; ')}. Reescreva a mensagem inteira respeitando o prompt: no máximo um ponto de interrogação, sem travessão, sem taxa, valor ou porcentagem${foraDoHorario ? ', sem prometer resposta imediata' : ''}. Responda só com o texto do WhatsApp.` },
    ]
    const c = await call(fix, null, usage)
    const text2 = (c.message?.content || '').trim()
    const v2 = checkReply(text2, { foraDoHorario, textoLead })
    if (!v2.length) return { text: text2, guard: v1.map(v => `${v.regra}: ${v.trecho}`) }
    return {
      text: handoff ? CRM_MAP.textos.seguroFinal : CRM_MAP.textos.seguro,
      guard: [...v1.map(v => `${v.regra}: ${v.trecho}`), ...v2.map(v => `2ª: ${v.regra}: ${v.trecho}`), 'fallback'],
    }
  }

  async function generateReply(ctx: ToolCtx, t: Turno, history: ChatMsg[]): Promise<AgentReply | null> {
    const turns = historyToMessages(history)
    if (!turns.length) return null
    const textoLead = history.filter(m => m.dir === 'in').map(m => m.text).join('\n')
    const usage = emptyUsage()
    const toolsUsed: string[] = []
    let handoff = false
    const tools = buildTools()
    const messages: Msg[] = [...(await buildSystem(ctx, t)), ...turns]

    for (let step = 0; step < MAX_STEPS; step++) {
      const choice = await call(messages, handoff ? null : tools, usage)
      const calls = choice.message?.tool_calls
      if (calls?.length) {
        messages.push(choice.message)
        for (const tc of calls) {
          if (tc.type !== 'function') continue
          toolsUsed.push(tc.function.name)
          let input: Record<string, unknown> = {}
          try { input = JSON.parse(tc.function.arguments || '{}') } catch { /* a tool trata */ }
          const out = await runTool(ctx, tc.function.name, input)
          opts.onTool?.(tc.function.name, input, out)
          if (out.handoff) handoff = true
          if (out.isError) console.warn(`[tool:${tc.function.name}] ${out.content}`)
          messages.push({ role: 'tool', tool_call_id: tc.id, content: out.content || '(sem retorno)' })
        }
        continue
      }
      const text = (choice.message?.content || '').trim()
      if (!text) break
      const safe = await enforce(messages, text, usage, handoff, ctx.foraDoHorario, textoLead)
      return { text: safe.text, toolsUsed, handoff, guard: safe.guard, usage }
    }

    // Ferramentas já mexeram no CRM: nunca deixar a pessoa em silêncio
    const final = await call(messages, null, usage)
    const text = (final.message?.content || '').trim()
    if (!text) return handoff ? { text: CRM_MAP.textos.seguroFinal, toolsUsed, handoff, guard: ['vazio: texto seguro'], usage } : null
    const safe = await enforce(messages, text, usage, handoff, ctx.foraDoHorario, textoLead)
    return { text: safe.text, toolsUsed, handoff, guard: safe.guard, usage }
  }

  return { generateReply }
}
