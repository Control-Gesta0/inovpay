import { mesclar, mudancas, renderPrompt, textosPadrao, type ItemId, type Textos } from './base-core'
import { loadPrompt } from './llm'
import { k, redis } from './redis'

/**
 * BASE DE DADOS (store): o que está publicado, o rascunho da equipe e o
 * histórico de versões, no Redis do agente (prefixo agente-inovpay:).
 *
 *   base:vigente    { versao, textos (só o que difere do padrão), publicadoEm, nota, exame }
 *   base:historico  lista das versões anteriores (20 mais novas), para voltar
 *   base:rascunho   { textos, atualizadoEm }: o que a equipe editou e ainda não passou no exame
 *
 * Nada do rascunho chega ao WhatsApp: só o vigente. O vigente só muda pelo
 * exame (publicar) ou por "voltar para a versão N".
 */

export interface Versao {
  versao: number
  textos: Partial<Textos>
  publicadoEm: string | null
  nota?: string
  mudancas?: ItemId[]
  exame?: { total: number; reprovados: number; custoUsd: number }
}

export interface Rascunho { textos: Partial<Textos>; atualizadoEm: string | null }

const K_VIGENTE = () => k('base', 'vigente')
const K_HISTORICO = () => k('base', 'historico')
const K_RASCUNHO = () => k('base', 'rascunho')

export const padrao = (): Textos => textosPadrao(loadPrompt())

export async function lerVigente(): Promise<Versao> {
  return (await redis.get<Versao>(K_VIGENTE())) || { versao: 0, textos: {}, publicadoEm: null }
}

export async function lerRascunho(): Promise<Rascunho> {
  return (await redis.get<Rascunho>(K_RASCUNHO())) || { textos: {}, atualizadoEm: null }
}

export async function lerHistorico(): Promise<Versao[]> {
  return (await redis.lrange<Versao>(K_HISTORICO(), 0, 19)) || []
}

// O atendimento lê o vigente a cada turno; 10 s de memória por instância bastam
let cache: { em: number; prompt: string; textos: Textos } | null = null

/** Prompt renderizado + textos que o atendimento usa agora. Redis fora: cai no padrão (nunca para). */
export async function baseVigente(): Promise<{ prompt: string; textos: Textos }> {
  if (cache && Date.now() - cache.em < 10_000) return cache
  let sobre: Partial<Textos> = {}
  try { sobre = (await lerVigente()).textos } catch (e) { console.warn('[base] vigente não leu, uso o padrão:', e instanceof Error ? e.message : e) }
  const textos = mesclar(padrao(), sobre)
  cache = { em: Date.now(), prompt: renderPrompt(loadPrompt(), textos), textos }
  return cache
}

/** Candidata = padrão + vigente + rascunho. */
export async function candidata(): Promise<{ textos: Textos; vigente: Textos; mudou: ItemId[] }> {
  const [v, r] = await Promise.all([lerVigente(), lerRascunho()])
  const base = padrao()
  const vigente = mesclar(base, v.textos)
  const textos = mesclar(base, v.textos, r.textos)
  return { textos, vigente, mudou: mudancas(vigente, textos) }
}

export async function salvarNoRascunho(id: ItemId, texto: string | null): Promise<Rascunho> {
  const r = await lerRascunho()
  const textos = { ...r.textos }
  const vigente = mesclar(padrao(), (await lerVigente()).textos)
  // voltar ao texto que já está no ar = não é mais rascunho
  if (texto === null || texto === vigente[id]) delete textos[id]
  else textos[id] = texto
  const novo = { textos, atualizadoEm: new Date().toISOString() }
  await redis.set(K_RASCUNHO(), novo)
  return novo
}

export async function descartarRascunho(id?: ItemId): Promise<void> {
  if (!id) { await redis.del(K_RASCUNHO()); return }
  await salvarNoRascunho(id, null)
}

/** Grava a nova versão (só o que difere do padrão) e guarda a anterior no histórico. */
export async function gravarVersao(textos: Textos, nota: string, exame?: Versao['exame']): Promise<Versao> {
  const atual = await lerVigente()
  const base = padrao()
  const sobre: Partial<Textos> = {}
  for (const id of mudancas(base, textos)) sobre[id] = textos[id]
  const nova: Versao = {
    versao: atual.versao + 1, textos: sobre, publicadoEm: new Date().toISOString(), nota: nota.slice(0, 200),
    mudancas: mudancas(mesclar(base, atual.textos), textos), exame,
  }
  await redis.lpush(K_HISTORICO(), atual)
  await redis.ltrim(K_HISTORICO(), 0, 19)
  await redis.set(K_VIGENTE(), nova)
  cache = null
  return nova
}

/** Tira do rascunho o que acabou de ser publicado (se ninguém editou de novo no meio do exame). */
export async function limparPublicado(publicado: Textos): Promise<void> {
  const r = await lerRascunho()
  const textos = { ...r.textos }
  for (const [id, v] of Object.entries(textos)) if (publicado[id as ItemId] === v) delete textos[id as ItemId]
  if (Object.keys(textos).length) await redis.set(K_RASCUNHO(), { textos, atualizadoEm: r.atualizadoEm })
  else await redis.del(K_RASCUNHO())
}

/** Volta para uma versão anterior (ela já passou no exame quando foi publicada). Vira uma versão nova. */
export async function voltarPara(versao: number): Promise<Versao | null> {
  const alvo = (await lerHistorico()).find(h => h.versao === versao)
  if (!alvo) return null
  return gravarVersao(mesclar(padrao(), alvo.textos), `Volta para a versão ${versao}`)
}
