import { trouxeTexto, type Textos } from '../lib/base-core'
import type { Cenario, Turno, World } from '../lib/evals-runner'
import { GATE_EVAL, HUMANO_EVAL } from '../lib/evals-runner'

/**
 * Exame de aceite (docs/02-escopo-substituicao.md §5): um cenário por função
 * do bot e da IA do GHL que o agente substitui. 10/10 em todos ou não sobe.
 * É também o porteiro da Base de dados: os cenários recebem os textos da versão
 * candidata e conferem, em código, que a assistente mandou o texto NOVO.
 */

const usou = (t: Turno[], tool: string) => t.some(x => x.tools.includes(tool))
const passou = (w: World) => w.tags.has(HUMANO_EVAL) && !w.tags.has(GATE_EVAL) && w.notes.length === 1
const naoPassou = (w: World) => !w.tags.has(HUMANO_EVAL) && w.tags.has(GATE_EVAL) && !w.notes.length
const semTaxa = (t: Turno[]) => t.every(x => !/\d\s*%|R\$\s*\d/.test(x.resposta))
const umaPergunta = (t: Turno[]) => t.every(x => (x.resposta.replace(/tudo (bem|certo|joia)\s*\?/gi, '').match(/\?/g) || []).length <= 1)
const ultima = (t: Turno[]) => t[t.length - 1]?.resposta || ''

const CNPJ_OK = '11.222.333/0001-81'
const CPF_RUIM = '123.456.789-00'

export function cenarios(tx: Textos): Cenario[] {
  return [
    {
      id: 'cliente-maquininha',
      nomeContato: 'Carlos Lima',
      documento: CNPJ_OK,
      msgs: ['oi, sou cliente', 'maquininha', 'liga mas dá erro', 'aparece erro de comunicação quando passo o cartão\n[imagem do lead]: tela da maquininha com a mensagem "ERRO DE COMUNICACAO - TENTE NOVAMENTE"'],
      checks: [
        { nome: 'não pediu CPF/CNPJ (já estava no cadastro)', fn: (_w, t) => t.every(x => !/cpf|cnpj/i.test(x.resposta)) },
        { nome: 'passou para a equipe com nota', fn: w => passou(w) },
        { nome: 'uma pergunta por mensagem', fn: (_w, t) => umaPergunta(t) },
        { nome: 'encerrou com o texto da base (encerramento do suporte)', fn: (_w, t) => trouxeTexto(ultima(t), tx.enc_suporte) },
      ],
      criterios: [
        'A IA não perguntou se a pessoa é cliente, porque ela já disse.',
        'A IA perguntou se a maquininha liga normalmente antes de pedir a descrição.',
        'A IA pediu para descrever o problema e mandar foto ou vídeo.',
        'A mensagem final encerra o atendimento sem fazer pergunta.',
      ],
    },
    {
      id: 'cliente-estorno-hoje',
      documento: CNPJ_OK,
      state: { tipo: 'cliente' },
      msgs: ['preciso estornar uma venda', 'sim, foi hoje', 'não consegui, pede uma senha que eu não sei'],
      checks: [
        { nome: 'mandou o passo a passo da base', fn: (_w, t) => trouxeTexto(t.map(x => x.resposta).join('\n'), tx.estorno_passos) },
        { nome: 'não mandou número de senha', fn: (_w, t) => t.every(x => !/\b\d{4,}\b/.test(x.resposta)) },
        { nome: 'passou para a equipe depois do "não consegui"', fn: w => passou(w) },
      ],
      criterios: [
        'A IA perguntou se a venda foi feita hoje.',
        'Para venda de hoje, a IA mandou o passo a passo do cancelamento na maquininha e perguntou se a pessoa conseguiu concluir.',
        'Quando a pessoa disse que não conseguiu, a IA passou para a equipe e encerrou sem pergunta.',
      ],
    },
    {
      id: 'cliente-estorno-anterior',
      documento: CNPJ_OK,
      state: { tipo: 'cliente' },
      msgs: ['quero cancelar uma venda de semana passada', 'foi de 350 reais', 'dia 29 de setembro\n[imagem do lead]: comprovante de venda legível, crédito à vista, R$ 350,00, 29/09/2026'],
      checks: [
        { nome: 'não prometeu 48h antes de ter foto, data e valor', fn: (_w, t) => !/48 horas/i.test(t[0]?.resposta || '') && !/48 horas/i.test(t[1]?.resposta || '') },
        { nome: 'passou para a equipe no fim', fn: w => passou(w) },
        { nome: 'nota com data e valor', fn: w => /29/.test(w.notes[0] || '') && /350/.test(w.notes[0] || '') },
        { nome: 'encerrou com o texto da base (cancelamento)', fn: (_w, t) => trouxeTexto(ultima(t), tx.enc_estorno_anterior) },
      ],
      criterios: [
        'A IA pediu a foto legível do comprovante, a data e o valor da venda.',
        'Quando a pessoa mandou só o valor, a IA pediu o que faltava em vez de encerrar.',
        'A mensagem final encerra o pedido de cancelamento sem fazer pergunta.',
      ],
    },
    {
      id: 'cliente-portal-split',
      documento: CNPJ_OK,
      state: { tipo: 'cliente' },
      msgs: ['tenho dúvida no portal', '1', 'tenho outra dúvida'],
      checks: [
        { nome: 'mandou o texto do split da base', fn: (_w, t) => trouxeTexto(t[1]?.resposta || '', tx.portal_split) },
        { nome: 'não passou para a equipe', fn: w => naoPassou(w) },
      ],
      criterios: [
        'A IA mostrou a lista de temas de dúvida (split, beneficiários, boleto, relatório de vendas, comprovante do split, outro assunto).',
        'Ao escolher o tema 1, a IA mandou as orientações do split de recebíveis e perguntou se resolveu.',
        'Quando a pessoa disse que tem outra dúvida, a IA mostrou os temas de novo.',
      ],
    },
    {
      id: 'atendente-direto',
      msgs: ['quero falar com um atendente'],
      checks: [
        { nome: 'passou para a equipe na primeira mensagem', fn: w => passou(w) },
        { nome: 'não pediu documento', fn: (_w, t) => !/cpf|cnpj/i.test(t[0]?.resposta || '') },
      ],
      criterios: [
        'A IA aceitou na hora passar para uma pessoa, sem questionário.',
        'A mensagem não termina com pergunta.',
      ],
    },
    {
      id: 'texto-livre-cliente',
      msgs: ['minha maquininha tá dando erro desde ontem'],
      checks: [
        { nome: 'registrou que é cliente', fn: w => w.state.tipo === 'cliente' },
        { nome: 'pediu o CPF ou CNPJ (não estava no cadastro)', fn: (_w, t) => /cpf|cnpj/i.test(t[0]?.resposta || '') },
      ],
      criterios: [
        'A IA não perguntou se a pessoa é cliente nem pediu para escolher número de menu: entendeu pelo texto.',
        'A IA pediu o CPF ou CNPJ cadastrado e citou o uso dos dados só para este atendimento (Política de Privacidade).',
      ],
    },
    {
      id: 'nao-cliente-qualificacao',
      nomeContato: 'Paula',
      msgs: [
        'boa tarde',
        'não sou cliente',
        CNPJ_OK,
        'tenho uma clínica de estética, recebo dos clientes e repasso pras profissionais parceiras',
        'tudo no pix, na mão',
        'umas 4 profissionais',
        'uns 120 mil por mês',
        'nunca calculei',
        'sou eu que decido',
      ],
      checks: [
        { nome: 'gravou o CNPJ', fn: w => w.documento === CNPJ_OK },
        { nome: 'anotou as respostas', fn: w => ['repasse', 'forma_repasse', 'recebedores', 'volume_mensal', 'bitributacao', 'decisor'].filter(k => (w.state.dados as Record<string, string> | undefined)?.[k]).length >= 5 },
        { nome: 'passou para o comercial no fim', fn: w => passou(w) && /qualifica/i.test(w.notes[0] || '') },
        { nome: 'encerrou com o texto da base (comercial)', fn: (_w, t) => trouxeTexto(ultima(t), tx.enc_comercial) },
        { nome: 'uma pergunta por mensagem', fn: (_w, t) => umaPergunta(t) },
      ],
      criterios: [
        'Depois do "boa tarde", a IA perguntou se a pessoa já é cliente da InovPay.',
        'A IA pediu o CNPJ da empresa (não "cadastrado").',
        'A IA fez as perguntas uma por vez, sem repetir o que a pessoa já tinha contado.',
        'O encerramento não diz que o caso "tem total fit" e não faz pergunta.',
      ],
    },
    {
      id: 'nao-cliente-pede-humano',
      state: { tipo: 'nao_cliente' },
      documento: CNPJ_OK,
      historico: [
        ['in', 'quero conhecer a maquininha'],
        ['out', 'Oi! Seja bem-vindo(a) à InovPay. Como funciona o seu negócio hoje? Vocês recebem pagamentos e depois repassam parte desse valor para outras pessoas ou empresas, tipo fornecedores, parceiros ou prestadores?'],
      ],
      msgs: ['pode me passar para um humano por favor'],
      checks: [
        { nome: 'passou na hora', fn: w => passou(w) },
        { nome: 'sem pergunta no final', fn: (_w, t) => !/\?/.test(ultima(t)) },
      ],
      criterios: ['A IA aceitou passar para uma pessoa na hora, sem pedir mais nenhuma informação.'],
    },
    {
      id: 'nao-cliente-pede-taxa',
      state: { tipo: 'nao_cliente' },
      documento: CNPJ_OK,
      msgs: ['quais são as taxas de vocês no crédito parcelado?'],
      checks: [
        { nome: 'não informou taxa nem valor', fn: (_w, t) => semTaxa(t) },
        { nome: 'anotou o pedido', fn: w => !!w.state.dados?.pedido_extra },
        { nome: 'não passou para a equipe', fn: w => naoPassou(w) },
      ],
      criterios: [
        'A IA disse que a equipe passa as taxas certinho, sem inventar número.',
        'A IA seguiu com uma pergunta do roteiro (como funciona o negócio ou o repasse).',
      ],
    },
    {
      id: 'cliente-pergunta-taxa',
      nomeContato: 'Matheus',
      documento: CNPJ_OK,
      msgs: ['tem alguma taxa nova pra máquina por causa da redução da selic?'],
      checks: [
        { nome: 'não informou taxa', fn: (_w, t) => semTaxa(t) },
        { nome: 'não decidiu sozinho o tipo', fn: w => w.state.tipo === undefined || w.state.tipo === 'cliente' },
      ],
      criterios: [
        'A IA não inventou taxa nem disse que a taxa mudou.',
        'Como a pergunta sozinha não mostra se é cliente, a IA perguntou se a pessoa já é cliente da InovPay (ou tratou como cliente se ficou claro).',
      ],
    },
    {
      id: 'fora-do-horario-estorno',
      foraDoHorario: true,
      documento: CNPJ_OK,
      msgs: ['sou cliente e preciso cancelar uma venda de ontem', 'foi de 1.200 reais, dia 9\n[imagem do lead]: comprovante legível, R$ 1.200,00, 09/10/2026'],
      checks: [
        { nome: 'passou para a equipe com nota', fn: w => passou(w) && /fora do hor/i.test(w.notes[0] || '') },
        { nome: 'não prometeu resposta imediata', fn: (_w, t) => t.every(x => !/em instantes|agora mesmo|j[aá] j[aá]|daqui a pouco/i.test(x.resposta)) },
        { nome: 'não repetiu o aviso de horário', fn: (_w, t) => !/9h às 18h/.test(t[0]?.resposta || '') },
      ],
      criterios: [
        'Mesmo fora do horário, a IA fez a triagem do estorno (pediu comprovante, data e valor).',
        'A mensagem final diz que a equipe continua na segunda-feira a partir das 9h.',
      ],
    },
    {
      id: 'cpf-invalido',
      state: { tipo: 'cliente' },
      msgs: ['meu split não caiu', CPF_RUIM],
      checks: [
        { nome: 'não gravou documento inválido', fn: w => !w.documento },
        { nome: 'pediu de novo', fn: (_w, t) => /cpf|cnpj/i.test(ultima(t)) },
      ],
      criterios: ['Quando o CPF veio inválido, a IA pediu para conferir e mandar de novo, com educação.'],
    },
    {
      id: 'documento-no-cadastro-nao-pergunta',
      documento: CNPJ_OK,
      state: { tipo: 'cliente' },
      msgs: ['bom dia'],
      checks: [{ nome: 'não pediu documento', fn: (_w, t) => !/cpf|cnpj/i.test(t[0]?.resposta || '') }],
      criterios: [
        'A IA não perguntou se é cliente (o tipo já era conhecido).',
        'A IA perguntou sobre qual assunto a pessoa precisa de ajuda.',
      ],
    },
    {
      id: 'nao-cliente-documento-no-cadastro',
      documento: CNPJ_OK,
      msgs: ['oi', 'ainda não sou cliente'],
      checks: [
        { nome: 'não pediu CNPJ de novo', fn: (_w, t) => t.every(x => !/cpf|cnpj/i.test(x.resposta)) },
        { nome: 'registrou não cliente', fn: w => w.state.tipo === 'nao_cliente' },
      ],
      criterios: [
        'A IA perguntou se a pessoa já é cliente.',
        'Depois do "ainda não sou cliente", a IA foi direto para a primeira pergunta sobre o negócio, sem pedir CNPJ.',
      ],
    },
  ]
}
