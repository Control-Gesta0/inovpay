import OpenAI from 'openai'
import { candidata, salvarNoRascunho } from './base'
import { ITENS, aplicarTroca, ehExtraId, ehItem, trouxeTexto, validarExtra, validarTexto, type Extra, type ItemId, type Textos } from './base-core'
import { CONFIG } from './config'
import { addUsage, costUsd, emptyUsage } from './execlog'
import { k, redis } from './redis'

/**
 * CURADOR da Base de dados: a equipe da InovPay pede em português ("o D+0 agora
 * vai até 13h", "acrescenta que aceitamos Pix por QR Code", ou corrige uma
 * resposta do laboratório) e a IA, com o token OpenAI do cliente, decide o
 * destino e escreve a mudança. A equipe nunca edita texto à mão.
 *
 * Travas em código: a IA muda texto só por troca EXATA de trecho (o resto fica
 * idêntico), tudo passa por validarTexto, e o resultado vai para o RASCUNHO.
 * O WhatsApp só muda depois do exame (lib/exame.ts). Pedido de regra de
 * atendimento vira pedido para a Control Gestão; taxa e preço são recusados.
 */

export type Destino = 'base' | 'nova_informacao' | 'control_gestao' | 'recusado' | 'pergunta' | 'nenhum'

export interface Mudanca {
  tipo: 'trocar' | 'nova' | 'remover'
  id: string
  titulo: string
  antes: string
  depois: string
}

export interface Correcao {
  /** teste: laboratório (sessao + mensagemId) · real: conversa do WhatsApp (contato + ts da execução) */
  fonte?: 'teste' | 'real'
  sessao?: string
  mensagemId?: string
  contato?: string
  nome?: string
  ts?: string
  /** a conversa até a resposta marcada (já com PII mascarada nas conversas reais) */
  lead: string
  /** a resposta que a equipe marcou como errada */
  resposta: string
  comoDeveria: string
  porque: string
}

export interface MsgConversa {
  id: string
  ts: string
  papel: 'equipe' | 'ia'
  texto: string
  origem?: 'base' | 'teste' | 'real'
  correcao?: Correcao
  analise?: { comoDeveria: string; porque: string }
  destino?: Destino
  mudancas?: Mudanca[]
  desfeita?: boolean
  custoUsd?: number | null
}

const K_CONVERSA = () => k('base', 'conversa')
const K_PEDIDOS = () => k('base', 'pedidos')
const MAX_DIA = 150

const novoId = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

export async function lerConversa(n = 100): Promise<MsgConversa[]> {
  return ((await redis.lrange<MsgConversa>(K_CONVERSA(), 0, n - 1)) || []).reverse()
}

async function guardar(m: MsgConversa) {
  await redis.lpush(K_CONVERSA(), m)
  await redis.ltrim(K_CONVERSA(), 0, 199)
}

const SISTEMA = `Você é o editor da Base de dados da assistente virtual da InovPay no WhatsApp (maquininha de cartão e split de recebíveis). A equipe da InovPay fala com você em português e pede mudanças: corrigir um texto, acrescentar uma informação ou apontar uma resposta errada que a assistente deu no laboratório de teste. Você decide o destino e devolve SÓ um JSON.

DESTINOS
- "base": mudar um dos TEXTOS FIXOS listados. Use {"tipo":"trocar","id":"<id>","de":"<trecho EXATO do texto atual>","para":"<trecho novo>"}. Mude só o que foi pedido; mantenha emojis, quebras de linha e o resto idênticos. Para reescrever o texto todo, "de" é o texto inteiro. Pode haver várias trocas.
- "nova_informacao": informação nova que a assistente precisa saber para responder (fato, procedimento, política, caminho no portal ou no app). Use {"tipo":"nova","titulo":"<até 60 letras>","texto":"<o fato, em poucas frases>"}. Se já existe informação acrescentada sobre o mesmo assunto, use "trocar" nela (o id começa com extra_). Para tirar uma informação acrescentada: {"tipo":"remover","id":"extra_..."}.
- "control_gestao": regra de atendimento ou de roteiro (ordem das perguntas, o que perguntar, quando passar para a equipe, tags, CPF/CNPJ, horário de atendimento, tom geral). Não mude nada; explique em uma frase que é regra do atendimento e vai como pedido para a Control Gestão, que testa e aplica.
- "recusado": taxa, porcentagem, preço, valor em reais, condição comercial, prazo de aprovação, promessa de resultado ou senha. Não mude nada; explique que isso fica com a equipe e a assistente nunca informa.
- "pergunta": o pedido não está claro. Faça UMA pergunta curta e não mude nada.
- "nenhum": não há o que mudar (por exemplo, a resposta já estava certa). Explique por quê.

REGRAS DOS TEXTOS (o sistema recusa o que quebrar estas regras)
- Sem travessão (— ou –). Sem "espero ter ajudado", "fico à disposição". Sem porcentagem, sem "R$", sem senha, sem "garantido".
- Encerramentos (ids enc_) não têm pergunta. O aviso de fora do horário mantém {quando} uma vez só.
- Textos do portal e do app vão para o cliente exatamente como estão: siga o estilo deles (emojis no começo da linha, setas ➝).
- Escreva como a equipe da InovPay: simpático e direto, frases curtas.

CORREÇÃO DE UMA RESPOSTA (do laboratório de teste ou de uma conversa real no WhatsApp)
Conversas reais vêm com CPF, CNPJ, telefone e e-mail mascarados ([cpf], [telefone]...): nunca copie esses dados para a base.
Quando a mensagem trouxer uma correção, preencha SEMPRE (mesmo com destino "nenhum", "control_gestao" ou "recusado"):
- "como_deveria": a mensagem que a assistente deveria ter mandado, pronta para o WhatsApp (siga as regras acima).
- "por_que": por que a resposta estava errada, em 1 ou 2 frases, apontando a causa: texto da base desatualizado, informação que faltava ou regra de atendimento.
E decida o destino da correção como em qualquer pedido.

COMO RESPONDER À EQUIPE
- Fale no passado do que você FEZ NA BASE, nomeando o texto ou a informação ("Troquei 14h por 13h no texto do split.", "Acrescentei a informação \"Formas de pagamento\"."). Você não muda a conversa nem a triagem: só textos e informações da base. Não fale de publicar, de exame nem de rascunho: o sistema acrescenta esse aviso. Não diga que a assistente "já passa a" fazer algo.
- Em "control_gestao" e "recusado" você não mudou nada: diga isso com clareza.
- Se a conversa (de teste ou real) usou os textos NO AR e o que faltou já está no RASCUNHO (informação acrescentada ou texto já trocado), não crie de novo: destino "nenhum", explique que já está no rascunho e falta publicar.

FORMATO (só JSON)
{"resposta":"o que você entendeu e o que fez, 1 a 3 frases, falando com a equipe","destino":"base|nova_informacao|control_gestao|recusado|pergunta|nenhum","como_deveria":"","por_que":"","mudancas":[]}`

function descreverBase(textos: Textos, extras: Extra[]): string {
  const fixos = ITENS.map(i => `### ${i.id} · ${i.titulo}\nPara que serve: ${i.ajuda}\nTexto atual:\n${textos[i.id]}`).join('\n\n')
  const ext = extras.length
    ? extras.map(e => `### ${e.id} · ${e.titulo}\nTexto atual:\n${e.texto}`).join('\n\n')
    : '(nenhuma ainda)'
  return `TEXTOS FIXOS\n\n${fixos}\n\nINFORMAÇÕES ACRESCENTADAS PELA EQUIPE\n\n${ext}`
}

function resumoConversa(msgs: MsgConversa[]): string {
  return msgs.slice(-10).map(m => {
    const muda = m.mudancas?.length ? ` [mudou: ${m.mudancas.map(x => x.titulo).join(', ')}${m.desfeita ? ' (desfeito)' : ''}]` : ''
    return `${m.papel === 'equipe' ? 'EQUIPE' : 'VOCÊ'}: ${m.texto.slice(0, 400)}${muda}`
  }).join('\n') || '(começo da conversa)'
}

interface Saida { resposta?: string; destino?: Destino; como_deveria?: string; por_que?: string; mudancas?: Array<{ tipo?: string; id?: string; de?: string; para?: string; titulo?: string; texto?: string }> }

/** Aplica as mudanças da IA numa cópia da candidata. Erro em qualquer uma = nada aplicado. */
export function aplicar(saida: Saida, textos: Textos, extras: Extra[]): { textos: Textos; extras: Extra[]; mudancas: Mudanca[]; erros: string[] } {
  const t = { ...textos }
  let ex = extras.map(e => ({ ...e }))
  const mudancas: Mudanca[] = []
  const erros: string[] = []
  for (const m of saida.mudancas || []) {
    if (m.tipo === 'trocar') {
      const id = String(m.id || '')
      const extra = ex.find(e => e.id === id)
      if (!ehItem(id) && !extra) { erros.push(`id desconhecido: ${id}`); continue }
      const atual = extra ? extra.texto : t[id as ItemId]
      const r = aplicarTroca(atual, String(m.de ?? ''), String(m.para ?? ''))
      if (r.erro) { erros.push(`${id}: ${r.erro}`); continue }
      const problemas = extra ? validarExtra({ ...extra, texto: r.texto! }) : validarTexto(id, r.texto!)
      if (problemas.length) { erros.push(`${id}: ${problemas.join(' ')}`); continue }
      const anterior = mudancas.find(x => x.id === id)
      if (anterior) anterior.depois = r.texto!
      else mudancas.push({ tipo: 'trocar', id, titulo: extra ? extra.titulo : ITENS.find(i => i.id === id)!.titulo, antes: atual, depois: r.texto! })
      if (extra) extra.texto = r.texto!
      else t[id as ItemId] = r.texto!
    } else if (m.tipo === 'nova') {
      const e: Extra = { id: `extra_${Math.random().toString(36).slice(2, 10).padEnd(8, '0')}`, titulo: String(m.titulo || '').trim(), texto: String(m.texto || '').trim() }
      const problemas = validarExtra(e)
      if (problemas.length) { erros.push(`nova "${e.titulo}": ${problemas.join(' ')}`); continue }
      // a mesma informação já existe (no ar ou no rascunho): não duplica
      const norm = (x: string) => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
      const igual = ex.find(x => norm(x.titulo) === norm(e.titulo) || (trouxeTexto(x.texto, e.texto) && trouxeTexto(e.texto, x.texto)))
      if (igual) { erros.push(`a informação "${e.titulo}" já existe como ${igual.id} ("${igual.titulo}"): use "trocar" nela, ou destino "nenhum" se ela já diz isso`); continue }
      ex.push(e)
      mudancas.push({ tipo: 'nova', id: e.id, titulo: e.titulo, antes: '', depois: e.texto })
    } else if (m.tipo === 'remover') {
      const id = String(m.id || '')
      const e = ex.find(x => x.id === id)
      if (!ehExtraId(id) || !e) { erros.push(`remover: ${id} não é uma informação acrescentada`); continue }
      ex = ex.filter(x => x.id !== id)
      mudancas.push({ tipo: 'remover', id, titulo: e.titulo, antes: e.texto, depois: '' })
    } else {
      erros.push(`tipo de mudança desconhecido: ${m.tipo}`)
    }
  }
  return { textos: t, extras: ex, mudancas, erros }
}

/**
 * Pedido da equipe (texto livre) ou correção do laboratório. A IA responde,
 * e o que ela mudar vai para o rascunho. Devolve as duas mensagens gravadas.
 */
export async function pedir(texto: string, correcao?: Correcao): Promise<{ equipe?: MsgConversa; ia?: MsgConversa; erro?: string }> {
  const pedido = String(texto || '').trim().slice(0, 2000)
  if (!pedido && !correcao) return { erro: 'Escreva o que você quer mudar.' }
  const dia = k('base', 'curador', new Date().toISOString().slice(0, 10))
  const usados = await redis.incr(dia)
  if (usados === 1) await redis.expire(dia, 2 * 86400)
  if (usados > MAX_DIA) return { erro: `Limite de ${MAX_DIA} pedidos por dia atingido (protege o custo). Volta amanhã.` }

  const historico = await lerConversa(12)
  const equipe: MsgConversa = { id: novoId('m'), ts: new Date().toISOString(), papel: 'equipe', texto: pedido, origem: correcao ? (correcao.fonte === 'real' ? 'real' : 'teste') : 'base', correcao }
  await guardar(equipe)

  const c = await candidata()
  const openai = new OpenAI({ apiKey: CONFIG.openaiApiKey })
  const modelo = process.env.EDITOR_MODEL || CONFIG.llmModel
  const usage = emptyUsage()
  const pedidoTexto = correcao
    ? `${correcao.fonte === 'real' ? `CORREÇÃO DE UMA CONVERSA REAL NO WHATSAPP (contato ${correcao.nome || 'sem nome'})\nConversa real até a resposta marcada` : 'CORREÇÃO VINDA DO LABORATÓRIO\nConversa de teste até a resposta marcada'}:\n${correcao.lead}\n\nRESPOSTA QUE A EQUIPE MARCOU COMO ERRADA:\n${correcao.resposta}\n\nCOMO A EQUIPE DIZ QUE DEVERIA SER: ${correcao.comoDeveria || '(não disse)'}\nPOR QUE A EQUIPE ACHA QUE ESTÁ ERRADO: ${correcao.porque || '(não disse)'}${pedido ? `\nOBSERVAÇÃO: ${pedido}` : ''}`
    : `PEDIDO DA EQUIPE: ${pedido}`
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: SISTEMA },
    { role: 'system', content: descreverBase(c.textos, c.extras) },
    { role: 'system', content: `CONVERSA ATÉ AQUI COM A EQUIPE\n${resumoConversa(historico)}` },
    { role: 'user', content: pedidoTexto },
  ]

  let saida: Saida = {}
  let resultado = aplicar({}, c.textos, c.extras)
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const r = await openai.chat.completions.create({ model: modelo, messages, response_format: { type: 'json_object' }, max_completion_tokens: 3000 })
    addUsage(usage, r.usage)
    const bruto = r.choices[0]?.message?.content || '{}'
    try { saida = JSON.parse(bruto) as Saida } catch { saida = { resposta: 'Não consegui entender o pedido. Pode explicar de outro jeito?', destino: 'pergunta', mudancas: [] } }
    if (!['base', 'nova_informacao'].includes(String(saida.destino))) saida.mudancas = []
    resultado = aplicar(saida, c.textos, c.extras)
    // correção sem diagnóstico não serve para a equipe: pede de novo
    if (correcao && (!String(saida.como_deveria || '').trim() || !String(saida.por_que || '').trim())) resultado.erros.push('correção sem "como_deveria" ou "por_que": preencha os dois')
    if (!resultado.erros.length) break
    messages.push({ role: 'assistant', content: bruto })
    messages.push({ role: 'system', content: `[SISTEMA] Nada foi aplicado. Problemas: ${resultado.erros.join(' | ')}. Corrija e devolva o JSON completo de novo (o "de" precisa ser copiado exatamente do texto atual e aparecer uma vez).` })
  }

  const custoUsd = costUsd(modelo, usage)
  let destino: Destino = (['base', 'nova_informacao', 'control_gestao', 'recusado', 'pergunta', 'nenhum'] as const).find(d => d === saida.destino) || 'nenhum'
  let resposta = String(saida.resposta || '').trim() || 'Pronto.'
  if (resultado.erros.length) {
    destino = 'nenhum'
    resposta = `Não consegui aplicar esta mudança com segurança (${resultado.erros[0].slice(0, 200)}). Nada foi alterado. Pode descrever de outro jeito?`
    resultado.mudancas = []
  } else if (resultado.mudancas.length) {
    const textosMudados: Partial<Textos> = {}
    for (const m of resultado.mudancas) if (ehItem(m.id)) textosMudados[m.id] = resultado.textos[m.id]
    await salvarNoRascunho({ textos: textosMudados, ...(resultado.mudancas.some(m => ehExtraId(m.id)) ? { extras: resultado.extras } : {}) })
  }
  if (destino === 'control_gestao') {
    await redis.lpush(K_PEDIDOS(), { ts: new Date().toISOString(), pedido: pedido || correcao?.comoDeveria || '', correcao: correcao ? { resposta: correcao.resposta, comoDeveria: correcao.comoDeveria, porque: correcao.porque } : undefined })
    await redis.ltrim(K_PEDIDOS(), 0, 199)
  }

  if (destino === 'control_gestao') resposta += ' Nada mudou na base: ficou registrado como pedido para a Control Gestão.'
  if (resultado.mudancas.length) resposta += ' Está no rascunho: teste e publique com o exame para valer no WhatsApp.'
  const ia: MsgConversa = {
    id: novoId('m'), ts: new Date().toISOString(), papel: 'ia', texto: resposta, origem: equipe.origem, destino,
    mudancas: resultado.mudancas,
    ...(correcao ? { analise: { comoDeveria: String(saida.como_deveria || '').trim(), porque: String(saida.por_que || '').trim() } } : {}),
    custoUsd,
  }
  await guardar(ia)
  return { equipe, ia }
}

/** Desfaz as mudanças de uma resposta da IA no rascunho (só se ninguém mudou o mesmo texto depois). */
export async function desfazer(mensagemId: string): Promise<{ ok: boolean; erro?: string }> {
  const lista = (await redis.lrange<MsgConversa>(K_CONVERSA(), 0, 199)) || []
  const i = lista.findIndex(m => m.id === mensagemId)
  const m = lista[i]
  if (!m || m.papel !== 'ia' || !m.mudancas?.length) return { ok: false, erro: 'Não há mudança para desfazer nesta mensagem.' }
  if (m.desfeita) return { ok: false, erro: 'Já foi desfeita.' }
  const c = await candidata()
  const textos: Partial<Textos> = {}
  let extras = c.extras.map(e => ({ ...e }))
  let mexeuExtras = false
  for (const mu of [...m.mudancas].reverse()) {
    if (ehItem(mu.id)) {
      if (c.textos[mu.id] !== mu.depois) return { ok: false, erro: `"${mu.titulo}" mudou de novo depois desta mensagem: desfaça a mais nova primeiro.` }
      textos[mu.id] = mu.antes
    } else {
      mexeuExtras = true
      const atual = extras.find(e => e.id === mu.id)
      if (mu.tipo === 'nova') extras = extras.filter(e => e.id !== mu.id)
      else if (mu.tipo === 'remover') { if (!atual) extras.push({ id: mu.id, titulo: mu.titulo, texto: mu.antes }) }
      else if (atual) atual.texto = mu.antes
    }
  }
  await salvarNoRascunho({ textos, ...(mexeuExtras ? { extras } : {}) })
  await redis.lset(K_CONVERSA(), i, { ...m, desfeita: true })
  return { ok: true }
}

export async function contarPedidosControl(): Promise<number> {
  return Number(await redis.llen(K_PEDIDOS())) || 0
}
