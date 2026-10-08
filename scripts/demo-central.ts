// npx tsx scripts/demo-central.ts — gera central/lib/demo-data.json (dados FICTÍCIOS)
// com as mesmas funções que o agente usa em /api/central. Só para CENTRAL_DEMO=1.
import { readFileSync, writeFileSync } from 'fs'
import { buildConversas, buildExecutionData, buildFunil, buildRecovery, type GhlOppResumo } from '../lib/central-data'
import { listarConversas, turnosDoContato } from '../lib/conversas-reais'
import type { ExecEntry } from '../lib/execlog'
import { GRUPOS, ITENS, textosPadrao, validarTexto } from '../lib/base-core'

const NOW = Date.now()
const min = (m: number) => new Date(NOW - m * 60_000).toISOString()
const u = (i: number, o: number) => ({ input: i, cached: Math.round(i * 0.7), output: o, calls: 2 })
const custo = (i: number, o: number) => Math.round(((i * 0.3 * 0.75 + i * 0.7 * 0.075 + o * 4.5) / 1e6) * 1e6) / 1e6

const NOMES = ['Marta Ribeiro', 'João Pedro', 'Loja Bella Moda', 'Carlos Henrique', 'Ana Paula', 'Distribuidora Sol', 'Renata Lima',
  'Pet Shop Amigo', 'Felipe Costa', 'Clínica Vida', 'Bruno Alves', 'Mercado Bom Preço', 'Juliana Rocha', 'Oficina do Zé', 'Patrícia Gomes']

type Roteiro = Array<Omit<ExecEntry, 'at' | 'leadId' | 'nome'> & { depois: number }>

const ROTEIROS: Roteiro[] = [
  [ // estorno de hoje que não deu certo (urgente)
    { tipo: 'resposta', perfil: 'cliente', turnoLead: 'Preciso cancelar uma venda', respostaIA: 'Oi! Seja bem-vindo(a) à InovPay. Pra eu te ajudar, me passa o CPF ou CNPJ cadastrado? Ele é usado só pra este atendimento, conforme a nossa Política de Privacidade.', tools: ['definir_tipo'], depois: 0 },
    { tipo: 'resposta', perfil: 'cliente', turnoLead: '[cnpj]', respostaIA: 'O estorno é de uma venda feita hoje?', tools: ['gravar_documento'], depois: 2 },
    { tipo: 'resposta', perfil: 'cliente', turnoLead: 'sim, de hoje cedo', respostaIA: 'O cancelamento de uma venda feita no mesmo dia é feito direto na maquininha… Conseguiu concluir o cancelamento na maquininha?', tools: ['anotar'], depois: 3 },
    { tipo: 'passou', perfil: 'cliente', porta: 'estorno', turnoLead: 'não consegui, pede uma senha que eu não lembro', respostaIA: 'Obrigado pelas informações! Seu atendimento foi registrado e vai para um dos nossos especialistas.', tools: ['anotar', 'passar_para_humano'], detalhe: 'Estorno de venda de hoje. Tentou na maquininha e travou na senha administrativa (não lembra). Venda de hoje cedo.', depois: 6 },
  ],
  [ // estorno resolvido na maquininha
    { tipo: 'resposta', perfil: 'cliente', turnoLead: 'como faço estorno? a venda foi agora', respostaIA: 'Oi! Seja bem-vindo(a) à InovPay. O cancelamento de uma venda feita no mesmo dia é feito direto na maquininha… Conseguiu concluir o cancelamento na maquininha?', tools: ['definir_tipo', 'anotar'], depois: 0 },
    { tipo: 'resposta', perfil: 'cliente', turnoLead: 'consegui, saiu o comprovante', respostaIA: 'Que bom! A InovPay agradece seu contato.', depois: 4 },
  ],
  [ // maquininha
    { tipo: 'resposta', perfil: 'cliente', turnoLead: 'minha maquininha não está passando cartão', respostaIA: 'Oi! Seja bem-vindo(a) à InovPay. Antes de te encaminhar, vamos tentar resolver rapidinho por aqui. A maquininha liga normalmente, liga mas dá erro, ou não liga?', tools: ['definir_tipo'], depois: 0 },
    { tipo: 'resposta', perfil: 'cliente', turnoLead: 'liga mas dá erro de comunicação', respostaIA: 'Em poucas palavras, me conta o que está acontecendo com a sua maquininha. Se puder, manda uma foto ou um vídeo mostrando o problema.', tools: ['anotar'], depois: 2, guard: ['uma pergunta: cortado em código'] },
    { tipo: 'passou', perfil: 'cliente', porta: 'suporte_maquininha', turnoLead: '[imagem do lead]: tela com "erro 05 sem comunicação"', respostaIA: 'Obrigado pelas informações! Seu atendimento foi registrado e vai para um dos nossos especialistas. Você não vai precisar repetir o que já mandou.', tools: ['anotar', 'passar_para_humano'], detalhe: 'Maquininha liga mas dá erro 05 (sem comunicação). Mandou foto da tela.', midia: { audios: 0, imagens: 1, documentos: 0 }, depois: 5 },
  ],
  [ // portal resolvido
    { tipo: 'resposta', perfil: 'cliente', turnoLead: 'como cadastro um fornecedor no portal?', respostaIA: 'Oi! Seja bem-vindo(a) à InovPay. 📲 Cadastro de Beneficiários… As orientações resolveram sua dúvida, você precisa de ajuda ou tem outra dúvida?', tools: ['definir_tipo', 'anotar'], depois: 0 },
    { tipo: 'resposta', perfil: 'cliente', turnoLead: 'resolveu, obrigado', respostaIA: 'Que bom que conseguimos ajudar! A InovPay agradece seu contato.', depois: 7 },
  ],
  [ // comercial qualificado
    { tipo: 'resposta', perfil: 'nao_cliente', turnoLead: 'quero saber das taxas', respostaIA: 'Oi! Seja bem-vindo(a) à InovPay. As taxas a nossa equipe passa certinho pra você. Você já é cliente da InovPay?', tools: ['anotar'], depois: 0 },
    { tipo: 'resposta', perfil: 'nao_cliente', turnoLead: 'não', respostaIA: 'Pra começar, me passa o CNPJ da sua empresa? Ele é usado só pra este atendimento, conforme a nossa Política de Privacidade.', tools: ['definir_tipo'], depois: 2 },
    { tipo: 'resposta', perfil: 'nao_cliente', turnoLead: '[cnpj]', respostaIA: 'Me conta como funciona o seu negócio hoje: vocês recebem pagamentos e depois repassam parte desse valor para outras pessoas ou empresas?', tools: ['gravar_documento'], depois: 3 },
    { tipo: 'resposta', perfil: 'nao_cliente', turnoLead: 'sim, repasso para 3 profissionais por pix', respostaIA: 'E qual o volume aproximado de vendas por mês, em valor ou em quantidade?', tools: ['anotar', 'anotar'], depois: 4 },
    { tipo: 'resposta', perfil: 'nao_cliente', turnoLead: 'uns 80 mil', respostaIA: 'Vocês já perceberam se acabam pagando imposto duas vezes sobre o valor que repassam, ou nunca chegaram a calcular isso?', tools: ['anotar'], depois: 3 },
    { tipo: 'resposta', perfil: 'nao_cliente', turnoLead: 'nunca calculei', respostaIA: 'E a decisão sobre isso é sua ou tem mais alguém envolvido?', tools: ['anotar'], depois: 5 },
    { tipo: 'passou', perfil: 'nao_cliente', porta: 'qualificacao_concluida', turnoLead: 'minha e do meu sócio', respostaIA: 'Perfeito, obrigado! Vou passar seu contato e um resumo da sua operação para o nosso time comercial, que vai olhar o seu caso.', tools: ['anotar', 'passar_para_humano'], detalhe: 'Clínica, repassa para 3 profissionais via Pix um a um. ~R$ 80 mil/mês. Nunca calculou bitributação. Decide com o sócio. Perguntou de taxas.', depois: 3 },
  ],
  [ // cancelamento de dias anteriores
    { tipo: 'resposta', perfil: 'cliente', turnoLead: 'preciso estornar uma venda de semana passada', respostaIA: 'Oi! Seja bem-vindo(a) à InovPay. Pra seguir, me manda numa mensagem só a foto legível do comprovante da venda, a data e o valor.', tools: ['definir_tipo', 'anotar'], depois: 0 },
    { tipo: 'passou', perfil: 'cliente', porta: 'estorno_anterior', turnoLead: '[imagem do lead]: comprovante de R$ 350,00 em 30/09', respostaIA: 'Obrigado pelo envio! Recebemos sua solicitação de cancelamento e ela vai para análise…', tools: ['anotar', 'anotar', 'anotar', 'passar_para_humano'], detalhe: 'Cancelamento de venda de 30/09, R$ 350,00, comprovante enviado (legível).', midia: { audios: 0, imagens: 1, documentos: 0 }, depois: 8 },
  ],
  [ // pediu pessoa
    { tipo: 'passou', perfil: undefined, porta: 'pediu_humano', turnoLead: 'quero falar com uma pessoa', respostaIA: 'Claro! Já deixei tudo registrado e um atendente da nossa equipe continua com você por aqui.', tools: ['passar_para_humano'], detalhe: 'Pediu para falar com uma pessoa logo na primeira mensagem.', depois: 0 },
  ],
]

const entries: ExecEntry[] = []
let c = 0
for (let dia = 13; dia >= 0; dia--) {
  const porDia = dia === 0 ? 5 : 2 + (dia % 4)
  for (let j = 0; j < porDia; j++) {
    const r = ROTEIROS[(c + j) % ROTEIROS.length]
    const leadId = `c${c}`
    const nome = NOMES[c % NOMES.length]
    let t = dia * 1440 + 60 + j * 95 + (c % 7) * 11
    if (dia === 0) t = 25 + j * 70
    const fora = dia > 0 && j === 0 && dia % 3 === 0
    if (fora) entries.push({ at: min(t + 0.2), leadId, nome, tipo: 'aviso', detalhe: 'fora do horário: equipe volta amanhã a partir das 9h', respostaIA: 'Olá! Obrigado por entrar em contato com a InovPay. No momento estamos fora do nosso horário de atendimento…' })
    for (const passo of r) {
      t -= passo.depois
      const { depois: _d, ...resto } = passo
      const i = 5200 + ((c * 37) % 1800)
      const o = 120 + ((c * 13) % 140)
      entries.push({ ...resto, at: min(t), leadId, nome, ms: 10_500 + ((c * 911) % 4200), usage: u(i, o), custoUsd: custo(i, o), detalhe: resto.detalhe || 'enviado' })
    }
    c++
  }
}
entries.push({ at: min(190), leadId: 'x1', nome: 'Rafael Souza', tipo: 'pulou', detalhe: 'uma pessoa da equipe respondeu nas últimas 6h: a IA não atropela' })
entries.push({ at: min(3000), leadId: 'x2', nome: 'Gustavo Pires', tipo: 'erro', ms: 4100, detalhe: 'GHL 429: limite de requisições (o próximo webhook responde)' })

const execucoes = buildExecutionData(entries, 5.4, 'gpt-5.4-mini-2026-03-17', NOW, 'DEMO')
const etapas = ['Novo Lead', 'Primeiro Contato', 'Reunião Agendada', 'Reunião Realizada', 'No-Show', 'Criar Conta', 'Conta em Análise', 'Aguardando Pgto', 'Enviar Máquina', 'Ativação']
  .map((name, position) => ({ id: `s${position}`, name, position }))
const dist = [2, 8, 1, 7, 0, 3, 0, 0, 0, 4]
const opps: GhlOppResumo[] = []
dist.forEach((n, s) => {
  for (let k = 0; k < n; k++) {
    opps.push({
      id: `o${s}-${k}`, pipelineStageId: `s${s}`, status: s === 9 && k < 3 ? 'won' : 'open', monetaryValue: 699,
      lastStageChangeAt: min((k % 3 === 0 ? 12 : 2) * 1440), contact: { name: NOMES[(s * 3 + k) % NOMES.length], tags: k % 2 ? ['ia'] : [] },
    })
  }
})
const live = {
  geradoEm: new Date(NOW).toISOString(),
  ...buildConversas(execucoes.execucoes, NOW),
  pipeline: { nome: 'Novos Leads InovPay' },
  ...buildFunil(etapas, opps, 'ia', NOW),
  regras: { modoGate: 'tag', gateTag: 'ia', humanTag: 'atendimento-humano', expediente: 'segunda a sexta, das 9h às 18h' },
  saude: { crmOk: true, problemas: [] },
}
// Base de dados: os textos reais, com um rascunho de exemplo
const padrao = textosPadrao(readFileSync('prompts/inovpay.md', 'utf-8'))
const rascunho: Record<string, string> = {}
const base = {
  versao: 2, publicadoEm: new Date(NOW - 3 * 86400_000).toISOString(), nota: 'Caminhos do app atualizados', rascunhoEm: new Date(NOW - 3600_000).toISOString(),
  grupos: { ...GRUPOS, extras: 'Informações acrescentadas pela equipe' },
  itens: [
    ...ITENS.map(i => ({ id: i.id, grupo: i.grupo as string, titulo: i.titulo, ajuda: i.ajuda, padrao: padrao[i.id], noAr: padrao[i.id], rascunho: rascunho[i.id] ?? null, problemas: rascunho[i.id] ? validarTexto(i.id, rascunho[i.id]) : [] })),
    { id: 'extra_demo0001', grupo: 'extras', titulo: 'Formas de pagamento na maquininha', ajuda: 'Informação nova: entra quando o rascunho for publicado.', padrao: '', noAr: '', rascunho: 'A maquininha aceita pagamento por aproximação e Pix por QR Code.', problemas: [] },
    { id: 'extra_demo0002', grupo: 'extras', titulo: 'Troca de bobina da maquininha', ajuda: 'Informação nova: entra quando o rascunho for publicado.', padrao: '', noAr: '', rascunho: 'Abra a tampa superior puxando a trava para cima. Coloque o rolo com o papel saindo por baixo e feche a tampa. Use bobina térmica 57 mm x 40 m.', problemas: [] },
  ],
  alteracoes: ['extra_demo0001', 'extra_demo0002'],
  historico: [
    { versao: 1, publicadoEm: new Date(NOW - 6 * 86400_000).toISOString(), nota: 'Encerramento do comercial mais curto', mudancas: ['enc_comercial'] },
    { versao: 0, publicadoEm: null, nota: null, mudancas: [] },
  ],
  conversa: [
    { id: 'c1', ts: new Date(NOW - 5 * 3600_000).toISOString(), papel: 'equipe', origem: 'base', texto: 'O split D+0 agora pode ser criado até 13h, não mais até 14h.' },
    { id: 'c2', ts: new Date(NOW - 5 * 3600_000 + 9000).toISOString(), papel: 'ia', origem: 'base', destino: 'base', custoUsd: 0.0024,
      texto: 'Troquei o horário de criação do split D+0 de 14h para 13h no texto do portal e mantive o resto igual. Está no rascunho: teste e publique com o exame para valer no WhatsApp.',
      mudancas: [{ tipo: 'trocar', id: 'portal_split', titulo: 'Split de recebíveis (transferência)', antes: padrao.portal_split, depois: padrao.portal_split.replace('Criar o Split até 14h', 'Criar o Split até 13h') }], desfeita: true },
    { id: 'c3', ts: new Date(NOW - 2 * 3600_000).toISOString(), papel: 'equipe', origem: 'teste', texto: '',
      correcao: { sessao: 'tdemo', mensagemId: 'r1', lead: '', resposta: 'A aceitação por aproximação depende do modelo da maquininha. Me conta qual é a sua dúvida?', comoDeveria: 'Deveria dizer que sim, aceita aproximação e Pix por QR Code', porque: 'Ela inventou que depende do modelo' } },
    { id: 'c4', ts: new Date(NOW - 2 * 3600_000 + 11000).toISOString(), papel: 'ia', origem: 'teste', destino: 'nova_informacao', custoUsd: 0.0026,
      texto: 'Acrescentei uma informação nova sobre as formas de pagamento da maquininha. Está no rascunho: teste e publique com o exame para valer no WhatsApp.',
      analise: { comoDeveria: 'Aceita, sim! A maquininha aceita pagamento por aproximação e Pix por QR Code.', porque: 'A base não tinha essa informação, então a assistente deduziu uma resposta ("depende do modelo") em vez de responder com o fato.' },
      mudancas: [{ tipo: 'nova', id: 'extra_demo0001', titulo: 'Formas de pagamento na maquininha', antes: '', depois: 'A maquininha aceita pagamento por aproximação e Pix por QR Code.' }] },
    { id: 'c5', ts: new Date(NOW - 3600_000).toISOString(), papel: 'equipe', origem: 'base', texto: 'Quero que ela pergunte o nome do cliente antes de tudo.' },
    { id: 'c6', ts: new Date(NOW - 3600_000 + 6000).toISOString(), papel: 'ia', origem: 'base', destino: 'control_gestao', custoUsd: 0.0008,
      texto: 'Isso é regra de atendimento (muda a ordem da triagem), então não mexi na base. Nada mudou na base: ficou registrado como pedido para a Control Gestão.' },
    { id: 'c7', ts: new Date(NOW - 1800_000).toISOString(), papel: 'equipe', origem: 'base', texto: 'Ensina o que serve deste manual',
      anexos: [{ nome: 'procedimentos.pdf', origem: 'arquivo', tipo: 'pdf', caracteres: 386 }, { nome: 'tabela.xlsx', origem: 'arquivo', tipo: 'xlsx', caracteres: 0, erro: 'formato não aceito (planilha Excel: salve como CSV)' }] },
    { id: 'c8', ts: new Date(NOW - 1800_000 + 7000).toISOString(), papel: 'ia', origem: 'base', destino: 'nova_informacao', custoUsd: 0.0026,
      texto: 'Acrescentei a troca de bobina como informação nova. A parte de tabela comercial do PDF eu não usei: taxa fica com a equipe. Não consegui ler: "tabela.xlsx": formato não aceito (planilha Excel: salve como CSV). Está no rascunho: teste e publique com o exame para valer no WhatsApp.',
      mudancas: [{ tipo: 'nova', id: 'extra_demo0002', titulo: 'Troca de bobina da maquininha', antes: '', depois: 'Abra a tampa superior puxando a trava para cima. Coloque o rolo com o papel saindo por baixo e feche a tampa. Use bobina térmica 57 mm x 40 m.' }] },
  ],
  pedidosControlGestao: 1,
  exame: { id: 'exdemo', status: 'aprovado', inicio: new Date(NOW - 3 * 86400_000 - 60_000).toISOString(), fim: new Date(NOW - 3 * 86400_000).toISOString(), nota: 'Caminhos do app atualizados', mudancas: ['portal_beneficiarios'], feitos: 14, total: 14, custoUsd: 0.07, versao: 2, falhas: [] },
}
// Laboratório: uma conversa de exemplo
const h = (id: string, dir: 'in' | 'out', text: string, m: number) => ({ id, dir, text, ts: NOW - m * 60_000 })
const teste = {
  sessao: {
    id: 'tdemo', criadoEm: new Date(NOW - 600_000).toISOString(), opcoes: { perfil: 'novo', fora: false, versao: 'vigente' },
    history: [
      h('l0', 'in', 'oi, minha maquininha não liga', 9),
      h('r1', 'out', 'Oi! Seja bem-vindo(a) à InovPay. Já vou te ajudar com a maquininha. Pra eu te ajudar, me passa o CPF ou CNPJ cadastrado? Ele é usado só pra este atendimento, conforme a nossa Política de Privacidade.', 9),
      h('l2', 'in', '11.222.333/0001-81', 8),
      h('r3', 'out', 'Em poucas palavras, me conta o que está acontecendo com a sua maquininha. Se puder, manda uma foto ou um vídeo mostrando o problema.', 8),
      h('l4', 'in', 'não acende nada, já carreguei a noite toda', 7),
      h('r5', 'out', 'Obrigado pelas informações! Seu atendimento foi registrado e vai para um dos nossos especialistas. Você não vai precisar repetir o que já mandou.', 7),
    ],
    mundo: {
      documento: '11.222.333/0001-81', tags: ['atendimento-humano', 'em contato'],
      notes: ['Passagem da IA para a equipe: Suporte · maquininha\nTipo: cliente\nCPF/CNPJ: 11.222.333/0001-81\n\nResumo: maquininha não liga, carregou a noite toda.\n\nDados coletados:\n- A maquininha liga?: não liga\n- Descrição do problema: não acende nada, já carreguei a noite toda'],
      state: { tipo: 'cliente', dados: { assunto: 'maquininha', estado_maquininha: 'não liga', descricao: 'não acende nada, já carreguei a noite toda' }, finalizado: { motivo: 'suporte_maquininha', em: new Date(NOW - 420_000).toISOString(), resumo: 'maquininha não liga' } },
    },
    detalhes: {
      r1: { tools: ['definir_tipo'], log: ['definir_tipo({"tipo":"cliente"}) → ok: cliente'], guard: [], ms: 9800, custoUsd: 0.0021, handoff: false },
      r3: { tools: ['gravar_documento', 'anotar'], log: ['gravar_documento({"documento":"11.222.333/0001-81"}) → ok: CNPJ válido gravado', 'anotar({"campo":"estado_maquininha","valor":"não liga"}) → ok'], guard: [], ms: 11200, custoUsd: 0.0024, handoff: false },
      r5: { tools: ['anotar', 'passar_para_humano'], log: ['anotar({"campo":"descricao","valor":"não acende nada, já carreguei a noite toda"}) → ok', 'passar_para_humano({"motivo":"suporte_maquininha"}) → ok: passado para a equipe'], guard: [], ms: 12900, custoUsd: 0.0027, handoff: true },
    },
    turnos: 3, custoUsd: 0.0072,
  },
  uso: { mensagens: 3, custoUsd: 0.0072, limite: 300, usdBrl: 5.4 },
}
const conversas = listarConversas(entries, 30)
const reais = { conversas, turnos: Object.fromEntries(conversas.map(c => [c.contato, turnosDoContato(entries, c.contato)])) }
writeFileSync('central/lib/demo-data.json', JSON.stringify({ execucoes, live, recuperacao: buildRecovery(), base, teste, reais }))
console.log(`demo: ${entries.length} execuções, ${opps.length} oportunidades → central/lib/demo-data.json`)
