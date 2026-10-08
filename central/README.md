# Central de IA · Assistente virtual (InovPay)

Painel sobre a assistente virtual da InovPay no WhatsApp, com a identidade da
Control Gestão (padrão Central v5) em **quatro abas**:

| Aba | Rotas | O que faz |
|---|---|---|
| Estatísticas | `/` · `/operacao` · `/resultados` · `/configuracoes` | visão geral, operação, resultados e sistema (subabas) |
| Teste | `/teste` | laboratório: conversa com a assistente sem tocar no GHL; botão Corrigir em cada resposta |
| Ensinar | `/ensinar` (o antigo `/base` redireciona) | a equipe pede mudanças em português, com arquivo ou link se quiser, e a IA altera; publica só depois do exame automático |
| Como usar | `/como-usar` | passo a passo, fluxo do cliente ligado aos textos da base no ar, "Sua base" e o dia a dia da equipe no GHL (conteúdo em `lib/como-usar.ts`) |

- Estatísticas: só leitura e **zero tokens**, tudo calculado em código a partir do
  diário do agente e do GHL. Teste e o exame da Base usam o modelo (o custo aparece na tela).
- **Fail-closed**: sem as fontes, a tela mostra "verificando" ou o erro. Nunca
  mostra "saudável" por falta de dado.
- O segredo do agente fica só no servidor; o navegador fala com `/api/*`, que
  exige sessão.

## Como os dados chegam

```
navegador → /api/exec | /api/live   (Central, exige login)
          → AGENT_URL/api/central?recurso=…            (agente, header x-central-secret)
          → Redis (diário de execuções) + GHL (funil, conferência do mapa)
navegador → /api/base | /api/teste                     (Central, exige login)
          → AGENT_URL/api/base | /api/teste            (agente, mesmo header)
```

O contrato de dados vive em `../lib/central-data.ts` (agente). `lib/types.ts`
aqui é o espelho: mudou lá, mude aqui.

## Deploy na Vercel (projeto separado do agente: `central-inovpay`)

1. O agente precisa estar com `/api/central` no ar. Confira com
   `curl -H "x-central-secret: $SEGREDO" "$AGENT_URL/api/central?recurso=execucoes"`.
2. Projeto Vercel com **Root Directory = `central`** (ou deploy pela CLI de dentro
   desta pasta). A Vercel detecta Next.js.
3. Variáveis de ambiente (veja `.env.example`):

| Variável | Valor |
|---|---|
| `AGENT_URL` | `https://inovpay-ia.vercel.app` |
| `AGENT_SECRET` | o `CENTRAL_SECRET` do agente |
| `APP_PASSWORD` | senha de acesso |
| `AUTH_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

`CENTRAL_DEMO` fica **vazio** em produção.

4. Smoke: `/login`, depois `/`, `/operacao`, `/resultados`, `/configuracoes`
   (Sistema: agente e CRM verdes), `/teste` (mandar uma mensagem) e `/ensinar`.

## Rodar local

```bash
npm ci
CENTRAL_DEMO=1 APP_PASSWORD=teste AUTH_SECRET=$(openssl rand -hex 32) npm run dev
```

Com `CENTRAL_DEMO=1` a Central usa dados fictícios (`lib/demo-data.json`,
gerados pelas mesmas funções do agente com `npx tsx scripts/demo-central.ts` na
raiz) e mostra um aviso no topo.

## Limites conhecidos

- O diário do agente guarda as **últimas 2.000 execuções**. Métricas de 30 dias
  cobrem só o que ainda está nele (a tela de Resultados mostra desde quando).
- Custo = só o modelo de linguagem (US$ → R$ por `COST_USD_BRL` no agente, padrão 5,40).
  Transcrição de áudio, leitura de imagem e infraestrutura não entram.
- Execuções anteriores a esta versão não têm o texto do contato nem a resposta:
  aparecem como "texto não guardado".
- "Resolvidos sem a equipe" conta os encerramentos do roteiro ("A InovPay
  agradece seu contato"): estorno feito na maquininha e manual do portal que
  resolveu.
- Nesta fase a assistente não move cards no funil nem faz follow-up: as duas
  telas mostram isso de forma explícita.
