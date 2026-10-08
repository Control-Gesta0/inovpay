/**
 * Conteúdo da aba "Como usar" (o que muda por cliente). A página
 * (app/(painel)/como-usar) é a estrutura e liga cada etapa do fluxo aos textos
 * da base do cliente, lidos ao vivo: quando a equipe muda um texto em Ensinar,
 * o fluxo já mostra o novo. `base` são ids de lib/base-core.ts (ITENS).
 */

export interface Passo { titulo: string; texto: string; href: string; acao: string }

export const PASSOS: Passo[] = [
  {
    titulo: 'Acompanhe',
    texto: 'Estatísticas mostra se a assistente está bem e o que pede decisão, como um estorno de venda de hoje que foi para a equipe. Em Operação › Passagens fica cada atendimento passado, com o resumo e o link do contato no GHL.',
    href: '/', acao: 'Abrir Estatísticas',
  },
  {
    titulo: 'Atenda o que ela passou',
    texto: 'No GHL, abra as conversas não lidas ou filtre pela tag atendimento-humano. Leia a nota interna antes de responder: o cliente já contou o caso e não precisa repetir.',
    href: '/operacao?aba=passagens', acao: 'Ver passagens',
  },
  {
    titulo: 'Teste antes de mudar',
    texto: 'Em Teste, converse como um cliente. É a mesma assistente do WhatsApp, mas nada vai para o GHL. Resposta errada? Clique em Corrigir embaixo dela e diga como deveria ser.',
    href: '/teste', acao: 'Abrir Teste',
  },
  {
    titulo: 'Ensine',
    texto: 'Em Ensinar › Pedir mudança, escreva o que mudou, anexe um arquivo (PDF, Word, imagem) ou cole um link. Viu algo errado no WhatsApp? Em Conversas reais, clique em Corrigir. A IA muda o rascunho e mostra o antes e o depois.',
    href: '/ensinar', acao: 'Abrir Ensinar',
  },
  {
    titulo: 'Publique com o exame',
    texto: 'Teste o rascunho e clique em Publicar com exame: 14 conversas de teste rodam com os textos novos e só publica se todas passarem. Se não gostar, Versões anteriores › Voltar para esta.',
    href: '/ensinar', acao: 'Ir para a publicação',
  },
]

/** Quando a assistente responde (tudo junto; se faltar um, ela fica quieta). */
export const ENTRADA = [
  'o contato tem a tag ia',
  'não tem a tag atendimento-humano',
  'ninguém da equipe respondeu pelo GHL nas últimas 6 horas',
  'não é grupo nem a resposta automática do WhatsApp Business',
]
export const ENTRADA_NOTA = 'Mensagens seguidas viram uma resposta só: ela espera uns 10 segundos. Áudio, foto e PDF ela ouve ou lê antes de responder.'

export const FORA_DO_HORARIO = {
  titulo: 'Fora do horário (segunda a sexta, das 9h às 18h)',
  texto: 'Manda o aviso uma vez por período e faz a triagem completa. No encerramento, diz quando a equipe continua. Nunca promete resposta imediata.',
  base: ['aviso_fora'],
}

export const INICIO = [
  { titulo: 'Cliente ou não cliente', texto: 'Cumprimenta e pergunta "Você já é cliente da InovPay?", a não ser que a mensagem já deixe claro (venda na maquininha, estorno ou portal: cliente; quer abrir conta: não cliente).' },
  { titulo: 'CPF ou CNPJ', texto: 'Pede uma vez, com o aviso da Política de Privacidade, confere se o número é válido e grava no campo CPF/CNPJ do contato. Campo já preenchido: não pede de novo.' },
]

export interface Assunto { titulo: string; texto: string; motivo: string; base: string[] }

export const CLIENTE: Assunto[] = [
  { titulo: 'Maquininha', texto: 'Pergunta se ela liga, pede a descrição do problema e uma foto ou vídeo.', motivo: 'suporte_maquininha', base: ['enc_suporte'] },
  { titulo: 'Estorno de venda de hoje', texto: 'Manda o passo a passo para cancelar na própria maquininha e pergunta se deu certo. Se não deu, passa.', motivo: 'estorno', base: ['estorno_passos', 'enc_suporte'] },
  { titulo: 'Cancelamento de dias anteriores', texto: 'Pede a foto legível do comprovante, a data e o valor. Só com os três passa para a equipe.', motivo: 'estorno_anterior', base: ['enc_estorno_anterior'] },
  { titulo: 'Portal ou app', texto: 'Mostra os 5 temas e manda o texto do tema escolhido. Se não resolver, pede a descrição e um print e passa.', motivo: 'portal_app', base: ['portal_split', 'portal_beneficiarios', 'portal_boleto', 'portal_relatorio', 'portal_comprovante', 'enc_suporte'] },
  { titulo: 'Falar com um atendente', texto: 'Pergunta o assunto em uma linha e passa.', motivo: 'pediu_atendente', base: ['enc_atendente'] },
]

export const NAO_CLIENTE = {
  texto: 'Pede o CNPJ e faz uma pergunta por mensagem, pulando o que a pessoa já contou. Se perguntarem como funciona, explica com o texto da base. Taxa e preço ficam com o comercial.',
  perguntas: [
    'Como funciona o negócio e o repasse',
    'Se o repasse é feito na mão',
    'Para quantas pessoas repassa',
    'Volume de vendas por mês',
    'Se percebe imposto pago duas vezes',
    'Quem decide',
  ],
  motivo: 'qualificacao_concluida',
  base: ['nao_cliente', 'enc_comercial'],
}

export const QUALQUER_MOMENTO = 'Pediu para falar com uma pessoa, em qualquer ponto: passa na hora, sem mais perguntas.'

export const PASSAGEM = [
  'Grava uma nota interna com o motivo, o tipo (cliente ou não), o CPF/CNPJ, o resumo e os dados coletados.',
  'Coloca a tag atendimento-humano.',
  'Tira a tag ia: daqui em diante quem responde é a equipe.',
  'Deixa a conversa como não lida, para aparecer para vocês.',
]

/** Travas em código: valem mesmo que o modelo tente o contrário (as de quando ela fica quieta ou passa na hora já estão no fluxo). */
export const TRAVAS = [
  'Nunca informa taxa, preço, valor, prazo ou condição comercial: diz que a equipe passa e anota o pedido.',
  'Uma pergunta por mensagem; a pergunta do roteiro comercial não pode ser pulada.',
  'Não diz que vai passar para a equipe sem passar de verdade: a trava refaz a resposta com a ferramenta.',
  'Só passa com os dados mínimos do motivo (cancelamento de dias anteriores: comprovante, data e valor).',
  'Nunca pede nem envia senha; não promete aprovação de estorno, cadastro ou análise.',
  'Fora do horário, não promete atendimento imediato.',
]

/** Quem muda o quê na base. */
export const QUEM_MUDA = {
  voce: ['Textos do portal e do app', 'Passo a passo do estorno na maquininha', 'O que ela explica para quem não é cliente', 'Encerramentos de cada passagem', 'Aviso de fora do horário', 'Informações novas (produto, procedimento, prazo operacional)'],
  control: ['Ordem das perguntas do roteiro', 'Quando ela passa para a equipe', 'Tags e quem ela atende', 'Horário da equipe e feriados', 'Tarefas novas (agendar, follow-up, mover card)'],
  nunca: ['Taxa e porcentagem', 'Preço e valor em reais', 'Senha', 'Dados pessoais de clientes'],
}

export const TAGS = [
  { tag: 'ia', significa: 'A assistente atende este contato.', quem: 'Combinado com a Control Gestão (nos testes, só os números de teste).' },
  { tag: 'atendimento-humano', significa: 'A equipe está com o contato. A assistente não responde.', quem: 'A assistente, na passagem. Vocês também podem colocar a qualquer hora.' },
  { tag: 'em contato', significa: 'O contato já foi atendido (a mesma tag da automação antiga).', quem: 'A assistente.' },
]

export const ACOES = [
  { titulo: 'Tirar a assistente de um contato', texto: 'Coloque a tag atendimento-humano. Ela para de responder na hora.' },
  { titulo: 'Devolver um contato para a assistente', texto: 'Tire a tag atendimento-humano e coloque a tag ia. Ela começa um atendimento novo, sem perguntar de novo se é cliente.' },
  { titulo: 'Feriado', texto: 'A assistente não sabe quando é feriado: num feriado de dia útil ela age como num dia normal. Avise a Control Gestão com antecedência para ajustar o aviso.' },
]

export const COMBINADOS = [
  { titulo: 'Não apaguem a conversa de um contato no GHL.', porque: 'O GHL deixa de avisar a assistente da próxima mensagem e o cliente fica sem resposta.' },
  { titulo: 'Não apaguem nem troquem o tipo do campo CPF/CNPJ.', porque: 'É onde ela grava o documento. Renomear pode.' },
  { titulo: 'Mudou um processo, prazo, caminho do app ou texto?', porque: 'Peça em Ensinar: a IA atualiza e o exame confere. Mudança no roteiro vira pedido para a Control Gestão.' },
  { titulo: 'Viram uma resposta estranha?', porque: 'Corrija em Ensinar › Conversas reais. Se for regra de atendimento, a IA registra o pedido para a Control Gestão.' },
  { titulo: 'Evitem mandar senha pelo WhatsApp.', porque: 'A assistente nunca faz isso, e a equipe deve seguir a mesma regra.' },
]

export const FAQ = [
  { p: 'A assistente diz que é uma IA?', r: 'Sim. Se perguntarem, ela diz que é a assistente virtual da InovPay. Nunca finge ser uma pessoa.' },
  { p: 'E se o cliente mandar áudio, foto ou PDF?', r: 'Ela ouve o áudio e lê a imagem ou o PDF, responde em texto e usa o que leu na conversa e na nota.' },
  { p: 'E se o cliente insistir na taxa?', r: 'Ela continua dizendo que a equipe passa as taxas e anota o pedido. Nunca escreve porcentagem nem valor.' },
  { p: 'Respondi um cliente e a assistente parou. Está com problema?', r: 'Não. Quando alguém da equipe responde pelo GHL, ela fica quieta por 6 horas naquele contato para não atropelar vocês.' },
  { p: 'Mudei um texto em Ensinar. Já vale no WhatsApp?', r: 'Só depois de publicar. A mudança fica no rascunho até o exame aprovar as 14 conversas de teste.' },
]
