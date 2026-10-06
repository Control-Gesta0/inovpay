import type OpenAI from 'openai'
import { mascarar, validarDocumento } from './documento'
import type { Port } from './port'
import { CAMPOS_ANOTACAO, type CampoAnotacao, type Estado } from './state'

/**
 * Ferramentas do agente. O que mexe no CRM é CÓDIGO com regra fixa:
 * o documento só grava se for válido e a passagem ao humano sempre faz as
 * mesmas três coisas (tira a tag de gate, põe atendimento-humano, deixa a nota).
 */

export interface ToolCtx {
  port: Port
  gateTag: string
  humanTag: string
  foraDoHorario: boolean
  quandoVolta: string
}

export interface ToolOut { content: string; isError?: boolean; handoff?: boolean }

export const MOTIVOS = ['suporte_maquininha', 'estorno', 'portal_app', 'pediu_atendente', 'qualificacao_concluida', 'pediu_humano', 'outro'] as const
type Motivo = typeof MOTIVOS[number]

const ROTULO_MOTIVO: Record<Motivo, string> = {
  suporte_maquininha: 'Suporte · maquininha',
  estorno: 'Suporte · estorno ou cancelamento de venda',
  portal_app: 'Suporte · portal ou app',
  pediu_atendente: 'Suporte · pediu atendente',
  qualificacao_concluida: 'Comercial · qualificação concluída',
  pediu_humano: 'Pediu para falar com uma pessoa',
  outro: 'Outro assunto',
}

const ROTULO_CAMPO: Record<CampoAnotacao, string> = {
  assunto: 'Assunto',
  descricao: 'Descrição do problema',
  data_venda: 'Data da venda',
  valor_venda: 'Valor da venda',
  comprovante: 'Comprovante',
  tema_portal: 'Tema (portal/app)',
  repasse: 'Recebe e repassa valores?',
  forma_repasse: 'Como repassa hoje',
  recebedores: 'Recebedores por venda',
  volume_mensal: 'Volume mensal',
  bitributacao: 'Percebe imposto em dobro?',
  decisor: 'Quem decide',
  pedido_extra: 'Pediu também',
}

export function buildTools(): OpenAI.Chat.ChatCompletionTool[] {
  return [
    {
      type: 'function',
      function: {
        name: 'definir_tipo',
        description: 'Registra se a pessoa já é cliente da InovPay. Use quando ela responder a pergunta ou disser isso claramente.',
        parameters: { type: 'object', properties: { tipo: { type: 'string', enum: ['cliente', 'nao_cliente'] } }, required: ['tipo'] },
      },
    },
    {
      type: 'function',
      function: {
        name: 'gravar_documento',
        description: 'Grava o CPF ou CNPJ que a pessoa informou no cadastro. O sistema valida: se voltar inválido, peça de novo.',
        parameters: { type: 'object', properties: { documento: { type: 'string', description: 'exatamente como a pessoa escreveu' } }, required: ['documento'] },
      },
    },
    {
      type: 'function',
      function: {
        name: 'anotar',
        description: 'Guarda uma informação da conversa para a nota que vai para a equipe. Chame sempre que a pessoa responder algo do roteiro, antes da próxima pergunta.',
        parameters: {
          type: 'object',
          properties: { campo: { type: 'string', enum: [...CAMPOS_ANOTACAO] }, valor: { type: 'string', description: 'o que a pessoa disse, resumido em poucas palavras' } },
          required: ['campo', 'valor'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'passar_para_humano',
        description: 'Passa o atendimento para a equipe da InovPay: a IA para de responder este contato e a equipe recebe uma nota com o resumo. Depois disso, escreva só a mensagem de encerramento.',
        parameters: {
          type: 'object',
          properties: {
            motivo: { type: 'string', enum: [...MOTIVOS] },
            resumo: { type: 'string', description: 'resumo do caso em 1 a 3 frases, para a equipe não perguntar tudo de novo' },
          },
          required: ['motivo', 'resumo'],
        },
      },
    },
  ]
}

/** Texto da nota interna (puro, testado). */
export function montarNota(st: Estado, motivo: Motivo, resumo: string, documento: string, foraDoHorario: boolean): string {
  const linhas = [
    `Passagem da IA para a equipe: ${ROTULO_MOTIVO[motivo] || motivo}`,
    `Tipo: ${st.tipo === 'cliente' ? 'Cliente' : st.tipo === 'nao_cliente' ? 'Não cliente' : 'Não informado'}`,
    `CPF/CNPJ: ${documento || 'não informado'}`,
    foraDoHorario ? 'Chegou fora do horário de atendimento.' : '',
    '',
    `Resumo: ${resumo.trim()}`,
  ]
  const dados = Object.entries(st.dados || {}).filter(([, v]) => v)
  if (dados.length) {
    linhas.push('', 'Dados coletados:')
    for (const [k, v] of dados) linhas.push(`- ${ROTULO_CAMPO[k as CampoAnotacao] || k}: ${v}`)
  }
  return linhas.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n').trim()
}

export async function runTool(ctx: ToolCtx, name: string, input: Record<string, unknown>): Promise<ToolOut> {
  try {
    const st = await ctx.port.getState()
    if (st.finalizado) return { content: 'Atendimento já passado para a equipe. Escreva só a mensagem final.', isError: true }

    if (name === 'definir_tipo') {
      const tipo = input.tipo === 'cliente' ? 'cliente' : input.tipo === 'nao_cliente' ? 'nao_cliente' : null
      if (!tipo) return { content: 'tipo inválido: use cliente ou nao_cliente', isError: true }
      await ctx.port.patchState({ tipo })
      return { content: `ok: ${tipo === 'cliente' ? 'é cliente' : 'não é cliente'}` }
    }

    if (name === 'gravar_documento') {
      const doc = validarDocumento(String(input.documento || ''))
      if (!doc) return { content: 'INVÁLIDO: não é um CPF (11 dígitos) nem um CNPJ (14 caracteres) válido. Não gravei. Peça de novo, com educação, conferindo os números.', isError: true }
      await ctx.port.gravarDocumento(doc.formatado)
      return { content: `ok: ${doc.tipo.toUpperCase()} ${mascarar(doc.valor)} gravado no cadastro` }
    }

    if (name === 'anotar') {
      const campo = String(input.campo || '') as CampoAnotacao
      const valor = String(input.valor || '').trim().slice(0, 500)
      if (!(CAMPOS_ANOTACAO as readonly string[]).includes(campo) || !valor) return { content: 'campo ou valor inválido', isError: true }
      const anterior = st.dados?.[campo]
      const novo = anterior && campo === 'descricao' && !anterior.includes(valor) ? `${anterior} / ${valor}` : valor
      await ctx.port.patchState({ dados: { ...(st.dados || {}), [campo]: novo } })
      return { content: `ok: ${campo} anotado` }
    }

    if (name === 'passar_para_humano') {
      const motivo = (MOTIVOS as readonly string[]).includes(String(input.motivo)) ? input.motivo as Motivo : 'outro'
      const resumo = String(input.resumo || '').trim() || 'Sem resumo.'
      const documento = await ctx.port.documento()
      // ordem: nota primeiro (é o que a equipe lê), depois as tags (as tags desligam a IA)
      await ctx.port.addNote(montarNota(st, motivo, resumo, documento, ctx.foraDoHorario))
      await ctx.port.addTags([ctx.humanTag])
      await ctx.port.removeTags([ctx.gateTag])
      try { await ctx.port.marcarNaoLida() } catch (e) { console.warn('[tools] não marquei a conversa como não lida:', e instanceof Error ? e.message : e) }
      await ctx.port.patchState({ finalizado: { motivo, resumo: resumo.slice(0, 500), em: new Date().toISOString() } })
      const quando = ctx.foraDoHorario
        ? `Agora está FORA do horário: diga que a equipe continua ${ctx.quandoVolta}. Não prometa resposta imediata.`
        : 'Está dentro do horário: diga que alguém da equipe continua por aqui em breve.'
      return { content: `ok: passado para a equipe (nota criada, IA desligada neste contato). Escreva a mensagem de encerramento, sem pergunta. ${quando}`, handoff: true }
    }

    return { content: `ferramenta desconhecida: ${name}`, isError: true }
  } catch (e) {
    return { content: `erro: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300), isError: true }
  }
}

