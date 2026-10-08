'use client'

import { useEffect, useState } from 'react'
import { ExternalLink, Headset, Radio, Route, ScrollText } from 'lucide-react'
import RefreshButton from '@/components/RefreshButton'
import { PageIntro, SectionTitle } from '@/components/ProductUI'
import FlightRecorder from '@/components/FlightRecorder'
import MoneyRadar from '@/components/MoneyRadar'
import { dataHora } from '@/lib/format'
import { useExecutions, useLive } from '@/lib/hooks'
import type { Execution, Passagem } from '@/lib/types'

type Tab = 'agora' | 'passagens' | 'historico' | 'funil'
type Filtro = 'todas' | 'marcos' | 'travas' | 'erros'

const TABS: Array<{ id: Tab; label: string; icon: typeof Radio }> = [
  { id: 'agora', label: 'Agora', icon: Radio },
  { id: 'passagens', label: 'Passagens', icon: Headset },
  { id: 'historico', label: 'Histórico', icon: ScrollText },
  { id: 'funil', label: 'Funil', icon: Route },
]

const FILTROS: Record<Filtro, { label: string; fn: (e: Execution) => boolean }> = {
  todas: { label: 'Todas', fn: () => true },
  marcos: { label: 'Passou / resolveu', fn: e => !!e.marco },
  travas: { label: 'Com trava', fn: e => e.travas.length > 0 },
  erros: { label: 'Erros e puladas', fn: e => e.resultado !== 'respondeu' },
}

const PERFIL: Record<string, string> = { cliente: 'CLIENTE', nao_cliente: 'NÃO CLIENTE' }

export default function Operacao() {
  const [tab, setTab] = useState<Tab>('agora')
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [todasPassagens, setTodasPassagens] = useState(false)
  const { data: live, carregando, erro } = useLive()
  const { data, erro: execErro } = useExecutions()

  useEffect(() => {
    const pedida = new URLSearchParams(window.location.search).get('aba')
    if (pedida && TABS.some(t => t.id === pedida)) setTab(pedida as Tab)
  }, [])
  const trocar = (t: Tab) => {
    setTab(t)
    window.history.replaceState(null, '', t === 'agora' ? '/operacao' : `/operacao?aba=${t}`)
  }
  const execs = (data?.execucoes || []).filter(FILTROS[filtro].fn)

  return (
    <div className="space-y-8">
      <PageIntro eyebrow="OPERAÇÃO" title="O que a assistente está" accent="fazendo." description="Quem está falando agora, quem foi para a equipe, o diário de cada resposta e o funil." action={<RefreshButton />} />
      <div className="max-w-full overflow-x-auto no-scrollbar">
        <div className="segmented">
          {TABS.map(t => <button key={t.id} onClick={() => trocar(t.id)} className={`whitespace-nowrap ${tab === t.id ? 'active' : ''}`}><t.icon size={13} className="inline mr-1.5 -mt-0.5" />{t.label}</button>)}
        </div>
      </div>

      {tab === 'agora' && (
        <section>
          <SectionTitle eyebrow="ÚLTIMAS 24 HORAS" title="Quem falou com a assistente." description="O estado é o do último evento de cada contato: com a assistente, com a equipe ou fora da IA." />
          <div className="grid grid-cols-3 gap-3 mb-5">
            <Mini label="Com a assistente" value={live?.grupos.iaAtendendo ?? 0} color="#22c55e" />
            <Mini label="Com a equipe" value={live?.grupos.comHumano ?? 0} color="#a78bfa" />
            <Mini label="Fora da IA" value={live?.grupos.foraDaIA ?? 0} color="#737373" />
          </div>
          <div className="panel overflow-hidden">
            {(live?.conversas || []).map((c, i) => (
              <div key={c.id} className={`px-4 md:px-5 py-4 flex items-center gap-3 md:gap-4 ${i ? 'border-t border-line-soft' : ''}`}>
                <span className={`w-2 h-2 rounded-full shrink-0 ${c.estado === 'ia' ? 'bg-success' : c.estado === 'humano' ? 'bg-purple-400' : 'bg-body-faint'}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[13px] text-ink truncate">{c.nome}</span>
                    <span className="font-mono text-[8.5px] text-body-faint shrink-0">{c.estado === 'ia' ? 'ASSISTENTE' : c.estado === 'humano' ? 'EQUIPE' : 'FORA DA IA'}</span>
                  </div>
                  <p className="text-[12px] text-body-mid truncate mt-1">{c.ultimaMsg}</p>
                </div>
                <span className="font-mono text-[9.5px] text-body-faint shrink-0">{c.minutosAtras < 60 ? `${c.minutosAtras}min` : `${Math.round(c.minutosAtras / 60)}h`}</span>
              </div>
            ))}
            {!carregando && !erro && !live?.conversas.length && <Empty text="Ninguém escreveu nas últimas 24 horas. A assistente segue monitorando." />}
            {erro && <Empty text={`Não consegui ler a operação: ${erro}`} />}
            {carregando && <div className="h-40 animate-pulse surface-alt" />}
          </div>
        </section>
      )}

      {tab === 'passagens' && (
        <section className="space-y-5">
          <SectionTitle eyebrow="TRIAGEM ENTREGUE À EQUIPE" title="Quem foi para a equipe, e por quê." description="Na passagem a assistente tira a tag ia, põe atendimento-humano, deixa a conversa como não lida e grava uma nota com o resumo no contato." />
          {data && data.motivos.seteDias.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {data.motivos.seteDias.map(m => (
                <span key={m.motivo} className="px-3 py-1.5 rounded-full border border-line-soft text-[11.5px] text-body-mid">
                  {m.rotulo} <span className="font-mono text-ink ml-1">{m.n}</span>
                </span>
              ))}
              <span className="px-1 py-1.5 text-[10.5px] text-body-faint">últimos 7 dias</span>
            </div>
          )}
          <div className="space-y-2">
            {(data?.passagens || []).slice(0, todasPassagens ? 60 : 20).map((p, i) => <PassagemLinha key={`${p.ts}-${i}`} p={p} />)}
            {!todasPassagens && (data?.passagens.length || 0) > 20 && (
              <button type="button" onClick={() => setTodasPassagens(true)} className="w-full panel px-5 py-3.5 text-[12px] font-medium text-cyan hover-raise">
                Ver mais {(data?.passagens.length || 0) - 20} passagens
              </button>
            )}
            {data && !data.passagens.length && <div className="panel"><Empty text="Nenhuma passagem registrada ainda." /></div>}
            {execErro && <div className="panel"><Empty text={`Não consegui ler o diário: ${execErro}`} /></div>}
            {!data && !execErro && <div className="panel h-40 animate-pulse surface-alt" />}
          </div>
        </section>
      )}

      {tab === 'historico' && (
        <section>
          <SectionTitle eyebrow="DIÁRIO AUDITÁVEL" title="Cada execução, com o que entrou, o que saiu e quanto custou." description="Telefone, CPF, CNPJ e e-mail aparecem mascarados." />
          <div className="max-w-full overflow-x-auto no-scrollbar mb-4">
            <div className="segmented">
              {(Object.keys(FILTROS) as Filtro[]).map(f => <button key={f} onClick={() => setFiltro(f)} className={`whitespace-nowrap ${filtro === f ? 'active' : ''}`}>{FILTROS[f].label}</button>)}
            </div>
          </div>
          <div className="space-y-2">
            {execs.slice(0, 80).map((e, i) => <FlightRecorder key={`${e.ts}-${i}`} execution={e} />)}
            {data && !execs.length && <Empty text="Nenhuma execução com este filtro." />}
            {!data && <div className="panel h-40 animate-pulse surface-alt" />}
          </div>
        </section>
      )}

      {tab === 'funil' && (
        <section className="space-y-5">
          <SectionTitle eyebrow={`PIPELINE · ${live?.pipeline.nome.toUpperCase() || 'GHL'}`} title="Onde estão as oportunidades." description="Só leitura: nesta fase a assistente não move cards." />
          {live && (
            <div className="grid grid-cols-3 gap-3">
              <Mini label="Abertas" value={live.leads.abertas} color="#06b6d4" />
              <Mini label="Ganhas" value={live.leads.ganhas} color="#22c55e" />
              <Mini label="Perdidas" value={live.leads.perdidas} color="#737373" />
            </div>
          )}
          <div className="panel p-4 md:p-7 space-y-4">
            {(live?.funil || []).map((e, _i, arr) => {
              const max = Math.max(...arr.map(x => x.n), 1)
              return (
                <div key={e.id} className="grid grid-cols-[110px_1fr_28px] md:grid-cols-[170px_1fr_40px] items-center gap-3">
                  <span className="text-[12px] truncate text-ink">{e.label}</span>
                  <div className="h-2 surface-alt rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.max(2, (e.n / max) * 100)}%`, background: e.n ? '#06b6d4' : 'var(--body-faint)' }} /></div>
                  <span className="font-mono text-[10px] text-body-muted text-right">{e.n}</span>
                </div>
              )
            })}
            {!live && !erro && <div className="h-40 animate-pulse surface-alt rounded-lg" />}
            {live && !live.funil.length && <Empty text="O pipeline não respondeu. Veja Configurações." />}
            {erro && <Empty text={`Não consegui ler o funil: ${erro}`} />}
          </div>
          {live && live.funil.length > 0 && <MoneyRadar live={live} />}
        </section>
      )}
    </div>
  )
}

function PassagemLinha({ p }: { p: Passagem }) {
  return (
    <details className={`panel group overflow-hidden ${p.urgente ? 'border-danger/30' : ''}`}>
      <summary className="list-none cursor-pointer px-4 md:px-5 py-4 flex items-center gap-3 md:gap-4 hover-raise">
        <span className={`w-2 h-2 rounded-full shrink-0 ${p.urgente ? 'bg-danger' : 'bg-purple-400'}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-medium text-ink">{p.nome}</span>
            <span className="font-mono text-[8.5px] tracking-[0.1em] px-1.5 py-0.5 rounded border" style={{ color: p.urgente ? '#ef4444' : '#a78bfa', borderColor: p.urgente ? '#ef444440' : '#a78bfa40' }}>{p.rotulo.toUpperCase()}</span>
            {p.perfil && <span className="font-mono text-[8.5px] text-body-faint">{PERFIL[p.perfil]}</span>}
          </div>
          <p className="text-[12px] text-body-mid truncate mt-1 group-open:hidden">{p.resumo}</p>
        </div>
        <span className="font-mono text-[9.5px] text-body-faint shrink-0">{dataHora(p.ts)}</span>
      </summary>
      <div className="px-4 md:px-5 pb-5 pt-4 border-t border-line-soft">
        <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-body-faint">Resumo que foi para a nota do contato</div>
        <p className="text-[12.5px] leading-relaxed text-body-mid mt-2 whitespace-pre-wrap break-words max-w-[820px]">{p.resumo || 'Sem resumo registrado.'}</p>
        {p.link && (
          <a href={p.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[11.5px] text-cyan mt-4">
            Abrir o contato no GHL <ExternalLink size={11} />
          </a>
        )}
      </div>
    </details>
  )
}

function Mini({ label, value, color }: { label: string; value: number; color: string }) {
  return <div className="panel px-4 md:px-5 py-4"><div className="font-impact font-bold text-[24px]" style={{ color }}>{value}</div><div className="font-mono text-[9px] uppercase tracking-[0.12em] text-body-muted mt-1">{label}</div></div>
}

function Empty({ text }: { text: string }) {
  return <div className="p-8 text-center text-[12.5px] text-body-muted">{text}</div>
}
