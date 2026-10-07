'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight, Bot, CheckCheck, CircleDollarSign, GitBranch, Headset, MessageSquareText,
  MousePointerClick, Sparkles, TrendingUp, Wallet, WalletCards,
} from 'lucide-react'
import RefreshButton from './RefreshButton'
import { Metric, PageIntro, SectionTitle } from './ProductUI'
import FocusNav, { type FocusItem } from './FocusNav'
import { brl } from '@/lib/format'
import { useExecutions, useLive } from '@/lib/hooks'
import { buildBriefing, type DecisionCard, type SignalTone } from '@/lib/intelligence'

type Focus = 'agir' | 'funil' | 'custos'

const FOCUS: FocusItem<Focus>[] = [
  { id: 'agir', label: 'Próximos passos', description: 'Escolha o que fazer', icon: MousePointerClick },
  { id: 'funil', label: 'Funil comercial', description: 'Onde estão as oportunidades', icon: GitBranch },
  { id: 'custos', label: 'Eficiência', description: 'Gastos e erros', icon: WalletCards },
]

export default function ExecutiveDashboard() {
  const [focus, setFocus] = useState<Focus>('agir')
  const { data: live, erro: liveErro, carregando: liveCarregando } = useLive()
  const { data, erro: execErro, carregando: execCarregando } = useExecutions()
  const f = data?.financeiro
  const pronto = !liveCarregando && !execCarregando
  // Fail-closed: só declara saúde depois das duas fontes; erro de conector é atenção
  const precisaAtencao = !!liveErro || !!execErro || (data?.saude24h.erros || 0) > 0 || (live ? !live.saude.crmOk : false)
  const briefing = buildBriefing(live, data)
  const [principal, ...secundarias] = briefing.decisions
  const hoje = data?.marcos.hoje
  const sete = data?.marcos.seteDias
  const taxaErro = data?.saude24h.total ? (data.saude24h.erros / data.saude24h.total) * 100 : 0

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="PAINEL EXECUTIVO"
        title="A assistente está"
        accent={!pronto ? 'sendo verificado.' : precisaAtencao ? 'pedindo atenção.' : 'operando bem.'}
        description="Primeiro o que pede decisão. Depois, só o detalhe que você escolher abrir."
        action={<RefreshButton />}
      />

      <section className="panel overflow-hidden">
        <div className="p-5 md:p-6 border-b border-line-soft flex items-start gap-4">
          <div className={`state-orb shrink-0 ${precisaAtencao ? 'text-warning bg-warning/[0.08]' : 'text-cyan bg-cyan/[0.08]'}`}>
            <Sparkles size={17} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-cyan">Briefing da Central · zero tokens</div>
            <h2 className="font-impact font-bold text-[19px] md:text-[22px] text-ink mt-2">{briefing.greeting}</h2>
            <p className="text-[13px] text-body-mid leading-relaxed mt-2">{briefing.summary}</p>
          </div>
        </div>
        {!pronto ? (
          <div className="h-28 animate-pulse surface-alt" />
        ) : liveErro || execErro ? (
          <div className="p-5 text-[13px] text-warning leading-relaxed">
            {liveErro ? `CRM: ${liveErro}` : `Diário: ${execErro}`}
          </div>
        ) : principal ? (
          <div>
            <div className="grid lg:grid-cols-[1.15fr_.85fr]">
              <Decision decision={principal} primary />
              <div className="border-t lg:border-t-0 lg:border-l border-line-soft p-5 flex flex-col justify-center">
                <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-body-muted">{precisaAtencao ? 'ESTADO ATUAL' : 'OPERAÇÃO PROTEGIDA'}</div>
                <p className="text-[13px] text-body-mid leading-relaxed mt-2">
                  {precisaAtencao
                    ? `${data?.saude24h.erros || 0} erro(s) nas últimas 24h${live && !live.saude.crmOk ? ' e divergência no CRM' : ''} merecem conferência.`
                    : 'A assistente está respondendo normalmente e sem falha registrada nas últimas 24h.'}
                </p>
                <Link href="/operacao" className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-cyan mt-4">Ver operação <ArrowRight size={12} /></Link>
              </div>
            </div>
            {secundarias.length > 0 && (
              <details className="group border-t border-line-soft">
                <summary className="list-none cursor-pointer px-5 py-3.5 flex items-center gap-3 hover-raise">
                  <span className="text-[12px] font-medium text-ink flex-1">Ver mais {secundarias.length} {secundarias.length === 1 ? 'sinal' : 'sinais'} do briefing</span>
                  <span className="text-[11px] text-body-faint group-open:rotate-90 transition-transform">▷</span>
                </summary>
                <div className="grid md:grid-cols-2 border-t border-line-soft divide-y md:divide-y-0 md:divide-x divide-line-soft">
                  {secundarias.map(d => <Decision key={d.id} decision={d} compact />)}
                </div>
              </details>
            )}
          </div>
        ) : (
          <div className="p-5 text-[13px] text-body-mid">Nenhum ponto pede decisão agora.</div>
        )}
      </section>

      <section>
        <SectionTitle eyebrow="O QUE IMPORTA HOJE" title="Atendimento, triagem e investimento." />
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <Metric icon={MessageSquareText} label="Contatos atendidos hoje" value={hoje ? String(hoje.atendidos) : '—'}
            hint={hoje ? `${hoje.clientes} cliente(s) · ${hoje.naoClientes} não cliente(s)` : undefined} color="#06b6d4" />
          <Metric icon={Headset} label="Passados para a equipe hoje" value={hoje ? String(hoje.passagens) : '—'} hint={sete ? `${sete.passagens} nos últimos 7 dias, com a triagem feita` : undefined} color="#a78bfa" />
          <Metric icon={CheckCheck} label="Resolvidos sem a equipe hoje" value={hoje ? String(hoje.resolvidos) : '—'}
            hint={sete ? `${sete.resolvidos} nos últimos 7 dias` : undefined} color="#3b82f6" featured={(hoje?.resolvidos || 0) > 0} />
          <Metric icon={Wallet} label="Custo do modelo hoje" value={f?.execucoesComCusto ? brl(f.hoje) : '—'}
            hint={f?.execucoesComCusto ? `${brl(f.medioPorExecucao, 3)} por execução, em média` : 'aguardando a primeira execução medida'} color="#22c55e" />
        </div>
      </section>

      <section className="space-y-4">
        <SectionTitle eyebrow="APROFUNDE SE PRECISAR" title="Uma pergunta por vez." description="Escolha um assunto. A Central mostra só o detalhe relacionado." />
        <FocusNav items={FOCUS} value={focus} onChange={setFocus} label="Detalhes da visão geral" />
      </section>

      {focus === 'funil' && (
        <section className="panel p-5 md:p-6">
          <SectionTitle eyebrow={`FUNIL COMERCIAL · ${live?.pipeline.nome.toUpperCase() || 'GHL'}`} title="Onde as oportunidades estão agora." description="Só leitura: nesta fase a assistente não move cards. O funil é da equipe."
            action={<Link href="/operacao?aba=funil" className="text-[11px] text-cyan">abrir funil</Link>} />
          <div className="space-y-3">
            {(live?.funil || []).map((etapa, _i, arr) => {
              const max = Math.max(...arr.map(x => x.n), 1)
              return (
                <div key={etapa.id}>
                  <div className="flex items-center justify-between text-[11.5px] mb-1.5">
                    <span className={etapa.ia ? 'text-ink' : 'text-body-mid'}>{etapa.label}</span>
                    <span className="font-mono text-body-muted">{etapa.n}</span>
                  </div>
                  <div className="h-1.5 rounded-full surface-alt overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.max(3, (etapa.n / max) * 100)}%`, background: etapa.ia ? 'linear-gradient(90deg,#0891b2,#22d3ee)' : 'var(--body-faint)' }} />
                  </div>
                </div>
              )
            })}
            {!live && <div className="h-32 rounded-lg surface-alt animate-pulse" />}
          </div>
        </section>
      )}

      {focus === 'custos' && (
        <section className="panel p-5 md:p-6">
          <SectionTitle eyebrow="EFICIÊNCIA" title="Custo sob controle." />
          <div className="grid sm:grid-cols-3 gap-5">
            <CostLine label="Hoje" value={f?.execucoesComCusto ? brl(f.hoje) : '—'} color="#22c55e" />
            <CostLine label="Últimos 7 dias" value={f?.execucoesComCusto ? brl(f.seteDias) : '—'} color="#06b6d4" />
            <CostLine label="Últimos 30 dias" value={f?.execucoesComCusto ? brl(f.trintaDias) : '—'} color="#3b82f6" />
            <div className="sm:col-span-3 pt-4 border-t border-line-soft">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11.5px] text-body-muted">Taxa de erro nas últimas 24h</span>
                <span className={`font-mono text-[11px] ${taxaErro === 0 ? 'text-success' : 'text-warning'}`}>{taxaErro.toFixed(1)}%</span>
              </div>
              <p className="text-[10.5px] text-body-faint leading-relaxed mt-3">{f?.observacao} A fatura do provedor continua sendo o fechamento financeiro.</p>
            </div>
          </div>
        </section>
      )}

      {focus === 'agir' && (
        <section>
          <SectionTitle eyebrow="PRÓXIMO PASSO" title="O que você quer fazer agora?" />
          <div className="grid md:grid-cols-3 gap-3">
            <Quick href="/operacao" icon={Bot} title="Acompanhar atendimentos" text="Quem a assistente está atendendo e cada decisão registrada." color="#06b6d4" />
            <Quick href="/operacao?aba=passagens" icon={Headset} title="Ver passagens" text="Quem foi para a equipe, por qual motivo e o resumo da triagem." color="#a78bfa" />
            <Quick href="/resultados" icon={TrendingUp} title="Ver o valor produzido" text="Clientes, não clientes, passagens, resolvidos e quanto custou." color="#22c55e" />
          </div>
        </section>
      )}
    </div>
  )
}

const TONE: Record<SignalTone, { color: string; label: string }> = {
  calm: { color: '#22c55e', label: 'PROTEÇÃO' },
  attention: { color: '#f59e0b', label: 'ATENÇÃO' },
  critical: { color: '#ef4444', label: 'URGENTE' },
  opportunity: { color: '#22c55e', label: 'OPORTUNIDADE' },
  learning: { color: '#a78bfa', label: 'APRENDIZADO' },
}

function Decision({ decision: d, primary = false, compact = false }: { decision: DecisionCard; primary?: boolean; compact?: boolean }) {
  const tone = TONE[d.tone]
  return (
    <Link href={d.href} className={`block p-5 interactive-card ${primary ? 'min-h-[185px]' : compact ? 'min-h-[145px]' : ''}`}>
      <div className="font-mono text-[8.5px] tracking-[0.13em]" style={{ color: tone.color }}>{tone.label}</div>
      <h3 className={`font-impact font-bold text-ink mt-3 ${primary ? 'text-[17px]' : 'text-[15px]'}`}>{d.title}</h3>
      <p className="text-[11.5px] text-body-mid leading-relaxed mt-2">{d.evidence}</p>
      {!compact && <p className="text-[10.5px] text-body-faint leading-relaxed mt-2">{d.impact}</p>}
      <span className="inline-flex items-center gap-1.5 text-[11px] text-cyan mt-4">{d.action} <ArrowRight size={11} /></span>
    </Link>
  )
}

function CostLine({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-8 h-8 rounded-[7px] border flex items-center justify-center" style={{ color, borderColor: `${color}30`, background: `${color}12` }}>
        <CircleDollarSign size={14} />
      </span>
      <div className="flex-1">
        <div className="text-[11px] text-body-muted">{label}</div>
        <div className="font-impact font-bold text-[17px] text-ink mt-0.5">{value}</div>
      </div>
    </div>
  )
}

function Quick({ href, icon: Icon, title, text, color }: { href: string; icon: typeof Sparkles; title: string; text: string; color: string }) {
  return (
    <Link href={href} className="panel interactive-card p-5 block">
      <span className="metric-icon" style={{ color, background: `${color}12`, borderColor: `${color}30` }}><Icon size={15} /></span>
      <h3 className="font-impact font-bold text-[15px] text-ink mt-5">{title}</h3>
      <p className="text-[12.5px] leading-relaxed text-body-mid mt-2">{text}</p>
      <span className="inline-flex items-center gap-1 text-[11px] text-cyan mt-4">Abrir <ArrowRight size={11} /></span>
    </Link>
  )
}
