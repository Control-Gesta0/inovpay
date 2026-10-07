import { createHash } from 'crypto'
import { CONFIG } from './config'
import { readExecs, type ExecEntry } from './execlog'
import { k, redis } from './redis'

/**
 * PAINEL da InovPay: o que a IA fez, só leitura. Fonte: o diário de execuções
 * (últimos 2.000 registros no Redis). Nada é inventado: período sem dado aparece vazio.
 * A senha fica na env PAINEL_SENHA (o repositório é público: nunca no código).
 */

const D = 86_400_000
const FMT = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
const diaSP = (ms: number) => FMT.format(ms)

export function senhaConfere(senha: string, esperada = process.env.PAINEL_SENHA || ''): boolean {
  if (!senha || !esperada) return false
  const h = (x: string) => createHash('sha256').update(x).digest()
  return h(senha).equals(h(esperada))
}

/** Trava contra adivinhar a senha: 8 erros em 15 min por IP bloqueiam por 15 min. */
export async function bloqueado(ip: string): Promise<boolean> {
  return (Number(await redis.get(k('painel', 'erros', ip))) || 0) >= 8
}
export async function registrarErro(ip: string): Promise<void> {
  const chave = k('painel', 'erros', ip)
  await redis.incr(chave)
  await redis.expire(chave, 15 * 60)
}

export interface Resumo {
  /** pessoas diferentes que a IA atendeu */
  contatos: number
  /** mensagens que a IA mandou (respostas + encerramentos) */
  mensagens: number
  passagens: number
  clientes: number
  naoClientes: number
  foraDoHorario: number
  erros: number
  custoUsd: number
}

const FALOU: ExecEntry['tipo'][] = ['resposta', 'passou']

/** Números de um período a partir do diário. Pura. */
export function resumir(execs: ExecEntry[]): Resumo {
  const falou = execs.filter(e => FALOU.includes(e.tipo))
  const perfil = new Map<string, string>()
  for (const e of falou) if (e.perfil) perfil.set(e.leadId, e.perfil)
  return {
    contatos: new Set(falou.map(e => e.leadId)).size,
    mensagens: falou.length,
    passagens: execs.filter(e => e.tipo === 'passou').length,
    clientes: [...perfil.values()].filter(p => p === 'cliente').length,
    naoClientes: [...perfil.values()].filter(p => p === 'nao_cliente').length,
    foraDoHorario: new Set(execs.filter(e => e.tipo === 'aviso').map(e => e.leadId)).size,
    erros: execs.filter(e => e.tipo === 'erro').length,
    custoUsd: Math.round(execs.reduce((s, e) => s + (e.custoUsd || 0), 0) * 10000) / 10000,
  }
}

/** Série diária (fuso de Brasília) dos últimos `dias`. Pura. */
export function porDia(execs: ExecEntry[], agora: number, dias = 30): Array<{ dia: string } & Resumo> {
  const porData = new Map<string, ExecEntry[]>()
  for (const e of execs) {
    const dia = diaSP(Date.parse(e.at))
    const lista = porData.get(dia)
    if (lista) lista.push(e); else porData.set(dia, [e])
  }
  const out: Array<{ dia: string } & Resumo> = []
  for (let i = dias - 1; i >= 0; i--) {
    const dia = diaSP(agora - i * D)
    out.push({ dia, ...resumir(porData.get(dia) || []) })
  }
  return out
}

export const MOTIVO_ROTULO: Record<string, string> = {
  suporte_maquininha: 'Maquininha',
  estorno: 'Estorno (venda de hoje)',
  estorno_anterior: 'Cancelamento (dias anteriores)',
  portal_app: 'Portal ou app',
  pediu_atendente: 'Pediu atendente',
  qualificacao_concluida: 'Comercial (qualificado)',
  pediu_humano: 'Pediu uma pessoa',
  outro: 'Outro assunto',
}

/** Passagens por motivo no período. Pura. */
export function porMotivo(execs: ExecEntry[]): Array<{ motivo: string; total: number }> {
  const m = new Map<string, number>()
  for (const e of execs) if (e.tipo === 'passou') m.set(e.porta || 'outro', (m.get(e.porta || 'outro') || 0) + 1)
  return [...m.entries()].map(([motivo, total]) => ({ motivo: MOTIVO_ROTULO[motivo] || motivo, total })).sort((a, b) => b.total - a.total)
}

export async function dadosPainel(agora = Date.now()) {
  const execs = await readExecs(2000)
  let redisOk = false
  try { redisOk = (await redis.ping()) === 'PONG' } catch { /* fora */ }
  const hoje = diaSP(agora)
  const inicioHoje = Date.parse(`${hoje}T00:00:00-03:00`)
  const de = (ms: number) => execs.filter(e => Date.parse(e.at) >= ms)
  const linkContato = (id: string) => `https://app.gohighlevel.com/v2/location/${CONFIG.ghlLocationId}/contacts/detail/${id}`
  return {
    agora,
    status: { redis: redisOk, gate: CONFIG.gateTag, modo: CONFIG.modoGate, humano: CONFIG.humanTag },
    cobertura: { registros: execs.length, desde: execs.length ? execs[execs.length - 1].at : null },
    hoje: resumir(de(inicioHoje)),
    seteDias: resumir(de(agora - 7 * D)),
    trintaDias: resumir(de(agora - 30 * D)),
    dias: porDia(execs, agora, 30),
    motivos30: porMotivo(de(agora - 30 * D)),
    passagens: execs.filter(e => e.tipo === 'passou').slice(0, 100).map(e => ({
      at: e.at, nome: e.nome || '', link: linkContato(e.leadId), motivo: MOTIVO_ROTULO[e.porta || ''] || e.porta || 'Outro assunto',
      perfil: e.perfil || null, resumo: (e.detalhe || '').slice(0, 400),
    })),
    erros: execs.filter(e => e.tipo === 'erro' && Date.parse(e.at) >= agora - D).slice(0, 25).map(e => ({ at: e.at, nome: e.nome || '', link: linkContato(e.leadId), detalhe: (e.detalhe || '').slice(0, 200) })),
    diario: execs.slice(0, 200).map(e => ({
      at: e.at, tipo: e.tipo, nome: e.nome || '', link: linkContato(e.leadId),
      detalhe: (e.detalhe || '').slice(0, 220), custoUsd: e.custoUsd ?? null, guard: e.guard || [],
    })),
    cotacao: Number(process.env.COTACAO_DOLAR || 5.4),
  }
}
