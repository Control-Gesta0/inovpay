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

**Reset de teste:** de um número em `RESET_PHONES`, mande `reset` no WhatsApp. Ou chame `POST /api/reset?secret=…&phone=11999999999`. Tira `atendimento-humano` e `em contato`, coloca `ia`, limpa o CPF/CNPJ, apaga a memória e grava o corte do histórico. A conversa no GHL não é apagada, porque conversa recriada faz o gatilho falhar na primeira mensagem.

## Endpoints

| Endpoint | Para quê |
|---|---|
| `GET /api/inbound` | saúde: `{ok, redis, gate, modo}` |
| `POST /api/inbound?secret=…` | webhook do workflow do GHL |
| `POST /api/reset?secret=…&phone=…` ou `&contact_id=…` | reset de teste (só contatos de teste; `&forcar=1` para outro) |
| `GET /api/validate?secret=…` | prova o mapa contra o GHL vivo. Tem que dar `ok: true` antes de ligar |
| `GET /api/executions?secret=…&limit=50` | diário: respostas, passagens, erros, custo |
| `GET /api/central?recurso=execucoes\|live\|recuperacao` | dados da Central (header `x-central-secret: <CENTRAL_SECRET>`). Só leitura, zero tokens |
| `GET /painel` | redireciona para a Central |

## Central de IA (painel)

**https://central-inovpay.vercel.app** · padrão Central v4.1 da Control Gestão, em `central/` (projeto Vercel
próprio, `central-inovpay`). Visão geral com briefing, operação (agora, passagens com resumo e link do contato,
histórico auditável, funil do GHL), resultados (triagem, motivos, custo), o roteiro e as travas, e a conferência
do CRM. Contrato de dados em `lib/central-data.ts`; detalhes em `central/README.md`.

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
