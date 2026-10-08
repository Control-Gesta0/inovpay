import { NextResponse, type NextRequest } from 'next/server'
import { chamarAgente } from '@/lib/agent'

export const dynamic = 'force-dynamic'

const ACOES = ['salvar', 'descartar', 'publicar', 'voltar']

export async function GET(req: NextRequest) {
  const exame = req.nextUrl.searchParams.get('exame')
  const rota = exame ? `/api/base?exame=${encodeURIComponent(exame)}` : '/api/base'
  const { status, body } = await chamarAgente(rota)
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  if (!ACOES.includes(String(b.acao))) return NextResponse.json({ error: 'ação inválida' }, { status: 400 })
  const { status, body } = await chamarAgente('/api/base', { method: 'POST', body: b })
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}
