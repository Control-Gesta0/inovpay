/**
 * Travas determinísticas: a resposta que casar com uma destas não sai. O modelo
 * reescreve uma vez e, se insistir, sai o texto seguro. Arquivo puro (testado em npm test).
 */

export interface Violation { regra: string; trecho: string }
export interface Regra { regra: string; re: RegExp }

export const REGRAS: Regra[] = [
  // Fora do escopo desta fase: a IA não informa taxa, preço nem valor (o time manda)
  { regra: 'informou taxa', re: /\b\d{1,2}(?:[.,]\d{1,2})?\s*%/ },
  { regra: 'informou valor', re: /R\$\s*\d[\d.,]*|\b\d[\d.,]*\s*reais\b/i },
  { regra: 'prometeu resultado', re: /\bgarant(o|imos|ido|ida)\b/i },
  // Senha nunca vai por mensagem (a InovPay mandava senha padrão por chat)
  { regra: 'enviou senha', re: /senha[^.\n]{0,25}\b\d{4,}\b|\b(123456|000000)\b/i },
  // Tom humano (SKILL §5.1): travessão é o tell nº 1
  { regra: 'travessão', re: /[—–]/ },
  { regra: 'resíduo de chatbot', re: /espero ter ajudado|posso ajudar (com|em) mais alguma coisa|fico (à|a) (sua )?disposi[cç][aã]o/i },
]

/** Fora do horário a IA não promete atendimento imediato (a IA nativa prometia "em instantes" num domingo). */
export const REGRA_FORA_DO_HORARIO: Regra = { regra: 'prometeu atendimento imediato fora do horário', re: /em instantes|agora mesmo|j[aá] j[aá]|daqui a pouco|logo mais|imediatamente|em alguns minutos|rapidinho (algu[eé]m|o time|a equipe)/i }

/**
 * "Vou encaminhar" sem ter chamado passar_para_humano = promessa que mente (a IA antiga fazia isso:
 * "vou te conectar com o time" e nada mudava no CRM). Só vale quando sabemos que NÃO houve passagem.
 */
export const REGRA_PROMESSA_SEM_PASSAGEM: Regra = { regra: 'prometeu passagem sem passar', re: /\b(vou|j[aá] vou|vou te|vou j[aá]) (encaminhar|passar (seu|sua|o seu|a sua|isso|essa|esse|pra|para|pro|voc[eê])|transferir|conectar)|\b(encaminhei|transferi|j[aá] passei)\b|encaminhar (pra|para) (an[aá]lise|a equipe|o time)|\b(algu[eé]m|a equipe|o time|nossa equipe|nosso time)( da equipe| do time)? (continua|vai continuar|te chama|vai te chamar|te responde|vai te responder|retorna|vai retornar)|\b(vou deixar|deixei|vou registrar|registrei|fica) (isso |tudo |seu pedido |sua solicita[cç][aã]o )?registrad[oa]|\bregistrei\b/i }

/** "R$ 1.200,00" → 1200 · "1,65%" → 1.65 · "350 reais" → 350. null se não houver número. */
export function numeroBR(s: string): number | null {
  let t = (s.match(/\d[\d.,]*/) || [''])[0].replace(/[.,]$/, '')
  if (!t) return null
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '')
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

const numerosDo = (texto: string) => new Set((texto.match(/\d[\d.,]*/g) || []).map(numeroBR).filter((n): n is number => n !== null))

/**
 * `textoLead`: o que a pessoa escreveu. Valor que ELA disse (ex.: "venda de 350 reais")
 * pode ser repetido na confirmação: a trava de valor/taxa barra só número que veio da IA.
 */
export function checkReply(text: string, opts: { foraDoHorario?: boolean; textoLead?: string; handoff?: boolean; tipoDesconhecido?: boolean } = {}): Violation[] {
  const out: Violation[] = []
  // Ainda não se sabe se é cliente e a resposta não pergunta: a triagem toda depende disso
  if (opts.tipoDesconhecido && !opts.handoff && !/\bcliente\b/i.test(text)) out.push({ regra: 'não perguntou se é cliente', trecho: text.slice(0, 40) })
  const regras = [...REGRAS, ...(opts.foraDoHorario ? [REGRA_FORA_DO_HORARIO] : []), ...(opts.handoff === false ? [REGRA_PROMESSA_SEM_PASSAGEM] : [])]
  const doLead = numerosDo(opts.textoLead || '')
  for (const { regra, re } of regras) {
    const m = text.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`))
    if (!m) continue
    // taxa nunca passa (nem repetindo a da pessoa: soaria como confirmação); valor dito pela pessoa pode ser repetido
    const reais = regra === 'informou valor'
      ? m.filter(x => { const n = numeroBR(x); return n === null || !doLead.has(n) })
      : m
    if (reais.length) out.push({ regra, trecho: reais[0] })
  }
  // modelo pequeno às vezes vaza sintaxe de tool, JSON ou alfabeto estranho
  const corrupt = text.match(/to=functions\.|\w+\(\{"|[ऀ-෿฀-๿ក-៿぀-ヿ一-鿿가-힯]/)
  if (corrupt) out.push({ regra: 'texto corrompido', trecho: corrupt[0] })
  const json = text.match(/^\s*[\[{]|"(campo|valor|motivo|resumo|documento|tipo)"\s*:/)
  if (json) out.push({ regra: 'texto corrompido', trecho: json[0] })
  const perguntas = contarPerguntas(text)
  if (perguntas > 1) out.push({ regra: 'mais de uma pergunta', trecho: `${perguntas} interrogações` })
  if (!text.trim()) out.push({ regra: 'vazio', trecho: '' })
  return out
}

/** Fica só UMA pergunta (a mais completa): as outras frases interrogativas saem (as afirmativas ficam). */
export function soUltimaPergunta(text: string): string {
  const frases = text.split(/(?<=[.!?])\s+/)
  // fica a pergunta mais completa (a mais longa); em empate, a última
  let manter = -1
  frases.forEach((f, i) => { if (f.includes('?') && (manter < 0 || f.length >= frases[manter].length)) manter = i })
  return frases.filter((f, i) => !f.includes('?') || i === manter).join(' ').replace(/\s{2,}/g, ' ').trim()
}

/** "Oi, tudo bem?" é cumprimento, não pergunta: não conta na regra de uma pergunta por vez. */
const CUMPRIMENTO = /\b(tudo (bem|certo|bom|joia|tranquilo|ok)|como vai( você)?|beleza|td bem)\s*\?/gi
export function contarPerguntas(text: string): number {
  return (text.replace(CUMPRIMENTO, '').match(/\?/g) || []).length
}

/**
 * Resposta automática do WhatsApp Business do PRÓPRIO lead ("Agradecemos sua mensagem.
 * Estamos fora do nosso horário…"). A IA não conversa com o robô do lead.
 */
export function ehAutoResposta(text: string): boolean {
  const t = text.toLowerCase()
  const fora = /fora do (nosso )?hor[aá]rio|n[aã]o estamos dispon[ií]veis|retornaremos (o mais breve|em breve|assim que)|mensagem autom[aá]tica/.test(t)
  const cortesia = /agradecemos (a |o |sua |seu )?(sua |seu )?(mensagem|contato)|obrigad[oa] (por|pelo) (entrar em )?contato|em breve (um|uma|retornaremos|responderemos)/.test(t)
  return fora && cortesia
}

/** "Message type is currently not supported." do GHL: o conteúdo não chegou. */
export const ehNaoSuportada = (text: string) => /message type is currently not supported/i.test(text)

/**
 * Mascara e-mail, CPF, CNPJ (inclusive o alfanumérico) e telefone antes de
 * guardar texto de conversa no diário que a Central mostra.
 */
export function mascararPII(texto: string): string {
  return texto
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[e-mail]')
    .replace(/\b[A-Z0-9]{2}\.[A-Z0-9]{3}\.[A-Z0-9]{3}\/[A-Z0-9]{4}-\d{2}\b/gi, '[cnpj]')
    .replace(/\b\d{14}\b/g, '[cnpj]')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[cpf]')
    .replace(/(\+?55\s?)?\(?\b\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/g, '[telefone]')
    .slice(0, 1500)
}
