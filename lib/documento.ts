/**
 * Validação de CPF e CNPJ (puro, testado em scripts/test.ts).
 * O documento do cliente pede: validar 11 ou 14 dígitos antes de seguir.
 * Aceita também o CNPJ alfanumérico da Receita (a partir de jul/2026):
 * 12 posições alfanuméricas + 2 dígitos verificadores, valor do caractere = código ASCII − 48.
 */

export interface Documento { tipo: 'cpf' | 'cnpj'; valor: string; formatado: string }

const limpa = (s: string) => String(s || '').toUpperCase().replace(/[\s.\-/]/g, '')

function cpfValido(d: string): boolean {
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false
  const dv = (n: number) => {
    let soma = 0
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i)
    const r = (soma * 10) % 11
    return r === 10 ? 0 : r
  }
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10])
}

function cnpjValido(d: string): boolean {
  if (!/^[0-9A-Z]{12}\d{2}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false
  const val = (c: string) => c.charCodeAt(0) - 48
  const dv = (n: number) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    let soma = 0
    for (let i = 0; i < n; i++) soma += val(d[i]) * pesos[i]
    const r = soma % 11
    return r < 2 ? 0 : 11 - r
  }
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13])
}

/** Documento válido ou null. Tira pontuação; texto com letras só passa se for CNPJ alfanumérico válido. */
export function validarDocumento(entrada: string): Documento | null {
  const d = limpa(entrada)
  if (d.length === 11 && cpfValido(d)) {
    return { tipo: 'cpf', valor: d, formatado: `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` }
  }
  if (d.length === 14 && cnpjValido(d)) {
    return { tipo: 'cnpj', valor: d, formatado: `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` }
  }
  return null
}

/** Mostra só o começo e o fim (o documento não vai inteiro para o prompt nem para o log). */
export const mascarar = (doc: string) => {
  const d = limpa(doc)
  return d.length < 6 ? '***' : `${d.slice(0, 3)}***${d.slice(-2)}`
}
