import fs from 'fs'
import path from 'path'
import OpenAI from 'openai'
import { renderPrompt, trouxeTexto, type ItemId } from './base-core'
import { CRM_MAP } from './crm-map'
import { mascarar } from './documento'
import { addUsage, emptyUsage, type Usage } from './execlog'
import { checkReply, comAvisoPrivacidade, soUltimaPergunta, type Violation } from './guards'
import type { ChatMsg } from './history'
import { perguntaEsperada, proximoPasso, respostaDoRoteiro } from './roteiro'
import { comRespostaDePreco, pediuPessoa, perguntouPreco, respondeuPreco, tipoDoTurno } from './tipo'
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
  /** evals e laboratório: troca o prompt sem deploy (já renderizado) */
  promptOverride?: string
  onTool?: (name: string, input: Record<string, unknown>, out: { content: string; isError?: boolean }) => void
}

const fileCache = new Map<string, string>()

/** O prompt com a base padrão (sem os marcadores <!-- base:… -->). */
export function promptPadrao(): string {
  return renderPrompt(loadPrompt())
}

/** O arquivo cru (template com os marcadores da base de dados). */
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

const PEDEM_ACAO = ['texto corrompido', 'não perguntou se é cliente', 'prometeu passagem sem passar']
const DICA_ACAO: Record<string, string> = {
  'texto corrompido': 'você escreveu JSON ou chamada de ferramenta como texto; para usar uma ferramenta, chame a função de verdade.',
  'não perguntou se é cliente': 'ainda não se sabe se a pessoa é cliente: pergunte "Você já é cliente da InovPay?" (se ela pediu para falar com uma pessoa, chame passar_para_humano(pediu_humano) em vez de perguntar).',
  'prometeu passagem sem passar': 'você disse que ia passar, encaminhar ou registrar para a equipe sem chamar passar_para_humano. Se é hora de passar, chame passar_para_humano agora; se não é, não prometa e siga o roteiro.',
}

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

/** Textos longos da base que não devem sair duas vezes seguidas (a pessoa já recebeu). */
const TEXTOS_LONGOS: ItemId[] = ['estorno_passos', 'portal_split', 'portal_beneficiarios', 'portal_boleto', 'portal_relatorio', 'portal_comprovante']

/** A última mensagem da IA já trazia este texto da base e a nova traz de novo (laboratório, 08/10/2026). */
export function repetiuTexto(ctx: Pick<ToolCtx, 'textos' | 'ultimaIa'>, text: string): Violation[] {
  const tx = ctx.textos
  const ultima = ctx.ultimaIa || ''
  if (!tx || !ultima) return []
  const id = TEXTOS_LONGOS.find(i => tx[i] && trouxeTexto(text, tx[i]!) && trouxeTexto(ultima, tx[i]!))
  return id ? [{ regra: 'repetiu o mesmo texto', trecho: `${id}: a pessoa acabou de receber; responda o que ela disse agora, sem mandar de novo` }] : []
}

/**
 * Estorno: o passo a passo da maquininha só serve para venda de HOJE. Sem a pessoa ter dito
 * quando foi, a assistente pergunta antes (exame de 08/10/2026: às vezes mandava direto).
 */
export function passoAPassoCedo(ctx: Pick<ToolCtx, 'textos'>, dados: Record<string, string | undefined> | undefined, text: string, textoLead: string): Violation[] {
  const passos = ctx.textos?.estorno_passos
  if (!passos || dados?.venda_de_hoje) return []
  if (/\b(hoje|ontem|anteontem|semana|m[eê]s passado|dia \d{1,2}|\d{1,2}\/\d{1,2})\b/i.test(textoLead)) return []
  return trouxeTexto(text, passos) ? [{ regra: 'passo a passo antes de saber se a venda é de hoje', trecho: 'pergunte primeiro: "O estorno é de uma venda feita hoje?"' }] : []
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
      pediuPessoa(t.lastLeadText) && !st.finalizado
        ? (st.tipo === 'cliente' && /atendente/i.test(ctx.ultimaIa || '') && !st.dados?.assunto
          ? 'PRÓXIMO PASSO: escolheu falar com um atendente na lista de assuntos. Peça em uma linha qual é o assunto (seção 4.4) e depois chame passar_para_humano(pediu_atendente).'
          : 'PRÓXIMO PASSO: a pessoa pediu para falar com uma pessoa. Chame passar_para_humano(pediu_humano) AGORA, sem fazer nenhuma pergunta.')
        : proximoPasso(st, !!documento, !!ctx.jaPediuDocumento),
      perguntouPreco(t.lastLeadText) ? 'ATENÇÃO: a pessoa perguntou de taxa, preço ou condição. COMECE a resposta dizendo, em uma frase, que a equipe passa essas informações certinho (sem número nenhum), anote com anotar(pedido_extra) e só depois faça o próximo passo.' : '',
      'As ferramentas devolvem o próximo passo atualizado: siga o que elas disserem.',
    ].filter(Boolean)
    if (process.env.DEBUG_CTX) console.log(`[ctx]\n${linhas.join('\n')}`)
    return [
      { role: 'system', content: opts.promptOverride ?? ctx.prompt ?? promptPadrao() },
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
  async function enforce(ctx: ToolCtx, messages: Msg[], text: string, usage: Usage, handoff: boolean, textoLead: string): Promise<{ text: string; guard: string[] }> {
    const foraDoHorario = ctx.foraDoHorario
    const st = await ctx.port.getState()
    const tipoDesconhecido = !st.tipo
    const tipoConhecido = !tipoDesconhecido
    const extra = (t: string) => [...repetiuTexto(ctx, t), ...(handoff ? [] : passoAPassoCedo(ctx, st.dados, t, textoLead))]
    const v1 = [...checkReply(text, { foraDoHorario, textoLead, handoff, tipoDesconhecido, tipoConhecido }), ...extra(text)]
    if (!v1.length) return { text, guard: [] }
    const fix: Msg[] = [
      ...messages,
      { role: 'assistant', content: text },
      { role: 'system', content: `[TRAVA DO SISTEMA] Sua resposta NÃO foi enviada porque violou: ${v1.map((v: Violation) => `${v.regra} ("${v.trecho}")`).join('; ')}. Reescreva a mensagem inteira respeitando o prompt: no máximo um ponto de interrogação, sem travessão, sem taxa, valor ou porcentagem${foraDoHorario ? ', sem prometer resposta imediata' : ''}${handoff ? '' : ', sem dizer que vai encaminhar ou passar para a equipe (isso só vale depois de chamar passar_para_humano)'}. Siga o PRÓXIMO PASSO do contexto. Responda só com o texto do WhatsApp.` },
    ]
    const c = await call(fix, null, usage)
    const text2 = (c.message?.content || '').trim()
    const v2 = [...checkReply(text2, { foraDoHorario, textoLead, handoff, tipoDesconhecido, tipoConhecido }), ...extra(text2)]
    if (!v2.length) return { text: text2, guard: v1.map(v => `${v.regra}: ${v.trecho}`) }
    // Só sobrou "mais de uma pergunta": corta as perguntas anteriores em vez de mandar o texto genérico
    if (v2.every(v => v.regra === 'mais de uma pergunta')) {
      const cortado = soUltimaPergunta(text2)
      if (cortado.length >= 15 && !checkReply(cortado, { foraDoHorario, textoLead, handoff, tipoDesconhecido, tipoConhecido }).length) {
        return { text: cortado, guard: [...v1.map(v => `${v.regra}: ${v.trecho}`), 'uma pergunta: cortado em código'] }
      }
    }
    return {
      text: handoff ? CRM_MAP.textos.seguroFinal : CRM_MAP.textos.seguro,
      guard: [...v1.map(v => `${v.regra}: ${v.trecho}`), ...v2.map(v => `2ª: ${v.regra}: ${v.trecho}`), 'fallback'],
    }
  }

  async function generateReply(ctx: ToolCtx, t: Turno, history: ChatMsg[]): Promise<AgentReply | null> {
    const turns = historyToMessages(history)
    if (!turns.length) return null
    const textoLead = history.filter(m => m.dir === 'in').map(m => m.text).join('\n')
    ctx.jaPediuDocumento = history.some(m => m.dir === 'out' && /\b(cpf|cnpj)\b/i.test(m.text))
    ctx.textoTurno = t.lastLeadText
    ctx.textoLead = textoLead
    ctx.ultimaIa = [...history].reverse().find(m => m.dir === 'out')?.text || ''
    // Cliente ou não: quando o texto é explícito, o CÓDIGO decide antes do modelo (lib/tipo.ts)
    const st0 = await ctx.port.getState()
    if (!st0.tipo) {
      const tipo = tipoDoTurno(t.lastLeadText, ctx.ultimaIa)
      if (tipo) await ctx.port.patchState({ tipo })
    }
    const st1 = await ctx.port.getState()
    const resp = !pediuPessoa(t.lastLeadText) && !perguntouPreco(t.lastLeadText) ? respostaDoRoteiro(st1, ctx.ultimaIa, t.lastLeadText) : null
    if (resp) await ctx.port.patchState({ dados: { ...(st1.dados || {}), [resp.campo]: resp.valor } })
    // Pergunta de taxa/preço: o CÓDIGO anota o pedido para a nota da equipe (o modelo às vezes esquecia)
    const precoNoTurno = perguntouPreco(t.lastLeadText)
    if (precoNoTurno && !st1.dados?.pedido_extra) {
      const st2 = await ctx.port.getState()
      await ctx.port.patchState({ dados: { ...(st2.dados || {}), pedido_extra: t.lastLeadText.trim().slice(0, 300) } })
    }
    const usage = emptyUsage()
    const toolsUsed: string[] = []
    let handoff = false
    const retries: string[] = []
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
          for (const m of out.marcas || []) toolsUsed.push(m)
          if (out.isError) console.warn(`[tool:${tc.function.name}] ${out.content}`)
          messages.push({ role: 'tool', tool_call_id: tc.id, content: out.content || '(sem retorno)' })
        }
        continue
      }
      const text = (choice.message?.content || '').trim()
      if (!text) break
      // Travas que pedem uma AÇÃO (registrar o tipo, passar para a equipe, chamar a ferramenta de verdade):
      // nova tentativa COM as ferramentas. Reescrever sem ferramentas só troca o texto e a ação some.
      if (!handoff && step < MAX_STEPS - 1) {
        const tipoDesconhecido = !(await ctx.port.getState()).tipo
        const acao = checkReply(text, { textoLead, handoff, tipoDesconhecido }).filter(v => PEDEM_ACAO.includes(v.regra))
        // Roteiro comercial: a mensagem tem que trazer a pergunta que falta (o modelo às vezes pulava uma)
        const stAgora = await ctx.port.getState()
        const esperada = !pediuPessoa(t.lastLeadText) && !retries.some(r => r.startsWith('pulou')) ? perguntaEsperada(stAgora, !!(await ctx.port.documento()), !!ctx.jaPediuDocumento) : null
        // Perguntou de taxa ou preço: a resposta tem que dizer que a equipe passa (regra de ouro: responder antes de perguntar)
        if (perguntouPreco(t.lastLeadText) && !respondeuPreco(text) && !retries.some(r => r.startsWith('ignorou'))) {
          retries.push('ignorou a pergunta de taxa: nova tentativa')
          messages.push({ role: 'assistant', content: text })
          messages.push({ role: 'system', content: '[TRAVA DO SISTEMA] Isso NÃO foi enviado: a pessoa perguntou de taxa, preço ou condição e você não respondeu. Comece dizendo, em uma frase e sem número, que a equipe passa essas informações certinho; anote com anotar(pedido_extra); depois siga o PRÓXIMO PASSO. Responda só com o texto do WhatsApp.' })
          continue
        }
        if (esperada && !esperada.marca.test(text)) {
          retries.push(`pulou a pergunta "${esperada.campo}": nova tentativa`)
          messages.push({ role: 'assistant', content: text })
          messages.push({ role: 'system', content: `[TRAVA DO SISTEMA] Isso NÃO foi enviado: faltou a próxima pergunta do roteiro comercial ("${esperada.campo}"). Se a pessoa respondeu outra coisa, anote o que ela disse. Depois faça esta pergunta, com estas palavras ou parecidas: "${esperada.texto}". Responda só com o texto do WhatsApp.` })
          continue
        }
        if (acao.length) {
          retries.push(`${acao.map(v => v.regra).join(', ')}: nova tentativa com ferramentas`)
          messages.push({ role: 'assistant', content: text })
          messages.push({ role: 'system', content: `[TRAVA DO SISTEMA] Isso NÃO foi enviado: ${acao.map(v => DICA_ACAO[v.regra]).join(' ')} Siga o PRÓXIMO PASSO do contexto e responda só com o texto do WhatsApp.` })
          continue
        }
      }
      const safe = await enforce(ctx, messages, text, usage, handoff, textoLead)
      return { text: comRespostaDePreco(comAvisoPrivacidade(safe.text, !!ctx.jaPediuDocumento), precoNoTurno && !handoff), toolsUsed, handoff, guard: [...retries, ...safe.guard], usage }
    }

    // Ferramentas já mexeram no CRM: nunca deixar a pessoa em silêncio
    const final = await call(messages, null, usage)
    const text = (final.message?.content || '').trim()
    if (!text) return handoff ? { text: CRM_MAP.textos.seguroFinal, toolsUsed, handoff, guard: ['vazio: texto seguro'], usage } : null
    const safe = await enforce(ctx, messages, text, usage, handoff, textoLead)
    return { text: comRespostaDePreco(comAvisoPrivacidade(safe.text, !!ctx.jaPediuDocumento), precoNoTurno && !handoff), toolsUsed, handoff, guard: [...retries, ...safe.guard], usage }
  }

  return { generateReply }
}
