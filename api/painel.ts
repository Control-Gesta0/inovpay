import type { VercelRequest, VercelResponse } from '@vercel/node'
import { bloqueado, dadosPainel, registrarErro, senhaConfere } from '../lib/painel'
import { PAINEL_HTML } from '../lib/painel-html'

/**
 * GET /painel → a página (sem dados). GET /api/painel?dados=1 com o header x-painel-senha → os números.
 * Senha errada conta tentativa por IP (8 em 15 min bloqueiam). Senha na env PAINEL_SENHA.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Robots-Tag', 'noindex, nofollow')
  if (!req.query.dados) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    return res.status(200).send(PAINEL_HTML)
  }
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'sem-ip'
  if (await bloqueado(ip)) return res.status(429).json({ error: 'muitas tentativas' })
  if (!senhaConfere(String(req.headers['x-painel-senha'] || ''))) {
    await registrarErro(ip)
    return res.status(401).json({ error: 'senha incorreta' })
  }
  return res.status(200).json(await dadosPainel())
}
