// npx tsx scripts/demo-central.ts — gera central/lib/demo-data.json (dados FICTÍCIOS)
// com as mesmas funções que o agente usa em /api/central. Só para CENTRAL_DEMO=1.
import { writeFileSync } from 'fs'
import { buildConversas, buildExecutionData, buildFunil, buildRecovery, type GhlOppResumo } from '../lib/central-data'
import type { ExecEntry } from '../lib/execlog'

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
writeFileSync('central/lib/demo-data.json', JSON.stringify({ execucoes, live, recuperacao: buildRecovery() }))
console.log(`demo: ${entries.length} execuções, ${opps.length} oportunidades → central/lib/demo-data.json`)
