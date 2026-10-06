import type { TipoContato } from './state'

/**
 * Cliente ou não: decisão em CÓDIGO quando o texto é explícito (o modelo pequeno
 * marcava "não cliente" sozinho a partir de um "oi" ou de uma pergunta de taxa).
 * Puro, testado em npm test.
 */

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

const NAO = /\b(nao|ainda nao) (sou|e|eh) (seu |sua |de voces )?client|\bnao tenho (conta|maquininha|maquina)\b|\b(quero|gostaria de|queria) (contratar|abrir (uma )?conta|ser cliente|conhecer|uma maquininha|adquirir)|\bvim pelo site\b|\bnovo cliente\b|\bainda nao (tenho|uso|trabalho com voces)\b/
const SIM = /\b(ja )?sou (seu |sua )?client|\bja (tenho|uso) (conta|a maquininha|maquininha|a maquina|voces)\b|\bminha (maquininha|maquina|conta)\b|\bmeu (split|saldo|portal|app|aplicativo|extrato|cadastro|beneficiario)\b|\bminhas (vendas|maquininhas|maquinas)\b|\bestorn|\bcancelar (uma |a |essa )?venda|\bvenda (que )?(eu )?fiz\b|\bbeneficiari|\bsplit (nao|que)\b|\bnao (caiu|chegou) (o |no )?(split|saldo|pagamento)/

/** Tipo pelo que a pessoa escreveu, se for explícito. "Não" vence "sim" ("não sou cliente, mas minha maquininha..."). */
export function tipoPeloTexto(texto: string): TipoContato | null {
  const t = norm(texto)
  if (NAO.test(t)) return 'nao_cliente'
  if (SIM.test(t)) return 'cliente'
  return null
}

/** A IA perguntou se é cliente na última mensagem? */
export const perguntouSeCliente = (textoIa: string) => /client/i.test(textoIa) && textoIa.includes('?')

/** Resposta curta à pergunta "Você já é cliente?" (sim / não / sou / ainda não). */
export function respostaSimNao(texto: string): TipoContato | null {
  const t = norm(texto).trim()
  if (/^(nao|n|ainda nao|nao sou|nunca|ainda nao sou)\b/.test(t)) return 'nao_cliente'
  if (/^(sim|s|sou|ja|ja sou|claro|isso|uhum|aham|1)\b/.test(t)) return 'cliente'
  if (/^2\b/.test(t)) return 'nao_cliente'
  return null
}

/** Pediu para falar com uma pessoa ou um atendente. */
export const pediuPessoa = (texto: string) =>
  /\b(falar|conversar|atendimento) com (um |uma |o |a |algum |alguma )?(atendente|humano|humana|pessoa|alguem|gente|vendedor|consultor|especialista)|\b(me )?(passa|passar|transfere|transferir) (para|pra|pro) (um |uma |o |a )?(humano|atendente|pessoa)|\b(quero|preciso de) (um |uma )?(atendente|humano)\b/.test(norm(texto))

/**
 * Tipo que o código já consegue decidir neste turno: texto explícito, ou resposta
 * à pergunta que a IA acabou de fazer. null = o modelo pergunta.
 */
export function tipoDoTurno(textoTurno: string, ultimaIa: string): TipoContato | null {
  return tipoPeloTexto(textoTurno) || (perguntouSeCliente(ultimaIa) ? respostaSimNao(textoTurno) : null)
}

/** Perguntou de taxa, preço ou condição (fora do escopo: a equipe responde, mas a IA tem que dizer isso antes de seguir). */
export const perguntouPreco = (texto: string) =>
  /\b(taxa|taxas|preco|precos|quanto (custa|e|sai|fica|cobra)|valor (da|do) (maquininha|maquina|plano)|mensalidade|aluguel|comodato|parcelad|antecipa)/.test(norm(texto))

/** A resposta da IA trata da pergunta de taxa/preço (diz que a equipe/o time passa essa informação). */
export const respondeuPreco = (texto: string) =>
  /\b(equipe|time|comercial|especialista|atendente)\b/.test(norm(texto)) && /\b(taxa|taxas|valor|valores|preco|precos|condic|informac|custo)/.test(norm(texto))
