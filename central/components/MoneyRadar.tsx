'use client'

import { useState } from 'react'
import { AlertTriangle, ArrowRight, ChevronDown, CircleDollarSign, Radar, TimerReset } from 'lucide-react'
import type { LiveData } from '@/lib/types'
import { brl } from '@/lib/format'
import { buildMoneyRadar } from '@/lib/intelligence'
import { SectionTitle } from './ProductUI'

export default function MoneyRadar({ live }: { live: LiveData | null }) {
  const [showAll, setShowAll] = useState(false)
  const signals = buildMoneyRadar(live)
  const visibleSignals = showAll ? signals : signals.slice(0, 2)
  const value = signals.reduce((n, s) => n + s.value, 0)
  const count = signals.reduce((n, s) => n + s.count, 0)

  return (
    <section id="radar" className="panel overflow-hidden scroll-mt-8">
      <div className="p-5 md:p-6 border-b border-line-soft">
        <SectionTitle
          eyebrow="RADAR DE DINHEIRO NA MESA · ZERO TOKENS"
          title={count ? `${count} oportunidades merecem ação.` : 'Nenhum sinal crítico pelo critério atual.'}
          description={count
            ? `${value ? `${brl(value, 0)} em valor aberto atravessa as etapas sinalizadas. ` : ''}O radar procura cards sem mudança há 7 dias ou mais.`
            : 'O radar analisa automaticamente tempo parado e valor aberto por etapa.'}
          action={
            <div className="state-orb text-success bg-success/[0.08]"><Radar size={17} /></div>
          }
        />
      </div>

      {signals.length > 0 ? (
        <div className="grid lg:grid-cols-2">
          {visibleSignals.map((s, i) => (
            <div key={s.id} className={`p-5 md:p-6 ${i % 2 ? 'lg:border-l' : ''} ${i > 1 ? 'border-t' : ''} border-line-soft`}>
              <div className="flex items-start gap-3">
                <span className={`metric-icon shrink-0 ${s.tone === 'critical' ? 'text-danger bg-danger/[0.07] border-danger/20' : 'text-success bg-success/[0.07] border-success/20'}`}>
                  {s.tone === 'critical' ? <AlertTriangle size={14} /> : <CircleDollarSign size={14} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-impact font-bold text-[14px] text-ink">{s.title}</h3>
                    {s.value > 0 && <span className="font-mono text-[10px] text-success">{brl(s.value, 0)}</span>}
                  </div>
                  <p className="text-[11.5px] leading-relaxed text-body-mid mt-2">{s.explanation}</p>
                  {s.samples.length > 0 && (
                    <div className="mt-4 space-y-1.5">
                      {s.samples.map(a => (
                        <div key={a.id} className="surface-alt rounded-md px-3 py-2 flex items-center gap-2">
                          <TimerReset size={11} className="text-warning shrink-0" />
                          <span className="text-[10.5px] text-body-mid truncate flex-1">{a.nome}</span>
                          <span className="font-mono text-[8.5px] text-body-faint">{a.diasParado}d</span>
                          {a.valor > 0 && <span className="font-mono text-[8.5px] text-success">{brl(a.valor, 0)}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="inline-flex items-center gap-1 text-[10.5px] text-cyan mt-4">Priorizar no CRM <ArrowRight size={10} /></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-8 text-center text-[12px] text-body-muted">O critério atual não encontrou oportunidade aberta sem mudança há 7 dias.</div>
      )}

      {signals.length > 2 && (
        <div className="px-5 py-4 border-t border-line-soft flex items-center justify-between gap-4">
          <p className="text-[11px] text-body-muted">
            {showAll ? 'Todas as etapas sinalizadas estão visíveis.' : `${signals.length - 2} ${signals.length - 2 === 1 ? 'etapa adicional fica recolhida' : 'etapas adicionais ficam recolhidas'} para manter o foco.`}
          </p>
          <button
            type="button"
            onClick={() => setShowAll(v => !v)}
            className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-cyan"
          >
            {showAll ? 'Mostrar menos' : `Ver mais ${signals.length - 2}`}
            <ChevronDown size={12} className={showAll ? 'rotate-180 transition-transform' : 'transition-transform'} />
          </button>
        </div>
      )}

      <div className="px-5 py-3 border-t border-line-soft text-[9.5px] text-body-faint">
        Valor aberto não é receita garantida. O radar prioriza investigação; não atribui venda à IA. O valor depende do campo Valor da oportunidade estar preenchido no GHL.
      </div>
    </section>
  )
}
