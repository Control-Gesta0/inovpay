'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Bot, ChevronDown, FlaskConical, PenLine, RotateCcw, Send, ShieldCheck, Tags, UserRound } from 'lucide-react'
import CorrigirPainel from '@/components/CorrigirPainel'
import { PageIntro, SectionTitle } from '@/components/ProductUI'
import { brl, MOTIVO_ROTULO } from '@/lib/format'
import type { MsgConversa, TesteOpcoes, TesteSessao, TesteUso } from '@/lib/types'

const SUGESTOES = [
  'Oi, minha maquininha não liga',
  'Quero cancelar uma venda que fiz hoje',
  'Tenho dúvida no portal',
  'Não sou cliente, quero conhecer',
  'Quanto é a taxa?',
  'Quero falar com um atendente',
]

const TOOL: Record<string, string> = {
  definir_tipo: 'registrou cliente ou não cliente',
  gravar_documento: 'gravou o CPF/CNPJ',
  anotar: 'anotou',
  passar_para_humano: 'passou para a equipe',
}

const CAMPO: Record<string, string> = {
  assunto: 'Assunto', estado_maquininha: 'A maquininha liga?', descricao: 'Descrição', venda_de_hoje: 'Venda de hoje?',
  data_venda: 'Data da venda', valor_venda: 'Valor da venda', comprovante: 'Comprovante', tema_portal: 'Tema do portal',
  repasse: 'Recebe e repassa?', forma_repasse: 'Como repassa', recebedores: 'Recebedores', volume_mensal: 'Volume mensal',
  bitributacao: 'Imposto em dobro?', decisor: 'Quem decide', pedido_extra: 'Pediu também',
}

const PADRAO: TesteOpcoes = { perfil: 'novo', fora: false, versao: 'vigente' }

function novoId() {
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

export default function Teste() {
  const [id, setId] = useState<string | null>(null)
  const [sessao, setSessao] = useState<TesteSessao | null>(null)
  const [uso, setUso] = useState<TesteUso | null>(null)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [demo, setDemo] = useState(false)
  const lista = useRef<HTMLDivElement>(null)
  const [corrigindo, setCorrigindo] = useState<string | null>(null)
  const [correcoes, setCorrecoes] = useState<Record<string, MsgConversa>>({})
  const opcoes = sessao?.opcoes || PADRAO

  const aplicar = (d: { sessao?: TesteSessao | null; uso?: TesteUso; error?: string; erro?: string; demo?: boolean }) => {
    if (d.sessao !== undefined) setSessao(d.sessao)
    if (d.uso) setUso(d.uso)
    if (d.demo) setDemo(true)
    setErro(d.erro || d.error || null)
  }

  const recomecar = useCallback(async (sid: string, o: Partial<TesteOpcoes>) => {
    setErro(null)
    const r = await fetch('/api/teste', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessao: sid, acao: 'recomecar', opcoes: o }) })
    aplicar(await r.json())
  }, [])

  // Sessão do laboratório: um id por navegador (fica 6 h no agente)
  useEffect(() => {
    let sid = ''
    try { sid = localStorage.getItem('teste-sessao') || '' } catch { /* modo privado */ }
    if (!/^[\w-]{8,64}$/.test(sid)) { sid = novoId(); try { localStorage.setItem('teste-sessao', sid) } catch { /* idem */ } }
    setId(sid)
    const pedida = new URLSearchParams(window.location.search).get('versao')
    if (pedida === 'rascunho') { recomecar(sid, { versao: 'rascunho' }); window.history.replaceState(null, '', '/teste'); return }
    fetch(`/api/teste?sessao=${sid}`).then(r => r.json()).then(aplicar).catch(e => setErro(String(e)))
  }, [recomecar])

  // rola só a caixa da conversa (a página fica onde está)
  useEffect(() => { const l = lista.current; if (l) l.scrollTop = l.scrollHeight }, [sessao?.history.length, enviando])

  const enviar = async (msg = texto) => {
    const t = msg.trim()
    if (!t || !id || enviando) return
    setEnviando(true)
    setErro(null)
    setTexto('')
    // mostra a mensagem na hora; a resposta substitui a sessão inteira
    setSessao(s => s ? { ...s, history: [...s.history, { id: `tmp${Date.now()}`, dir: 'in', text: t, ts: Date.now() }] } : s)
    try {
      const r = await fetch('/api/teste', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessao: id, texto: t }) })
      const d = await r.json()
      if (!r.ok && !d.sessao) {
        // não entrou: devolve o texto para o campo
        setSessao(s => s ? { ...s, history: s.history.filter(m => !m.id.startsWith('tmp')) } : s)
        setTexto(t)
      }
      aplicar(d)
    } catch (e) {
      setErro(`Não consegui falar com o agente: ${e instanceof Error ? e.message : String(e)}`)
      setTexto(t)
    } finally {
      setEnviando(false)
    }
  }

  const trocar = (o: Partial<TesteOpcoes>) => { if (id) recomecar(id, { ...opcoes, ...o }) }
  const historia = sessao?.history || []
  const fechado = !!sessao?.mundo.state.finalizado
  const usdBrl = uso?.usdBrl || 5.4

  return (
    <div className="space-y-8">
      <PageIntro eyebrow="TESTE" title="Converse com a assistente," accent="sem risco." description="Mesmo cérebro, mesmas ferramentas e travas do WhatsApp. Nada vai para o GHL nem para nenhum cliente." />

      {demo && <p className="text-[12px] text-warning">Modo demonstração: a conversa abaixo é um exemplo. Para conversar de verdade, a Central precisa do agente.</p>}

      <section className="panel p-4 md:p-5 flex flex-wrap items-center gap-x-6 gap-y-3">
        <Opcao rotulo="Contato" valor={opcoes.perfil} onChange={v => trocar({ perfil: v as TesteOpcoes['perfil'] })}
          itens={[['novo', 'Sem cadastro'], ['com_documento', 'CPF/CNPJ no cadastro']]} />
        <Opcao rotulo="Horário" valor={opcoes.fora ? 'fora' : 'dentro'} onChange={v => trocar({ fora: v === 'fora' })}
          itens={[['dentro', 'Dentro'], ['fora', 'Fora do horário']]} />
        <Opcao rotulo="Textos" valor={opcoes.versao} onChange={v => trocar({ versao: v as TesteOpcoes['versao'] })}
          itens={[['vigente', 'No ar'], ['rascunho', 'Rascunho']]} />
        <button type="button" onClick={() => id && recomecar(id, opcoes)} className="ml-auto inline-flex items-center gap-2 px-3.5 py-2 rounded-[8px] border border-line-soft text-[12px] text-body-mid hover:text-ink hover-raise">
          <RotateCcw size={13} /> Recomeçar
        </button>
      </section>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
        <section className="panel overflow-hidden flex flex-col min-h-[520px]">
          <div ref={lista} className="flex-1 p-4 md:p-5 space-y-3 overflow-y-auto max-h-[62vh] scroll-thin">
            {!historia.length && (
              <div className="py-8 text-center">
                <FlaskConical size={20} className="text-cyan mx-auto" />
                <p className="text-[13px] text-body-mid mt-3">Escreva como um cliente escreveria no WhatsApp, ou comece por um destes:</p>
                <div className="flex flex-wrap justify-center gap-2 mt-4">
                  {SUGESTOES.map(s => (
                    <button key={s} type="button" onClick={() => enviar(s)} disabled={enviando || demo}
                      className="px-3 py-2 rounded-full border border-line-soft text-[11.5px] text-body-mid hover:text-ink hover:border-cyan/25 disabled:opacity-40">{s}</button>
                  ))}
                </div>
              </div>
            )}
            {historia.map(m => {
              const d = sessao?.detalhes[m.id]
              const aviso = m.id.startsWith('a')
              return (
                <div key={m.id} className={`flex ${m.dir === 'in' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[86%] md:max-w-[78%] ${m.dir === 'in' ? 'items-end' : 'items-start'} flex flex-col`}>
                    <div className={`rounded-[12px] px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap break-words ${
                      m.dir === 'in' ? 'bg-cyan/[0.12] border border-cyan/25 text-ink rounded-br-[4px]' : 'surface-alt border border-line-soft text-ink rounded-bl-[4px]'}`}>
                      {m.text}
                    </div>
                    {aviso && <span className="font-mono text-[9px] text-body-faint mt-1">AVISO DE FORA DO HORÁRIO · ENVIADO PELO SISTEMA</span>}
                    {d && (
                      <div className="flex items-start gap-3 flex-wrap">
                        <Detalhes d={d} usdBrl={usdBrl} />
                        {!demo && (
                          <button type="button" onClick={() => setCorrigindo(m.id)} className={`mt-1 inline-flex items-center gap-1 text-[10.5px] font-medium ${correcoes[m.id] ? 'text-success' : 'text-cyan'} hover:underline`}>
                            <PenLine size={11} /> {correcoes[m.id] ? 'corrigida · ver' : 'Corrigir'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
            {enviando && <div className="text-[11.5px] text-body-muted animate-pulse">A assistente está escrevendo… (pode levar uns 15 segundos)</div>}
          </div>

          <div className="border-t border-line-soft p-3 md:p-4">
            {erro && <p className="text-[12px] text-warning mb-2">{erro}</p>}
            {fechado ? (
              <div className="flex items-center justify-between gap-3 text-[12.5px] text-body-mid">
                <span>Passou para a equipe. No WhatsApp, daqui em diante quem responde é a equipe.</span>
                <button type="button" onClick={() => id && recomecar(id, opcoes)} className="shrink-0 inline-flex items-center gap-1.5 text-cyan text-[12px]"><RotateCcw size={12} /> Recomeçar</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={1} placeholder="Escreva como o cliente…" disabled={demo}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
                  className="campo flex-1 rounded-[10px] px-3.5 py-2.5 text-[13.5px] resize-none min-h-[44px] max-h-40" />
                <button type="button" onClick={() => enviar()} disabled={!texto.trim() || enviando || demo} aria-label="Enviar"
                  className="px-4 rounded-[10px] border border-cyan/30 bg-cyan/[0.12] text-cyan disabled:opacity-30"><Send size={16} /></button>
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-4">
          <section className="panel p-5">
            <SectionTitle eyebrow="NO GHL, ISSO FARIA" title="O que mudaria no contato." />
            <div className="space-y-4 text-[12.5px]">
              <Linha icon={UserRound} rotulo="Cliente?" valor={sessao?.mundo.state.tipo === 'cliente' ? 'Sim' : sessao?.mundo.state.tipo === 'nao_cliente' ? 'Não é cliente' : 'Ainda não sabe'} />
              <Linha icon={ShieldCheck} rotulo="Campo CPF/CNPJ" valor={sessao?.mundo.documento ? `${sessao.mundo.documento}${opcoes.perfil === 'com_documento' ? ' (já estava)' : ''}` : 'vazio'} />
              <div className="flex items-start gap-3">
                <Tags size={14} className="text-cyan shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="text-body-muted text-[11px]">Tags</div>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {(sessao?.mundo.tags || ['ia']).map(t => <span key={t} className="font-mono text-[10px] px-2 py-0.5 rounded border border-line-soft text-ink">{t}</span>)}
                  </div>
                </div>
              </div>
              {sessao?.mundo.state.dados && Object.keys(sessao.mundo.state.dados).length > 0 && (
                <div>
                  <div className="text-body-muted text-[11px] mb-1.5">Anotado</div>
                  <dl className="space-y-1.5">
                    {Object.entries(sessao.mundo.state.dados).filter(([, v]) => v).map(([k, v]) => (
                      <div key={k} className="grid grid-cols-[110px_1fr] gap-2"><dt className="text-body-faint text-[11px]">{CAMPO[k] || k}</dt><dd className="text-ink text-[11.5px] break-words">{v}</dd></div>
                    ))}
                  </dl>
                </div>
              )}
              {sessao?.mundo.state.finalizado && (
                <div className="rounded-[8px] border border-purple-400/30 bg-purple-400/[0.06] p-3">
                  <div className="font-mono text-[9px] tracking-[0.1em] text-purple-400">PASSOU PARA A EQUIPE · {(MOTIVO_ROTULO[sessao.mundo.state.finalizado.motivo] || sessao.mundo.state.finalizado.motivo).toUpperCase()}</div>
                  {sessao.mundo.notes[0] && <pre className="mt-2 text-[11px] text-body-mid whitespace-pre-wrap break-words font-space">{sessao.mundo.notes[0]}</pre>}
                </div>
              )}
              {(sessao?.mundo.cards || []).map((c, i) => (
                <div key={i} className="rounded-[8px] border border-cyan/30 bg-cyan/[0.05] p-3">
                  <div className="font-mono text-[9px] tracking-[0.1em] text-cyan">CARD NO FUNIL SUPORTE INOVPAY</div>
                  <p className="text-[11.5px] text-ink mt-1.5">{c} · etapa &quot;Entrou no suporte&quot;</p>
                </div>
              ))}
            </div>
          </section>
          <p className="text-[10.5px] text-body-faint leading-relaxed px-1">
            {sessao ? `Esta conversa: ${sessao.turnos} mensagem(ns), ${brl(sessao.custoUsd * usdBrl, 3)} de modelo. ` : ''}
            {uso ? `Laboratório hoje: ${uso.mensagens} de ${uso.limite} mensagens, ${brl(uso.custoUsd * usdBrl, 2)}.` : ''} Fotos e áudios não entram no teste.
          </p>
        </aside>
      </div>

      {corrigindo && id && sessao && (() => {
        const i = sessao.history.findIndex(m => m.id === corrigindo)
        if (i < 0) return null
        const ultimaOut = sessao.history.slice(0, i).map(m => m.dir).lastIndexOf('out')
        const cliente = sessao.history.slice(ultimaOut + 1, i).filter(m => m.dir === 'in').map(m => m.text).join('\n')
        return (
          <CorrigirPainel origem="teste" cliente={cliente} resposta={sessao.history[i].text}
            pedido={{ acao: 'corrigir', sessao: sessao.id, mensagem: corrigindo }} resultado={correcoes[corrigindo]}
            onResultado={r => setCorrecoes(c => ({ ...c, [corrigindo]: r }))}
            onFechar={() => setCorrigindo(null)}
            onTestarRascunho={() => { setCorrigindo(null); recomecar(id, { ...opcoes, versao: 'rascunho' }) }} />
        )
      })()}
    </div>
  )
}

function Opcao({ rotulo, valor, itens, onChange }: { rotulo: string; valor: string; itens: Array<[string, string]>; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-body-muted">{rotulo}</span>
      <div className="segmented">
        {itens.map(([v, l]) => <button key={v} type="button" onClick={() => v !== valor && onChange(v)} className={`whitespace-nowrap ${v === valor ? 'active' : ''}`}>{l}</button>)}
      </div>
    </div>
  )
}

function Linha({ icon: Icon, rotulo, valor }: { icon: typeof Bot; rotulo: string; valor: string }) {
  return (
    <div className="flex items-start gap-3">
      <Icon size={14} className="text-cyan shrink-0 mt-0.5" />
      <div className="min-w-0"><div className="text-body-muted text-[11px]">{rotulo}</div><div className="text-ink mt-0.5 break-words">{valor}</div></div>
    </div>
  )
}

function Detalhes({ d, usdBrl }: { d: TesteSessao['detalhes'][string]; usdBrl: number }) {
  const [aberto, setAberto] = useState(false)
  const resumo = [
    d.tools.length ? [...new Set(d.tools.map(t => TOOL[t] || t))].join(', ') : 'sem ação no contato',
    `${(d.ms / 1000).toFixed(1)} s`,
    brl(d.custoUsd * usdBrl, 3),
    d.guard.length ? `${d.guard.length} trava(s)` : '',
  ].filter(Boolean).join(' · ')
  return (
    <div className="mt-1 max-w-full">
      <button type="button" onClick={() => setAberto(v => !v)} className="inline-flex items-center gap-1 font-mono text-[9.5px] text-body-faint hover:text-body-mid text-left">
        {resumo} <ChevronDown size={10} className={aberto ? 'rotate-180' : ''} />
      </button>
      {aberto && (
        <div className="mt-1.5 rounded-[8px] border border-line-soft p-3 space-y-1.5 text-[11px] text-body-mid break-words">
          {d.log.map((l, i) => <div key={i}>· {l}</div>)}
          {d.guard.map((g, i) => <div key={`g${i}`} className="text-warning">trava: {g}</div>)}
          {!d.log.length && !d.guard.length && <div>Respondeu sem chamar ferramenta.</div>}
        </div>
      )}
    </div>
  )
}
