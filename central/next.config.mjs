import { fileURLToPath } from 'node:url'

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // a aba "Base de dados" virou "Ensinar": link antigo continua funcionando
  async redirects() {
    return [{ source: '/base', destination: '/ensinar', permanent: false }]
  },
  // O repositório tem outro package-lock (o do agente) na raiz: a Central é um projeto próprio
  outputFileTracingRoot: fileURLToPath(new URL('.', import.meta.url)),
}
export default nextConfig
