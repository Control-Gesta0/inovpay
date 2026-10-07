import 'server-only'
import { demo } from './demo'

export type Recurso = 'execucoes' | 'live' | 'recuperacao'

/**
 * Lê o agente no servidor (o segredo nunca vai ao navegador).
 * Fail-closed: sem AGENT_URL/AGENT_SECRET devolve erro, nunca dado vazio que
 * pareça "tudo bem". CENTRAL_DEMO=1 só serve para ver a tela com dados fictícios.
 */
export async function lerAgente(recurso: Recurso): Promise<{ status: number; body: unknown }> {
  if (process.env.CENTRAL_DEMO === '1') return { status: 200, body: { ...(demo(recurso) as object), demo: true } }
  const url = process.env.AGENT_URL
  const secret = process.env.AGENT_SECRET
  if (!url || !secret) return { status: 503, body: { error: 'Central sem conexão com o agente: configure AGENT_URL e AGENT_SECRET.' } }
  try {
    const r = await fetch(`${url.replace(/\/$/, '')}/api/central?recurso=${recurso}`, {
      headers: { 'x-central-secret': secret },
      cache: 'no-store',
      signal: AbortSignal.timeout(25_000),
    })
    const body = await r.json().catch(() => ({ error: `agente respondeu ${r.status} sem JSON` }))
    return { status: r.ok ? 200 : 502, body: r.ok ? body : { error: (body as { error?: string }).error || `agente respondeu ${r.status}` } }
  } catch (e) {
    return { status: 502, body: { error: `agente não respondeu: ${e instanceof Error ? e.message : String(e)}` } }
  }
}
