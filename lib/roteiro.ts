import type { Estado } from './state'

/**
 * O ROTEIRO em código: qual é o próximo passo e quais textos fecham cada passagem.
 * O modelo escolhe as palavras; a ORDEM do roteiro sai daqui (puro, testado).
 */

/** As seis perguntas da IA antiga do GHL, na mesma ordem. */
export const PERGUNTAS_COMERCIAL = [
  { campo: 'repasse', marca: /repass/i, texto: 'Me conta como funciona o seu negócio hoje: vocês recebem pagamentos e depois repassam parte desse valor para outras pessoas ou empresas, tipo fornecedores, parceiros ou prestadores?' },
  { campo: 'forma_repasse', marca: /na m[aã]o|algum sistema/i, texto: 'E hoje esse repasse é feito na mão, tipo Pix ou transferência um a um, ou vocês usam algum sistema?' },
  { campo: 'recebedores', marca: /quant[ao]s (pessoas|empresas|recebedores|parceiros|profissionais)/i, texto: 'Normalmente, numa venda, quantas pessoas ou empresas diferentes recebem parte do valor, mais ou menos?' },
  { campo: 'volume_mensal', marca: /volume|faturamento|por m[eê]s/i, texto: 'E qual o volume aproximado de vendas por mês, em valor ou em quantidade?' },
  { campo: 'bitributacao', marca: /imposto/i, texto: 'Vocês já perceberam se acabam pagando imposto duas vezes sobre o valor que repassam, ou nunca chegaram a calcular isso?' },
  { campo: 'decisor', marca: /decis[aã]o|decide/i, texto: 'E a decisão sobre isso é sua ou tem mais alguém envolvido?' },
] as const

export function proximoPasso(st: Estado, temDocumento: boolean, jaPediuDocumento: boolean): string {
  if (st.finalizado) return 'Atendimento já passado para a equipe: escreva só a mensagem final.'
  if (!st.tipo) {
    return 'PRÓXIMO PASSO: descobrir se é cliente. Pergunte "Você já é cliente da InovPay?" (pode responder antes, em uma frase, o que ela perguntou, se estiver no documento). Só chame definir_tipo depois que ela responder.'
  }
  if (st.tipo === 'cliente') {
    if (!temDocumento) return 'PRÓXIMO PASSO: pedir o CPF ou CNPJ cadastrado (seção 4.1) ANTES de qualquer roteiro, com a frase da Política de Privacidade. Se a pessoa já contou o problema, diga em poucas palavras que já vai ajudar com isso e peça o documento.'
    const faltaCancelamento = faltandoCancelamento(st)
    if (ehNao(st.dados?.venda_de_hoje) && !faltaCancelamento.length) return 'PRÓXIMO PASSO: comprovante, data e valor já anotados. Chame passar_para_humano(estorno_anterior) agora e use o encerramento que a ferramenta devolver.'
    if (st.dados?.estado_maquininha && st.dados?.descricao) return 'PRÓXIMO PASSO: a descrição da maquininha já está anotada. Chame passar_para_humano(suporte_maquininha) agora e use o encerramento que a ferramenta devolver.'
    if (ehNao(st.dados?.venda_de_hoje) && faltaCancelamento.length) return `PRÓXIMO PASSO: cancelamento de venda de dias anteriores. Ainda falta: ${faltaCancelamento.join(' e ')}. Peça o que falta numa mensagem só (não pergunte de novo o que já veio).`
    return 'PRÓXIMO PASSO: seguir o roteiro do assunto da seção 4.3 (se o assunto ainda não foi dito, pergunte qual é). Estorno: se a pessoa já disse quando foi a venda ("hoje", "ontem", "semana passada", uma data), anote venda_de_hoje e NÃO pergunte se foi hoje. Venda de dias anteriores: peça numa mensagem só a foto legível do comprovante, a data e o valor.'
  }
  if (!temDocumento && !jaPediuDocumento) return 'PRÓXIMO PASSO: pedir o CNPJ da empresa (seção 5.1), com a frase da Política de Privacidade.'
  const falta = PERGUNTAS_COMERCIAL.find(p => !st.dados?.[p.campo])
  if (falta) return `PRÓXIMO PASSO: fazer a pergunta "${falta.campo}" do roteiro comercial, com estas palavras ou parecidas: "${falta.texto}" (se a pessoa já respondeu isso na conversa, anote e vá para a seguinte).`
  return 'PRÓXIMO PASSO: as seis respostas estão anotadas. Chame passar_para_humano(qualificacao_concluida) e encerre (seção 5.3).'
}

/** Encerramento de cada passagem (texto do documento do cliente). null = o modelo escreve. */
export const ENCERRAMENTO: Record<string, string | null> = {
  suporte_maquininha: 'Obrigado pelas informações! Seu atendimento foi registrado e vai para um dos nossos especialistas. Você não vai precisar repetir o que já mandou.',
  estorno_anterior: 'Obrigado pelo envio! Recebemos sua solicitação de cancelamento e ela vai para análise. Se for aprovada, a carta ou o comprovante de cancelamento fica disponível em até 48 horas úteis. Acompanhe o atendimento por aqui.',
  estorno: 'Obrigado pelas informações! Seu atendimento foi registrado e vai para um dos nossos especialistas. Você não vai precisar repetir o que já mandou.',
  portal_app: 'Obrigado pelas informações! Seu atendimento foi registrado e vai para um dos nossos especialistas. Você não vai precisar repetir o que já mandou.',
  pediu_atendente: 'Obrigado! Você está na fila de atendimento e um dos nossos atendentes continua por aqui mesmo.',
  qualificacao_concluida: 'Obrigado pelas informações! Vou passar seu contato e um resumo da sua operação para o nosso time comercial, que vai olhar o seu caso e te mostrar como o split funcionaria pra você.',
  pediu_humano: null,
  outro: null,
}

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
    if (falta.length) return `Antes de passar, ainda falta: ${falta.join(' e ')}. Peça o que falta numa mensagem só e anote.`
  }
  if (motivo === 'portal_app' && !st.dados?.descricao) return 'Antes de passar, peça a pessoa descrever o que aconteceu (e um print, sem senha) e anote com anotar(descricao).'
  return null
}

/**
 * Resposta do roteiro comercial anotada pelo CÓDIGO: se a última mensagem da IA fez a pergunta
 * que falta, o que a pessoa escreveu em seguida é a resposta dela (o modelo às vezes esquecia de
 * anotar e repetia a pergunta). Devolve o campo e o valor, ou null.
 */
export function respostaDoRoteiro(st: Estado, ultimaIa: string, textoTurno: string): { campo: string; valor: string } | null {
  if (st.tipo !== 'nao_cliente' || !textoTurno.trim() || !ultimaIa.includes('?')) return null
  const pergunta = ultimaIa.slice(Math.max(0, ultimaIa.lastIndexOf('?') - 220))
  const falta = PERGUNTAS_COMERCIAL.find(p => !st.dados?.[p.campo])
  if (!falta || !falta.marca.test(pergunta)) return null
  return { campo: falta.campo, valor: textoTurno.trim().slice(0, 300) }
}

/** Pergunta do roteiro comercial que a próxima mensagem TEM que trazer (null = não se aplica agora). */
export function perguntaEsperada(st: Estado, temDocumento: boolean, jaPediuDocumento: boolean): typeof PERGUNTAS_COMERCIAL[number] | null {
  if (st.tipo !== 'nao_cliente' || st.finalizado) return null
  if (!temDocumento && !jaPediuDocumento) return null
  return PERGUNTAS_COMERCIAL.find(p => !st.dados?.[p.campo]) || null
}

const CAMPOS_COMERCIAIS: string[] = PERGUNTAS_COMERCIAL.map(p => p.campo)
const normal = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

/**
 * Resposta do roteiro comercial só entra se tiver base no que a pessoa escreveu
 * (o modelo chegou a anotar "repasse" no turno em que a pessoa só mandou o CNPJ).
 * Palavras comparadas pelo começo (5 letras: "repassa" casa com "repasso"). Puro.
 */
export function temBaseNoLead(campo: string, valor: string, textoLead: string): boolean {
  if (!CAMPOS_COMERCIAIS.includes(campo)) return true
  const palavras = normal(valor).split(' ').filter(w => w.length >= 3 || /\d/.test(w))
  if (!palavras.length) return false
  const lead = ` ${normal(textoLead)} `
  const achou = palavras.filter(w => lead.includes(` ${w.slice(0, 5)}`))
  return achou.length / palavras.length >= 0.4
}
