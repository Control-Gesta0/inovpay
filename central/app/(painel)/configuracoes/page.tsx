'use client'

import { AlertTriangle, CheckCircle2, Cpu, Database, Repeat2, Server, Tags } from 'lucide-react'
import RefreshButton from '@/components/RefreshButton'
import { PageIntro, SectionTitle } from '@/components/ProductUI'
import { SISTEMA_VERSAO } from '@/components/Sidebar'
import { useExecutions, useLive, useRecovery } from '@/lib/hooks'

export default function Configuracoes() {
  const { data: live, erro: liveErro, carregando } = useLive()
  const { data: exec, erro: execErro } = useExecutions()
  const { data: rec } = useRecovery()
  const crmOk = !!live && live.saude.crmOk && !liveErro

  return (
    <div className="space-y-8">
      <PageIntro eyebrow="CONFIGURAÇÕES" title="Sistema e" accent="conexões." description="Estado das integrações que sustentam a assistente. Somente leitura." action={<RefreshButton />} />

      <section>
        <SectionTitle eyebrow="SAÚDE" title="As fontes do painel." />
        <div className="grid md:grid-cols-2 gap-3">
          <Linha icon={Server} titulo="Agente (diário de execuções)" ok={!!exec && !execErro} carregando={!exec && !execErro}
            texto={execErro || (exec ? `${exec.cobertura.registros} execuções no diário · modelo ${exec.modelo}` : 'verificando…')} />
          <Linha icon={Database} titulo="CRM (GoHighLevel)" ok={crmOk} carregando={carregando}
            texto={liveErro || (live ? (live.saude.crmOk ? `Mapa conferido: campo CPF/CNPJ e pipeline ${live.pipeline.nome} batem com a conta · ${live.leads.total} oportunidades` : `${live.saude.problemas.length} divergência(s)`) : 'verificando…')} />
          <Linha icon={Repeat2} titulo="Follow-up automático" ok={!!rec?.ativo} neutro={!!rec && !rec.ativo} carregando={!rec}
            texto={rec ? (rec.ativo ? `Ligado · ${rec.fila.length} na fila` : 'Fora do escopo desta fase') : 'verificando…'} />
          <Linha icon={Tags} titulo="Quem a assistente atende" ok neutro carregando={!live}
            texto={live ? regraGate(live.regras) : 'verificando…'} />
          <Linha icon={Cpu} titulo="Versão da Central" ok neutro texto={`${SISTEMA_VERSAO} · expediente da equipe: ${live?.regras.expediente || '…'}`} />
        </div>
      </section>

      {live && live.saude.problemas.length > 0 && (
        <section className="panel p-5 md:p-6">
          <SectionTitle eyebrow="DIVERGÊNCIAS NO CRM" title="O que conferir no GoHighLevel." description="O GHL aceita gravação em campo que não existe mais, e o dado some sem aviso." />
          <ul className="space-y-2">
            {live.saude.problemas.map(p => <li key={p} className="text-[12.5px] text-warning flex gap-2"><AlertTriangle size={14} className="shrink-0 mt-0.5" />{p}</li>)}
          </ul>
        </section>
      )}
    </div>
  )
}

function regraGate(r: { modoGate: string; gateTag: string; humanTag: string }) {
  if (r.modoGate === 'desligada') return 'Desligada: a assistente não responde ninguém (MODO_GATE).'
  const base = r.modoGate === 'todos' ? 'Todos os contatos' : `Só contatos com a tag “${r.gateTag}”`
  return `${base}, exceto quem tem “${r.humanTag}”. Na passagem, a tag “${r.gateTag}” sai e “${r.humanTag}” entra.`
}

function Linha({ icon: Icon, titulo, texto, ok, neutro, carregando }: { icon: typeof Server; titulo: string; texto: string; ok: boolean; neutro?: boolean; carregando?: boolean }) {
  const cor = carregando ? 'text-body-muted' : neutro ? 'text-body-muted' : ok ? 'text-success' : 'text-warning'
  return (
    <div className="panel p-5 flex items-start gap-4">
      <span className="metric-icon text-cyan bg-cyan/[0.07] border-cyan/20 shrink-0"><Icon size={15} /></span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-ink">{titulo}</span>
          {!carregando && !neutro && (ok ? <CheckCircle2 size={13} className={cor} /> : <AlertTriangle size={13} className={cor} />)}
        </div>
        <p className={`text-[12px] leading-relaxed mt-1 break-words ${ok || neutro ? 'text-body-mid' : cor}`}>{texto}</p>
      </div>
    </div>
  )
}
