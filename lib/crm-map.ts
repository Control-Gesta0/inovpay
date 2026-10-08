/**
 * O que é da conta GHL da InovPay. IDs consultados AO VIVO em 06/10/2026 e
 * conferidos a cada deploy pelo /api/validate (o GHL grava em campo apagado
 * devolvendo 200, então o mapa precisa ser provado contra o CRM vivo).
 */
export const CRM_MAP = {
  /** campo do contato "CPF/CNPJ" (texto). A IA grava aqui, para cliente e para não cliente */
  campoDocumento: { id: '4NVMB1avj34qzlNXYzay', nome: 'CPF/CNPJ' },

  /**
   * Funil comercial que a Central mostra (só leitura: a IA não move card nesta fase).
   * As etapas são lidas AO VIVO do GHL; aqui fica só qual pipeline é.
   */
  pipeline: { id: 'd8cxey6LPExYI33I9JpF', nome: 'Novos Leads InovPay' },

  /** tag que a automação antiga colocava em todo contato atendido (preservada) */
  tagEmContato: 'em contato',

  /** expediente da equipe: segunda a sexta, 9h às 18h, sem pausa */
  expediente: { inicio: 9, fim: 18 },

  textos: {
    // o aviso de fora do horário e os encerramentos moram na Base de dados (lib/base-core.ts)
    reset: 'Reset feito. A conversa começa do zero na próxima mensagem.',
    /** a trava barrou duas vezes: sai um texto neutro em vez de algo errado */
    seguro: 'Entendi! Me conta um pouquinho mais, por favor, pra eu te ajudar certinho.',
    seguroFinal: 'Obrigado pelas informações! Seu atendimento foi registrado e vai para a nossa equipe, que continua por aqui mesmo.',
  },
}
