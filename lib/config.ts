function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Env var obrigatória ausente: ${name}`)
  return v
}

const list = (v: string | undefined) => (v || '').split(',').map(x => x.trim()).filter(Boolean)

export type ModoGate = 'tag' | 'todos' | 'desligada'

/**
 * InovPay · GHL. O GHL devolve o transcript: o histórico vem do CRM (fonte da verdade).
 * O Redis guarda só coordenação: buffer, lock, estado da conversa, corte do reset,
 * cache de mídia transcrita e o diário de execuções.
 */
export const CONFIG = {
  clientName: process.env.CLIENT_NAME || 'InovPay · Agente',

  ghlToken: required('GHL_TOKEN'),
  ghlLocationId: required('GHL_LOCATION_ID'),
  ghlBaseUrl: (process.env.GHL_BASE_URL || 'https://services.leadconnectorhq.com').replace(/\/+$/, ''),
  /** tipo de canal no POST /conversations/messages (WhatsApp oficial nativo do GHL) */
  ghlChannel: process.env.GHL_CHANNEL || 'WhatsApp',
  timezone: process.env.TIMEZONE || 'America/Sao_Paulo',

  openaiApiKey: required('OPENAI_API_KEY'),
  llmModel: process.env.LLM_MODEL || 'gpt-5.4-mini-2026-03-17',
  visionModel: process.env.VISION_MODEL || 'gpt-5.4-mini-2026-03-17',
  sttModel: process.env.STT_MODEL || 'gpt-4o-mini-transcribe',

  // Aceita os dois nomes: o do Upstash e o que a integração da Vercel cria
  upstashUrl: process.env.UPSTASH_REDIS_REST_URL || required('KV_REST_API_URL'),
  upstashToken: process.env.UPSTASH_REDIS_REST_TOKEN || required('KV_REST_API_TOKEN'),
  /** o Upstash é compartilhado com outros clientes: TODA chave leva este prefixo */
  redisPrefix: process.env.REDIS_PREFIX || 'agente-inovpay:',

  webhookSecret: required('WEBHOOK_SECRET'),
  debounceSeconds: Number(process.env.DEBOUNCE_SECONDS || 10),

  /** Gate: só atende quem tem a tag. A passagem para o humano tira esta tag. */
  gateTag: (process.env.GATE_TAG || 'ia').toLowerCase(),
  humanTag: (process.env.HUMAN_TAG || 'atendimento-humano').toLowerCase(),
  /** tag: só com a tag de gate · todos: todo contato sem atendimento-humano · desligada: ninguém */
  modoGate: ((v: string): ModoGate => (v === 'todos' || v === 'desligada' ? v : 'tag'))((process.env.MODO_GATE || 'tag').toLowerCase()),

  /** cotação para mostrar o custo do modelo em reais na Central */
  usdBrl: Number(process.env.COST_USD_BRL || process.env.COTACAO_DOLAR || 5.4),

  /** quem pode mandar "reset" pelo WhatsApp (telefones) ou pelo id do contato */
  resetPhones: list(process.env.RESET_PHONES),
  testContactIds: list(process.env.TEST_CONTACT_IDS),
}
