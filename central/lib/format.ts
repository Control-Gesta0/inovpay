export function brl(valor: number, casas = 2) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: casas, maximumFractionDigits: casas })
}

export function dataHora(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function tempoRelativo(iso: string) {
  const delta = new Date(iso).getTime() - Date.now()
  const min = Math.round(Math.abs(delta) / 60000)
  const txt = min < 60 ? `${min} min` : min < 1440 ? `${Math.round(min / 60)}h` : `${Math.round(min / 1440)}d`
  return delta < 0 ? `há ${txt}` : `em ${txt}`
}

export function pct(parte: number, todo: number) {
  return todo ? `${Math.round((parte / todo) * 100)}%` : '—'
}

/** Rótulos dos motivos de passagem (os mesmos do agente, lib/central-data.ts). */
export const MOTIVO_ROTULO: Record<string, string> = {
  suporte_maquininha: 'Maquininha',
  estorno: 'Estorno de venda de hoje',
  estorno_anterior: 'Cancelamento de dias anteriores',
  portal_app: 'Portal ou app',
  pediu_atendente: 'Pediu atendente',
  qualificacao_concluida: 'Comercial qualificado',
  pediu_humano: 'Pediu uma pessoa',
  outro: 'Outro assunto',
}
