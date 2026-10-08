import type { ExecEntry } from './execlog'

/**
 * Contrato de dados da Central (painel). Tudo aqui é calculado em CÓDIGO a
 * partir do diário de execuções e do CRM: zero tokens, nenhum número inventado.
 * Arquivo puro (sem env) para rodar em `npm test`. O espelho na Central é
 * central/lib/types.ts: mudou aqui, mude lá.
 */

/** O que a execução produziu: passou para a equipe ou resolveu sem precisar dela. */
export type Marco = 'passou' | 'resolvido'
export type Perfil = 'cliente' | 'nao_cliente'

export const MOTIVOS: Record<string, { rotulo: string; urgente?: boolean }> = {
  suporte_maquininha: { rotulo: 'Maquininha' },
  // venda de hoje: o cancelamento só sai na própria maquininha, no mesmo dia
  estorno: { rotulo: 'Estorno de venda de hoje', urgente: true },
  estorno_anterior: { rotulo: 'Cancelamento de dias anteriores' },
  portal_app: { rotulo: 'Portal ou app' },
  pediu_atendente: { rotulo: 'Pediu atendente' },
  qualificacao_concluida: { rotulo: 'Comercial qualificado' },
  pediu_humano: { rotulo: 'Pediu uma pessoa' },
  outro: { rotulo: 'Outro assunto' },
}
export const rotuloMotivo = (m?: string) => MOTIVOS[m || 'outro']?.rotulo || m || 'Outro assunto'

/** Encerramento sem passagem (roteiro: estorno feito na maquininha, manual do portal resolveu). */
const RESOLVIDO = /A InovPay agradece seu contato/i

export interface Execution {
  ts: string
  contactId: string
  nome: string
  tipo: ExecEntry['tipo']
  resultado: 'respondeu' | 'erro' | 'pulou'
  detalhe: string
  duracaoMs: number
  tools: string[]
  travas: string[]
  midia?: ExecEntry['midia']
  turnoLead?: string
  respostaIA?: string
  marco?: Marco
  /** na passagem: o motivo (suporte_maquininha, estorno, qualificacao_concluida…) */
  motivo?: string
  perfil?: Perfil
  custo?: {
    totalBrl: number
    modeloUsd: number
    usdBrl: number
    tokens: { input: number; cached: number; output: number; chamadas: number }
  }
}

export interface Marcos {
  /** contatos que receberam resposta da assistente */
  atendidos: number
  clientes: number
  naoClientes: number
  /** contatos que receberam o aviso de fora do horário */
  foraDoHorario: number
  /** encerrados pela assistente sem precisar da equipe */
  resolvidos: number
  /** passados para a equipe com a triagem feita */
  passagens: number
  /** não clientes que responderam a qualificação e foram para o comercial */
  qualificados: number
}

export interface MotivoN { motivo: string; rotulo: string; n: number }

export interface Passagem {
  ts: string
  contactId: string
  nome: string
  motivo: string
  rotulo: string
  perfil?: Perfil
  resumo: string
  urgente: boolean
  link: string
}

export interface Financial {
  hoje: number
  seteDias: number
  trintaDias: number
  totalRegistrado: number
  execucoesComCusto: number
  execucoesSemCusto: number
  medioPorExecucao: number
  porDia: Array<{ data: string; custo: number; execucoes: number }>
  usdBrl: number
  observacao: string
}

export interface ExecutionData {
  execucoes: Execution[]
  saude24h: { total: number; respondeu: number; erros: number; pulou: number }
  marcos: { hoje: Marcos; seteDias: Marcos; trintaDias: Marcos }
  motivos: { hoje: MotivoN[]; seteDias: MotivoN[]; trintaDias: MotivoN[] }
  passagens: Passagem[]
  financeiro: Financial
  cobertura: { desde: string | null; registros: number }
  modelo: string
}

const DIA = 86400_000
const FALOU: Array<ExecEntry['tipo']> = ['resposta', 'passou']

/** Data (AAAA-MM-DD) no fuso de São Paulo. */
export function diaSP(iso: string | number | Date): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

export function marcoDe(e: Pick<ExecEntry, 'tipo' | 'respostaIA'>): Marco | undefined {
  if (e.tipo === 'passou') return 'passou'
  if (e.tipo === 'resposta' && RESOLVIDO.test(e.respostaIA || '')) return 'resolvido'
  return undefined
}

export function linkContato(locationId: string, contactId: string): string {
  return locationId ? `https://app.gohighlevel.com/v2/location/${locationId}/contacts/detail/${contactId}` : ''
}

export function toExecution(e: ExecEntry, usdBrl: number): Execution {
  const resultado: Execution['resultado'] = e.tipo === 'erro' ? 'erro' : e.tipo === 'pulou' ? 'pulou' : 'respondeu'
  const custoUsd = typeof e.custoUsd === 'number' ? e.custoUsd : null
  return {
    ts: e.at,
    contactId: e.leadId,
    nome: e.nome || 'Contato',
    tipo: e.tipo,
    resultado,
    detalhe: e.detalhe || '',
    duracaoMs: e.ms || 0,
    tools: e.tools || [],
    travas: e.guard || [],
    midia: e.midia,
    turnoLead: e.turnoLead,
    respostaIA: e.respostaIA,
    marco: marcoDe(e),
    motivo: e.tipo === 'passou' ? e.porta || 'outro' : undefined,
    perfil: e.perfil,
    custo: custoUsd !== null && e.usage
      ? {
          totalBrl: round(custoUsd * usdBrl, 5),
          modeloUsd: custoUsd,
          usdBrl,
          tokens: { input: e.usage.input, cached: e.usage.cached, output: e.usage.output, chamadas: e.usage.calls },
        }
      : undefined,
  }
}

/** Contatos únicos por marco (quem repete a ação conta uma vez). Reset de teste não conta. */
export function contarMarcos(execs: Execution[]): Marcos {
  const contatos = (f: (e: Execution) => boolean) => new Set(execs.filter(f).map(e => e.contactId)).size
  // perfil mais recente de cada contato (execs vêm do mais novo para o mais velho)
  const perfil = new Map<string, Perfil>()
  for (const e of execs) if (e.perfil && !perfil.has(e.contactId)) perfil.set(e.contactId, e.perfil)
  const perfis = [...perfil.values()]
  return {
    atendidos: contatos(e => FALOU.includes(e.tipo)),
    clientes: perfis.filter(p => p === 'cliente').length,
    naoClientes: perfis.filter(p => p === 'nao_cliente').length,
    foraDoHorario: contatos(e => e.tipo === 'aviso'),
    resolvidos: contatos(e => e.marco === 'resolvido'),
    passagens: contatos(e => e.marco === 'passou'),
    qualificados: contatos(e => e.marco === 'passou' && e.motivo === 'qualificacao_concluida'),
  }
}

/** Passagens por motivo: cada par contato + motivo conta uma vez. */
export function contarMotivos(execs: Execution[]): MotivoN[] {
  const pares = new Set<string>()
  const n = new Map<string, number>()
  for (const e of execs) {
    if (e.marco !== 'passou') continue
    const m = e.motivo || 'outro'
    if (pares.has(`${e.contactId}|${m}`)) continue
    pares.add(`${e.contactId}|${m}`)
    n.set(m, (n.get(m) || 0) + 1)
  }
  return [...n.entries()].map(([motivo, total]) => ({ motivo, rotulo: rotuloMotivo(motivo), n: total })).sort((a, b) => b.n - a.n)
}

export function buildExecutionData(entries: ExecEntry[], usdBrl: number, modelo: string, now = Date.now(), locationId = ''): ExecutionData {
  const execs = entries.map(e => toExecution(e, usdBrl)).sort((a, b) => b.ts.localeCompare(a.ts))
  const reais = execs.filter(e => e.tipo !== 'reset')
  const desde = (ms: number) => reais.filter(e => now - Date.parse(e.ts) <= ms)
  const hojeSP = diaSP(now)
  const deHoje = reais.filter(e => diaSP(e.ts) === hojeSP)
  const h24 = execs.filter(e => now - Date.parse(e.ts) <= DIA)
  const soma = (xs: Execution[]) => round(xs.reduce((s, e) => s + (e.custo?.totalBrl || 0), 0), 4)
  const comCusto = execs.filter(e => e.custo)
  const semCusto = execs.filter(e => !e.custo && FALOU.includes(e.tipo))

  const porDia = Array.from({ length: 14 }, (_, i) => {
    const data = diaSP(now - (13 - i) * DIA)
    const doDia = execs.filter(e => diaSP(e.ts) === data && e.resultado !== 'pulou')
    return { data, custo: soma(doDia), execucoes: doDia.length }
  })

  return {
    execucoes: execs.slice(0, 200),
    saude24h: {
      total: h24.filter(e => e.resultado !== 'pulou').length,
      respondeu: h24.filter(e => e.resultado === 'respondeu').length,
      erros: h24.filter(e => e.resultado === 'erro').length,
      pulou: h24.filter(e => e.resultado === 'pulou').length,
    },
    marcos: { hoje: contarMarcos(deHoje), seteDias: contarMarcos(desde(7 * DIA)), trintaDias: contarMarcos(desde(30 * DIA)) },
    motivos: { hoje: contarMotivos(deHoje), seteDias: contarMotivos(desde(7 * DIA)), trintaDias: contarMotivos(desde(30 * DIA)) },
    passagens: execs.filter(e => e.marco === 'passou').slice(0, 60).map(e => {
      const motivo = e.motivo || 'outro'
      return {
        ts: e.ts, contactId: e.contactId, nome: e.nome, motivo, rotulo: rotuloMotivo(motivo), perfil: e.perfil,
        resumo: e.detalhe.slice(0, 600), urgente: !!MOTIVOS[motivo]?.urgente, link: linkContato(locationId, e.contactId),
      }
    }),
    financeiro: {
      hoje: soma(execs.filter(e => diaSP(e.ts) === hojeSP)),
      seteDias: soma(execs.filter(e => now - Date.parse(e.ts) <= 7 * DIA)),
      trintaDias: soma(execs.filter(e => now - Date.parse(e.ts) <= 30 * DIA)),
      totalRegistrado: soma(execs),
      execucoesComCusto: comCusto.length,
      execucoesSemCusto: semCusto.length,
      medioPorExecucao: comCusto.length ? round(soma(comCusto) / comCusto.length, 5) : 0,
      porDia,
      usdBrl,
      observacao: `Custo do modelo de linguagem convertido a US$ 1 = R$ ${usdBrl.toFixed(2).replace('.', ',')}. Transcrição de áudio, leitura de imagem e infraestrutura não entram nesta conta.`,
    },
    cobertura: { desde: execs.length ? execs[execs.length - 1].ts : null, registros: execs.length },
    modelo,
  }
}

// ---------- Funil (CRM, só leitura) ----------

export interface GhlEtapa { id: string; name: string; position: number }

export interface GhlOppResumo {
  id: string
  name?: string
  monetaryValue?: number
  pipelineStageId: string
  status: string
  lastStageChangeAt?: string
  updatedAt?: string
  createdAt?: string
  contact?: { id?: string; name?: string; tags?: string[] }
}

export interface FunilEtapa {
  id: string
  label: string
  /** oportunidades abertas na etapa */
  n: number
  /** a IA move cards nesta etapa? (nesta fase, não move em nenhuma) */
  ia: boolean
  valor: number
  parados: number
  amostras: Array<{ id: string; nome: string; valor: number; diasParado: number }>
}

export interface LiveData {
  geradoEm: string
  conversas: Array<{ id: string; nome: string; ultimaMsg: string; minutosAtras: number; estado: 'ia' | 'humano' | 'fora' }>
  grupos: { iaAtendendo: number; comHumano: number; foraDaIA: number }
  conversas24h: number
  respostaMedianaSegundos: number | null
  pipeline: { nome: string }
  funil: FunilEtapa[]
  leads: { total: number; abertas: number; ganhas: number; perdidas: number; comIA: number; tagsDisponiveis: boolean }
  regras: { modoGate: string; gateTag: string; humanTag: string; expediente: string }
  saude: { crmOk: boolean; problemas: string[] }
}

export function buildFunil(etapas: GhlEtapa[], opps: GhlOppResumo[], gateTag: string, now = Date.now()): Pick<LiveData, 'funil' | 'leads'> {
  const funil: FunilEtapa[] = [...etapas].sort((a, b) => a.position - b.position).map(s => ({
    id: s.id, label: s.name, n: 0, ia: false, valor: 0, parados: 0, amostras: [],
  }))
  const dias = (o: GhlOppResumo) => Math.floor((now - Date.parse(o.lastStageChangeAt || o.updatedAt || o.createdAt || new Date(now).toISOString())) / DIA)
  const leads = { total: opps.length, abertas: 0, ganhas: 0, perdidas: 0, comIA: 0, tagsDisponiveis: false }
  for (const o of opps) {
    const tags = (o.contact?.tags || []).map(t => t.toLowerCase())
    if (o.contact?.tags) leads.tagsDisponiveis = true
    if (tags.includes(gateTag)) leads.comIA++
    // Este pipeline não tem etapa de Ganho/Perdido: fechadas contam pelo status, fora das etapas
    if (o.status === 'won') { leads.ganhas++; continue }
    if (o.status === 'lost' || o.status === 'abandoned') { leads.perdidas++; continue }
    const etapa = funil.find(f => f.id === o.pipelineStageId)
    if (!etapa) continue
    leads.abertas++
    const valor = Number(o.monetaryValue || 0)
    etapa.n++
    etapa.valor += valor
    const d = dias(o)
    if (d >= 7) {
      etapa.parados++
      if (etapa.amostras.length < 4) etapa.amostras.push({ id: o.id, nome: o.contact?.name || o.name || 'Contato', valor, diasParado: d })
    }
  }
  return { funil, leads }
}

/** Conversas das últimas 24h e o estado atual de cada contato, a partir do diário. */
export function buildConversas(execs: Execution[], now = Date.now()): Pick<LiveData, 'conversas' | 'grupos' | 'conversas24h' | 'respostaMedianaSegundos'> {
  const h24 = execs.filter(e => now - Date.parse(e.ts) <= DIA)
  const ultimas = new Map<string, Execution>()
  for (const e of h24) if (!ultimas.has(e.contactId)) ultimas.set(e.contactId, e) // do mais novo pro mais velho
  const conversas = [...ultimas.values()].map(e => {
    const estado: 'ia' | 'humano' | 'fora' =
      e.marco === 'passou' || (e.resultado === 'pulou' && /equipe/i.test(e.detalhe)) ? 'humano'
      : e.resultado === 'pulou' ? 'fora' : 'ia'
    return {
      id: e.contactId,
      nome: e.nome,
      ultimaMsg: e.tipo === 'reset' ? `Reset de teste: ${e.detalhe}` : e.respostaIA || e.turnoLead || e.detalhe,
      minutosAtras: Math.max(0, Math.round((now - Date.parse(e.ts)) / 60000)),
      estado,
    }
  })
  const tempos = h24.filter(e => FALOU.includes(e.tipo) && e.duracaoMs > 0).map(e => e.duracaoMs).sort((a, b) => a - b)
  const mediana = tempos.length ? tempos[Math.floor(tempos.length / 2)] / 1000 : null
  return {
    conversas: conversas.slice(0, 40),
    grupos: {
      iaAtendendo: conversas.filter(c => c.estado === 'ia').length,
      comHumano: conversas.filter(c => c.estado === 'humano').length,
      foraDaIA: conversas.filter(c => c.estado === 'fora').length,
    },
    conversas24h: new Set(h24.filter(e => FALOU.includes(e.tipo)).map(e => e.contactId)).size,
    respostaMedianaSegundos: mediana === null ? null : round(mediana, 1),
  }
}

function round(n: number, casas: number): number {
  const f = 10 ** casas
  return Math.round(n * f) / f
}
