'use client'

import { useState } from 'react'
import { CheckCircle2, Clock3, MessageCircleReply, PauseCircle, Target } from 'lucide-react'
import { SectionTitle } from './ProductUI'
import { tempoRelativo } from '@/lib/format'
import { useRecovery } from '@/lib/hooks'
import type { RecoveryData } from '@/lib/types'

type View = 'agora' | 'eficacia' | 'definicao'

/** Recuperação: quem vai receber follow-up, quem voltou a conversar e quem avançou. Na InovPay, fora desta fase. */
export default function RecoveryPanel() {
  const [view, setView] = useState<View>('agora')
  const { data, erro, carregando } = useRecovery()

  if (carregando) return <div className="panel h-52 animate-pulse surface-alt" />
  if (erro || !data) return <Empty text={`A recuperação não respondeu${erro ? `: ${erro}` : ''}.`} />

  if (!data.ativo) {
    return (
      <section className="space-y-6">
        <SectionTitle eyebrow="RECUPERAÇÃO" title="Follow-up automático." description="Retomar quem parou de responder, com cadência e medição de quem voltou." />
        <div className="panel p-5 md:p-6 flex items-start gap-4">
          <PauseCircle size={16} className="text-body-muted shrink-0 mt-0.5" />
          <div>
            <div className="text-[13px] font-medium text-ink">Fora do escopo desta fase</div>
            <p className="text-[12.5px] text-body-mid leading-relaxed mt-1.5">{data.observacao}</p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-6">
      <SectionTitle eyebrow="RECUPERAÇÃO" title="Quem vai receber, quem voltou e quem avançou." description="Voltar a conversar e avançar no funil são conversões diferentes, e aparecem separadas." />
      <div className="segmented overflow-x-auto max-w-full">
        {([['agora', 'Agora'], ['eficacia', 'Eficácia'], ['definicao', 'Definição']] as const).map(([id, label]) =>
          <button key={id} onClick={() => setView(id)} className={view === id ? 'active' : ''}>{label}</button>)}
      </div>
      {view === 'agora' && <Agora data={data} />}
      {view === 'eficacia' && <Eficacia data={data} />}
      {view === 'definicao' && <Definicao data={data} />}
    </section>
  )
}

function Agora({ data }: { data: RecoveryData }) {
  const b = data.buckets
  return <>
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      <Metric label="Na fila" value={data.fila.length} icon={Clock3} color="#06b6d4" />
      <Metric label="Vencidos" value={b.vencidos} icon={Clock3} color="#ef4444" />
      <Metric label="Na próxima hora" value={b.proximaHora} icon={Clock3} color="#f59e0b" />
      <Metric label="Ainda hoje" value={b.hoje} icon={Clock3} color="#a78bfa" />
      <Metric label="Amanhã ou depois" value={b.amanha + b.depois} icon={Clock3} color="#737373" />
    </div>
    <div className="panel overflow-hidden">
      {data.fila.map((l, i) => (
        <div key={l.contactId} className={`px-5 py-4 flex items-center gap-3 ${i ? 'border-t border-line-soft' : ''}`}>
          <div className="min-w-0 flex-1 text-[13px] font-medium text-ink truncate">{l.nome}</div>
          <span className="font-mono text-[10px] text-cyan">{l.proximoToque > data.definicao.cadenciaHoras.length ? 'ENCERRAR' : `TOQUE ${l.proximoToque}`}</span>
          <span className="text-[11px] text-body-mid w-[92px] text-right">{tempoRelativo(l.quando)}</span>
        </div>
      ))}
      {!data.fila.length && <Empty text="Nenhum lead aguardando follow-up agora." />}
    </div>
  </>
}

function Eficacia({ data }: { data: RecoveryData }) {
  const enviados = data.porToque.reduce((s, t) => s + t.enviados, 0)
  const resp = data.porToque.reduce((s, t) => s + t.responderam, 0)
  const conc = data.porToque.reduce((s, t) => s + t.concretizaram, 0)
  return <>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Metric label="Toques no diário" value={enviados} icon={Clock3} color="#737373" />
      <Metric label="Voltaram a conversar" value={resp} icon={MessageCircleReply} color="#22c55e" />
      <Metric label="Avançaram em 7 dias" value={conc} icon={Target} color="#06b6d4" />
      <Metric label="Cadência esgotada" value={data.esgotados} icon={CheckCircle2} color="#a78bfa" />
    </div>
    <div className="panel overflow-x-auto">
      <table className="w-full min-w-[520px] text-left">
        <thead><tr className="font-mono text-[9px] uppercase tracking-[0.1em] text-body-faint">
          {['Toque', 'Espera', 'No diário', 'Responderam', 'Avançaram'].map(x => <th key={x} className="px-4 py-3">{x}</th>)}
        </tr></thead>
        <tbody>{data.porToque.map(t => (
          <tr key={t.toque} className="border-t border-line-soft text-[12px] text-body-mid">
            <td className="px-4 py-3 font-mono text-cyan">FU{t.toque}</td>
            <td className="px-4 py-3">{horas(data.definicao.cadenciaHoras[t.toque - 1])}</td>
            <td className="px-4 py-3">{t.enviados}</td>
            <td className="px-4 py-3">{t.responderam}</td>
            <td className="px-4 py-3">{t.concretizaram}</td>
          </tr>
        ))}</tbody>
      </table>
      <p className="px-4 py-3 border-t border-line-soft text-[10.5px] text-body-faint">&quot;No diário&quot; conta os toques ainda dentro das últimas 1.000 execuções registradas; respostas e avanços vêm do contador permanente.</p>
    </div>
  </>
}

function Definicao({ data }: { data: RecoveryData }) {
  return <div className="panel p-6 md:p-8 max-w-3xl space-y-5">
    <Rule label="Voltou a conversar" value={data.definicao.resposta} />
    <Rule label="Concretizou" value={data.definicao.objetivo} />
    <Rule label="Janela de atribuição" value={`${data.definicao.janelaHoras} horas depois da resposta`} />
    <Rule label="Cadência" value={data.definicao.cadenciaHoras.map(horas).join(' → ') + ', só em dia útil das 9h às 18h'} />
  </div>
}

function horas(h: number) { return h < 24 ? `${h}h` : `${Math.round(h / 24)}d` }

function Metric({ label, value, icon: Icon, color }: { label: string; value: number; icon: typeof Clock3; color: string }) {
  return <div className="panel p-4"><Icon size={14} style={{ color }} /><div className="font-impact text-[24px] font-bold text-ink mt-3">{value}</div><div className="text-[10.5px] text-body-muted mt-1">{label}</div></div>
}

function Rule({ label, value }: { label: string; value: string }) {
  return <div><div className="font-mono text-[9px] uppercase tracking-[0.12em] text-body-faint">{label}</div><div className="text-[13px] mt-1.5 text-ink">{value}</div></div>
}

function Empty({ text }: { text: string }) {
  return <div className="p-8 text-center text-[12px] text-body-muted">{text}</div>
}
