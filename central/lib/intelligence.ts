import { brl } from './format'
import type { ExecutionData, LiveData, RecoveryData } from './types'

/**
 * Briefing e "Pergunte à Central": interpretação calculada em código, zero
 * tokens. Sem as duas fontes, nenhuma conclusão é inventada.
 */

export type SignalTone = 'calm' | 'attention' | 'critical' | 'opportunity' | 'learning'

export interface DecisionCard { id: string; tone: SignalTone; title: string; evidence: string; impact: string; action: string; href: string }
export interface ExecutiveBriefing { greeting: string; summary: string; decisions: DecisionCard[] }

const plural = (n: number, s: string, p: string) => (n === 1 ? s : p)
const DIA = 86400_000

export function buildBriefing(live: LiveData | null, data: ExecutionData | null): ExecutiveBriefing {
  if (!live || !data) {
    return {
      greeting: 'Estou reunindo as fontes da operação.',
      summary: 'O briefing só aparece depois que o CRM e o diário responderem. Até lá, nenhuma conclusão é inventada.',
      decisions: [],
    }
  }
  const decisions: DecisionCard[] = []
  const erros = data.saude24h.erros
  const agora = Date.now()
  const passagens24h = data.passagens.filter(p => agora - Date.parse(p.ts) <= DIA)

  if (!live.saude.crmOk) {
    decisions.push({
      id: 'crm', tone: 'critical', title: 'O mapa do CRM precisa de conferência',
      evidence: live.saude.problemas[0] || 'A leitura do CRM falhou.',
      impact: 'Com campo divergente, o GHL aceita a gravação e o dado some sem aviso.',
      action: 'Ver detalhes', href: '/configuracoes',
    })
  }
  if (erros > 0) {
    decisions.push({
      id: 'erros', tone: erros >= 3 ? 'critical' : 'attention',
      title: `${erros} ${plural(erros, 'execução pede', 'execuções pedem')} investigação`,
      evidence: `${erros} ${plural(erros, 'erro apareceu', 'erros apareceram')} no diário nas últimas 24 horas.`,
      impact: 'Pode haver cliente esperando resposta.', action: 'Abrir o histórico', href: '/operacao?aba=historico',
    })
  }
  const urgentes = passagens24h.filter(p => p.urgente)
  if (urgentes.length) {
    decisions.push({
      id: 'urgentes', tone: 'critical',
      title: `${urgentes.length} ${plural(urgentes.length, 'estorno de venda de hoje', 'estornos de venda de hoje')} com a equipe`,
      evidence: `${urgentes.map(p => p.nome).slice(0, 3).join(', ')} não ${plural(urgentes.length, 'conseguiu', 'conseguiram')} cancelar na maquininha.`,
      impact: 'Venda do mesmo dia: quanto antes a equipe atender, mais simples o cancelamento.', action: 'Ver passagens', href: '/operacao?aba=passagens',
    })
  }
  const outras = passagens24h.filter(p => !p.urgente)
  if (outras.length) {
    const porMotivo = new Map<string, number>()
    for (const p of outras) porMotivo.set(p.rotulo, (porMotivo.get(p.rotulo) || 0) + 1)
    decisions.push({
      id: 'passagens', tone: 'opportunity',
      title: `${outras.length} ${plural(outras.length, 'atendimento chegou', 'atendimentos chegaram')} à equipe com a triagem feita`,
      evidence: [...porMotivo.entries()].sort((a, b) => b[1] - a[1]).map(([r, n]) => `${r}: ${n}`).join(' · '),
      impact: 'Cada um tem a tag atendimento-humano e uma nota com o resumo: ninguém precisa perguntar de novo.',
      action: 'Ver passagens', href: '/operacao?aba=passagens',
    })
  }
  const parados = live.funil.filter(f => f.parados > 0).sort((a, b) => b.parados - a.parados)[0]
  if (parados) {
    decisions.push({
      id: 'parados', tone: 'opportunity',
      title: `${parados.parados} ${plural(parados.parados, 'oportunidade parada', 'oportunidades paradas')} em ${parados.label}`,
      evidence: `Sem mudança de etapa há 7 dias ou mais${parados.valor ? `, somando ${brl(parados.valor, 0)} em valor aberto na etapa` : ''}.`,
      impact: 'É onde o funil comercial está perdendo ritmo.', action: 'Ver dinheiro parado', href: '/resultados#radar',
    })
  }
  if (!data.financeiro.execucoesComCusto) {
    decisions.push({
      id: 'ledger', tone: 'learning', title: 'Custo ainda não medido',
      evidence: 'Nenhuma execução com consumo de tokens registrado apareceu no diário.',
      impact: 'A próxima conversa real inaugura o custo por resposta.', action: 'Entender os custos', href: '/resultados',
    })
  }

  const m = data.marcos.hoje
  return {
    greeting: erros === 0 && live.saude.crmOk ? 'A assistente está operando sem falha crítica.' : 'A assistente está operando, com pontos de atenção.',
    summary: `Hoje: ${m.atendidos} ${plural(m.atendidos, 'contato atendido', 'contatos atendidos')} (${m.clientes} ${plural(m.clientes, 'cliente', 'clientes')}, ${m.naoClientes} ${plural(m.naoClientes, 'não cliente', 'não clientes')}), ${m.passagens} ${plural(m.passagens, 'passagem', 'passagens')} para a equipe e ${m.resolvidos} ${plural(m.resolvidos, 'resolvido', 'resolvidos')} sem precisar dela. Tempo mediano de ${live.respostaMedianaSegundos ? `${Math.round(live.respostaMedianaSegundos)}s` : '—'} por resposta, contando a espera de 10s que junta mensagens seguidas.`,
    decisions: decisions.slice(0, 4),
  }
}

export interface MoneySignal { id: string; stage: string; count: number; value: number; tone: SignalTone; title: string; explanation: string; samples: LiveData['funil'][number]['amostras'] }

export function buildMoneyRadar(live: LiveData | null): MoneySignal[] {
  if (!live) return []
  return live.funil
    .filter(s => s.parados > 0)
    .map((s, i) => ({
      id: `money-${i}`, stage: s.label, count: s.parados, value: s.valor,
      tone: (/Aguardando|Criar Conta|Análise|Enviar|Ativação/i.test(s.label) ? 'critical' : 'opportunity') as SignalTone,
      title: `${s.parados} ${plural(s.parados, 'parada', 'paradas')} em ${s.label}`,
      explanation: s.valor
        ? `${brl(s.valor, 0)} em valor aberto nessa etapa; conta oportunidades abertas sem mudança de etapa há 7 dias ou mais.`
        : 'Oportunidades abertas sem mudança de etapa há 7 dias ou mais.',
      samples: s.amostras,
    }))
    .sort((a, b) => (b.value || b.count) - (a.value || a.count))
    .slice(0, 6)
}

export interface CentralAnswer { answer: string; evidence: string[]; href?: string; label?: string }

export function answerCentral(raw: string, live: LiveData | null, data: ExecutionData | null, rec: RecoveryData | null): CentralAnswer {
  const q = raw.toLowerCase()
  if (!live || !data) return { answer: 'Ainda estou carregando o CRM e o diário.', evidence: ['Espere as fontes responderem e pergunte de novo.'] }

  if (/custo|gasto|token|investimento|quanto custa/.test(q)) {
    const f = data.financeiro
    return {
      answer: f.execucoesComCusto
        ? `Nos últimos 30 dias o modelo custou ${brl(f.trintaDias)}; em média ${brl(f.medioPorExecucao, 3)} por execução.`
        : 'Ainda não há execução com custo registrado.',
      evidence: [`${f.execucoesComCusto} execuções com custo`, `${f.execucoesSemCusto} registros sem custo (antigos ou com erro)`, f.observacao],
      href: '/resultados', label: 'Abrir resultados',
    }
  }
  if (/erro|falha|quebrou|saúde|saude|crm/.test(q)) {
    return {
      answer: data.saude24h.erros ? `Encontrei ${data.saude24h.erros} erro(s) nas últimas 24 horas.` : 'Nenhuma falha no diário nas últimas 24 horas.',
      evidence: [`${data.saude24h.total} execuções analisadas`, live.saude.crmOk ? 'Mapa do CRM conferido sem divergência' : `CRM: ${live.saude.problemas[0]}`],
      href: '/operacao?aba=historico', label: 'Abrir o histórico',
    }
  }
  if (/passag|equipe|humano|estorno|cancel|maquin|suporte|portal|app/.test(q)) {
    const mot = data.motivos.seteDias
    return {
      answer: `Nos últimos 7 dias a assistente passou ${data.marcos.seteDias.passagens} contato(s) para a equipe e resolveu ${data.marcos.seteDias.resolvidos} sem precisar dela.`,
      evidence: mot.length ? mot.map(m => `${m.rotulo}: ${m.n}`) : ['Nenhuma passagem nos últimos 7 dias'],
      href: '/operacao?aba=passagens', label: 'Ver passagens',
    }
  }
  if (/cliente|comercial|qualific|convers|funil|parad|oportun|dinheiro|lead/.test(q)) {
    const m = data.marcos.trintaDias
    const radar = buildMoneyRadar(live)
    return {
      answer: `Em 30 dias: ${m.atendidos} contatos atendidos, ${m.clientes} clientes e ${m.naoClientes} não clientes; ${m.qualificados} foram qualificados e passados ao comercial.`,
      evidence: radar.length ? radar.slice(0, 3).map(r => `${r.stage}: ${r.count} parada(s) há 7+ dias`) : ['Nenhuma oportunidade parada pelo critério de 7 dias'],
      href: '/resultados', label: 'Abrir resultados',
    }
  }
  if (/hor[aá]rio|fora|noite|fim de semana/.test(q)) {
    const m = data.marcos.seteDias
    return {
      answer: `Nos últimos 7 dias, ${m.foraDoHorario} contato(s) escreveram fora do horário, receberam o aviso e já fizeram a triagem com a assistente.`,
      evidence: [`Expediente da equipe: ${live.regras.expediente}`, 'O aviso sai uma vez por período fechado; a triagem segue normal.'],
      href: '/operacao?aba=historico', label: 'Abrir o histórico',
    }
  }
  if (/follow|recupera|sumiu|retom/.test(q)) {
    return {
      answer: rec ? rec.observacao : 'A leitura do follow-up não respondeu.',
      evidence: [],
      href: '/operacao?aba=recuperacao', label: 'Abrir recuperação',
    }
  }
  return {
    answer: `Nas últimas 24h: ${live.conversas24h} contatos atendidos, ${data.saude24h.erros} erro(s) e tempo mediano de ${live.respostaMedianaSegundos ? `${Math.round(live.respostaMedianaSegundos)}s` : '—'}.`,
    evidence: ['Resposta calculada com os seus dados, sem consumir tokens', 'Pergunte sobre passagens, estornos, clientes, horário, custo ou erros.'],
  }
}
