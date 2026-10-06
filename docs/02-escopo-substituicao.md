# InovPay · Escopo: substituir a IA do GHL e a automação do bot

**Data:** 06/10/2026 · **Decisão do projeto:** o agente novo faz **somente o que a IA do GHL (Conversation AI) e a automação "1- Suporte - WhatsApp Bot" fazem hoje**. Funções novas ficam de fora. O que entra além disso é a correção dos defeitos dessas mesmas funções, porque o serviço precisa funcionar de verdade.

Este documento substitui as seções 8 a 11 do `01-diagnostico-ghl.md`. O diagnóstico continua valendo como retrato da conta.

---

## 1 · O que existe hoje (inventário do que será substituído)

Levantado nas conversas de 21/08 a 06/10, no documento "Funil de Suporte · WhatsApp Bot" e nos dados gravados nos contatos.

### 1.1 · Automação "1- Suporte - WhatsApp Bot"

| # | Função | Como funciona hoje | Evidência |
|---|---|---|---|
| A1 | Gatilho | Toda mensagem recebida no WhatsApp dispara o fluxo | 83 boas-vindas em 62 conversas |
| A2 | Tag | Coloca `em contato` no contato | Todos os 62 contatos que passaram pelo bot têm a tag. Nenhum outro tem |
| A3 | Fora do horário | Fora de seg a sex, das 9h às 18h, manda o aviso de horário e **para** (não faz triagem nem chama a IA). Existe desde 14/09 | 9 avisos. Em todos, a próxima mensagem é de um humano no dia útil seguinte |
| A4 | Cliente ou não | "Você já é nosso cliente? 1 Sim / 2 Não". Fora das opções, reenvia "Não entendi sua resposta" | 83 envios, 28 erros de opção |
| A5 | Identificação | Cliente: pede o CPF ou CNPJ e **grava no campo `CPF/CNPJ`** do contato, sem validar | Gravou "606607608-60" no teste e um CNPJ seguido do nome da loja |
| A6 | Menu de suporte | 1 Maquininha · 2 Estorno · 3 Portal/App · 4 Atendente | 42 exibições |
| A6.1 | Maquininha | "A maquininha liga normalmente?" (3 opções) → "Descreva o que está acontecendo, envie foto ou vídeo" → "Seu atendimento foi registrado… você não precisará repetir as informações" | 4 casos |
| A6.2 | Estorno | "Venda de hoje?" **Sim:** passo a passo na máquina → "Conseguiu?" → se não, atendente. **Não:** pede foto do comprovante, data e valor → "carta ou comprovante de cancelamento em até 48 horas úteis" | 4 casos. Ramo "Não" corrigido em 23/09 |
| A6.3 | Portal/App | 6 temas: Split, Beneficiários, Boleto, Relatório de vendas, Comprovante do split, Outro. Envia o texto do FAQ → "Resolveu? Sim / Não / Outra dúvida". "Não" pede descrição e print e passa ao atendente. "Outro" pede descrição e passa ao atendente | 5 casos. Nas conversas, o texto do tema **não chegou** a ser enviado: o lead voltou à saudação |
| A6.4 | Atendente | Pergunta o assunto → "Você está na fila. Um de nossos atendentes vai continuar por aqui" | 19 de 42 escolhas |
| A7 | Não cliente | Passa para a IA do GHL | 12 casos |

### 1.2 · IA do GHL (Conversation AI, a "IA SDR")

| # | Função | Como funciona hoje | Evidência |
|---|---|---|---|
| B1 | Identificação | Pede o "CPF ou CNPJ cadastrado" e o valor acaba no campo `CPF/CNPJ` | 8 dos 10 contatos atendidos por ela (fora o teste interno) têm o campo preenchido |
| B2 | Qualificação | 6 perguntas, uma por vez: recebe e repassa valores? · repassa de forma manual ou com sistema? · para quantos recebedores? · volume mensal · paga imposto duas vezes? · quem decide? | 11 conversas, sempre nessa ordem |
| B3 | Encerramento | "Sua operação tem total fit com o split", oferece "simulação personalizada" e "vou te conectar com o time comercial" (desde 17/09 cita o horário comercial) | 4 conversas completas |

### 1.3 · O que nenhuma das duas faz (fica fora do escopo)

Responder taxa ou preço da máquina, criar ou mover oportunidade, agendar reunião, definir responsável, fazer follow-up, enviar template e tratar cliente PagBank como caso à parte. O template "Podemos continuar nossa conversa?" é enviado à mão pela equipe, não pela automação.

**Um ponto importante:** quando o bot diz "seu atendimento foi registrado" ou a IA diz "vou te conectar com o time", **nada muda no CRM**. Não entra tag, responsável nem nota. Por isso a Katia pergunta tudo de novo e alguns leads ficaram sem resposta. A promessa existe, a ação não.

---

## 2 · Como o agente novo faz cada função

**Princípio:** mesmas funções, mesmo conteúdo, mesma ordem de perguntas. O que muda é que o agente entende o que o lead escreve, em vez de exigir um número.

| Hoje | No agente novo | Defeito que deixa de existir |
|---|---|---|
| A1 Gatilho | Workflow mínimo "Customer Replied (WhatsApp) → webhook" para a Vercel. A decisão fica no código | Bot reiniciando no meio da conversa (31% das boas-vindas) |
| A2 Tag `em contato` | Mantida, colocada pelo agente no primeiro atendimento | Nenhum, só preservar o filtro que a equipe usa |
| A3 Fora do horário | Mesmo aviso de horário e, em seguida, **a mesma triagem do horário comercial** (suporte ou qualificação). O fechamento diz quando a equipe volta ("a partir das 9h do próximo dia útil") | Hoje o lead fora do horário só recebe o aviso e espera, em mediana, 14,5 h sem nada registrado |
| A4 Cliente ou não | Faz a pergunta (seção 2.1), mas entende "sou cliente", "minha máquina parou" ou "quero conhecer" sem pedir número. Se o lead já disse o assunto, não pergunta | 31% das respostas eram texto livre e caíam em "Não entendi" |
| A5 CPF/CNPJ | Pede, com o aviso de LGPD na mesma mensagem, e grava no campo `CPF/CNPJ`, **validando** 11 ou 14 dígitos e o dígito verificador, como o documento do cliente já pedia. Não pede de novo se o campo já está preenchido | "1", foto e CPF inventado gravados como documento |
| A6.1 Maquininha | Mesmas 2 a 3 perguntas, aceita a foto ou o vídeo e passa ao atendente | Nenhum, só muda o formato |
| A6.2 Estorno | Mesmo roteiro e mesmos textos. Na venda anterior, confere se recebeu foto, data e valor antes de dizer "48 horas úteis" | Ramo sem saída (corrigido em 23/09, preservado) |
| A6.3 Portal/App | Os 6 textos do FAQ do documento, enviados de fato. "Resolveu?" e "outra dúvida" funcionam igual | O texto do tema não chegava ao lead |
| A6.4 Atendente | Pede o assunto em uma linha e passa. Se o lead pede humano em qualquer ponto, passa na hora | Lead pedindo humano duas vezes e não sendo atendido |
| A7 Não cliente | Segue para a qualificação, sem trocar de "robô" | Nenhum, só muda o formato |
| B1 Identificação | Pede o **CNPJ da empresa** (não "cadastrado", porque não é cliente) e grava no campo `CPF/CNPJ` validado. Se o campo já estiver preenchido, não pede | Pedir "CPF/CNPJ cadastrado" a quem acabou de dizer que não é cliente |
| B2 Qualificação | As mesmas 6 perguntas, uma por mensagem, pulando o que o lead já respondeu | Repetir pergunta já respondida |
| B3 Encerramento | Mesmo fechamento ("vou passar para o time comercial"), sem "em instantes" fora do horário. Diz quando o time volta | Promessa de "em instantes" num domingo |
| Passagem ao humano (A6 e B3) | **Passa a acontecer de verdade:** tira a tag `ia`, coloca `atendimento-humano` (o agente para de responder naquele contato) e uma **nota interna** com o resumo, o assunto e os dados coletados | Humano perguntando tudo de novo |

### 2.1 · Pergunta de cliente e campo `CPF/CNPJ` (decisão revista em 06/10)

- O agente **sempre descobre se é cliente**: pergunta "Você já é cliente da InovPay?", a não ser que a pessoa já tenha dito com clareza (ex.: "minha maquininha deu erro", "sou cliente", "ainda não tenho conta"). Pergunta sobre taxa sozinha não conta, porque cliente também pergunta de taxa.
- **O documento vai direto para o campo `CPF/CNPJ`**, de cliente e de não cliente, depois de validado.
- **Se o campo já estiver preenchido, o agente não pede o documento de novo**, seja cliente ou não. A pergunta "é cliente?" continua valendo.
- Com isso a limpeza dos 9 contatos deixou de ser necessária: o campo não decide mais se é cliente.

### 2.2 · Passagem para humano e reset de teste (decisão de 06/10)

- **Passagem para humano:** tira a tag `ia`, coloca `atendimento-humano`, cria a nota interna com o resumo e marca a conversa como não lida. Sem a tag `ia`, a IA não responde mais aquele contato.
- **Gate:** a IA só atende contato com a tag `ia`.
- **Reset de teste:** o número de teste manda `reset` no WhatsApp (ou a agência chama `POST /api/reset`). O agente tira `atendimento-humano` e `em contato`, coloca `ia` de volta, limpa o campo `CPF/CNPJ`, apaga a memória no Redis e grava um **corte**: tudo o que veio antes deixa de existir para a IA. A conversa no GHL **não é apagada**, porque conversa recriada faz o gatilho "Customer Replied" falhar na primeira mensagem. Só funciona para os números de teste cadastrados.

**Regras que valem em todo o fluxo** (vêm do comportamento atual ou do documento do cliente):
- Se uma pessoa da equipe respondeu o lead recentemente, ou o contato tem `atendimento-humano`, o agente fica em silêncio. Assim a resposta ao template "Claro, vamos lá!" não reinicia mais o atendimento.
- Quando o lead pergunta algo que o bot e a IA não respondem hoje (taxa, preço, prazo de entrega), o agente diz que o time vai responder e anota o pedido na nota da passagem. Ele não trava a conversa nem inventa número.
- Áudio é transcrito e foto é lida na entrada. Hoje o bot ignora os dois.
- Resposta automática do WhatsApp Business do lead ("Estamos fora do nosso horário…") é ignorada.

---

## 3 · O que sai e o que fica no GHL

| Sai (na virada, com autorização da InovPay) | Fica ou entra |
|---|---|
| Workflow "1- Suporte - WhatsApp Bot" (despublicado, não apagado) | **1 workflow** de gatilho: Customer Replied (WhatsApp) → webhook da Vercel |
| Os 2 agentes do Conversation AI (desligados) | Campos que já existem: `CPF/CNPJ` e `Nome da Empresa` |
| | Tags `ia` (gate), `em contato` (já existe) e `atendimento-humano` (nova) |

Como follow-up e template estão fora do escopo, **não é preciso nenhum workflow de template**. O GHL fica com um único workflow, de uma ação.

---

## 4 · Decisões (fechadas em 06/10)

| # | Decisão |
|---|---|
| D1 | **Fora do horário, o agente faz a triagem completa** depois do aviso de horário. Suporte: coleta tudo e deixa a nota pronta. Comercial: faz as 6 perguntas. O fechamento informa que a equipe responde a partir das 9h do próximo dia útil. Nunca promete "em instantes" fora do horário |
| D2 | A passagem ao humano coloca a tag `atendimento-humano` e a nota interna. **Sem definir responsável**, igual a hoje |
| D3 | Os textos do documento "Funil de Suporte" (FAQ, estorno, maquininha, horário) valem como estão. Passam só pelo ajuste de tom, sem mudar regra, horário nem prazo |
| D4 | O aviso de LGPD entra uma vez, na mensagem que pede o CPF/CNPJ (se o campo já existe, não há pedido e não há aviso). O comando "menu" não entra |
| D5 | A virada (despublicar o bot e desligar o Conversation AI) é autorizada pelo Fernando |
| D6 | Sempre descobre se é cliente; documento direto no campo; campo preenchido = não pede documento de novo (seção 2.1) |
| D7 | Passagem para humano tira `ia` e põe `atendimento-humano`. Reset de teste devolve `ia`, limpa tags, documento e histórico (seção 2.2) |

---

## 5 · Como provar que substitui (exame antes de subir)

Um cenário por função do inventário. Só sobe com **10/10** em todos.

1. Cliente com máquina que não liga, manda foto → triagem e passagem com nota.
2. Estorno de venda de hoje → passo a passo da máquina; "não consegui" → passagem.
3. Estorno de venda anterior, manda só o valor → pede foto e data antes de prometer 48h úteis.
4. Dúvida de split → texto do FAQ; "resolveu?" → "tenho outra dúvida" → volta aos temas.
5. "Quero falar com atendente" logo na primeira mensagem → passa na hora, sem questionário.
6. Abre com texto livre ("minha máquina tá dando erro") → entende que é cliente, sem pedir "1 ou 2".
7. Não cliente completa as 6 perguntas → fechamento com o horário real do time.
8. Não cliente pede humano no meio da qualificação → passa na hora.
9. Não cliente pergunta a taxa → diz que o time manda a tabela, anota o pedido, segue sem inventar número.
10. Lead responde "Claro, vamos lá!" a um template enquanto a Katia atende → agente em silêncio.
11. Mensagem às 22h de sábado sobre estorno → aviso de horário, triagem completa e fechamento "a equipe responde a partir das 9h de segunda".
12. CPF inválido → pede de novo e não grava.
13. Cliente já conhecido com `CPF/CNPJ` preenchido escreve "bom dia" → não pede documento, pergunta o assunto.
14. Não cliente com `CPF/CNPJ` preenchido → pergunta se é cliente, mas não pede o CNPJ de novo.

Depois do exame: teste de ponta a ponta com um número real da equipe (mensagem recebida, campo gravado, tags, nota interna e registro de execução conferidos) e rampagem por tag (contato da equipe, 10 conversas, todos).

---

## 6 · Troca sem resposta dupla

| Fase | Bot | Conversation AI | Agente novo |
|---|---|---|---|
| Teste | Ganha a condição "não tem a tag `ia-inovpay`" | Desligado para quem tem `ia-inovpay` | Atende só quem tem `ia-inovpay` |
| 10 conversas | Igual | Igual | Tag colocada à mão |
| Virada | Despublicado | Desligado | Atende todos |

---

## 7 · O que preciso para construir

| Item | Situação |
|---|---|
| Token do GHL | Recebido. Fica só nas variáveis de ambiente da Vercel |
| Chave de API do modelo de IA (conta comercial) | Pendente. O modelo é escolhido na construção, por teste comparativo |
| Upstash Redis | Pendente (fila de 10 s para juntar mensagens seguidas e registro de execuções) |
| Projeto na Vercel | Pendente |
| Decisões D1 a D6 | Fechadas em 06/10 |

---

## 8 · Fora do escopo (registrado para não se perder)

Ficam anotados porque aparecem nas conversas, mas **não entram agora**: informar taxas e preço da máquina; agendar a conversa de 15 min; criar e mover oportunidades; follow-up de quem sumiu; tratamento específico para cliente PagBank; importar a lista de clientes ativos; Central de acompanhamento para a InovPay.
