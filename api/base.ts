import type { VercelRequest, VercelResponse } from '@vercel/node'
import { candidata, descartarRascunho, lerHistorico, lerRascunho, lerVigente, padrao, salvarNoRascunho, voltarPara } from '../lib/base'
import { GRUPOS, ITENS, ehItem, validarTexto } from '../lib/base-core'
import { centralAutorizada, corpo } from '../lib/central-auth'
import { iniciarExame, lerExame } from '../lib/exame'

/**
 * Base de dados da Central (header x-central-secret).
 *   GET                       → itens (padrão, no ar, rascunho), versão, histórico e o último exame
 *   GET  ?exame=<id>          → andamento de um exame
 *   POST {acao:'salvar', id, texto}      → grava no rascunho (nada muda no WhatsApp)
 *   POST {acao:'descartar', id?}         → tira do rascunho (sem id: tudo)
 *   POST {acao:'publicar', nota}         → roda o exame com o rascunho; só publica se passar
 *   POST {acao:'voltar', versao}         → volta para uma versão anterior
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!centralAutorizada(req)) return res.status(401).json({ error: 'unauthorized' })
  res.setHeader('Cache-Control', 'no-store')
  try {
    if (req.method === 'GET') {
      if (req.query.exame) return res.status(200).json({ exame: await lerExame(String(req.query.exame)) })
      return res.status(200).json(await estado())
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'use GET ou POST' })
    const b = corpo(req)
    const acao = String(b.acao || '')
    if (acao === 'salvar') {
      const id = String(b.id || '')
      if (!ehItem(id)) return res.status(400).json({ error: 'item desconhecido' })
      const texto = String(b.texto ?? '').replace(/\r\n/g, '\n')
      await salvarNoRascunho(id, texto)
      return res.status(200).json({ ok: true, problemas: validarTexto(id, texto), ...(await estado()) })
    }
    if (acao === 'descartar') {
      const id = b.id ? String(b.id) : undefined
      if (id && !ehItem(id)) return res.status(400).json({ error: 'item desconhecido' })
      await descartarRascunho(id as never)
      return res.status(200).json({ ok: true, ...(await estado()) })
    }
    if (acao === 'publicar') {
      const r = await iniciarExame(String(b.nota || ''))
      return res.status(r.erro ? 409 : 202).json(r)
    }
    if (acao === 'voltar') {
      const v = await voltarPara(Number(b.versao))
      if (!v) return res.status(404).json({ error: 'versão não encontrada no histórico' })
      return res.status(200).json({ ok: true, ...(await estado()) })
    }
    return res.status(400).json({ error: 'acao inválida (salvar | descartar | publicar | voltar)' })
  } catch (e) {
    return res.status(500).json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) })
  }
}

async function estado() {
  const [vig, rasc, hist, exame, c] = await Promise.all([lerVigente(), lerRascunho(), lerHistorico(), lerExame(), candidata()])
  const base = padrao()
  return {
    versao: vig.versao,
    publicadoEm: vig.publicadoEm,
    nota: vig.nota || null,
    rascunhoEm: rasc.atualizadoEm,
    grupos: GRUPOS,
    itens: ITENS.map(i => ({
      id: i.id, grupo: i.grupo, titulo: i.titulo, ajuda: i.ajuda,
      padrao: base[i.id],
      noAr: c.vigente[i.id],
      rascunho: rasc.textos[i.id] ?? null,
      problemas: rasc.textos[i.id] !== undefined ? validarTexto(i.id, rasc.textos[i.id]!) : [],
    })),
    alteracoes: c.mudou,
    historico: hist.map(h => ({ versao: h.versao, publicadoEm: h.publicadoEm, nota: h.nota || null, mudancas: h.mudancas || [] })),
    exame,
  }
}
