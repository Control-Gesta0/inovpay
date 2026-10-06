import { CRM_MAP } from './crm-map'

/**
 * Expediente da InovPay: segunda a sexta, 9h às 18h. Decisão em CÓDIGO (zero token).
 * Feriado não entra: num feriado de dia útil o agente se comporta como dentro do horário.
 */

function partes(d: Date, timezone: string): { dia: number; hora: number } {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false })
  const p = Object.fromEntries(f.formatToParts(d).map(x => [x.type, x.value]))
  const dia = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday)
  return { dia, hora: (Number(p.hour) % 24) + Number(p.minute) / 60 }
}

export function dentroDoHorario(d: Date, timezone = 'America/Sao_Paulo'): boolean {
  const { dia, hora } = partes(d, timezone)
  const { inicio, fim } = CRM_MAP.expediente
  return dia >= 1 && dia <= 5 && hora >= inicio && hora < fim
}

/** Brasil sem horário de verão desde 2019: Brasília = UTC-3 fixo. */
const OFFSET_H = 3

function noDia(d: Date, hora: number, somaDias = 0): Date {
  const local = new Date(d.getTime() - OFFSET_H * 3600_000)
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + somaDias, hora + OFFSET_H))
}

/** Próxima abertura do expediente (o próprio `d` se já estiver dentro). */
export function proximaAbertura(d: Date, timezone = 'America/Sao_Paulo'): Date {
  if (dentroDoHorario(d, timezone)) return d
  for (let i = 0; i < 8; i++) {
    const c = noDia(d, CRM_MAP.expediente.inicio, i)
    if (c.getTime() >= d.getTime() && dentroDoHorario(c, timezone)) return c
  }
  return d
}

const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']

/** "hoje a partir das 9h", "amanhã a partir das 9h", "na segunda-feira a partir das 9h". */
export function quandoVolta(d: Date, timezone = 'America/Sao_Paulo'): string {
  const abre = proximaAbertura(d, timezone)
  const h = `${CRM_MAP.expediente.inicio}h`
  const ymd = (x: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(x)
  if (ymd(abre) === ymd(d)) return `hoje a partir das ${h}`
  if (ymd(abre) === ymd(new Date(d.getTime() + 86400_000))) return `amanhã a partir das ${h}`
  return `na ${DIAS[partes(abre, timezone).dia]} a partir das ${h}`.replace('na sábado', 'no sábado').replace('na domingo', 'no domingo')
}
