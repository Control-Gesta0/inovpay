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

  console.log(falhas ? `\n❌ ${falhas} falha(s)` : '\n✅ tudo certo')
  process.exit(falhas ? 1 : 0)
}
main().catch(e => { console.error(e); process.exit(1) })
