import fs from 'fs'
import path from 'path'

/** Lê .env.local (sem dependência). Não sobrescreve o que já está no ambiente. */
export function loadEnv(file = '.env.local'): void {
  const p = path.join(process.cwd(), file)
  if (!fs.existsSync(p)) return
  for (const line of fs.readFileSync(p, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m || line.trim().startsWith('#')) continue
    const v = m[2].replace(/\s+#.*$/, '').replace(/^["']|["']$/g, '')
    process.env[m[1]] ??= v
  }
}
