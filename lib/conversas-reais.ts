import type { ExecEntry } from './execlog'

/**
 * Conversas REAIS para correção (Base de dados → Conversas reais), montadas do
 * diário de execuções: o que o cliente escreveu e o que a assistente mandou, já
 * com CPF, CNPJ, telefone e e-mail mascarados no momento em que foi gravado.
 * Puro (sem env): testado em npm test.
 */

export interface ConversaResumo {
  contato: string
  nome: string
  ultima: string
  /** respostas da assistente com texto guardado */
  respostas: number
  /** último texto (cliente ou assistente), curto */
  previa: string
  /** motivo da passagem, se passou para a equipe */
  passou?: string
  perfil?: 'cliente' | 'nao_cliente'
}

export interface TurnoReal {
  ts: string
  tipo: 'resposta' | 'aviso' | 'passou'
  cliente: string
  resposta: string
  tools: string[]
  travas: string[]
  motivo?: string
}

const COM_RESPOSTA: Array<ExecEntry['tipo']> = ['resposta', 'aviso', 'passou']
const tem = (e: ExecEntry) => COM_RESPOSTA.includes(e.tipo) && !!e.respostaIA

export function listarConversas(execs: ExecEntry[], limite = 60): ConversaResumo[] {
  const porContato = new Map<string, ExecEntry[]>()
  for (const e of execs) {
    if (!tem(e)) continue
    const l = porContato.get(e.leadId)
    if (l) l.push(e); else porContato.set(e.leadId, [e])
  }
  return [...porContato.entries()]
    .map(([contato, l]) => {
      const ordem = [...l].sort((a, b) => b.at.localeCompare(a.at))
      const ult = ordem[0]
      const pass = ordem.find(e => e.tipo === 'passou')
      return {
        contato,
        nome: ult.nome || ordem.find(e => e.nome)?.nome || 'Contato',
        ultima: ult.at,
        respostas: l.length,
        previa: (ult.respostaIA || ult.turnoLead || '').replace(/\s+/g, ' ').slice(0, 140),
        passou: pass?.porta,
        perfil: ordem.find(e => e.perfil)?.perfil,
      }
    })
    .sort((a, b) => b.ultima.localeCompare(a.ultima))
    .slice(0, limite)
}

/** Turnos de um contato, do mais antigo para o mais novo. O texto do cliente não se repete no aviso + resposta. */
export function turnosDoContato(execs: ExecEntry[], contato: string): TurnoReal[] {
  const l = execs.filter(e => e.leadId === contato && tem(e)).sort((a, b) => a.at.localeCompare(b.at))
  let ultimoCliente = ''
  return l.map(e => {
    const cliente = (e.turnoLead || '').trim()
    const repetido = !!cliente && cliente === ultimoCliente
    if (cliente) ultimoCliente = cliente
    return {
      ts: e.at,
      tipo: e.tipo as TurnoReal['tipo'],
      cliente: repetido ? '' : cliente,
      resposta: e.respostaIA || '',
      tools: (e.tools || []).filter(t => !t.startsWith('trava:')),
      travas: e.guard || [],
      motivo: e.tipo === 'passou' ? e.porta : undefined,
    }
  })
}

/** Contexto da correção: até 6 turnos antes + o que o cliente escreveu na resposta marcada. */
export function contextoReal(turnos: TurnoReal[], ts: string): { lead: string; resposta: string; turno: TurnoReal } | null {
  const i = turnos.findIndex(t => t.ts === ts)
  if (i < 0) return null
  const linhas: string[] = []
  for (const t of turnos.slice(Math.max(0, i - 6), i + 1)) {
    if (t.cliente) linhas.push(`CLIENTE: ${t.cliente}`)
    if (t !== turnos[i]) linhas.push(`ASSISTENTE${t.tipo === 'aviso' ? ' (aviso automático de fora do horário)' : ''}: ${t.resposta}`)
  }
  const d = turnos[i]
  linhas.push(`(nessa resposta a assistente usou: ${d.tools.join(', ') || 'nenhuma ferramenta'}${d.travas.length ? `; travas: ${d.travas.join(' | ')}` : ''}${d.tipo === 'aviso' ? '; é o aviso automático de fora do horário' : ''})`)
  return { lead: linhas.join('\n').slice(0, 6000), resposta: d.resposta.slice(0, 3000), turno: d }
}
