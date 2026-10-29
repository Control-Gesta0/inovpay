import type { Estado } from './state'

/**
 * O ROTEIRO em código: qual é o próximo passo e quais textos fecham cada passagem.
 * O modelo escolhe as palavras; a ORDEM do roteiro sai daqui (puro, testado).
 */

/**
 * Perguntas do roteiro comercial, nesta ordem (revisadas com a InovPay em 23/10/2026: tipo de
 * produto ou serviço, recebimento perguntado de forma mais clara e faturamento).
 * `seRepasse`: só faz sentido se a empresa repassa parte do valor; com "não" na pergunta do
 * repasse, o código pula essas.
 */
export const PERGUNTAS_COMERCIAL = [
  { campo: 'segmento', marca: /produto ou servi[cç]o|segmento|ramo/i, texto: 'Qual é o tipo de produto ou serviço que a sua empresa oferece?' },
  { campo: 'repasse', marca: /repass/i, resposta: /\brepass|\bdivid[oi]|comiss[aã]o/i, texto: 'Quando a sua empresa recebe por uma venda, uma parte desse valor precisa ser repassada para outra pessoa ou empresa, como um parceiro, fornecedor ou profissional?' },
  { campo: 'forma_repasse', seRepasse: true, marca: /manualmente|na m[aã]o|algum sistema/i, resposta: /\bpix\b|transfer[eê]ncia|na m[aã]o|manualmente|planilha/i, texto: 'E como esse repasse é feito hoje: manualmente, por Pix ou transferência, ou por algum sistema?' },
  { campo: 'recebedores', seRepasse: true, marca: /quant[ao]s (pessoas|empresas|recebedores|parceiros|profissionais)/i, resposta: /\b\d+\s*(pessoas|profissionais|parceir[oa]s|fornecedores|empresas|m[eé]dic[oa]s|vendedor[ea]s)/i, texto: 'Em média, quantas pessoas ou empresas recebem uma parte do valor de cada venda?' },
  { campo: 'volume_mensal', marca: /faturamento|volume|por m[eê]s/i, resposta: /\b\d+([.,]\d+)?\s*(mil|k|milh[aãõ])|r\$\s*\d/i, texto: 'Qual é o faturamento mensal aproximado da empresa?' },
  { campo: 'bitributacao', seRepasse: true, marca: /imposto/i, texto: 'Vocês já perceberam se pagam imposto duas vezes sobre o valor que repassam, ou ainda não chegaram a calcular isso?' },
  { campo: 'decisor', marca: /decis[aã]o|decide/i, texto: 'A decisão sobre isso é sua ou envolve mais alguém?' },
] as const satisfies ReadonlyArray<{ campo: string; marca: RegExp; texto: string; seRepasse?: boolean; resposta?: RegExp }>

type PerguntaComercial = typeof PERGUNTAS_COMERCIAL[number]

/** Próxima pergunta comercial que falta (pula as do repasse quando a empresa não repassa). Puro. */
export function faltaComercial(st: Estado): PerguntaComercial | undefined {
  const semRepasse = ehNao(st.dados?.repasse)
  return PERGUNTAS_COMERCIAL.find(p => !st.dados?.[p.campo] && !('seRepasse' in p && semRepasse))
}

export function proximoPasso(st: Estado, temDocumento: boolean, jaPediuDocumento: boolean): string {
  if (st.finalizado) return 'Atendimento já passado para a equipe: escreva só a mensagem final.'
  if (!st.tipo) {
    return 'PRÓXIMO PASSO: descobrir se é cliente. Pergunte "Você já é cliente da InovPay?" (pode responder antes, em uma frase, o que ela perguntou, se estiver no documento). Só chame definir_tipo depois que ela responder.'
  }
  if (st.tipo === 'cliente') {
    if (!temDocumento) return 'PRÓXIMO PASSO: pedir o CNPJ da empresa cadastrada (seção 4.1) ANTES de qualquer roteiro, com a frase da Política de Privacidade. Se a pessoa já contou o problema, diga em poucas palavras que já vai ajudar com isso e peça o documento.'
    const faltaCancelamento = faltandoCancelamento(st)
    if (ehNao(st.dados?.venda_de_hoje) && !faltaCancelamento.length) return 'PRÓXIMO PASSO: comprovante, data e valor já anotados. Chame passar_para_humano(estorno_anterior) agora e use o encerramento que a ferramenta devolver.'
    if (st.dados?.estado_maquininha && st.dados?.descricao) return 'PRÓXIMO PASSO: a descrição da maquininha já está anotada. Chame passar_para_humano(suporte_maquininha) agora e use o encerramento que a ferramenta devolver.'
    if (ehNao(st.dados?.venda_de_hoje) && faltaCancelamento.length) return `PRÓXIMO PASSO: cancelamento de venda de dias anteriores. Ainda falta: ${faltaCancelamento.join(' e ')}. Peça o que falta em uma mensagem só (não pergunte de novo o que já veio).`
    return 'PRÓXIMO PASSO: seguir o roteiro do assunto da seção 4.3 (se o assunto ainda não foi dito, pergunte qual é). Estorno: se a pessoa já disse quando foi a venda ("hoje", "ontem", "semana passada", uma data), anote venda_de_hoje e NÃO pergunte se foi hoje. Venda de dias anteriores: peça em uma mensagem só a foto legível do comprovante, a data e o valor.'
  }
  if (!temDocumento && !jaPediuDocumento) return 'PRÓXIMO PASSO: pedir o CNPJ da empresa (seção 5.1), com a frase da Política de Privacidade.'
  const falta = faltaComercial(st)
  if (falta) return `PRÓXIMO PASSO: fazer a pergunta "${falta.campo}" do roteiro comercial, com estas palavras ou parecidas: "${falta.texto}" (se a pessoa já respondeu isso na conversa, anote e vá para a seguinte).`
  return 'PRÓXIMO PASSO: as respostas do roteiro estão anotadas. Chame passar_para_humano(qualificacao_concluida) e encerre (seção 5.3).'
}

/** Encerramento de cada passagem (texto do documento do cliente). null = o modelo escreve. */
const ehNao = (v?: string) => !!v && /^(n[aã]o|nao|anterior|ontem|outro dia)/i.test(v.trim())

const ITENS_CANCELAMENTO = [['comprovante', 'a foto legível do comprovante'], ['data_venda', 'a data da venda'], ['valor_venda', 'o valor da venda']] as const

/** O que ainda falta para o cancelamento de venda de dias anteriores. */
export function faltandoCancelamento(st: Estado): string[] {
  return ITENS_CANCELAMENTO.filter(([campo]) => !st.dados?.[campo]).map(([, nome]) => nome)
}

/**
 * Dados mínimos de cada passagem (o roteiro do documento do cliente). Sem eles a ferramenta
 * recusa e diz o que pedir: a equipe nunca recebe um caso pela metade.
 * Pediu pessoa, outro assunto ou comercial: passa sempre.
 */
export function faltaParaPassar(motivo: string, st: Estado): string | null {
  if (motivo === 'suporte_maquininha' && !st.dados?.descricao) return 'Antes de passar, peça em poucas palavras o que está acontecendo com a maquininha e uma foto ou vídeo do problema (passo 2 do roteiro), e anote com anotar(descricao).'
  if (motivo === 'estorno_anterior') {
    const falta = faltandoCancelamento(st)
    if (falta.length) return `Antes de passar, ainda falta: ${falta.join(' e ')}. Peça o que falta em uma mensagem só e anote.`
  }
  if (motivo === 'portal_app' && !st.dados?.descricao) return 'Antes de passar, peça a pessoa descrever o que aconteceu (e um print, sem senha) e anote com anotar(descricao).'
  return null
}

/**
 * Resposta do roteiro comercial anotada pelo CÓDIGO: se a última mensagem da IA fez a pergunta
 * que falta, o que a pessoa escreveu em seguida é a resposta dela (o modelo às vezes esquecia de
 * anotar e repetia a pergunta). Devolve o campo e o valor, ou null.
 */
/** Perguntas do roteiro da maquininha (cliente): a resposta que vem logo depois é anotada pelo código. */
const PERGUNTAS_MAQUININHA = [
  { campo: 'estado_maquininha', marca: /liga normalmente|liga mas d[aá] erro|n[aã]o liga\?/i },
  { campo: 'descricao', marca: /me conta o que est[aá] acontecendo|descrev[ae] (o problema|o que)/i },
] as const

export function respostaDoRoteiro(st: Estado, ultimaIa: string, textoTurno: string): { campo: string; valor: string } | null {
  // Cliente, maquininha: a pessoa respondeu a pergunta do roteiro (o modelo às vezes esquecia de anotar
  // a descrição, a passagem era recusada e ele repetia a pergunta: exame de 08/10/2026)
  if (st.tipo === 'cliente' && textoTurno.trim()) {
    const p = PERGUNTAS_MAQUININHA.find(q => !st.dados?.[q.campo] && q.marca.test(ultimaIa))
    return p ? { campo: p.campo, valor: textoTurno.trim().slice(0, 300) } : null
  }
  if (st.tipo !== 'nao_cliente' || !textoTurno.trim() || !ultimaIa.includes('?')) return null
  const pergunta = ultimaIa.slice(Math.max(0, ultimaIa.lastIndexOf('?') - 220))
  const falta = faltaComercial(st)
  if (!falta || !falta.marca.test(pergunta)) return null
  return { campo: falta.campo, valor: textoTurno.trim().slice(0, 300) }
}

/**
 * Respostas que vieram ADIANTADAS na mesma mensagem ("tenho uma clínica e repasso para as
 * profissionais" responde o segmento E o repasse): o código anota as perguntas seguintes cujo
 * sinal aparece no texto, na ordem, até a primeira que não aparece. Sem isso a trava obrigava a
 * repetir a pergunta e as respostas seguintes ficavam desalinhadas (exame de 23/10/2026). Puro.
 */
export function respostasAdiantadas(st: Estado, textoTurno: string): Array<{ campo: string; valor: string }> {
  if (st.tipo !== 'nao_cliente' || !textoTurno.trim()) return []
  const out: Array<{ campo: string; valor: string }> = []
  let atual: Estado = st
  for (;;) {
    const p = faltaComercial(atual)
    if (!p || !('resposta' in p) || !p.resposta.test(textoTurno)) break
    out.push({ campo: p.campo, valor: textoTurno.trim().slice(0, 300) })
    atual = { ...atual, dados: { ...(atual.dados || {}), [p.campo]: textoTurno.trim().slice(0, 300) } }
  }
  return out
}

/** Pergunta do roteiro comercial que a próxima mensagem TEM que trazer (null = não se aplica agora). */
export function perguntaEsperada(st: Estado, temDocumento: boolean, jaPediuDocumento: boolean): PerguntaComercial | null {
  if (st.tipo !== 'nao_cliente' || st.finalizado) return null
  if (!temDocumento && !jaPediuDocumento) return null
  return faltaComercial(st) || null
}

const CAMPOS_COMERCIAIS: string[] = PERGUNTAS_COMERCIAL.map(p => p.campo)
const normal = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

/**
 * Resposta do roteiro comercial só entra se tiver base no que a pessoa escreveu
 * (o modelo chegou a anotar "repasse" no turno em que a pessoa só mandou o CNPJ).
 * Palavras comparadas pelo começo (5 letras: "repassa" casa com "repasso"). Puro.
 */
/**
 * Valor de "ainda não respondeu" não é resposta. O modelo tentava anotar "não informou",
 * "a confirmar", "aguardando resposta" e, com isso, pulava a pergunta (exame de 08/10/2026).
 */
export const SEM_RESPOSTA = /\b(n[aã]o (foi )?(informou|informado|informada|respondeu|respondido|disse|falou|mencionou|citou)|a (confirmar|definir|verificar)|aguardando|pendente|sem resposta|ainda n[aã]o (respondeu|informou|disse|falou)|desconhecid[oa]|n\/a)\b/i

export function temBaseNoLead(campo: string, valor: string, textoLead: string): boolean {
  // vale para todo campo: "não informado" no comprovante deixava passar o cancelamento sem os dados
  if (SEM_RESPOSTA.test(valor)) return false
  if (!CAMPOS_COMERCIAIS.includes(campo)) return true
  const palavras = normal(valor).split(' ').filter(w => w.length >= 3 || /\d/.test(w))
  if (!palavras.length) return false
  const lead = ` ${normal(textoLead)} `
  const achou = palavras.filter(w => lead.includes(` ${w.slice(0, 5)}`))
  return achou.length / palavras.length >= 0.4
}
