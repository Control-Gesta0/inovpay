/**
 * npm test: regras determinísticas (sem rede, sem env de produção).
 */
process.env.GHL_TOKEN ||= 'pit-x'
process.env.GHL_LOCATION_ID ||= 'loc'
process.env.OPENAI_API_KEY ||= 'x'
process.env.UPSTASH_REDIS_REST_URL ||= 'https://x.upstash.io'
process.env.UPSTASH_REDIS_REST_TOKEN ||= 'x'
process.env.WEBHOOK_SECRET ||= 'x'

let falhas = 0
function eq(nome: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) falhas++
  console.log(`${ok ? '✅' : '❌'} ${nome}${ok ? '' : ` → recebido ${JSON.stringify(got)}, esperado ${JSON.stringify(want)}`}`)
}

async function main() {
  // ---------- CPF / CNPJ ----------
  const { validarDocumento, mascarar } = await import('../lib/documento')
  eq('CPF válido com pontuação', validarDocumento('529.982.247-25')?.formatado, '529.982.247-25')
  eq('CPF válido sem pontuação', validarDocumento('52998224725')?.tipo, 'cpf')
  eq('CPF com dígito errado', validarDocumento('123.456.789-00'), null)
  eq('CPF repetido', validarDocumento('111.111.111-11'), null)
  eq('CPF com último dígito trocado', validarDocumento('606.607.608-61'), null)
  eq('CNPJ válido', validarDocumento('11.222.333/0001-81')?.formatado, '11.222.333/0001-81')
  eq('CNPJ com rótulo junto (visto no laboratório)', validarDocumento('CNPJ 11.222.333/0001-81')?.formatado, '11.222.333/0001-81')
  eq('CPF no meio da frase', validarDocumento('sim, foi hoje. meu cpf é 529.982.247-25')?.tipo, 'cpf')
  eq('texto sem documento válido', validarDocumento('CNPJ 11.222.333/0001-80'), null)
  eq('CNPJ com ponto no lugar da barra (visto na conversa)', validarDocumento('69.356.674.0001-20')?.tipo ?? 'inválido', validarDocumento('69356674000120')?.tipo ?? 'inválido')
  eq('CNPJ com dígito errado', validarDocumento('11.222.333/0001-82'), null)
  eq('CNPJ alfanumérico (Receita, jul/2026)', validarDocumento('12.ABC.345/01DE-35')?.tipo, 'cnpj')
  eq('"1" não é documento', validarDocumento('1'), null)
  eq('texto não é documento', validarDocumento('meu cnpj é esse'), null)
  eq('máscara', mascarar('11.222.333/0001-81'), '112***81')

  // ---------- Travas ----------
  const { checkReply, ehAutoResposta, ehNaoSuportada, numeroBR } = await import('../lib/guards')
  const regras = (t: string, o = {}) => [...new Set(checkReply(t, o).map(v => v.regra))]
  eq('taxa barrada', regras('No crédito à vista a taxa é 4,88%.'), ['informou taxa'])
  eq('taxa da pessoa também barra', regras('Sim, 1,65% no pix.', { textoLead: 'vocês cobram 1,65% no pix?' }), ['informou taxa'])
  eq('preço barrado', regras('A maquininha sai por R$ 699 no Pix.'), ['informou valor'])
  eq('valor que a pessoa disse pode repetir', regras('Anotei a venda de R$ 1.200,00 do dia 9.', { textoLead: 'foi de 1.200 reais, dia 9' }), [])
  eq('valor diferente do da pessoa barra', regras('Anotei a venda de R$ 1.500,00.', { textoLead: 'foi de 1.200 reais' }), ['informou valor'])
  eq('número de senha barrado', regras('Use a senha 123456 da maquininha.'), ['enviou senha'])
  eq('senha administrativa sem número passa', regras('Você vai precisar do cartão usado na compra e da senha administrativa da maquininha.'), [])
  eq('travessão barrado', regras('Combinado — já passei pra equipe.'), ['travessão'])
  eq('resíduo de chatbot', regras('Pronto! Fico à disposição.'), ['resíduo de chatbot'])
  eq('duas perguntas', regras('Qual o seu CNPJ? E qual o assunto?'), ['mais de uma pergunta'])
  eq('cumprimento não conta como pergunta', regras('Oi, tudo bem? Você já é cliente da InovPay?'), [])
  eq('"em instantes" fora do horário', regras('Já passei pra equipe, em instantes alguém te chama.', { foraDoHorario: true }), ['prometeu atendimento imediato fora do horário'])
  eq('"em instantes" dentro do horário passa', regras('Já passei pra equipe, em instantes alguém te chama.'), [])
  eq('horários do FAQ passam', regras('⏰ Criar o Split até 14h\n💸 Fornecedor recebe até 16h do mesmo dia'), [])
  eq('48 horas úteis passa', regras('Se for aprovada, a carta sai em até 48 horas úteis.'), [])
  eq('JSON vazado', regras('{"campo":"assunto","valor":"x"}'), ['texto corrompido'])
  eq('número BR', [numeroBR('R$ 1.200,00'), numeroBR('350 reais'), numeroBR('1,65%')], [1200, 350, 1.65])

  eq('promessa de encaminhar sem passagem', regras('Vou encaminhar pra análise do time, tá?', { handoff: false }), ['prometeu passagem sem passar'])
  eq('encaminhar depois da passagem passa', regras('Obrigado! Já passei pra equipe, que continua por aqui.', { handoff: true }), [])
  eq('roteiro da maquininha não é promessa', regras('Antes de te encaminhar, vamos tentar resolver rapidinho por aqui. A maquininha liga normalmente?', { handoff: false }), [])

  // ---------- Roteiro: próximo passo ----------
  const { proximoPasso } = await import('../lib/roteiro')
  eq('tipo desconhecido → perguntar se é cliente', /descobrir se é cliente/.test(proximoPasso({}, false, false)), true)
  eq('cliente sem documento → pedir documento', /CPF ou CNPJ cadastrado/.test(proximoPasso({ tipo: 'cliente' }, false, true)), true)
  eq('cliente com documento → roteiro do assunto', /roteiro do assunto/.test(proximoPasso({ tipo: 'cliente' }, true, false)), true)
  eq('não cliente sem documento → pedir CNPJ uma vez', /CNPJ da empresa/.test(proximoPasso({ tipo: 'nao_cliente' }, false, false)), true)
  eq('não cliente que já foi perguntado → 1ª pergunta', /"repasse"/.test(proximoPasso({ tipo: 'nao_cliente' }, false, true)), true)
  eq('não cliente → próxima pergunta que falta', /"recebedores"/.test(proximoPasso({ tipo: 'nao_cliente', dados: { repasse: 'sim', forma_repasse: 'pix' } }, true, false)), true)
  const { respostaDoRoteiro } = await import('../lib/roteiro')
  eq('resposta anotada pelo código', respostaDoRoteiro({ tipo: 'nao_cliente', dados: { repasse: 'sim', forma_repasse: 'pix' } }, 'E normalmente, numa venda, quantas pessoas ou empresas diferentes recebem parte do valor?', 'umas 4 profissionais'), { campo: 'recebedores', valor: 'umas 4 profissionais' })
  eq('sem a pergunta, não anota', respostaDoRoteiro({ tipo: 'nao_cliente', dados: { repasse: 'sim', forma_repasse: 'pix' } }, 'Pra começar, me passa o CNPJ da sua empresa?', '11.222.333/0001-81'), null)
  eq('cliente não usa o roteiro comercial', respostaDoRoteiro({ tipo: 'cliente' }, 'Vocês recebem e repassam valores?', 'sim'), null)
  const { perguntaEsperada } = await import('../lib/roteiro')
  eq('pergunta esperada depois do documento', perguntaEsperada({ tipo: 'nao_cliente', dados: { repasse: 'a', forma_repasse: 'b', recebedores: 'c' } }, true, false)?.campo, 'volume_mensal')
  eq('sem pergunta esperada antes do CNPJ', perguntaEsperada({ tipo: 'nao_cliente' }, false, false), null)
  const { temBaseNoLead } = await import('../lib/roteiro')
  eq('anotação com base no lead', temBaseNoLead('repasse', 'repassa para as profissionais parceiras', 'tenho uma clínica, recebo dos clientes e repasso pras profissionais parceiras'), true)
  eq('anotação inventada recusada', temBaseNoLead('repasse', 'recebe e repassa para fornecedores', '11.222.333/0001-81\nnão sou cliente'), false)
  eq('campo de suporte não exige base', temBaseNoLead('assunto', 'estorno', 'oi'), true)
  eq('seis respostas → passar', /qualificacao_concluida/.test(proximoPasso({ tipo: 'nao_cliente', dados: { repasse: 'a', forma_repasse: 'b', recebedores: 'c', volume_mensal: 'd', bitributacao: 'e', decisor: 'f' } }, true, false)), true)

  eq('"vou passar sua dúvida" é promessa', regras('Vou passar sua dúvida pra equipe, tá?', { handoff: false }), ['prometeu passagem sem passar'])
  const { soUltimaPergunta } = await import('../lib/guards')
  eq('fica a pergunta mais completa', soUltimaPergunta('Normalmente, numa venda, quantas pessoas recebem parte do valor? Uma média já ajuda?'), 'Normalmente, numa venda, quantas pessoas recebem parte do valor?')
  eq('"vou deixar registrado" sem passagem é promessa', regras('Vou deixar isso registrado para a equipe analisar.', { handoff: false }), ['prometeu passagem sem passar'])
  const { faltaParaPassar, PERGUNTAS_COMERCIAL } = await import('../lib/roteiro')
  eq('roteiro: nenhuma pergunta comercial com duas interrogações', PERGUNTAS_COMERCIAL.every(p => (p.texto.match(/\?/g) || []).length === 1), true)
  eq('maquininha sem descrição não passa', !!faltaParaPassar('suporte_maquininha', { tipo: 'cliente' }), true)
  eq('maquininha com descrição passa', faltaParaPassar('suporte_maquininha', { dados: { descricao: 'erro de comunicação' } }), null)
  eq('cancelamento sem data não passa', /data da venda/.test(faltaParaPassar('estorno_anterior', { dados: { valor_venda: '350', comprovante: 'ok' } }) || ''), true)
  eq('pediu pessoa passa sempre', faltaParaPassar('pediu_humano', {}), null)

  eq('"alguém continua por aqui" sem passagem é promessa', regras('A equipe te passa essa informação certinho. Alguém continua por aqui em breve.', { handoff: false }), ['prometeu passagem sem passar'])
  eq('tipo desconhecido sem perguntar se é cliente', regras('A equipe te passa essa informação certinho.', { tipoDesconhecido: true, handoff: false }), ['não perguntou se é cliente'])
  eq('tipo desconhecido perguntando passa', regras('Sobre taxa a equipe te passa certinho. Você já é cliente da InovPay?', { tipoDesconhecido: true, handoff: false }), [])
  const r2 = await import('../lib/roteiro')
  eq('estorno anterior sem nada → pede os três', /comprovante.*data.*valor/.test(r2.proximoPasso({ tipo: 'cliente', dados: { venda_de_hoje: 'não' } }, true, false)), true)

  // ---------- Cliente ou não (código) ----------
  const { tipoPeloTexto, tipoDoTurno, pediuPessoa } = await import('../lib/tipo')
  eq('"minha maquininha tá dando erro" → cliente', tipoPeloTexto('minha maquininha tá dando erro desde ontem'), 'cliente')
  eq('"preciso estornar uma venda" → cliente', tipoPeloTexto('preciso estornar uma venda'), 'cliente')
  eq('"sou cliente e preciso cancelar" → cliente', tipoPeloTexto('sou cliente e preciso cancelar uma venda de ontem'), 'cliente')
  eq('"não sou cliente" → não cliente', tipoPeloTexto('não sou cliente'), 'nao_cliente')
  eq('"ainda não sou cliente" → não cliente', tipoPeloTexto('ainda não sou cliente'), 'nao_cliente')
  eq('"quero conhecer a maquininha" → não cliente', tipoPeloTexto('quero conhecer a maquininha'), 'nao_cliente')
  eq('"oi" → ninguém sabe', tipoPeloTexto('oi'), null)
  eq('pergunta de taxa não decide', tipoPeloTexto('tem alguma taxa nova pra máquina por causa da redução da selic?'), null)
  eq('"sim" depois da pergunta → cliente', tipoDoTurno('sim', 'Oi! Você já é cliente da InovPay?'), 'cliente')
  eq('"não" depois da pergunta → não cliente', tipoDoTurno('não', 'Você já é cliente da InovPay?'), 'nao_cliente')
  eq('"sim" sem a pergunta não decide', tipoDoTurno('sim', 'Conseguiu concluir o cancelamento?'), null)
  eq('pediu atendente', pediuPessoa('quero falar com um atendente'), true)
  eq('pediu humano', pediuPessoa('Pode me passar para um humano por favor'), true)
  eq('não é pedido de pessoa', pediuPessoa('minha maquininha não liga'), false)
  const { perguntouPreco } = await import('../lib/tipo')
  eq('perguntou taxa', perguntouPreco('quais são as taxas de vocês no crédito parcelado?'), true)
  eq('perguntou preço', perguntouPreco('quanto custa a maquininha?'), true)
  eq('não perguntou preço', perguntouPreco('minha maquininha não liga'), false)
  const { respondeuPreco } = await import('../lib/tipo')
  eq('respondeu a taxa', respondeuPreco('As taxas a nossa equipe te passa certinho. Me conta como funciona o seu negócio hoje?'), true)
  eq('ignorou a taxa', respondeuPreco('Me conta como funciona o seu negócio hoje?'), false)

  // ---------- Auto-resposta e mensagem não suportada ----------
  eq('auto-resposta do WhatsApp Business do lead', ehAutoResposta('Agradecemos sua mensagem. Estamos fora do nosso horário de atendimento. Em breve um de nossos atendentes irá te responder.'), true)
  eq('pessoa falando de horário não é auto-resposta', ehAutoResposta('vocês atendem fora do horário comercial?'), false)
  eq('não suportada', ehNaoSuportada('Message type is currently not supported.'), true)

  // ---------- Horário ----------
  const { dentroDoHorario, quandoVolta, proximaAbertura } = await import('../lib/horario')
  const d = (iso: string) => new Date(iso)
  eq('quarta 10h30 aberto', dentroDoHorario(d('2026-10-07T10:30:00-03:00')), true)
  eq('quarta 18h fechado', dentroDoHorario(d('2026-10-07T18:00:00-03:00')), false)
  eq('quarta 8h59 fechado', dentroDoHorario(d('2026-10-07T08:59:00-03:00')), false)
  eq('sábado fechado', dentroDoHorario(d('2026-10-10T11:00:00-03:00')), false)
  eq('sábado 22h volta segunda', quandoVolta(d('2026-10-10T22:00:00-03:00')), 'na segunda-feira a partir das 9h')
  eq('terça 20h volta amanhã', quandoVolta(d('2026-10-06T20:00:00-03:00')), 'amanhã a partir das 9h')
  eq('quarta 7h volta hoje', quandoVolta(d('2026-10-07T07:00:00-03:00')), 'hoje a partir das 9h')
  eq('sexta 19h abre segunda 9h', proximaAbertura(d('2026-10-09T19:00:00-03:00')).toISOString(), '2026-10-12T12:00:00.000Z')

  // ---------- Reset ----------
  const { ehComandoReset, podeResetar } = await import('../lib/reset')
  eq('"reset"', ehComandoReset(' Reset '), true)
  eq('"#reset"', ehComandoReset('#reset'), true)
  eq('frase com reset não é comando', ehComandoReset('preciso dar reset na maquininha'), false)
  const cfg = { ids: ['c-teste'], phones: ['11 99999-0000'] }
  eq('reset por telefone de teste (+55)', podeResetar({ id: 'x', phone: '+5511999990000' }, cfg), true)
  eq('reset por id de teste', podeResetar({ id: 'c-teste', phone: '' }, cfg), true)
  eq('cliente comum não reseta', podeResetar({ id: 'y', phone: '+5511988887777' }, cfg), false)

  // ---------- Nota da passagem ----------
  const { montarNota } = await import('../lib/tools')
  const nota = montarNota({ tipo: 'cliente', dados: { assunto: 'estorno', valor_venda: 'R$ 350', data_venda: '29/09' } }, 'estorno', 'Quer cancelar venda de 29/09.', '11.222.333/0001-81', true)
  eq('nota tem motivo, tipo, documento e dados', [/estorno/i.test(nota), /Tipo: Cliente/.test(nota), /11\.222\.333/.test(nota), /Valor da venda: R\$ 350/.test(nota), /fora do horário/i.test(nota)], [true, true, true, true, true])

  // ---------- Webhook do GHL ----------
  const { extractContactId, extractLocationId } = await import('../api/inbound')
  eq('contact_id no topo', extractContactId({ contact_id: 'c1' }), 'c1')
  eq('custom data', extractContactId({ customData: { contact_id: 'c2' }, contact_id: 'c9' }), 'c2')
  eq('contact.id', extractContactId({ contact: { id: 'c3' } }), 'c3')
  eq('sem contato', extractContactId({ foo: 1 }), '')
  eq('location', extractLocationId({ location: { id: 'L1' } }), 'L1')

  // ---------- Bloco atual ----------
  const { blocoAtual, ehGrupo } = await import('../lib/agent')
  eq('bloco = mensagens depois da última resposta', blocoAtual([
    { id: '1', dir: 'in', text: 'oi', ts: 1 }, { id: '2', dir: 'out', text: 'Oi!', ts: 2 },
    { id: '3', dir: 'in', text: 'sou cliente', ts: 3 }, { id: '4', dir: 'in', text: 'estorno', ts: 4 },
  ]).map(m => m.text), ['sou cliente', 'estorno'])
  eq('grupo de WhatsApp', ehGrupo({ phone: '+120363012345678' }), true)

  // ---------- Central (contrato de dados) ----------
  const { buildConversas, buildExecutionData, buildFunil, marcoDe } = await import('../lib/central-data')
  const { mascararPII } = await import('../lib/guards')
  const NOW = Date.parse('2026-10-07T15:00:00Z')
  const h = (horas: number) => new Date(NOW - horas * 3600_000).toISOString()
  const u = { input: 4000, cached: 3000, output: 200, calls: 2 }
  const ex = [
    { at: h(1), tipo: 'passou' as const, leadId: 'a', nome: 'Ana', perfil: 'cliente' as const, porta: 'estorno', ms: 12000, tools: ['anotar', 'passar_para_humano'], usage: u, custoUsd: 0.002, detalhe: 'Estorno de hoje: não conseguiu na maquininha' },
    { at: h(1.5), tipo: 'resposta' as const, leadId: 'a', nome: 'Ana', perfil: 'cliente' as const, ms: 11000, usage: u, custoUsd: 0.001, respostaIA: 'O estorno é de uma venda feita hoje?' },
    { at: h(2), tipo: 'resposta' as const, leadId: 'b', nome: 'Bruno', perfil: 'cliente' as const, ms: 9000, usage: u, custoUsd: 0.001, respostaIA: 'Que bom que conseguimos ajudar! A InovPay agradece seu contato.' },
    { at: h(3), tipo: 'passou' as const, leadId: 'c', nome: 'Carla', perfil: 'nao_cliente' as const, porta: 'qualificacao_concluida', ms: 13000, guard: ['uma pergunta: cortado'], usage: u, custoUsd: 0.001, detalhe: 'Repasse para 3 parceiros' },
    { at: h(3.2), tipo: 'aviso' as const, leadId: 'c', nome: 'Carla', detalhe: 'fora do horário' },
    { at: h(4), tipo: 'erro' as const, leadId: 'd', nome: 'Davi', detalhe: 'GHL 429' },
    { at: h(5), tipo: 'pulou' as const, leadId: 'e', nome: 'Eva', detalhe: 'uma pessoa da equipe respondeu nas últimas 6h: a IA não atropela' },
    { at: h(6), tipo: 'reset' as const, leadId: 'f', nome: 'Teste', detalhe: 'tags e histórico limpos' },
    { at: h(24 * 40), tipo: 'resposta' as const, leadId: 'g', nome: 'Gil', detalhe: 'enviado' },
  ]
  eq('marco: passou', marcoDe(ex[0]), 'passou')
  eq('marco: resolvido sem a equipe', marcoDe(ex[2]), 'resolvido')
  eq('marco: resposta comum não é marco', marcoDe(ex[1]), undefined)
  const cd = buildExecutionData(ex, 5.4, 'gpt-5.4-mini', NOW, 'LOC')
  eq('saúde 24h', cd.saude24h, { total: 7, respondeu: 6, erros: 1, pulou: 1 })
  eq('marcos 7 dias', cd.marcos.seteDias, { atendidos: 3, clientes: 2, naoClientes: 1, foraDoHorario: 1, resolvidos: 1, passagens: 2, qualificados: 1 })
  eq('reset de teste não conta como atendimento', cd.marcos.trintaDias.atendidos, 3)
  eq('passagens por motivo', cd.motivos.seteDias.map(m => [m.rotulo, m.n]), [['Estorno de venda de hoje', 1], ['Comercial qualificado', 1]])
  eq('estorno de hoje é urgente', cd.passagens.map(p => [p.nome, p.urgente]), [['Ana', true], ['Carla', false]])
  eq('link do contato no GHL', cd.passagens[0].link, 'https://app.gohighlevel.com/v2/location/LOC/contacts/detail/a')
  eq('custo em reais (7d)', cd.financeiro.seteDias, 0.0270)
  eq('14 dias de série', cd.financeiro.porDia.length, 14)
  const cv = buildConversas(cd.execucoes, NOW)
  eq('estados das conversas', cv.grupos, { iaAtendendo: 3, comHumano: 3, foraDaIA: 0 })
  eq('conversas 24h', cv.conversas24h, 3)
  eq('mediana em segundos', cv.respostaMedianaSegundos, 12)
  const fu = buildFunil([{ id: 's2', name: 'Primeiro Contato', position: 1 }, { id: 's1', name: 'Novo Lead', position: 0 }], [
    { id: '1', pipelineStageId: 's1', status: 'open', lastStageChangeAt: h(24 * 10), monetaryValue: 699, contact: { name: 'Ana', tags: ['ia'] } },
    { id: '2', pipelineStageId: 's2', status: 'open', lastStageChangeAt: h(2), contact: { name: 'Bia', tags: [] } },
    { id: '3', pipelineStageId: 's2', status: 'won', lastStageChangeAt: h(24 * 20), contact: { name: 'Caio', tags: ['IA'] } },
  ], 'ia', NOW)
  eq('funil na ordem do GHL', fu.funil.map(e => [e.label, e.n, e.parados]), [['Novo Lead', 1, 1], ['Primeiro Contato', 1, 0]])
  eq('ganhas fora das etapas', fu.leads, { total: 3, abertas: 2, ganhas: 1, perdidas: 0, comIA: 2, tagsDisponiveis: true })
  eq('PII mascarada', mascararPII('meu cnpj 12.345.678/0001-95, cpf 12345678909, fone (11) 98765-4321, a@b.com'), 'meu cnpj [cnpj], cpf [cpf], fone [telefone], [e-mail]')
  eq('celular de 11 dígitos vira telefone, não CPF', mascararPII('me liga 11987654321'), 'me liga [telefone]')
  eq('CPF pontuado e CNPJ alfanumérico', mascararPII('123.456.789-09 e 12.ABC.345/01DE-35'), '[cpf] e [cnpj]')
  eq('CNPJ só números mascarado', mascararPII('12345678000195'), '[cnpj]')
  eq('valor em reais não vira telefone', mascararPII('vendi R$ 1.250,00 ontem'), 'vendi R$ 1.250,00 ontem')


  // ---------- Base de dados (núcleo) ----------
  const bc = await import('../lib/base-core')
  const { loadPrompt } = await import('../lib/llm')
  const tpl = loadPrompt()
  const renderizado = bc.renderPrompt(tpl)
  const tp = bc.textosPadrao(tpl)
  eq('prompt renderizado sem marcadores', /<!--|base:/.test(renderizado), false)
  eq('padrão renderiza igual ao prompt', bc.renderPrompt(tpl, tp) === renderizado, true)
  eq('todo item tem texto padrão', bc.ITENS.every(i => !!tp[i.id]), true)
  eq('encerramento citado no prompt = o da ferramenta', [tp.enc_suporte === bc.PADRAO_CODIGO.enc_suporte, tp.enc_estorno_anterior === bc.PADRAO_CODIGO.enc_estorno_anterior], [true, true])
  eq('textos padrão passam na trava', bc.ITENS.filter(i => bc.validarTexto(i.id, tp[i.id]).length).map(i => i.id), [])
  const editado = bc.renderPrompt(tpl, { ...tp, portal_split: 'Split novo\nlinha 2', estorno_passos: 'Passo A\nPasso B' })
  eq('edição entra no prompt', editado.includes('**Split de recebíveis (transferência)**\nSplit novo\nlinha 2\n\n**Cadastro'), true)
  eq('edição dentro da lista mantém o recuo', editado.includes('"Passo A\n   Passo B"'), true)
  eq('trava: porcentagem', bc.validarTexto('portal_split', 'Taxa de 1,5% no D+0').length > 0, true)
  eq('trava: valor em reais', bc.validarTexto('nao_cliente', 'A maquininha custa R$ 699').length > 0, true)
  eq('trava: travessão', bc.validarTexto('portal_boleto', 'Pague até 23h — no portal').length > 0, true)
  eq('trava: aviso sem {quando}', bc.validarTexto('aviso_fora', 'Estamos fora do horário.').length > 0, true)
  eq('trava: encerramento com pergunta', bc.validarTexto('enc_suporte', 'Registrado! Mais alguma coisa?').length > 0, true)
  eq('trava: vazio', bc.validarTexto('portal_relatorio', '   ').length > 0, true)
  eq('trava: marcação de sistema', bc.validarTexto('portal_relatorio', 'texto <!-- x -->').length > 0, true)
  eq('encerramento por motivo', [bc.encerramento('estorno', { enc_suporte: 'X' }), bc.encerramento('pediu_humano', {}), bc.encerramento('qualificacao_concluida', {})?.slice(0, 8)], ['X', null, 'Obrigado'])
  eq('aviso com quando', bc.avisoForaDoHorario({ aviso_fora: 'Volta {quando}.' }, 'amanhã'), 'Volta amanhã.')
  eq('mesclar ignora id desconhecido', 'xyz' in bc.mesclar(tp, { xyz: 'a' } as never), false)
  eq('exame vê texto novo', [bc.trouxeTexto('Oi! Split novo: crie até 22h no portal', 'Split novo, crie até 22h no portal'), bc.trouxeTexto('Crie até 23h no portal antigo', 'Split novo com horário diferente e caminho inédito')], [true, false])


  // ---------- Anotação sem resposta (exame de 08/10/2026) ----------
  const rt = await import('../lib/roteiro')
  const leadCom = 'não sou cliente\ntenho uma clínica e repasso pras profissionais\numas 4 profissionais'
  eq('"não informou" não vira resposta', rt.temBaseNoLead('bitributacao', 'não informou', leadCom), false)
  eq('"a confirmar" não vira resposta', rt.temBaseNoLead('volume_mensal', 'a confirmar', leadCom), false)
  eq('"aguardando resposta" não vira resposta', rt.temBaseNoLead('volume_mensal', 'aguardando resposta', leadCom), false)
  eq('"não informado" também não vale no cancelamento', [rt.temBaseNoLead('comprovante', 'não informado', leadCom), rt.temBaseNoLead('data_venda', 'a confirmar', leadCom), rt.temBaseNoLead('valor_venda', 'R$ 350', leadCom)], [false, false, true])
  eq('resposta de verdade continua entrando', rt.temBaseNoLead('recebedores', 'umas 4 profissionais', leadCom), true)
  eq('"não sei" é resposta', rt.temBaseNoLead('bitributacao', 'não sei', leadCom + '\nnão sei'), true)

  eq('maquininha: descrição anotada pelo código', rt.respostaDoRoteiro({ tipo: 'cliente', dados: { assunto: 'maquininha', estado_maquininha: 'liga mas dá erro' } }, 'Em poucas palavras, me conta o que está acontecendo com a sua maquininha. Se puder, manda uma foto ou um vídeo mostrando o problema.', 'erro de comunicação\n[imagem do lead]: tela com erro'), { campo: 'descricao', valor: 'erro de comunicação\n[imagem do lead]: tela com erro' })
  eq('maquininha: estado anotado pelo código', rt.respostaDoRoteiro({ tipo: 'cliente', dados: { assunto: 'maquininha' } }, 'A maquininha liga normalmente, liga mas dá erro, ou não liga?', 'não liga'), { campo: 'estado_maquininha', valor: 'não liga' })
  eq('maquininha: não reescreve o que já está anotado', rt.respostaDoRoteiro({ tipo: 'cliente', dados: { descricao: 'x', estado_maquininha: 'y' } }, 'me conta o que está acontecendo', 'outra coisa'), null)

  // ---------- Não pergunta de novo se é cliente ----------
  const gd = await import('../lib/guards')
  eq('tipo conhecido: perguntar de novo é trava', gd.checkReply('Oi! Você já é cliente da InovPay?', { tipoConhecido: true }).map(v => v.regra), ['perguntou de novo se é cliente'])
  eq('tipo desconhecido: perguntar é o certo', gd.checkReply('Oi! Você já é cliente da InovPay?', { tipoDesconhecido: true }).length, 0)

  // ---------- Não repete o texto longo da base ----------
  const { repetiuTexto } = await import('../lib/llm')
  eq('repetiu o passo a passo: trava', repetiuTexto({ textos: tp, ultimaIa: tp.estorno_passos + '\nConseguiu concluir?' }, tp.estorno_passos).length, 1)
  eq('primeira vez: sem trava', repetiuTexto({ textos: tp, ultimaIa: 'O estorno é de uma venda feita hoje?' }, tp.estorno_passos).length, 0)

  // ---------- Curador: trocas exatas, informação nova, sem duplicar ----------
  const cur = await import('../lib/curador')
  eq('troca exata', bc.aplicarTroca('Criar até 14h\nOutra linha', 'até 14h', 'até 13h'), { texto: 'Criar até 13h\nOutra linha' })
  eq('troca de trecho que não existe', !!bc.aplicarTroca('abc', 'xyz', '1').erro, true)
  eq('troca ambígua (aparece 2 vezes)', !!bc.aplicarTroca('14h e 14h', '14h', '13h').erro, true)
  const ap = cur.aplicar({ mudancas: [{ tipo: 'trocar', id: 'portal_split', de: 'Criar o Split até 14h', para: 'Criar o Split até 13h' }, { tipo: 'nova', titulo: 'Pix e aproximação', texto: 'A maquininha aceita Pix por QR Code e aproximação.' }] }, tp, [])
  eq('curador aplica troca e informação nova', [ap.erros, ap.textos.portal_split.includes('até 13h'), ap.extras.length, ap.mudancas.map(m => m.tipo)], [[], true, 1, ['trocar', 'nova']])
  eq('curador não deixa taxa entrar', cur.aplicar({ mudancas: [{ tipo: 'nova', titulo: 'Taxa', texto: 'A taxa do débito é 1,2%.' }] }, tp, []).erros.length, 1)
  eq('curador não duplica informação', cur.aplicar({ mudancas: [{ tipo: 'nova', titulo: 'Aceita Pix', texto: 'A maquininha aceita Pix por QR Code e aproximação.' }] }, tp, ap.extras).erros.length, 1)
  eq('curador não quebra o {quando} do aviso', cur.aplicar({ mudancas: [{ tipo: 'trocar', id: 'aviso_fora', de: 'continua {quando}', para: 'continua amanhã' }] }, tp, []).erros.length, 1)
  const comExtra = bc.renderPrompt(tpl, tp, ap.extras)
  eq('informação nova vira a seção 11 do prompt', [comExtra.includes('## 11. Informações cadastradas pela equipe da InovPay'), comExtra.includes('**Pix e aproximação**\nA maquininha aceita Pix'), bc.renderPrompt(tpl, tp, []) === renderizado], [true, true, true])

  const { passoAPassoCedo } = await import('../lib/llm')
  eq('passo a passo sem saber se é de hoje: trava', passoAPassoCedo({ textos: tp }, {}, tp.estorno_passos, 'preciso estornar uma venda').length, 1)
  eq('pessoa disse que foi hoje: pode mandar', passoAPassoCedo({ textos: tp }, {}, tp.estorno_passos, 'quero estornar uma venda que fiz hoje').length, 0)
  eq('venda_de_hoje anotada: pode mandar', passoAPassoCedo({ textos: tp }, { venda_de_hoje: 'sim' }, tp.estorno_passos, 'preciso estornar').length, 0)

  eq('pediu CPF sem o aviso: código acrescenta', gd.comAvisoPrivacidade('Pra eu te ajudar, me passa o CPF ou CNPJ cadastrado?', false), 'Pra eu te ajudar, me passa o CPF ou CNPJ cadastrado? ' + gd.AVISO_PRIVACIDADE)
  eq('já tem o aviso: não repete', gd.comAvisoPrivacidade('Me passa o CNPJ? Ele é usado só pra este atendimento, conforme a nossa Política de Privacidade.', false).match(/Privacidade/g)?.length, 1)
  eq('segundo pedido (inválido): sem aviso de novo', gd.comAvisoPrivacidade('Hmm, esse número não bateu aqui. Confere pra mim e me manda de novo o CPF ou CNPJ cadastrado?', true).includes('Privacidade'), false)
  eq('não pede documento: não mexe', gd.comAvisoPrivacidade('Já gravei seu CNPJ. Qual é o assunto?', false), 'Já gravei seu CNPJ. Qual é o assunto?')

  const tp2 = await import('../lib/tipo')
  eq('taxa sem resposta: frase depois do cumprimento', tp2.comRespostaDePreco('Oi! Seja bem-vindo(a) à InovPay. Você já é cliente da InovPay?', true), 'Oi! Seja bem-vindo(a) à InovPay. ' + tp2.FRASE_PRECO + ' Você já é cliente da InovPay?')
  eq('taxa já respondida: não mexe', tp2.comRespostaDePreco('A equipe passa as taxas certinho. Como funciona o seu negócio?', true), 'A equipe passa as taxas certinho. Como funciona o seu negócio?')
  eq('sem pergunta de taxa: não mexe', tp2.comRespostaDePreco('Como funciona o seu negócio?', false), 'Como funciona o seu negócio?')

  // ---------- Conversas reais para correção ----------
  const cr = await import('../lib/conversas-reais')
  const reais = [
    { at: '2026-10-08T22:00:00Z', tipo: 'aviso' as const, leadId: 'x', nome: 'Rita', turnoLead: 'oi, minha máquina não liga', respostaIA: 'Olá! Estamos fora do horário…' },
    { at: '2026-10-08T22:00:05Z', tipo: 'resposta' as const, leadId: 'x', nome: 'Rita', turnoLead: 'oi, minha máquina não liga', respostaIA: 'Pra eu te ajudar, me passa o CPF ou CNPJ?', perfil: 'cliente' as const },
    { at: '2026-10-08T22:01:00Z', tipo: 'passou' as const, leadId: 'x', nome: 'Rita', turnoLead: '[cnpj]', respostaIA: 'Obrigado pelas informações!', porta: 'suporte_maquininha', tools: ['passar_para_humano'] },
    { at: '2026-10-08T21:00:00Z', tipo: 'resposta' as const, leadId: 'y', nome: 'Beto', turnoLead: 'oi', respostaIA: 'Oi! Você já é cliente?' },
    { at: '2026-10-08T20:00:00Z', tipo: 'pulou' as const, leadId: 'z', nome: 'Zé', detalhe: 'sem a tag' },
    { at: '2026-10-08T19:00:00Z', tipo: 'resposta' as const, leadId: 'w', nome: 'Antigo', detalhe: 'enviado' },
  ]
  eq('conversas reais: só com texto guardado, mais nova primeiro', cr.listarConversas(reais).map(c => [c.nome, c.respostas, c.passou ?? null]), [['Rita', 3, 'suporte_maquininha'], ['Beto', 1, null]])
  const tr = cr.turnosDoContato(reais, 'x')
  eq('texto do cliente não repete no aviso + resposta', tr.map(t => [t.tipo, t.cliente]), [['aviso', 'oi, minha máquina não liga'], ['resposta', ''], ['passou', '[cnpj]']])
  const cx = cr.contextoReal(tr, '2026-10-08T22:01:00Z')
  eq('contexto da correção real', [cx?.resposta, cx?.lead.includes('CLIENTE: [cnpj]'), cx?.lead.includes('ASSISTENTE: Pra eu te ajudar')], ['Obrigado pelas informações!', true, true])

  // ---------- Material anexado (arquivo ou link) ----------
  const mat = await import('../lib/material')
  const { emptyUsage } = await import('../lib/execlog')
  eq('link: só http(s) público', ['https://inovpay.com.br/ajuda', 'http://localhost:3000', 'http://127.0.0.1/x', 'http://10.0.0.5', 'http://192.168.1.1', 'http://172.20.0.1', 'http://169.254.169.254/latest/meta-data', 'http://[::1]/', 'file:///etc/passwd', 'ftp://x.com', 'http://intranet.local'].map(l => !!mat.linkPermitido(l)), [true, false, false, false, false, false, false, false, false, false, false])
  eq('Google Docs vira exportação em texto', mat.linkDeExportacao(new URL('https://docs.google.com/document/d/abc_123-X/edit?usp=sharing')).href, 'https://docs.google.com/document/d/abc_123-X/export?format=txt')
  eq('Google Planilhas vira CSV', mat.linkDeExportacao(new URL('https://docs.google.com/spreadsheets/d/PLAN1/edit#gid=0')).href, 'https://docs.google.com/spreadsheets/d/PLAN1/export?format=csv')
  eq('HTML vira texto (sem script e menu)', mat.htmlParaTexto('<html><head><style>x{}</style><script>alert(1)</script></head><body><nav>Menu</nav><h1>Ajuda</h1><p>Split&nbsp;até 14h</p><ul><li>Passo 1</li></ul></body></html>'), 'Ajuda\nSplit até 14h\n- Passo 1')
  eq('links do texto (até 3, sem pontuação no fim)', mat.linksDoTexto('veja https://a.com/x, e https://b.com. e https://a.com/x e https://c.com e https://d.com'), ['https://a.com/x', 'https://b.com', 'https://c.com'])
  const txt = await mat.lerArquivo({ nome: 'procedimento.txt', base64: Buffer.from('Para criar o Split: Portal ➝ Split ➝ Novo.\r\n\r\n\r\nPrazo: até 14h.').toString('base64') }, emptyUsage())
  eq('arquivo de texto lido', [txt.erro ?? null, txt.texto], [null, 'Para criar o Split: Portal ➝ Split ➝ Novo.\n\nPrazo: até 14h.'])
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
  zip.file('word/document.xml', '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Troca de bobina</w:t></w:r></w:p><w:p><w:r><w:t>Abra a tampa e encaixe o rolo.</w:t></w:r></w:p></w:body></w:document>')
  const docx = await mat.lerArquivo({ nome: 'manual.docx', base64: (await zip.generateAsync({ type: 'nodebuffer' })).toString('base64') }, emptyUsage())
  eq('Word (.docx) lido', [docx.erro ?? null, docx.texto], [null, 'Troca de bobina\n\nAbra a tampa e encaixe o rolo.'])
  eq('formato não aceito', !!(await mat.lerArquivo({ nome: 'planilha.xlsx', base64: 'AAAA' }, emptyUsage())).erro?.includes('salve como CSV'), true)
  eq('arquivo grande demais', !!(await mat.lerArquivo({ nome: 'grande.txt', base64: Buffer.alloc(mat.MAX_ARQUIVO + 1, 97).toString('base64') }, emptyUsage())).erro?.includes('maior que 3 MB'), true)
  eq('link interno não é buscado', (await mat.lerLink('http://169.254.169.254/latest/meta-data', emptyUsage())).erro, 'link inválido ou não público')
  const sete = ['Bobina: abra a tampa e encaixe o rolo.', 'Bateria: carregue por duas horas antes do uso.', 'Senha do portal: use Esqueci minha senha na tela de entrada.', 'Comprovante: reimprima pelo menu Vendas da maquininha.', 'Chip: a maquininha usa o chip que já vem instalado.', 'Wi-Fi: Configurações, Rede, escolha a rede e digite a senha da rede.', 'Relatório: Portal, Relatórios, Vendas do período.']
    .map((texto, i) => ({ tipo: 'nova', titulo: `Assunto ${i + 1}`, texto }))
  eq('material: no máximo 6 informações novas por pedido', cur.aplicar({ mudancas: sete }, tp, []).erros.some(e => e.includes('máximo é 6')), true)
  const cheias = Array.from({ length: 14 }, (_, i) => ({ id: `extra_${String(i).padStart(8, '0')}`, titulo: `Tema ${i}`, texto: 'x'.repeat(1400) }))
  eq('material: informações acrescentadas não passam de 20 mil caracteres', cur.aplicar({ mudancas: [{ tipo: 'nova', titulo: 'Mais uma', texto: 'y'.repeat(1400) }] }, tp, cheias).erros.some(e => e.includes('passariam de 20000')), true)
  eq('material: remover continua valendo acima do limite', cur.aplicar({ mudancas: [{ tipo: 'remover', id: cheias[0].id }] }, tp, cheias).erros, [])

  console.log(falhas ? `\n❌ ${falhas} falha(s)` : '\n✅ tudo certo')
  process.exit(falhas ? 1 : 0)
}
main().catch(e => { console.error(e); process.exit(1) })
