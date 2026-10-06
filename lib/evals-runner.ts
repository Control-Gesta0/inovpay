import OpenAI from 'openai'
import { costUsd } from './execlog'
import type { ChatMsg } from './history'
import { createBrain } from './llm'
import type { Port } from './port'
import type { Estado } from './state'

/**
 * O EXAME DO CÉREBRO: roda o prompt do deploy com as ferramentas REAIS numa
 * porta em memória (zero efeito no CRM, zero mensagem enviada).
 * Cada cenário: checagens em CÓDIGO + critérios para um juiz cego.
 * Portão: qualquer checagem falhando ou critério reprovado = reprovado.
 */

export interface World {
  documento: string
  tags: Set<string>
  notes: string[]
  state: Estado
  log: string[]
}

export interface Turno { lead: string; resposta: string; tools: string[]; guard: string[]; handoff: boolean }

export interface Cenario {
  id: string
  nomeContato?: string
  /** conversa anterior (já em andamento) */
  historico?: Array<['in' | 'out', string]>
  state?: Estado
  documento?: string
  foraDoHorario?: boolean
  msgs: string[]
  checks: Array<{ nome: string; fn: (w: World, t: Turno[]) => boolean }>
  criterios: string[]
}

export interface ResultadoCenario {
  id: string
  rodada: number
  passou: boolean
  nota: number
  falhasCodigo: string[]
  falhasJuiz: Array<{ criterio: string; porque: string }>
  conversa: Turno[]
  log: string[]
}

export interface Relatorio { aprovado: boolean; total: number; reprovados: number; custoUsd: number; modelo: string; resultados: ResultadoCenario[] }

export const GATE_EVAL = 'ia'
export const HUMANO_EVAL = 'atendimento-humano'

function memoryPort(w: World): Port {
  return {
    async documento() { return w.documento },
    async gravarDocumento(v) { w.documento = v; w.log.push(`grava CPF/CNPJ=${v}`) },
    async tags() { return [...w.tags] },
    async addTags(t) { t.forEach(x => w.tags.add(x.toLowerCase())); w.log.push(`tags + ${t.join(',')}`) },
    async removeTags(t) { t.forEach(x => w.tags.delete(x.toLowerCase())); w.log.push(`tags - ${t.join(',')}`) },
    async addNote(n) { w.notes.push(n); w.log.push(`nota: ${n.replace(/\n/g, ' | ').slice(0, 300)}`) },
    async marcarNaoLida() { w.log.push('conversa marcada como não lida') },
    async getState() { return structuredClone(w.state) },
    async patchState(p) { Object.assign(w.state, p); return structuredClone(w.state) },
  }
}

export async function runEvals(opts: {
  apiKey: string
  cenarios: Cenario[]
  model: string
  judgeModel: string
  filtros?: string[]
  reps?: number
}): Promise<Relatorio> {
  const openai = new OpenAI({ apiKey: opts.apiKey })
  const lista = opts.cenarios.filter(c => !opts.filtros?.length || opts.filtros.some(f => c.id.includes(f)))
  const reps = opts.reps || 1
  let custo = 0

  async function rodar(c: Cenario, rodada: number): Promise<ResultadoCenario> {
    const w: World = { documento: c.documento || '', tags: new Set([GATE_EVAL]), notes: [], state: structuredClone(c.state || {}), log: [] }
    const brain = createBrain({
      apiKey: opts.apiKey, model: opts.model,
      onTool: (nome, input, out) => { w.log.push(`${nome}(${JSON.stringify(input).slice(0, 200)}) → ${out.isError ? 'ERRO ' : ''}${out.content.slice(0, 160)}`) },
    })
    const history: ChatMsg[] = (c.historico || []).map(([dir, text], i) => ({ id: `h${i}`, dir, text, ts: i + 1 }))
    const turnos: Turno[] = []
    const fora = !!c.foraDoHorario
    // fora do horário: num sábado às 22h (a equipe volta segunda às 9h)
    const agora = fora ? new Date('2026-10-10T22:00:00-03:00') : new Date('2026-10-07T10:30:00-03:00')
    for (const [i, msg] of c.msgs.entries()) {
      if (w.state.finalizado) break
      history.push({ id: `m${history.length}`, dir: 'in', text: msg, ts: history.length + 1 })
      const iOut = history.map(m => m.dir).lastIndexOf('out')
      const bloco = history.slice(iOut + 1).map(m => m.text).join('\n')
      const avisoForaEnviado = fora && i === 0 && !history.some(m => m.dir === 'out')
      const reply = await brain.generateReply({
        port: memoryPort(w), gateTag: GATE_EVAL, humanTag: HUMANO_EVAL,
        foraDoHorario: fora, quandoVolta: fora ? 'na segunda-feira a partir das 9h' : 'hoje a partir das 9h',
      }, {
        nomeContato: c.nomeContato || '', agora, timezone: 'America/Sao_Paulo',
        jaFalou: history.some(m => m.dir === 'out'), avisoForaEnviado, lastLeadText: bloco,
      }, history)
      const resposta = reply?.text || ''
      custo += reply ? costUsd(opts.model, reply.usage) || 0 : 0
      turnos.push({ lead: msg, resposta, tools: reply?.toolsUsed || [], guard: reply?.guard || [], handoff: !!reply?.handoff })
      history.push({ id: `r${history.length}`, dir: 'out', text: resposta, ts: history.length + 1 })
    }

    const falhasCodigo = c.checks.filter(ch => { try { return !ch.fn(w, turnos) } catch { return true } }).map(ch => ch.nome)
    const contexto = [
      c.historico?.length ? `CONVERSA ANTERIOR:\n${c.historico.map(([d, t]) => `${d === 'in' ? 'LEAD' : 'IA'}: ${t}`).join('\n')}\n` : '',
      fora ? '(A conversa acontece FORA do horário de atendimento. O sistema já mandou um aviso de horário antes da primeira resposta da IA.)\n' : '',
      c.documento ? '(O CPF/CNPJ da pessoa já estava no cadastro.)\n' : '',
    ].join('')
    const transcript = turnos.map(t => `LEAD: ${t.lead}\nIA: ${t.resposta}`).join('\n\n')
    const juiz = await openai.chat.completions.create({
      model: opts.judgeModel,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Você avalia a conversa de uma assistente virtual de WhatsApp da InovPay (maquininha e split de recebíveis). Para CADA critério responda se foi atendido. Seja rigoroso e literal. JSON: {"criterios":[{"criterio":"...","ok":true|false,"porque":"..."}]}' },
        { role: 'user', content: `CRITÉRIOS:\n${c.criterios.map((x, i) => `${i + 1}. ${x}`).join('\n')}\n\n${contexto}CONVERSA:\n${transcript}` },
      ],
    })
    const veredito = JSON.parse(juiz.choices[0].message.content || '{"criterios":[]}') as { criterios: Array<{ criterio: string; ok: boolean; porque: string }> }
    const falhasJuiz = (veredito.criterios || []).filter(x => !x.ok).map(x => ({ criterio: x.criterio, porque: x.porque }))
    const nota = c.criterios.length ? Math.round(((c.criterios.length - falhasJuiz.length) / c.criterios.length) * 100) / 10 : 10
    const passou = !falhasCodigo.length && !falhasJuiz.length && (veredito.criterios || []).length >= c.criterios.length
    return { id: c.id, rodada, passou, nota, falhasCodigo, falhasJuiz, conversa: turnos, log: w.log }
  }

  const tarefas: Array<() => Promise<ResultadoCenario>> = []
  for (const c of lista) for (let r = 1; r <= reps; r++) tarefas.push(() => rodar(c, r).catch(e => ({
    id: c.id, rodada: r, passou: false, nota: 0, falhasCodigo: [`erro: ${e instanceof Error ? e.message : String(e)}`], falhasJuiz: [], conversa: [], log: [],
  })))
  const LOTE = Number(process.env.EVAL_CONCORRENCIA || 6)
  const resultados: ResultadoCenario[] = []
  for (let i = 0; i < tarefas.length; i += LOTE) resultados.push(...await Promise.all(tarefas.slice(i, i + LOTE).map(f => f())))
  const reprovados = resultados.filter(r => !r.passou).length
  return { aprovado: reprovados === 0, total: resultados.length, reprovados, custoUsd: Math.round(custo * 10000) / 10000, modelo: opts.model, resultados }
}
