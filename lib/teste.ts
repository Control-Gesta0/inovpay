import { baseVigente, candidata } from './base'
import { avisoForaDoHorario, renderPrompt } from './base-core'
import { CONFIG } from './config'
import { memoryPort, type World } from './evals-runner'
import { costUsd } from './execlog'
import type { ChatMsg } from './history'
import { dentroDoHorario, proximaAbertura, quandoVolta } from './horario'
import { createBrain, loadPrompt } from './llm'
import { k, redis } from './redis'

/**
 * LABORATÓRIO (aba Teste da Central): conversa com a assistente de verdade
 * (mesmo cérebro, mesmas ferramentas e travas), numa porta em memória.
 * Nada vai para o GHL nem para o WhatsApp. A sessão vive 6 h no Redis.
 * Pode usar a versão no ar ou o rascunho da Base de dados (antes de publicar).
 */

export interface Opcoes {
  /** novo: sem cadastro · com_documento: o CPF/CNPJ já está no campo do contato */
  perfil: 'novo' | 'com_documento'
  fora: boolean
  versao: 'vigente' | 'rascunho'
}

export interface Detalhe { tools: string[]; log: string[]; guard: string[]; ms: number; custoUsd: number; handoff: boolean }

export interface Sessao {
  id: string
  criadoEm: string
  opcoes: Opcoes
  history: ChatMsg[]
  /** o que aconteceria no GHL */
  mundo: { documento: string; tags: string[]; notes: string[]; state: World['state'] }
  detalhes: Record<string, Detalhe>
  turnos: number
  custoUsd: number
}

const TTL = 6 * 3600
const MAX_TURNOS = 40
const MAX_DIA = 300
const DOC_TESTE = '11.222.333/0001-81'
const K = (id: string) => k('teste', id)

export const opcoesPadrao = (): Opcoes => ({ perfil: 'novo', fora: false, versao: 'vigente' })

function nova(id: string, opcoes: Opcoes): Sessao {
  return {
    id, criadoEm: new Date().toISOString(), opcoes, history: [],
    mundo: { documento: opcoes.perfil === 'com_documento' ? DOC_TESTE : '', tags: ['ia'], notes: [], state: {} },
    detalhes: {}, turnos: 0, custoUsd: 0,
  }
}

export async function lerSessao(id: string): Promise<Sessao | null> {
  return redis.get<Sessao>(K(id))
}

export async function recomecar(id: string, opcoes?: Partial<Opcoes>): Promise<Sessao> {
  const atual = await lerSessao(id)
  const s = nova(id, { ...opcoesPadrao(), ...(atual?.opcoes || {}), ...(opcoes || {}) })
  await redis.set(K(id), s, { ex: TTL })
  return s
}

/** Data simulada: dentro do horário = hoje (ou o próximo dia útil) às 10h30; fora = hoje às 21h. */
function agoraSimulado(fora: boolean): Date {
  const agora = new Date()
  const dentro = dentroDoHorario(agora, CONFIG.timezone)
  if (fora) {
    if (!dentro) return agora
    const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: CONFIG.timezone }).format(agora)
    return new Date(`${ymd}T21:00:00-03:00`)
  }
  return dentro ? agora : new Date(proximaAbertura(agora, CONFIG.timezone).getTime() + 90 * 60_000)
}

export async function falar(id: string, texto: string): Promise<{ sessao?: Sessao; erro?: string }> {
  const msg = String(texto || '').trim().slice(0, 2000)
  if (!msg) return { erro: 'Mensagem vazia.' }
  if (/^\s*#?reset\s*$/i.test(msg)) return { sessao: await recomecar(id) }

  if (!(await redis.set(k('teste', 'lock', id), '1', { nx: true, ex: 120 }))) return { erro: 'A assistente ainda está respondendo a mensagem anterior.' }
  try {
    const s = (await lerSessao(id)) || nova(id, opcoesPadrao())
    if (s.mundo.state.finalizado) return { erro: 'A assistente já passou este atendimento para a equipe (no WhatsApp ela para de responder aqui). Clique em Recomeçar para testar de novo.' }
    if (s.turnos >= MAX_TURNOS) return { erro: `Esta conversa chegou a ${MAX_TURNOS} mensagens. Clique em Recomeçar.` }
    const dia = k('teste', 'dia', new Date().toISOString().slice(0, 10))
    const usados = await redis.incr(dia)
    if (usados === 1) await redis.expire(dia, 2 * 86400)
    if (usados > MAX_DIA) return { erro: `O laboratório chegou ao limite de ${MAX_DIA} mensagens hoje (protege o custo). Volta amanhã.` }

    const { prompt, textos } = s.opcoes.versao === 'rascunho'
      ? await candidata().then(c => ({ textos: c.textos, prompt: renderPrompt(loadPrompt(), c.textos) }))
      : await baseVigente()

    const agora = agoraSimulado(s.opcoes.fora)
    const volta = quandoVolta(agora, CONFIG.timezone)
    const t0 = Date.now()
    const jaFalou = s.history.some(m => m.dir === 'out')
    s.history.push({ id: `l${s.history.length}`, dir: 'in', text: msg, ts: Date.now() })

    // Aviso de fora do horário: sai pelo CÓDIGO antes da primeira resposta, igual ao WhatsApp
    let avisoForaEnviado = false
    if (s.opcoes.fora && !s.history.some(m => m.dir === 'out')) {
      s.history.push({ id: `a${s.history.length}`, dir: 'out', text: avisoForaDoHorario(textos, volta), ts: Date.now() })
      avisoForaEnviado = true
    }

    const w: World = { documento: s.mundo.documento, tags: new Set(s.mundo.tags), notes: [...s.mundo.notes], state: s.mundo.state, log: [] }
    const brain = createBrain({
      apiKey: CONFIG.openaiApiKey, model: CONFIG.llmModel, promptOverride: prompt,
      onTool: (nome, input, out) => { w.log.push(`${nome}(${JSON.stringify(input).slice(0, 300)}) → ${out.isError ? 'NÃO FEZ: ' : ''}${out.content.slice(0, 220)}`) },
    })
    const iOut = s.history.map(m => m.dir).lastIndexOf('out')
    const bloco = s.history.slice(iOut + 1).filter(m => m.dir === 'in').map(m => m.text).join('\n') || msg
    const reply = await brain.generateReply({
      port: memoryPort(w), gateTag: 'ia', humanTag: 'atendimento-humano', textos,
      foraDoHorario: s.opcoes.fora, quandoVolta: volta,
    }, {
      nomeContato: 'Teste', agora, timezone: CONFIG.timezone,
      jaFalou, avisoForaEnviado, lastLeadText: bloco,
    }, s.history)

    const resposta = reply?.text || '(a assistente não gerou resposta)'
    const custo = reply ? costUsd(CONFIG.llmModel, reply.usage) || 0 : 0
    const rid = `r${s.history.length}`
    s.history.push({ id: rid, dir: 'out', text: resposta, ts: Date.now() })
    s.detalhes[rid] = { tools: reply?.toolsUsed || [], log: w.log, guard: reply?.guard || [], ms: Date.now() - t0, custoUsd: custo, handoff: !!reply?.handoff }
    s.mundo = { documento: w.documento, tags: [...w.tags], notes: w.notes, state: w.state }
    s.turnos++
    s.custoUsd = Math.round((s.custoUsd + custo) * 1e6) / 1e6
    await redis.set(K(id), s, { ex: TTL })
    const kc = k('teste', 'custo', new Date().toISOString().slice(0, 10))
    await redis.incrbyfloat(kc, custo)
    await redis.expire(kc, 40 * 86400)
    return { sessao: s }
  } finally {
    await redis.del(k('teste', 'lock', id))
  }
}

export async function custoHoje(): Promise<{ mensagens: number; custoUsd: number; limite: number; usdBrl: number }> {
  const d = new Date().toISOString().slice(0, 10)
  const [m, c] = await Promise.all([redis.get<number>(k('teste', 'dia', d)), redis.get<number>(k('teste', 'custo', d))])
  return { mensagens: Number(m || 0), custoUsd: Math.round(Number(c || 0) * 10000) / 10000, limite: MAX_DIA, usdBrl: CONFIG.usdBrl }
}
