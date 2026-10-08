import { REGRAS } from './guards'

/**
 * BASE DE DADOS (núcleo puro): os textos que a assistente usa e que a equipe
 * pode editar pela Central. Sem env, sem Redis: testado em `npm test`.
 *
 * Dois lugares de origem:
 *  - prompt: blocos marcados em prompts/inovpay.md com <!-- base:id -->…<!-- /base -->.
 *    Os marcadores nunca chegam ao modelo: renderPrompt() troca pelo texto vigente.
 *    Sem edição, o prompt renderizado é BYTE A BYTE o de antes dos marcadores.
 *  - código: encerramentos que a ferramenta devolve e o aviso de fora do horário.
 * Um mesmo id pode estar nos dois (o encerramento citado no prompt é o mesmo da ferramenta).
 *
 * Toda edição passa por validarTexto() (trava em código) e pelo exame (evals) antes de valer.
 */

export const ITENS = [
  { id: 'portal_split', grupo: 'portal', titulo: 'Split de recebíveis (transferência)', ajuda: 'Tema 1 das dúvidas do portal e do app. Vai para o cliente exatamente como está aqui.' },
  { id: 'portal_beneficiarios', grupo: 'portal', titulo: 'Cadastro de beneficiários (fornecedores)', ajuda: 'Tema 2 das dúvidas do portal e do app. Vai para o cliente exatamente como está aqui.' },
  { id: 'portal_boleto', grupo: 'portal', titulo: 'Pagamento de boleto', ajuda: 'Tema 3 das dúvidas do portal e do app. Vai para o cliente exatamente como está aqui.' },
  { id: 'portal_relatorio', grupo: 'portal', titulo: 'Relatório de vendas', ajuda: 'Tema 4 das dúvidas do portal e do app. Vai para o cliente exatamente como está aqui.' },
  { id: 'portal_comprovante', grupo: 'portal', titulo: 'Comprovante do split de recebíveis', ajuda: 'Tema 5 das dúvidas do portal e do app. Vai para o cliente exatamente como está aqui.' },
  { id: 'estorno_passos', grupo: 'suporte', titulo: 'Cancelamento de venda feita hoje (na maquininha)', ajuda: 'Passo a passo enviado quando o cliente quer estornar uma venda do mesmo dia. Depois dele, a assistente pergunta se deu certo.', recuo: '   ' },
  { id: 'nao_cliente', grupo: 'comercial', titulo: 'O que ela pode explicar para quem não é cliente', ajuda: 'A assistente usa só isto, com as palavras dela e em poucas frases, quando um não cliente pergunta como funciona. Taxa e preço nunca entram aqui.' },
  { id: 'enc_suporte', grupo: 'encerramentos', titulo: 'Encerramento do suporte', ajuda: 'Quando passa para a equipe: problema na maquininha, estorno de hoje que não deu certo e dúvida do portal que precisa de ajuda.' },
  { id: 'enc_estorno_anterior', grupo: 'encerramentos', titulo: 'Encerramento do cancelamento de dias anteriores', ajuda: 'Quando o cliente mandou comprovante, data e valor de uma venda antiga.' },
  { id: 'enc_atendente', grupo: 'encerramentos', titulo: 'Encerramento de "falar com um atendente"', ajuda: 'Quando o cliente escolhe falar com um atendente e diz o assunto.' },
  { id: 'enc_comercial', grupo: 'encerramentos', titulo: 'Encerramento do comercial', ajuda: 'Quando quem ainda não é cliente termina as seis perguntas e vai para o time comercial.' },
  { id: 'aviso_fora', grupo: 'horario', titulo: 'Aviso de fora do horário', ajuda: 'Enviado uma vez por período fechado, antes da triagem. {quando} vira "amanhã a partir das 9h", "na segunda-feira a partir das 9h" e assim por diante.', exige: '{quando}' },
] as const

export type ItemId = (typeof ITENS)[number]['id']
export type Textos = Record<ItemId, string>

/** Informação nova que a equipe pediu para a IA acrescentar (vira a seção 11 do prompt). */
export interface Extra { id: string; titulo: string; texto: string }

export const ehExtraId = (id: string) => /^extra_[a-z0-9]{4,16}$/.test(id)

export const GRUPOS: Record<string, string> = {
  portal: 'Textos do portal e do app',
  suporte: 'Suporte',
  comercial: 'Quem ainda não é cliente',
  encerramentos: 'Encerramentos (quando passa para a equipe)',
  horario: 'Horário',
}

export const ehItem = (id: string): id is ItemId => ITENS.some(i => i.id === id)
const meta = (id: ItemId) => ITENS.find(i => i.id === id)!

/** Textos que moram no código (a ferramenta e o aviso usam estes). */
export const PADRAO_CODIGO: Partial<Textos> = {
  enc_suporte: 'Obrigado pelas informações! Seu atendimento foi registrado e vai para um dos nossos especialistas. Você não vai precisar repetir o que já mandou.',
  enc_estorno_anterior: 'Obrigado pelo envio! Recebemos sua solicitação de cancelamento e ela vai para análise. Se for aprovada, a carta ou o comprovante de cancelamento fica disponível em até 48 horas úteis. Acompanhe o atendimento por aqui.',
  enc_atendente: 'Obrigado! Você está na fila de atendimento e um dos nossos atendentes continua por aqui mesmo.',
  enc_comercial: 'Obrigado pelas informações! Vou passar seu contato e um resumo da sua operação para o nosso time comercial, que vai olhar o seu caso e te mostrar como o split funcionaria pra você.',
  aviso_fora: 'Olá! Obrigado por entrar em contato com a InovPay. No momento estamos fora do nosso horário de atendimento, que é de segunda a sexta, das 9h às 18h. Já vou adiantando seu atendimento por aqui e a nossa equipe continua {quando}.',
}

/** Motivo da passagem → qual encerramento a ferramenta devolve (null: a assistente escreve um curto). */
export const ENCERRAMENTO_POR_MOTIVO: Record<string, ItemId | null> = {
  suporte_maquininha: 'enc_suporte',
  estorno: 'enc_suporte',
  portal_app: 'enc_suporte',
  estorno_anterior: 'enc_estorno_anterior',
  pediu_atendente: 'enc_atendente',
  qualificacao_concluida: 'enc_comercial',
  pediu_humano: null,
  outro: null,
}

const BLOCO = /<!-- base:([a-z_]+) -->(\n?)([\s\S]*?)(\n?)<!-- \/base -->/g

function semRecuo(texto: string, recuo?: string): string {
  return recuo ? texto.split('\n').map((l, i) => (i > 0 && l.startsWith(recuo) ? l.slice(recuo.length) : l)).join('\n') : texto
}
function comRecuo(texto: string, recuo?: string): string {
  return recuo ? texto.split('\n').map((l, i) => (i > 0 && l ? recuo + l : l)).join('\n') : texto
}

/** Os textos padrão: os blocos do prompt (sem o recuo da lista) + os do código. */
export function textosPadrao(template: string): Textos {
  const out: Partial<Textos> = { ...PADRAO_CODIGO }
  for (const m of template.matchAll(BLOCO)) {
    const id = m[1]
    if (!ehItem(id)) throw new Error(`marcador desconhecido no prompt: base:${id}`)
    out[id] = semRecuo(m[3], (meta(id) as { recuo?: string }).recuo)
  }
  const faltam = ITENS.filter(i => out[i.id] === undefined).map(i => i.id)
  if (faltam.length) throw new Error(`itens sem texto padrão: ${faltam.join(', ')}`)
  return out as Textos
}

/** Seção com as informações acrescentadas pela equipe (só existe se houver alguma). */
export function secaoExtras(extras: Extra[]): string {
  if (!extras.length) return ''
  return [
    '',
    '',
    '## 11. Informações cadastradas pela equipe da InovPay',
    'Use quando a pessoa perguntar sobre isto. Responda com as suas palavras, em poucas frases, sem inventar além do que está aqui. Taxa, preço e condição comercial continuam com a equipe (seção 2).',
    ...extras.map(e => `\n**${e.titulo}**\n${e.texto}`),
  ].join('\n')
}

/** Prompt final: cada bloco marcado vira o texto vigente (ou o padrão), sem os marcadores; extras no fim. */
export function renderPrompt(template: string, textos: Partial<Textos> = {}, extras: Extra[] = []): string {
  return renderBlocos(template, textos).replace(/\s*$/, m => (extras.length ? '' : m)) + (extras.length ? secaoExtras(extras) + '\n' : '')
}

function renderBlocos(template: string, textos: Partial<Textos>): string {
  // a quebra de linha colada no marcador é do marcador (bloco em linha própria): sai junto
  return template.replace(BLOCO, (_t, id: string, _nl1: string, padrao: string) => {
    if (!ehItem(id)) throw new Error(`marcador desconhecido no prompt: base:${id}`)
    const v = textos[id]
    return v === undefined ? padrao : comRecuo(v, (meta(id) as { recuo?: string }).recuo)
  })
}

/** Vigente = padrão + o que foi publicado por cima (só ids conhecidos). */
export function mesclar(padrao: Textos, ...camadas: Array<Partial<Record<string, string>> | undefined | null>): Textos {
  const out = { ...padrao }
  for (const c of camadas) for (const [id, v] of Object.entries(c || {})) if (ehItem(id) && typeof v === 'string') out[id] = v
  return out
}

/** Encerramento que a ferramenta devolve para o motivo. */
export function encerramento(motivo: string, textos: Partial<Textos>): string | null {
  const id = ENCERRAMENTO_POR_MOTIVO[motivo]
  return id ? textos[id] ?? PADRAO_CODIGO[id] ?? null : null
}

export function avisoForaDoHorario(textos: Partial<Textos>, quando: string): string {
  return (textos.aviso_fora ?? PADRAO_CODIGO.aviso_fora!).replace('{quando}', quando)
}

const MAX = 2500

/** Trava em código antes do exame: o que a assistente nunca pode mandar não entra na base. */
export function validarTexto(id: string, texto: string): string[] {
  const extra = ehExtraId(id)
  if (!ehItem(id) && !extra) return ['item desconhecido']
  const t = String(texto ?? '')
  const out: string[] = []
  const max = extra ? 1500 : MAX
  if (!t.trim()) out.push('O texto está vazio.')
  if (t.length > max) out.push(`O texto passou de ${max} caracteres (tem ${t.length}).`)
  if (/<!--|-->|\{\{|^#+ /m.test(t)) out.push('O texto tem marcação de sistema (<!--, -->, {{ ou título com #).')
  const m = (extra ? {} : meta(id as ItemId)) as { exige?: string }
  if (m.exige && t.split(m.exige).length - 1 !== 1) out.push(`O texto precisa ter ${m.exige} uma vez (é onde entra quando a equipe volta).`)
  if (id.startsWith('enc_') && /\?/.test(t)) out.push('Encerramento não pode ter pergunta: depois da passagem quem responde é a equipe.')
  for (const { regra, re } of REGRAS) {
    const achou = t.match(re)
    if (!achou) continue
    const porque: Record<string, string> = {
      'informou taxa': 'tem porcentagem (taxa fica com a equipe)',
      'informou valor': 'tem valor em reais (preço e valor ficam com a equipe)',
      'prometeu resultado': 'promete resultado ("garantido")',
      'enviou senha': 'tem senha com número',
      'travessão': 'tem travessão (use vírgula, ponto ou dois-pontos)',
      'resíduo de chatbot': 'tem frase de robô ("espero ter ajudado", "fico à disposição")',
    }
    out.push(`O texto ${porque[regra] || regra}: "${achou[0]}".`)
  }
  return out
}

export function validarExtra(e: Extra): string[] {
  const out: string[] = []
  if (!ehExtraId(e.id)) out.push('id inválido')
  if (!e.titulo?.trim() || e.titulo.length > 80) out.push('O título precisa ter de 1 a 80 caracteres.')
  if (/[*#<>]/.test(e.titulo || '')) out.push('O título não pode ter *, #, < ou >.')
  return [...out, ...validarTexto(e.id, e.texto)]
}

/**
 * Troca exata feita pela IA: "de" precisa aparecer UMA vez no texto atual.
 * É isso que garante que a IA muda só o trecho pedido (o resto fica idêntico).
 */
export function aplicarTroca(texto: string, de: string, para: string): { texto?: string; erro?: string } {
  if (!de) return { erro: 'trecho "de" vazio' }
  const n = texto.split(de).length - 1
  if (n === 0) return { erro: `o trecho "${de.slice(0, 80)}" não existe no texto atual (copie exatamente, com emojis e pontuação)` }
  if (n > 1) return { erro: `o trecho "${de.slice(0, 80)}" aparece ${n} vezes; use um trecho maior, que apareça uma vez só` }
  return { texto: texto.replace(de, () => para) }
}

/** Diferença entre dois conjuntos de textos (ids que mudaram). */
export function mudancas(antes: Textos, depois: Textos): ItemId[] {
  return ITENS.map(i => i.id).filter(id => antes[id] !== depois[id])
}

/**
 * O exame confere se a resposta trouxe o texto da base (o da versão candidata):
 * pelo menos 60% das palavras com 4 letras ou mais do texto aparecem na resposta.
 * Tolera a assistente juntar uma frase curta, mas pega texto velho ou inventado.
 */
export function trouxeTexto(resposta: string, texto: string): boolean {
  const palavras = (s: string) => new Set(s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[a-z0-9]{4,}/g) || [])
  const alvo = palavras(resposta)
  const base = [...palavras(texto)]
  if (!base.length) return true
  return base.filter(p => alvo.has(p)).length / base.length >= 0.6
}
