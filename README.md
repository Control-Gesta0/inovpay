# InovPay · Agente de IA no GoHighLevel

Agente da InovPay no WhatsApp que substitui a automação "1- Suporte - WhatsApp Bot" e a IA do GHL (Conversation AI). Ele faz as mesmas funções, mas conversando em vez de usar menu numerado. Roda na Vercel, lê e escreve no GHL e usa a OpenAI e o Upstash Redis.

| Documento | Conteúdo |
|---|---|
| [docs/01-diagnostico-ghl.md](docs/01-diagnostico-ghl.md) | Análise da conta GHL, das 151 conversas, do bot e da IA atual, catálogo extraído e riscos |
| [docs/02-escopo-substituicao.md](docs/02-escopo-substituicao.md) | **Escopo vigente:** o que o bot e a IA do GHL fazem, como o agente faz cada função, decisões D1 a D7 e o exame de aceite |

**Estado:** `PROVANDO`. `npm test` verde, exame **42/42** (14 cenários × 3 rodadas, 06/10/2026) e deploy em https://inovpay-ia.vercel.app. Falta o teste de ponta a ponta com número real (precisa do workflow no GHL e do número de teste).

## Como funciona

```
Lead manda mensagem no WhatsApp
  → Workflow do GHL "Customer Replied" (sem filtro de tag) → POST /api/inbound?secret=…
      responde 200 na hora; o resto roda em segundo plano:
      1. "reset" vindo de número de teste? zera o contato e para
      2. tag atendimento-humano, ou sem a tag "ia"? não responde
      3. espera 10s (várias mensagens seguidas viram uma resposta só)
      4. lê a conversa no GHL a partir do último reset (nota interna fica de fora; áudio e imagem viram texto)
      5. alguém da equipe respondeu nas últimas 6h? a IA não atropela
      6. fora do horário (seg a sex, 9h às 18h)? manda o aviso de horário, uma vez, e segue a triagem
      7. código decide o que é determinístico: cliente ou não (texto explícito ou resposta à pergunta),
         resposta do roteiro comercial, próximo passo, dados mínimos de cada passagem
      8. GPT + ferramentas: grava CPF/CNPJ validado, anota, passa para a equipe
      9. travas em código: sem taxa, sem preço, sem senha, sem travessão, uma pergunta por vez,
         sem "em instantes" fora do horário, sem prometer passagem sem passar, sem pular pergunta
         do roteiro, sem ignorar pergunta de taxa (as que pedem ação tentam de novo COM ferramentas)
     10. envia pelo GHL e registra no diário
```

**Passagem para a equipe** (`passar_para_humano`): nota interna com resumo e dados coletados, tag `atendimento-humano`, tira a tag `ia` e marca a conversa como não lida. A IA para de responder esse contato.

**Reset de teste:** de um número em `RESET_PHONES`, mande `reset` no WhatsApp. Ou chame `POST /api/reset?secret=…&phone=11999999999`. Tira `atendimento-humano` (a tag `em contato` fica: o bot antigo só dispara para quem não tem `em contato`, então ele não responde junto com a IA nos testes), coloca `ia`, limpa o CPF/CNPJ, apaga a memória e grava o corte do histórico. A conversa no GHL não é apagada, porque conversa recriada faz o gatilho falhar na primeira mensagem.

## Endpoints

| Endpoint | Para quê |
|---|---|
| `GET /api/inbound` | saúde: `{ok, redis, gate, modo}` |
| `POST /api/inbound?secret=…` | webhook do workflow do GHL |
| `POST /api/reset?secret=…&phone=…` ou `&contact_id=…` | reset de teste (só contatos de teste; `&forcar=1` para outro) |
| `GET /api/validate?secret=…` | prova o mapa contra o GHL vivo. Tem que dar `ok: true` antes de ligar |
| `GET /api/executions?secret=…&limit=50` | diário: respostas, passagens, erros, custo |
| `GET /api/central?recurso=execucoes\|live` | dados da Central (header `x-central-secret: <CENTRAL_SECRET>`). Só leitura, zero tokens |
| `GET/POST /api/base` | Aba Ensinar da Central: pedir mudança à IA (curador, com até 3 arquivos ou links), conversas reais (`?conversas=1`, `?conversa=<id>`), corrigir resposta do laboratório ou real, desfazer, publicar com exame (14 cenários), voltar versão. Não existe edição manual |
| `GET/POST /api/teste` | laboratório da Central: conversa com a assistente numa porta em memória (nada vai para o GHL) |
| `GET /painel` | redireciona para a Central |

## Central de IA (painel)

**https://central-inovpay.vercel.app** · identidade da Control Gestão, padrão Central v4.1, em `central/`
(projeto Vercel próprio, `central-inovpay`). Quatro abas:

- **Estatísticas**: visão geral (veredito, o que pede decisão e quatro números de hoje), operação (agora,
  passagens com resumo e link do contato, histórico auditável, funil do GHL com as oportunidades paradas),
  resultados (resumo e triagem em 7 ou 30 dias, custo) e sistema (agente, CRM e quem ela atende). As subabas
  e o "Pergunte à Central" (no menu, Ctrl K) dividem a mesma leitura por 1 minuto: trocar de subaba não busca
  o CRM de novo.
- **Teste**: laboratório. Conversa com a assistente de verdade (mesmo cérebro, ferramentas e travas) numa
  porta em memória; mostra o que mudaria no contato (tags, CPF/CNPJ, anotações, nota). Pode usar os textos
  no ar ou o rascunho da base. Limite de 300 mensagens por dia.
- **Ensinar** (antes "Base de dados"; `/base` redireciona para `/ensinar`): os textos que a assistente manda e consulta (portal e app, cancelamento na maquininha,
  explicação para não cliente, encerramentos, aviso de fora do horário) e as informações que a equipe pede para
  acrescentar. **Ninguém edita texto à mão**: a equipe pede em português (aba "Pedir mudança", com histórico),
  corrige uma resposta no Teste ou uma resposta de **conversa real** do WhatsApp (aba "Conversas reais", montada do
  diário com PII mascarada) pelo botão "Corrigir": como deveria ser e por que está errado. A IA (`lib/curador.ts`,
  com a chave OpenAI do cliente) decide o destino: muda o texto por troca exata de trecho, acrescenta informação
  (seção 11 do prompt), registra pedido para a Control Gestão (regra de atendimento) ou recusa (taxa, preço,
  senha). Tudo vai para o rascunho; publicar roda o exame (14 cenários; cenário que falha roda mais 2 vezes e
  precisa passar nas duas). Três subabas: Pedir mudança, Conversas reais e O que ela sabe (textos recolhidos,
  só leitura); as versões anteriores, com "voltar para esta", ficam recolhidas no quadro do topo.
- **Como usar**: o manual vivo para a equipe do cliente. Passo a passo da Central, fluxo do cliente no WhatsApp
  (cada etapa mostra o texto da base que a assistente usa, lido da versão no ar, com link para mudar em Ensinar),
  "Sua base" (versão, textos por assunto, como uma mudança passa a valer, quem muda o quê) e "Equipe no GHL"
  (tags, combinados, dúvidas). Roteiro e travas moram aqui. O conteúdo de cada cliente fica em
  `central/lib/como-usar.ts`; a página é a estrutura.
- **Material para ensinar**: no "Pedir mudança" dá para anexar até 3 arquivos (PDF, Word .docx, texto, Markdown,
  CSV ou imagem; 3 MB no total) ou colar até 3 links (site, Google Docs ou Planilhas compartilhados com "qualquer
  pessoa com o link"). `lib/material.ts` transforma em texto uma vez (PDF e imagem lidos pela OpenAI com a chave do
  cliente, `VISION_MODEL`; Word pelo mammoth) e o curador usa como fonte: troca um texto fixo ou cria informações
  novas curtas (até 6 por pedido, 1.500 caracteres cada, 20 mil no total). Taxa, preço, senha e dados pessoais
  do material não entram. O arquivo não é guardado; o histórico mostra o nome, quantos caracteres foram lidos ou
  por que não deu para ler. Link só público (localhost, IP interno e redirecionamento para eles são bloqueados).

Como a base funciona: os blocos editáveis estão marcados em `prompts/inovpay.md` com
`<!-- base:id -->…<!-- /base -->` e os encerramentos/aviso em `lib/base-core.ts`. Sem edição, o prompt
renderizado é idêntico ao arquivo sem os marcadores (provado em `npm test`). O publicado vive no Redis
(`base:vigente`, `base:historico`, `base:rascunho`); o atendimento lê a cada turno (cache de 10 s).
Contrato de dados em `lib/central-data.ts`; detalhes em `central/README.md`.

## Variáveis de ambiente

Veja `.env.example`. Nunca commitar valores: este repositório é público.

## Provas

- `npm test`: CPF/CNPJ (inclusive o CNPJ alfanumérico), travas, horário, reset, nota da passagem, webhook.
- `npm run evals`: 14 cenários do escopo (seção 5 do documento 02), com juiz. Só sobe com todos aprovados. Último resultado: 42/42 com `EVAL_REPS=3`.
- `npm run typecheck`.

## Configuração no GHL (feita no painel, a API não cria workflow)

1. Workflow **"IA InovPay · entrada"**: gatilho *Customer Replied* (canal WhatsApp), **sem filtro de tag**. Ação *Custom Webhook* `POST https://<projeto>.vercel.app/api/inbound?secret=<WEBHOOK_SECRET>`, Custom Data `contact_id = {{contact.id}}`.
2. Enquanto o bot antigo estiver ligado: no workflow "1- Suporte - WhatsApp Bot", condição **"contato NÃO tem a tag ia"** logo no início. No Conversation AI, mesma exclusão (ou desligar para os contatos de teste).
3. Virada (autorização do Fernando): despublicar o bot e desligar os 2 agentes do Conversation AI.
