# InovPay · Diagnóstico do GHL e do atendimento no WhatsApp

**Data:** 06/10/2026 · **Fonte:** API do GoHighLevel ao vivo (location `MCpYTxCMOUCftkHlGyOB`), 151 conversas e 3.719 mensagens de 21/07 a 06/10, documento "Funil de Suporte · WhatsApp Bot" (ago/2026) e o site inovpay.com.br.
**Estado do projeto:** `DIAGNOSTICANDO`. CRM confirmado (GoHighLevel). A estrutura está mapeada. O desenho depende das respostas da seção 11.

> Os IDs da seção 2 são uma **foto de 06/10**. Na construção eles são consultados de novo, ao vivo, porque o GHL aceita gravação em campo apagado sem dar erro.

---

## 0 · Resumo para quem tem 2 minutos

1. **Hoje três coisas respondem o mesmo número:** o workflow "1- Suporte - WhatsApp Bot" (menu numerado), o Conversation AI nativo do GHL (2 agentes, a "IA SDR") e a equipe (Katia e Fernando). Elas se atropelam. Em 31% das vezes em que o bot deu boas-vindas, já havia um humano conversando com o lead nas 72 horas anteriores.
2. **O menu não funciona para quem escreve.** De 83 boas-vindas, só 48% receberam a resposta esperada ("1" ou "2"). O resto foi texto livre, áudio, foto ou nada. No menu de suporte, 45% escolheram "falar com atendente".
3. **A IA SDR atual segue um questionário fixo sobre split e não responde o que o lead pergunta.** Um lead pediu taxa e ela pediu "CPF/CNPJ cadastrado". Outro pediu duas vezes para falar com um humano e ela insistiu numa última pergunta. Ele não foi atendido. Ela também prometeu "em instantes" num domingo às 19h56, e a resposta humana veio na segunda às 9h40, quase 14 horas depois. Em 9 das 11 conversas em que ela atuou, um humano assumiu por cima.
4. **O volume é mais de suporte do que de venda.** Nos últimos 30 dias começaram 35 conversas novas. No menu, 14 se declararam cliente e 7 foram para a IA SDR. Somando as conversas antigas que voltaram, 56 contatos escreveram no período.
5. **O pipeline quase não é usado.** São 23 oportunidades no total, 3 ganhas e só 2 criadas nos últimos 30 dias. A oportunidade só nasce quando o Fernando pede os documentos. O funil real está na cabeça da equipe.
6. **A InovPay vende duas coisas no mesmo número:** a solução própria (maquininha e split sobre a Cappta) e planos de maquininha PagBank. A IA precisa reconhecer as duas.
7. **O site fala com clínicas, oficinas e petshops, mas quem chama no WhatsApp são principalmente lojas de celular e eletrônicos.** O prompt precisa atender quem chega de verdade.
8. **"Tirar todas as automações do GHL" é possível em quase tudo, mas não em tudo.** Ficam duas pontes de entrega: o gatilho que avisa o agente e os templates de reengajamento (a API do GHL não envia template de WhatsApp). A lógica vai toda para a Vercel (seção 9).
9. **Faltam definições comerciais que só a InovPay pode dar.** Circulam duas tabelas de taxa InovPay diferentes. A promessa de recebimento varia ("recebe amanhã", "em minutos", "D0"). O link de pagamento foi dado como "descontinuado" e como "ativo" no mesmo mês (seção 11).

---

## 1 · O negócio

### O que o site diz (inovpay.com.br)
- **Proposta:** split de pagamentos para não pagar imposto duas vezes sobre o valor que a empresa repassa a parceiros e fornecedores. O ganho é maior no **Simples Nacional**.
- **Público do site:** serviços automotivos (75% do faturamento é repasse), clínicas médicas (60%), odontológicas (50%), estética (50%), petshops e veterinárias (40%).
- **Como funciona:** a empresa cadastra os beneficiários, que não precisam de conta. A venda acontece normalmente, por maquininha, link em até 21x, Pix ou boleto. O repasse sai registrado.
- **Promessas:** "saldo disponível em minutos, já antecipado"; o parceiro recebe no próximo dia útil; cadastro e validação em 2 a 3 dias úteis; só pessoa jurídica ativa maquininha; o beneficiário pode ser CPF ou CNPJ.
- **CTA:** "conversa de 15 minutos" pelo WhatsApp. O link `wa.me` já chega com o texto "Vim pelo site da InovPay (Página inicial)", o que permite rastrear a origem.
- **Validação contábil:** Carlos Martins Escritório de Contabilidade e Prime Care Contabilidade. O Carlos Martins também é o parceiro que mais indica, com a tag `indicado martins`.

### O que as conversas mostram
- **Quem chega:** principalmente lojas de celular, iPhone, eletrônicos e importados (cerca de 25 conversas). Aparecem também uma oficina, um consultório odontológico, moda, cursos e gráfica 3D. Os faturamentos citados vão de R$ 30 mil a R$ 350 mil por mês.
- **Origem:** indicação de parceiro (contador Martins, Murillo Pinna, Gustavo/Space Shop, Kauã Netto, Luis Charles), Instagram, site, base importada do RD (126 contatos), eventos (Hub Experience, CBM 2026) e repescagem.
- **Argumento que a equipe usa:** split para evitar bitributação e DIMP ("toda venda é emitida a DIMP"). Com loja de celular, o gancho é o repasse ao fornecedor do aparelho.
- **Infraestrutura:** opera sobre a **Cappta** (app "Conta Cappta" / "Meus Recebíveis", portal `inovpay.posportal.com.br`, chamados com a adquirente). A máquina e a plataforma antigas foram descontinuadas.
- **PagBank:** a InovPay também gerencia planos PagBank (D0 e D1) de clientes e vende maquininha PagBank. Disputa, Pix e suporte de conta PagBank vão para o próprio PagBank.

---

## 2 · O que existe hoje no GHL (foto de 06/10)

| Item | Situação |
|---|---|
| Location | INOVPAY, criada em 21/07/2026, fuso America/Sao_Paulo, modo SaaS ativo |
| Canais | **WhatsApp oficial (Cloud API nativo do GHL), +55 11 91850-2471**: 1.741 mensagens recebidas e 1.518 enviadas (04/08 a 06/10) · **ZaptosWPP** (WhatsApp não oficial do Fernando, integrado como SMS): 346 mensagens, só entre 23/07 e 28/07 · Instagram: 13 mensagens |
| Usuários | Fernando Talarico (admin), Katia Duque (suporte@, admin), Ramon Gandra (admin), Guilherme Gomes (agência Control Gestão) |
| Contatos | 1.159, dos quais 1.025 foram importados de uma vez em 04/08. Só 4 têm a tag `cliente ativo` |
| Pipeline | **Novos Leads InovPay** `d8cxey6LPExYI33I9JpF`, com 10 etapas: Novo Lead · Primeiro Contato · Reunião Agendada · Reunião Realizada · No-Show · Criar Conta · Conta em Análise · Aguardando Pgto · Enviar Máquina · Ativação |
| Oportunidades | 23 no total: Primeiro Contato 8 · Reunião Agendada 1 · Reunião Realizada 7 · Criar Conta 3 · Ativação 4 (3 ganhas). Valor típico R$ 699 |
| Campos do contato | `CPF/CNPJ` (preenchido em 171) · `Nome da Empresa` (259) |
| Campos da oportunidade | `Parceiro` (opções: Contador Martins, Murillo - Power, Gustavo - Space, Kaua Netto) |
| Tags (35) | A maioria é de origem (`indicado *`, `importado rd`, `hub experience`, `cbm 2026`), status (`em contato`, `cliente ativo`, `respescagem`) ou produto (`maquininha`, `split`, `link pagto`, `pagbank`, `2x/3x/4x máquinas`) |
| Workflows | `1- Suporte - WhatsApp Bot` (publicado, versão 34, editado em 29/09) e um rascunho vazio |
| Conversation AI | A API informa **2 agentes**. O token atual não tem permissão para ler a configuração deles |
| Base de conhecimento | 1, vazia (0 FAQs) · Voice AI: nenhum |
| Calendários | 4 calendários **pessoais** (Katia, Fernando, Ramon, Guilherme), sincronizados com a agenda pessoal. Aparecem eventos como consulta médica e aula de italiano. Não existe um calendário de "reunião comercial" |
| Templates de WhatsApp | A API não listou nenhum, mas as conversas mostram pelo menos "Podemos continuar nossa conversa?" e "Venda bloqueada". Conferir no painel |
| Produto | "Maquininha InovPAY", sem preço cadastrado |

---

## 3 · Como o atendimento funciona de verdade

### 3.1 · Linha do tempo
- **23/07 a 28/07:** o atendimento era pelo WhatsApp pessoal do Fernando (Zaptos). Os contatos o chamavam pelo nome.
- **04/08:** a conta migrou para o WhatsApp oficial e a base de 1.025 contatos foi importada. A Katia assumiu o grosso do atendimento (977 mensagens contra 254 do Fernando).
- **21/08 a 27/08:** o bot de menu entrou no ar. A IA SDR nativa aparece a partir de 27/08 (primeiro em teste, com o Ramon).
- **14/09:** entrou a mensagem de fora do horário.
- **23/09:** o fluxo de estorno foi corrigido. Antes, quem respondia "venda de dias anteriores" ficava sem saída.

### 3.2 · O bot de menu (workflow)
O desenho segue o documento do cliente: pergunta se é cliente, pede CPF/CNPJ, mostra 4 assuntos e submenus.

| Medida | Resultado |
|---|---|
| Boas-vindas disparadas | 83, em 62 conversas. 10 conversas receberam a boas-vindas mais de uma vez |
| Boas-vindas com humano já conversando (últimas 72h) | **26 (31%)** |
| Resposta ao "você já é cliente?" | "1": 28 · "2": 12 · **texto livre: 26 (31%)** · áudio ou anexo: 2 · humano entrou antes: 14 · sem resposta: 1 |
| Menu de suporte (42 exibições) | **"4 Falar com atendente": 19 (45%)** · Portal/App: 5 · Maquininha: 4 · Estorno: 4 · texto livre ou CNPJ: o resto |

**Por que o bot interrompe a conversa humana:** a equipe reabre conversas com o template "Podemos continuar nossa conversa?". O lead toca em "Claro, vamos lá!" e isso dispara o menu de boas-vindas no meio do atendimento. A própria Katia escreveu a um cliente: "igona o boot que ta doidão rsrsr".

**Outros defeitos observados:**
- Não entende texto livre. "Queria falar com humano" recebeu "Não entendi" duas vezes, e "Minhas duas máquina tão assim" também.
- Aceita qualquer coisa como CPF/CNPJ: "1", uma foto, "606607608-60".
- Pede o CPF/CNPJ e não usa a informação depois.
- Não entrega o conteúdo do FAQ: quem escolheu um tema do Portal/App voltou para a saudação. Depois a Katia mandou os textos à mão.
- Não repassa ao humano o assunto escolhido. O Fernando perguntou de novo "Qual sua dúvida?".
- Áudio fica sem resposta.
- Na opção 4 fora do horário, não diz quando alguém vai responder.

### 3.3 · A IA SDR nativa (Conversation AI)
Ela entra quando o lead responde "2" no menu. Atuou em 11 conversas.

**Roteiro fixo,** quase sempre na mesma ordem: (a) CPF/CNPJ "cadastrado" (a partir de 08/09, mesmo para quem acabou de dizer que não é cliente), (b) recebe e repassa valores?, (c) repassa de forma manual?, (d) quantos recebedores?, (e) volume por mês, (f) paga imposto duas vezes?, (g) "total fit" e quem decide, (h) "vou te conectar com o time comercial agora".

**O que dá errado:**
- **Não responde a pergunta do lead.** Pediram taxa (08/09 e 30/09) e ela seguiu o questionário.
- **Ignora pedido de humano.** Em 23/09 o lead pediu "Pode me passar para um humano por favor" duas vezes. Ela insistiu em "só preciso de uma última informação" e ninguém respondeu depois.
- **Promete o que não acontece.** "Em instantes alguém do nosso time vai te chamar" num domingo às 19h56. A Katia respondeu na segunda às 9h40, e a primeira frase do lead foi "Estou aguardando até agora". Num sábado (05/09, 11h55) ela disse "já vou te direcionar para um atendente humano", e o humano chegou na terça, 08/09, às 10h47, cerca de 71 horas depois (com o feriado de 7/9 no meio).
- **Não desqualifica.** Quem respondeu "não" sobre bitributação também ouviu "total fit".
- **Não agenda nada.** Só promete o contato.
- **O que ela coleta se perde.** A Katia pergunta de novo segmento, nome e origem, que já estavam na conversa.
- **Soa como robô.** "Entendi!", "Perfeito!", "Legal, X!", "não precisa ser exato" em quase toda mensagem. Às vezes escreve "obrigado", às vezes "obrigada".

### 3.4 · A equipe
| Medida | Resultado |
|---|---|
| 1ª resposta humana, lead chegou em horário comercial | mediana de **10 min**, 75% em até 40 min, 90% em até 89 min (n=57) |
| 1ª resposta humana, lead chegou fora do horário | mediana de **14,5 h**, 90% em até 78 h (n=28) |
| Mensagens recebidas fora do horário (seg a sex, 9h às 18h) | 14% (176 à noite e 92 no fim de semana) |

A equipe responde rápido em horário comercial. O buraco está à noite, no fim de semana e em conversas que ficam sem dono. Leads e clientes ficaram sem resposta em pelo menos 10 conversas (pedido de ligação, "GT 58" na máquina, demora de vendas no portal, split pendente, estorno num sábado).

---

## 4 · O conhecimento que a IA precisa ter (extraído das conversas)

### 4.1 · Comercial
| Tema | Resposta da equipe |
|---|---|
| Preço da maquininha | **R$ 699 no Pix ou R$ 799 em até 10x no cartão**, frete grátis por Sedex. Não tem aluguel, comodato nem mensalidade. Em 19/08 apareceu "até 12x". A 2ª máquina para cliente saiu por R$ 600 (exceção do Fernando) |
| Máquina | "P2, bem rápida, painel digital", chip 4G grátis, aproximação, Pix por QR Code |
| Parcelamento | Crédito em até 21x (antes era 18x) |
| Pix na máquina | 1,65% |
| Recebimento | Vende hoje e recebe amanhã (tabela). Fernando em 09/09: "recebimento é D0, o split na saída é D1". Site: "saldo em minutos, já antecipado". **Contradição: ver seção 11** |
| Antecipar o split para o mesmo dia | 0,7% sobre o valor |
| Quem pode ter conta | Só CNPJ (MEI aceito). Menor de idade não ativa. O endereço tem que bater com a Receita. Bares e restaurantes são recusados |
| Análise de cadastro | 24 a 48h (site: 2 a 3 dias úteis). CNPJ novo exige evidências: rede social, contrato social, fotos da fachada e do estoque, uma NF e o link do Google Maps |
| Dados para cadastro | Nome, gênero, CPF, RG, nascimento, telefone, e-mail, faturamento estimado, nome da empresa, CNPJ, data de abertura e endereço completo (18 campos) |
| Taxa paga pelo comprador | Simulação nas calculadoras `inovpay.com.br/calculadora/silver/` e `/calculadora/novacalculadora/` |
| Link de pagamento | Usa 3DS. Configurar "taxa ao portador: sim" e "pagamento único". Cai em cerca de 10 minutos. Não integra com site. **Foi dito que estava descontinuado em 06/08 e 24/08, e que estava ativo em 21/08, 31/08 e 09/09** |
| Conta digital | Sem chave Pix para enviar nem receber. Pix só na maquininha. Saldo não usado é liquidado na conta do titular após 28 dias. Conta Cappta sem split cobra tarifa |
| Não aceita | Voucher (VA/VR), Mercado Pago |
| Processadoras citadas | Getnet e Rede |
| Ativação | Depois que a máquina chega: videochamada de 30 a 60 min **pelo computador** (compartilhar tela), com Google Authenticator, biometria e selfie |

### 4.2 · Tabelas de taxa em uso (imagens enviadas pela equipe)
São **quatro tabelas** circulando. Todas dizem "taxas com recebimento em 1 dia".

**InovPay A** (enviada em 02/10 e 05/10, Visa/Master | Elo): Pix 1,65% · débito 2,65% | 3,30% · 1x 4,88% | 5,35% · 6x 8,90% | 9,75% · 10x 11,50% | 12,75% · 12x 12,90% | 14,00% · 18x 17,95% | 18,64% · 21x 20,25% | 20,35%.

**InovPay B** (enviada em 08/09 e 29/09, Visa/Master | Elo | Amex | Cabal): débito 1,59% | 1,97% | n/d | 5,50% · crédito 3,99% | 4,10% | 4,50% | 7,13% · 6x 8,69% | 9,09% | 9,09% | 10,60% · 10x 11,99% | 12,77% · 12x 13,19% | 13,96% · 21x 20,49% | 20,05% | 20,90% | 22,39%.

**Link InovPay** (Visa/Master | Elo): débito 1,93% | 2,53% · à vista 4,79% | 5,16% · 10x 14,38% | 15,11% · 21x 23,35% | 23,45%.

**PagBank D1** (Visa/Master | Elo/outros): Pix 0,56% · débito 1,45% | 1,51% · crédito 2,97% | 3,30% · 12x 11,45% | 11,65% · 18x 15,23% | 15,43%. Também existe uma tabela PagBank D0.

> As tabelas completas ficam guardadas fora do repositório até a InovPay confirmar quais valem. **A IA não vai escolher plano.** Ou ela envia a tabela padrão que a InovPay definir, ou leva o lead para a conversa com o time. Taxa errada dita com confiança é o tipo de erro que vira reclamação.

### 4.3 · Suporte (regras que a equipe repete)
- **Split e boleto D+1:** criar, editar ou cancelar até 23h. O fornecedor recebe até 11h do próximo dia útil. Usa saldo acumulado mais as vendas do dia.
- **Split e boleto D+0:** criar até 14h. O fornecedor recebe até 16h. Usa só o saldo acumulado de dias anteriores.
- **Só dia útil.** Segunda-feira é mais lento.
- **Beneficiário:** a aprovação leva cerca de 20 min. Se reprovar, foi a análise de risco e "não há o que ser feito". Não dá para editar nem apagar.
- **Boleto:** só se estiver no CNPJ da empresa ou no CPF dos sócios. Boleto de terceiro não passa.
- **Estorno do mesmo dia:** o lojista faz na máquina (Menu, Estorno, cartão do cliente e senha administrativa).
- **Estorno de dias anteriores:** comprovante impresso (não vale foto da tela), data, valor e CNPJ. Precisa de saldo na agenda, senão aguarda vendas ou devolve via Pix. Carta de cancelamento em até 48h úteis.
- **Venda bloqueada:** NF, termo de compra e venda assinado e documento do portador, com cerca de 7 dias. Cartão de familiar conta como autofinanciamento e pode levar a descredenciamento.
- **Saldo que "sumiu":** em geral é a liquidação automática de 28 dias.
- **Conta inativa:** depois de 90 dias sem transacionar, a reativação exige reenviar os dados.
- **Erro na máquina:** Gerir Terminal, Inicialização, teste de R$ 0,01. Erros com código ("AD-96", "GT 58") vão para humano.
- **Portal:** limpar cache, trocar de navegador, Google Authenticator. Quando há instabilidade, a equipe avisa.
- **Cliente PagBank:** troca de plano D0/D1 por solicitação, com aceite no app PagBank em até 48h. Disputa e chargeback são resolvidos no app PagBank.
- **Já existem os textos do FAQ** (split, beneficiários, boleto, relatório de vendas, comprovante do split) no documento do cliente. Eles entram no prompt quase como estão.

### 4.4 · Tom da equipe (matéria-prima do few-shot)
A Katia é calorosa e curta: "Tudo joia?", "Combinado!", "Show!", "Conte comigo", e fecha com "Te ajudo em algo mais?". Ela costuma mandar uma mensagem atrás da outra. O Fernando é seco e direto ("blz", "excelente"). Bons exemplos para usar como modelo:
- "Você faz repasses de valores para outros profissionais no seu consultório? (...) o nosso split de pagamentos vai te ajudar muito nessa gestão dos valores e não sofrer bitributação."
- "Podemos agendar um papo via meet ou telefone? Te explicamos melhor como funciona a operação e tu conta um pouco da sua. Qual sua disponibilidade para hoje às 17h ou amanhã às 10h?"
- "No seu caso está configurado 28 dias de acúmulo: se você faz uma venda hoje e não usa esses valores até 28 dias corridos, o valor residual entra na sua conta."
- "Não é automático: primeiro é feito o estorno na sua conta, depois vai a solicitação para a adquirente. Por isso o prazo de 48h."

O que **não** copiar: os erros de digitação, o "?" solto, "como já informado" e "eu já enviei isso acima".

---

## 5 · O processo comercial real e onde trava

```
1. Primeiro contato (bot → IA SDR ou Katia)
2. Qualificação humana: origem/indicação, nome, CNPJ, segmento, faturamento, máquina atual
   + pitch de split/bitributação + imagem de taxas
3. Call opcional (Meet ou telefone, o Fernando liga)
4. Fernando envia a lista de 18 campos  → só aqui nasce a oportunidade no CRM
5. Análise de risco (CNPJ novo: evidências da loja)
6. Aprovado → pagamento (link pagaragora ou Pix) → Sedex no mesmo dia (~4 dias)
7. Máquina chega → videochamada de ativação pelo computador
8. Primeiro split, cadastro de beneficiários
```

Um ciclo completo leva **13 a 14 dias** (dois casos inteiros nas conversas). Pontos de perda:
- A call combinada que não acontece ("amanhã 10h?", "quer me ligar agora?" e a conversa acaba).
- O pedido de documentos extras: o lead some.
- A ativação exige notebook ("Não sabia do notebook"). Um cliente levou 6 dias da chegada da máquina até ativar.
- Fornecedor principal reprovado na análise depois da compra: "Então comprei a máquina em vão… 80% é desse fornecedor".
- Objeções sem resposta pronta: aluguel ou comodato, taxa "igual à da InfinitePay", "só quero link", Pix para transferência, QR fixo e integração com site.

---

## 6 · O que a IA pode resolver no suporte e o que continua humano

| A IA resolve sozinha | A IA prepara e passa ao humano (com resumo) | Só humano |
|---|---|---|
| Janelas de split e boleto D+0/D+1, regra de dia útil | Estorno de dias anteriores: coleta CNPJ, valor, data e foto do comprovante, confere a legibilidade | Abrir chamado na Cappta ou na adquirente |
| Passo a passo do portal e do app (os 5 textos do FAQ) | Erro na máquina: coleta a foto do erro, o modelo e o que já tentou | Comando remoto na máquina |
| Estorno do mesmo dia (caminho na máquina) | Venda bloqueada: lista o que mandar e recebe os documentos | Decisão de análise de risco |
| Liquidação de 28 dias, "saldo que sumiu" | Troca de conta para liquidação (banco, agência e conta) | Troca de plano PagBank, negociação de taxa |
| Beneficiário reprovado (explica a regra) | Pedido de 2ª máquina, troca de máquina | Envio de senha ou acesso (a IA **nunca** envia senha) |
| Fora do horário: diz a verdade sobre quando o time volta | Instabilidade do portal: registra e avisa a equipe | Reativação de conta inativa |

**A regra que corrige o maior erro de hoje:** o humano nunca deve perguntar de novo o que a IA já perguntou. Toda passagem leva uma nota interna no contato com o resumo do caso, os dados coletados e o que o cliente já tentou.

---

## 7 · Riscos e alertas (falar com a InovPay antes de fechar)

| # | Sinal | Risco | Encaminhamento |
|---|---|---|---|
| 1 | Bot, Conversation AI e humano no mesmo número | **Resposta dupla e atropelo** (já acontece hoje) | Na virada, desligar o workflow do bot e os 2 agentes do Conversation AI. Durante o teste, separar por tag (seção 10) |
| 2 | "Remover todas as automações do GHL" | A API do GHL não envia template nem recebe a mensagem do lead sem um gatilho | Ficam 2 tipos de ponte (seção 9). A lógica toda vai para a Vercel |
| 3 | Não há cadastro confiável de quem é cliente ativo (4 tags `cliente ativo`, CPF/CNPJ em 171 contatos) | A IA não sabe se é suporte ou venda sem perguntar | Importar a lista de clientes ativos (exportada da Cappta e do PagBank) com a tag `cliente-inovpay` / `cliente-pagbank` e o CNPJ. Sem isso, a IA pergunta de forma natural, sem menu |
| 4 | Duas tabelas InovPay diferentes, recebimento "amanhã" × "em minutos" × "D0", link "descontinuado" × "ativo" | A IA repete uma contradição com confiança | A InovPay define a versão oficial (seção 11) |
| 5 | Site focado em clínicas, oficinas e petshops; o WhatsApp recebe lojas de celular | Prompt afinado para o público errado | Duas formas de abrir a conversa no prompt: "serviço com repasse a profissional" e "revenda com repasse a fornecedor" |
| 6 | Senha padrão do portal enviada em texto, igual para todos os clientes | Segurança da conta do cliente | Alerta para a InovPay. A IA fica proibida de enviar qualquer senha |
| 7 | Pipeline quase vazio | Impossível provar o ganho da IA sem a "foto do antes" | Usar as medidas da seção 8.4 como linha de base e a IA passa a criar a oportunidade no 1º contato |
| 8 | Calendários pessoais com eventos privados | A IA marcaria reunião em cima de consulta médica, ou exporia o nome do evento | Criar um calendário dedicado "Conversa InovPay" com a disponibilidade real |
| 9 | Template com nome errado ("Olá, Maquininha", "Olá, Semnick", "Olá, ") | O primeiro nome do contato está sujo na base | A IA corrige o nome quando o lead se apresentar. Revisar a importação de 04/08 |
| 10 | Respostas automáticas do WhatsApp Business do próprio lead ("Estamos fora do nosso horário") | A IA conversa com o robô do lead | Trava em código para ignorar resposta automática |
| 11 | Mensagens "Message type is currently not supported" e áudios da equipe que chegaram mudos | Lead travado | O agente registra e passa ao humano; não fingir que entendeu |

---

## 8 · Proposta de desenho (para validar com a InovPay)

### 8.1 · Um agente, quatro portas
O primeiro contato é uma conversa normal, sem menu numerado. A IA descobre a porta pelo que o lead escreve ("minha máquina", "estorno", "split não caiu" → suporte; "quanto é a taxa", "quero conhecer" → comercial) e pelo que o CRM já sabe (tag de cliente, oportunidade ganha, CNPJ). Só pergunta "você já é cliente InovPay?" quando não dá para saber.

| Porta | Para quem | O que a IA faz | Fim |
|---|---|---|---|
| **Comercial** | Quem ainda não é cliente | Responde a dúvida primeiro (preço da máquina, como funciona o split, quem pode ter conta), qualifica (segmento, faturamento, faz repasse?, para quantos, regime tributário, máquina atual) e agenda a conversa de 15 min | Reunião marcada no calendário, oportunidade em "Reunião Agendada" |
| **Suporte InovPay** | Cliente da solução própria | Resolve o que está na coluna 1 da seção 6, coleta o que está na coluna 2 | Resolvido, ou passagem ao humano com resumo |
| **Cliente PagBank** | Cliente de plano PagBank | Dúvidas de taxa e plano, D0/D1, disputa (orienta o app PagBank) | Pedido de troca de plano para o Fernando |
| **Parceiros e outros** | Contador indicador, fornecedor, gateway, assunto pessoal | Não vende. Identifica e passa | Fernando |

### 8.2 · Alçada (até onde a IA mexe no funil)
- **Pode:** criar a oportunidade em "Novo Lead", mover para "Primeiro Contato" ao qualificar e para "Reunião Agendada" ao marcar; preencher os campos de qualificação; marcar tags de origem; passar ao humano.
- **Não pode:** mexer de "Reunião Realizada" em diante (Criar Conta, Análise, Pagamento, Envio, Ativação). Esse trecho é da equipe. Se a etapa atual não for conhecida ou for de outro pipeline, a IA não mexe.
- **Gate:** a IA só atende contatos com a tag `ia-inovpay` durante a rampagem (1 contato da equipe, depois 10 leads, depois todos).
- **A IA cala quando um humano assume:** tag `atendimento-humano`, colocada pela IA na passagem ou pela equipe com um clique.

### 8.3 · Peças técnicas e por quê
| Decisão | Por quê | O que custa |
|---|---|---|
| Prompt direto, sem RAG | FAQ, tabelas e regras somam bem menos de 10 mil tokens. Com cache o custo cai e o modelo vê tudo | Se o conhecimento passar de ~25 mil tokens, revisamos |
| Áudio do lead vira texto (transcrição) | Houve cerca de 25 áudios nas conversas | Custo pequeno por minuto |
| Foto e PDF entendidos na entrada | Comprovante de estorno, foto de erro na máquina, NF e documentos são a rotina do suporte | Uma leitura por arquivo, gravada como texto no histórico |
| Resposta em texto, sem voz | O número é oficial e o GHL descarta áudio enviado. Voz exigiria um segundo canal no mesmo número, com risco de resposta dupla | Sem bolinha de voz |
| Regra de horário em código | A IA atende 24h, mas promete prazo de humano só com o horário real (seg a sex, 9h às 18h) | Nenhum |
| Calendário dedicado | Os calendários de hoje são pessoais | A InovPay define quem atende e quando |
| Follow-up comercial por template | Fora da janela de 24h só template aprovado pela Meta entrega | Template de marketing pago por envio, 1 a 2 dias de aprovação |
| Escolha do modelo de IA | Feita na construção, com teste comparativo e o exame de 10 cenários | Nenhum agora |

### 8.4 · Foto do antes (linha de base, 06/09 a 06/10)
| Medida | Valor |
|---|---|
| Conversas novas no WhatsApp | 35 |
| Contatos que escreveram (novos + antigos) | 56 |
| Se declararam cliente no menu | 14 |
| Foram para a IA SDR | 7 |
| Oportunidades criadas | 2 |
| Vendas ganhas no CRM | 0 no período (3 no total desde julho) |
| 1ª resposta humana em horário comercial | mediana de 10 min |
| 1ª resposta humana fora do horário | mediana de 14,5 h |

O CRM não registra reuniões nem vendas de forma confiável. A InovPay precisa informar quantas máquinas vendeu e quanto faturou em setembro para a foto ficar completa.

---

## 9 · Sobre "remover todas as automações do GHL"

A direção está certa: o bot de menu e o Conversation AI saem, e a decisão (o que responder, quando passar ao humano, quando mover etapa, quando fazer follow-up) passa a morar no código na Vercel, onde dá para testar, versionar e medir.

O que **não dá** para tirar do GHL, porque a plataforma não oferece outro caminho:

1. **O gatilho de entrada.** Um workflow "Customer Replied (WhatsApp) → webhook para a Vercel". Ele não decide nada, só avisa que chegou mensagem. Sem ele, o agente não fica sabendo.
2. **Os templates de reengajamento.** A API do GHL não envia template de WhatsApp. Para falar com quem sumiu há mais de 24h, o agente coloca uma tag (`ia-fu-c2`, `ia-fu-c3`…) e um workflow por template faz o envio.

Opcional: um workflow "Contact Created → webhook" para registrar a origem de todo lead, inclusive dos que a IA não atende.

Resultado: o GHL fica com 2 a 5 workflows de uma ação cada, sem lógica. Hoje o workflow do bot está na versão 34 e é ele que quebra a conversa.

---

## 10 · Plano de migração sem resposta dupla

| Fase | Bot de menu | Conversation AI | Agente novo |
|---|---|---|---|
| Teste (E2E) | Ganha a condição "não tem a tag `ia-inovpay`" (uma edição no painel) | Desligado para contatos com `ia-inovpay` (ou desligado de vez, se a InovPay aceitar) | Atende só quem tem `ia-inovpay` (contato da equipe) |
| 10 leads | Igual | Igual | Tag colocada à mão em 10 conversas novas |
| Virada | **Despublicado** | **Desligado** | Gate aberto para todos, redeploy |

A virada precisa de autorização da InovPay. Antes dela, o agente passa pelo exame de 10 cenários (nota 10/10) e por um teste de ponta a ponta num número real, com mensagem recebida, etapa movida, nota interna e registro de execução conferidos.

---

## 11 · Perguntas para a InovPay (rodada 1)

**Bloqueiam o prompt:**
1. Qual tabela de taxas InovPay vale hoje: a "A" (Pix 1,65%, débito 2,65%, 21x 20,25%) ou a "B" (débito 1,59%, crédito 3,99%, 21x 20,49%, com Amex e Cabal)? Ou são planos diferentes? Se forem, quem escolhe o plano do lead e por qual critério?
2. A IA pode mandar a tabela de taxas logo que o lead pede, ou só depois de saber segmento e faturamento (como a Katia faz)?
3. O lojista recebe em D0, D+1 ou "em minutos"? O que a IA deve prometer?
4. O link de pagamento está ativo para cliente novo? Com qual tabela?
5. A máquina sai por R$ 799 em 10x ou em 12x? Existe desconto que a IA pode oferecer, ou desconto é só com o Fernando?
6. Quais segmentos a InovPay **não** atende, além de bares e restaurantes?
7. Para loja de celular, o argumento é o repasse ao fornecedor do aparelho. Está validado com o contador? O que a IA pode e não pode afirmar sobre imposto? (o site diz que a InovPay não faz consultoria tributária)

**Bloqueiam o funil:**
8. O que precisa acontecer na conversa para o lead estar pronto para a conversa de 15 min?
9. Quem faz essa conversa (Fernando, Katia, os dois) e em que horários? Podemos criar o calendário "Conversa InovPay"?
10. Quando o lead some, quantas vezes a IA volta a chamar e em quanto tempo? Quando ela desiste?
11. O que conta como **resultado**: reunião realizada, cadastro enviado ou máquina paga? Em qual etapa do pipeline isso aparece?

**Bloqueiam o suporte:**
12. Existe uma lista de clientes ativos (InovPay e PagBank) com CNPJ que possamos importar para o GHL?
13. Para quem vai cada passagem: suporte sempre para a Katia? Comercial e PagBank para o Fernando?
14. O que a IA responde quando o portal está instável? Quem avisa a IA que há instabilidade?
15. Pode criar oportunidade para todo lead novo, inclusive os 1.025 contatos importados, se eles voltarem a falar?

**Governança:**
16. Quem aprova o que a IA fala (o "dono do prompt")?
17. Querem um grupo de WhatsApp para receber os alertas da IA (falha, passagem urgente, resumo diário)?
18. O número +55 11 91850-2471 está em algum outro sistema além do GHL? O ZaptosWPP ainda está conectado a alguma coisa?

---

## 12 · Acessos e credenciais

| Item | Situação | Para quê |
|---|---|---|
| GHL Private Integration Token | **Recebido.** Funciona para contatos, conversas, pipeline, campos, calendários e workflows (só a lista). **Não lê o Conversation AI.** Vai para as variáveis de ambiente da Vercel e nunca para o repositório | Tudo no CRM |
| Escopo de Conversation AI no token (opcional) | Pendente | Ler os 2 agentes atuais antes de desligar |
| Chave de API da IA (conta comercial) | Pendente, depois da escolha do modelo | Cérebro do agente |
| Upstash Redis | Pendente | Fila de 10s, follow-up, registro de execuções |
| Projeto na Vercel | Pendente | Hospedagem |
| Acesso ao painel do GHL com permissão de workflow | Já existe (usuário da agência) | Criar o gatilho, os templates e desligar o bot na virada |

---

## 13 · Próximos passos

1. A InovPay responde a rodada da seção 11. Os itens 1 a 5, 8, 9 e 12 são os que travam.
2. Com as respostas, sai o desenho comentado (portas, alçada, campos novos e cadências) para aprovação.
3. Construção a partir do template GHL da Control Gestão, com os IDs consultados ao vivo de novo.
4. Exame de 10 cenários (10/10), teste de ponta a ponta com número real e rampagem por tag.
5. Virada: bot despublicado e Conversation AI desligado, com autorização.
