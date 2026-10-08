'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, BookOpenText, CheckCircle2, FlaskConical, History, ListChecks, Loader2, Pencil, RotateCcw, ShieldCheck, Undo2, Upload, XCircle } from 'lucide-react'
import FocusNav, { type FocusItem } from '@/components/FocusNav'
import { PageIntro, SectionTitle } from '@/components/ProductUI'
import RefreshButton from '@/components/RefreshButton'
import { dataHora } from '@/lib/format'
import type { BaseEstado, BaseItem, Exame } from '@/lib/types'
import ComoConduz from './ComoConduz'

type View = 'textos' | 'conduz' | 'historico'

const VIEWS: FocusItem<View>[] = [
  { id: 'textos', label: 'Textos', description: 'O que ela manda e consulta', icon: BookOpenText },
  { id: 'conduz', label: 'Como ela conduz', description: 'Roteiro e travas (leitura)', icon: ListChecks },
  { id: 'historico', label: 'Versões', description: 'O que foi publicado', icon: History },
]

const CENARIO: Record<string, string> = {
  'cliente-maquininha': 'Cliente com problema na maquininha',
  'cliente-estorno-hoje': 'Estorno de venda de hoje',
  'cliente-estorno-anterior': 'Cancelamento de venda de dias anteriores',
  'cliente-portal-split': 'Dúvida no portal (split)',
  'atendente-direto': 'Pede um atendente logo de cara',
  'texto-livre-cliente': 'Cliente explica o problema sem menu',
  'nao-cliente-qualificacao': 'Não cliente: as seis perguntas',
  'nao-cliente-pede-humano': 'Não cliente pede uma pessoa',
  'nao-cliente-pede-taxa': 'Não cliente pergunta a taxa',
  'cliente-pergunta-taxa': 'Cliente pergunta a taxa',
  'fora-do-horario-estorno': 'Fora do horário',
  'cpf-invalido': 'CPF inválido',
  'documento-no-cadastro-nao-pergunta': 'Documento já no cadastro',
  'nao-cliente-documento-no-cadastro': 'Não cliente com documento no cadastro',
}

export default function Base() {
  const [view, setView] = useState<View>('textos')
  const [dados, setDados] = useState<(BaseEstado & { demo?: boolean }) | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [exame, setExame] = useState<Exame | null>(null)
  const [nota, setNota] = useState('')
  const [publicando, setPublicando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seguindo = useRef<string | null>(null)

  const carregar = useCallback(async () => {
    try {
      const d = await (await fetch('/api/base', { cache: 'no-store' })).json()
      if (d.error) { setErro(d.error); return }
      setDados(d); setErro(null)
      if (d.exame) setExame(d.exame)
    } catch (e) { setErro(String(e)) }
  }, [])

  useEffect(() => {
    carregar()
    window.addEventListener('central:refresh', carregar)
    return () => { window.removeEventListener('central:refresh', carregar); if (timer.current) clearTimeout(timer.current) }
  }, [carregar])

  // Exame rodando: acompanha a cada 2,5 s até terminar
  const acompanhar = useCallback((id: string) => {
    if (seguindo.current === id) return
    seguindo.current = id
    setPublicando(true)
    const passo = async () => {
      try {
        const d = await (await fetch(`/api/base?exame=${id}`, { cache: 'no-store' })).json()
        if (d.exame) setExame(d.exame)
        if (d.exame?.status === 'rodando') { timer.current = setTimeout(passo, 2500); return }
        seguindo.current = null
        setPublicando(false)
        carregar()
      } catch { timer.current = setTimeout(passo, 4000) }
    }
    passo()
  }, [carregar])

  useEffect(() => {
    if (exame?.status === 'rodando') acompanhar(exame.id)
  }, [exame, acompanhar])

  const post = async (corpo: Record<string, unknown>) => {
    const r = await fetch('/api/base', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) })
    const d = await r.json()
    if (d.itens) setDados(d)
    return { ok: r.ok, d }
  }

  const publicar = async () => {
    setAviso(null)
    setPublicando(true)
    const { ok, d } = await post({ acao: 'publicar', nota })
    if (!ok || !d.exame) {
      setPublicando(false)
      setAviso(d.erro || d.error || 'Não consegui iniciar o exame.')
      return
    }
    setNota('')
    setExame(d.exame)
    acompanhar(d.exame.id)
  }

  const itens = dados?.itens || []
  const grupos = dados ? Object.entries(dados.grupos).filter(([g]) => itens.some(i => i.grupo === g)) : []
  const alteracoes = dados?.alteracoes.length || 0
  const comProblema = itens.filter(i => i.rascunho !== null && i.problemas.length).length

  return (
    <div className="space-y-8">
      <PageIntro eyebrow="BASE DE DADOS" title="O que a assistente" accent="sabe." description="Os textos que ela manda e consulta. Edite à vontade: nada muda no WhatsApp até passar no exame automático." action={<RefreshButton />} />

      {dados?.demo && <p className="text-[12px] text-warning">Modo demonstração: os textos são os de verdade, mas salvar e publicar precisam do agente.</p>}
      {erro && <div className="panel p-5 text-[13px] text-warning">Não consegui ler a base: {erro}</div>}

      <section className="panel overflow-hidden">
        <div className="p-5 md:p-6 flex items-start gap-4 flex-wrap">
          <div className={`state-orb shrink-0 ${alteracoes ? 'text-warning bg-warning/[0.08]' : 'text-success bg-success/[0.08]'}`}>
            {alteracoes ? <Pencil size={16} /> : <ShieldCheck size={16} />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-cyan">{dados ? `Versão ${dados.versao} no ar` : 'Carregando'}{dados?.publicadoEm ? ` · publicada em ${dataHora(dados.publicadoEm)}` : dados ? ' · textos originais' : ''}</div>
            <h2 className="font-impact font-bold text-[18px] md:text-[20px] text-ink mt-2">
              {!dados ? 'Lendo a base…' : alteracoes ? `${alteracoes} ${alteracoes === 1 ? 'texto editado espera' : 'textos editados esperam'} o exame para valer.` : 'Tudo o que está aqui é o que a assistente usa agora.'}
            </h2>
            <p className="text-[12.5px] text-body-mid leading-relaxed mt-1.5">
              {alteracoes
                ? 'Teste no laboratório com o rascunho e, quando estiver bom, publique. O exame roda os 14 cenários de atendimento com os textos novos (leva menos de 1 minuto) e só publica se todos passarem. Cenário que falhar roda mais 2 vezes e precisa passar nas duas.'
                : 'Para mudar um texto, clique em Editar. A edição fica no rascunho até você publicar.'}
            </p>
          </div>
        </div>

        {alteracoes > 0 && (
          <div className="border-t border-line-soft p-5 md:px-6 flex flex-wrap items-center gap-3">
            <input value={nota} onChange={e => setNota(e.target.value)} maxLength={200} placeholder="O que mudou? (opcional, aparece no histórico)" className="campo rounded-[8px] px-3.5 py-2.5 text-[12.5px] flex-1 min-w-[220px]" />
            <Link href="/teste?versao=rascunho" className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-[8px] border border-line-soft text-[12px] text-body-mid hover:text-ink hover-raise">
              <FlaskConical size={13} /> Testar o rascunho
            </Link>
            <button type="button" onClick={publicar} disabled={publicando || comProblema > 0 || !!dados?.demo}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[8px] border border-cyan/30 bg-cyan/[0.12] text-cyan text-[12.5px] font-medium disabled:opacity-40">
              {publicando ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} Publicar com exame
            </button>
            <button type="button" onClick={() => post({ acao: 'descartar' })} disabled={publicando || !!dados?.demo} className="text-[11.5px] text-body-faint hover:text-ink disabled:opacity-40">descartar tudo</button>
            {comProblema > 0 && <p className="basis-full text-[11.5px] text-warning">Corrija {comProblema === 1 ? 'o texto marcado' : `os ${comProblema} textos marcados`} antes de publicar.</p>}
          </div>
        )}
        {aviso && <div className="border-t border-line-soft px-5 md:px-6 py-3 text-[12px] text-warning">{aviso}</div>}
        {exame && <ResultadoExame exame={exame} />}
      </section>

      <FocusNav items={VIEWS} value={view} onChange={setView} label="Áreas da base de dados" />

      {view === 'textos' && (
        <div className="space-y-8">
          {grupos.map(([g, titulo]) => (
            <section key={g}>
              <SectionTitle eyebrow={titulo.toUpperCase()} title={titulo} />
              <div className="space-y-3">
                {itens.filter(i => i.grupo === g).map(i => <Item key={i.id} item={i} post={post} bloqueado={publicando || !!dados?.demo} />)}
              </div>
            </section>
          ))}
          {!dados && !erro && <div className="panel h-60 animate-pulse surface-alt" />}
        </div>
      )}

      {view === 'conduz' && <ComoConduz />}

      {view === 'historico' && (
        <section>
          <SectionTitle eyebrow="VERSÕES PUBLICADAS" title="O que já esteve no ar." description="Voltar para uma versão vale na hora (ela já passou no exame quando foi publicada) e vira uma versão nova." />
          <div className="panel overflow-hidden">
            {dados && (
              <div className="px-5 py-4 flex items-center gap-3">
                <CheckCircle2 size={15} className="text-success shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-ink">Versão {dados.versao} · no ar</div>
                  <div className="text-[11.5px] text-body-muted mt-0.5">{dados.publicadoEm ? `${dataHora(dados.publicadoEm)} · ${dados.nota || 'sem nota'}` : 'textos originais da implantação'}</div>
                </div>
              </div>
            )}
            {(dados?.historico || []).map(h => (
              <div key={`${h.versao}-${h.publicadoEm}`} className="px-5 py-4 flex items-center gap-3 border-t border-line-soft">
                <History size={15} className="text-body-faint shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] text-ink">Versão {h.versao}</div>
                  <div className="text-[11.5px] text-body-muted mt-0.5">{h.publicadoEm ? `${dataHora(h.publicadoEm)} · ${h.nota || 'sem nota'}` : 'textos originais da implantação'}</div>
                </div>
                <button type="button" disabled={publicando || !!dados?.demo}
                  onClick={() => { if (confirm(`Voltar para a versão ${h.versao}? Ela passa a valer no WhatsApp agora.`)) post({ acao: 'voltar', versao: h.versao }) }}
                  className="inline-flex items-center gap-1.5 text-[11.5px] text-cyan disabled:opacity-40"><Undo2 size={12} /> Voltar para esta</button>
              </div>
            ))}
            {dados && !dados.historico.length && <div className="px-5 py-4 border-t border-line-soft text-[12px] text-body-muted">Nenhuma versão anterior ainda.</div>}
          </div>
        </section>
      )}
    </div>
  )
}

function Item({ item, post, bloqueado }: { item: BaseItem; post: (c: Record<string, unknown>) => Promise<{ ok: boolean; d: { problemas?: string[]; error?: string } }>; bloqueado: boolean }) {
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const atual = item.rascunho ?? item.noAr
  const editadoNoAr = item.noAr !== item.padrao
  const linhas = Math.min(18, Math.max(4, atual.split('\n').length + 1))

  const salvar = async (valor: string) => {
    setSalvando(true); setErro(null)
    const { ok, d } = await post({ acao: 'salvar', id: item.id, texto: valor })
    setSalvando(false)
    if (!ok) { setErro(d.error || 'Não salvou.'); return }
    setEditando(false)
  }

  return (
    <article className={`panel overflow-hidden ${item.rascunho !== null ? 'border-warning/30' : ''}`}>
      <div className="px-5 pt-4 pb-3 flex items-start gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-[14px] font-medium text-ink">{item.titulo}</h3>
            {item.rascunho !== null && <span className="font-mono text-[8.5px] tracking-[0.1em] px-1.5 py-0.5 rounded border border-warning/40 text-warning">RASCUNHO</span>}
            {item.rascunho === null && editadoNoAr && <span className="font-mono text-[8.5px] tracking-[0.1em] px-1.5 py-0.5 rounded border border-cyan/40 text-cyan">EDITADO PELA EQUIPE</span>}
          </div>
          <p className="text-[11.5px] text-body-muted leading-relaxed mt-1">{item.ajuda}</p>
        </div>
        {!editando && (
          <div className="flex items-center gap-3 shrink-0">
            {item.rascunho !== null && <button type="button" disabled={bloqueado} onClick={() => post({ acao: 'descartar', id: item.id })} className="inline-flex items-center gap-1 text-[11.5px] text-body-faint hover:text-ink disabled:opacity-40"><XCircle size={12} /> descartar</button>}
            {item.rascunho === null && editadoNoAr && <button type="button" disabled={bloqueado} onClick={() => salvar(item.padrao)} className="inline-flex items-center gap-1 text-[11.5px] text-body-faint hover:text-ink disabled:opacity-40"><RotateCcw size={12} /> texto original</button>}
            <button type="button" disabled={bloqueado} onClick={() => { setTexto(atual); setEditando(true) }} className="inline-flex items-center gap-1.5 text-[12px] text-cyan disabled:opacity-40"><Pencil size={12} /> Editar</button>
          </div>
        )}
      </div>
      <div className="px-5 pb-5">
        {editando ? (
          <div className="space-y-3">
            <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={linhas} className="campo w-full rounded-[8px] px-3.5 py-3 text-[13px] leading-relaxed font-space" />
            <div className="flex items-center gap-3 flex-wrap">
              <button type="button" onClick={() => salvar(texto)} disabled={salvando || !texto.trim()} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[8px] border border-cyan/30 bg-cyan/[0.12] text-cyan text-[12px] font-medium disabled:opacity-40">
                {salvando ? <Loader2 size={12} className="animate-spin" /> : null} Salvar no rascunho
              </button>
              <button type="button" onClick={() => { setEditando(false); setErro(null) }} className="text-[12px] text-body-muted hover:text-ink">Cancelar</button>
              <span className="text-[10.5px] text-body-faint">Fica no rascunho: o WhatsApp só muda depois do exame.</span>
            </div>
            {erro && <p className="text-[12px] text-warning">{erro}</p>}
          </div>
        ) : (
          <div className="surface-alt rounded-[8px] px-4 py-3 text-[12.5px] leading-relaxed text-ink whitespace-pre-wrap break-words">{atual}</div>
        )}
        {item.rascunho !== null && item.problemas.length > 0 && (
          <ul className="mt-3 space-y-1">
            {item.problemas.map(p => <li key={p} className="text-[11.5px] text-warning flex gap-2"><AlertTriangle size={12} className="shrink-0 mt-0.5" />{p}</li>)}
          </ul>
        )}
        {item.rascunho !== null && !editando && (
          <details className="mt-3 group">
            <summary className="list-none cursor-pointer text-[11px] text-body-faint hover:text-body-mid">ver o texto que está no ar ▷</summary>
            <div className="mt-2 rounded-[8px] border border-line-soft px-4 py-3 text-[12px] leading-relaxed text-body-mid whitespace-pre-wrap break-words">{item.noAr}</div>
          </details>
        )}
      </div>
    </article>
  )
}

function ResultadoExame({ exame: e }: { exame: Exame }) {
  if (e.status === 'rodando') {
    const pct = e.total ? Math.round((e.feitos / e.total) * 100) : 0
    return (
      <div className="border-t border-line-soft px-5 md:px-6 py-4">
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-ink inline-flex items-center gap-2"><Loader2 size={13} className="animate-spin text-cyan" /> Exame rodando com os textos novos…</span>
          <span className="font-mono text-body-muted">{e.feitos}/{e.total}</span>
        </div>
        <div className="h-1.5 surface-alt rounded-full overflow-hidden mt-2.5"><div className="h-full rounded-full bg-cyan transition-all" style={{ width: `${Math.max(4, pct)}%` }} /></div>
      </div>
    )
  }
  if (e.status === 'aprovado') {
    return (
      <div className="border-t border-line-soft px-5 md:px-6 py-4 flex items-start gap-3">
        <CheckCircle2 size={16} className="text-success shrink-0 mt-0.5" />
        <p className="text-[12.5px] text-body-mid leading-relaxed"><strong className="text-ink">Publicado: versão {e.versao}.</strong> Passou nos 14 cenários{e.instaveis?.length ? ` (${e.instaveis.length} precisou de nova tentativa e passou nas duas)` : ''}{e.fim ? `, em ${dataHora(e.fim)}` : ''}. A assistente já usa os textos novos no WhatsApp.</p>
      </div>
    )
  }
  return (
    <div className="border-t border-line-soft px-5 md:px-6 py-4">
      <div className="flex items-start gap-3">
        <XCircle size={16} className="text-danger shrink-0 mt-0.5" />
        <p className="text-[12.5px] text-body-mid leading-relaxed">
          <strong className="text-ink">{e.status === 'erro' ? 'O exame não terminou.' : `Não publicado: ${new Set((e.falhas || []).map(f => f.cenario)).size} de 14 cenários falharam.`}</strong>{' '}
          {e.status === 'erro' ? e.erro : 'Nada mudou no WhatsApp. Veja abaixo o que falhou, ajuste o texto e publique de novo.'}
        </p>
      </div>
      {(e.falhas || []).map((f, i) => (
        <details key={`${f.cenario}-${i}`} className="mt-3 rounded-[8px] border border-line-soft group">
          <summary className="list-none cursor-pointer px-4 py-3 text-[12.5px] text-ink flex items-center gap-2">
            <AlertTriangle size={13} className="text-warning shrink-0" /> {CENARIO[f.cenario] || f.cenario}
            <span className="ml-auto text-[10.5px] text-body-faint group-open:hidden">ver conversa</span>
          </summary>
          <div className="px-4 pb-4 space-y-3">
            <ul className="space-y-1">{f.motivos.map(m => <li key={m} className="text-[11.5px] text-warning">· {m}</li>)}</ul>
            <div className="space-y-2">
              {f.conversa.map((t, i) => (
                <div key={i} className="text-[11.5px] leading-relaxed">
                  <div className="text-body-muted"><strong className="text-body-mid">Cliente:</strong> {t.lead}</div>
                  <div className="text-body-mid whitespace-pre-wrap break-words mt-0.5"><strong className="text-ink">Assistente:</strong> {t.resposta}</div>
                </div>
              ))}
            </div>
          </div>
        </details>
      ))}
    </div>
  )
}
