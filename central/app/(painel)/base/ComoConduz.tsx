import { ListChecks, ShieldCheck } from 'lucide-react'
import { SectionTitle } from '@/components/ProductUI'

const ETAPAS = [
  ['1. Cliente ou não cliente', 'Cumprimento curto e a pergunta "Você já é cliente da InovPay?", a menos que a mensagem já deixe claro (venda na maquininha, estorno, portal: cliente; quer abrir conta: não cliente). Quando o texto é explícito, quem decide é o código.'],
  ['2. CPF ou CNPJ', 'Pedido uma vez, com o aviso da Política de Privacidade, e gravado direto no campo CPF/CNPJ do contato. Campo já preenchido: não pede de novo, seja cliente ou não.'],
  ['3. Cliente: assunto e roteiro', 'Maquininha (estado e descrição, com foto), estorno (venda de hoje: passo a passo na maquininha; dias anteriores: comprovante, data e valor), portal e app (textos do manual enviados como estão) ou falar com um atendente.'],
  ['4. Não cliente: seis perguntas', 'Repasse, forma do repasse, quantos recebem, volume mensal, bitributação e quem decide. Uma por mensagem, pulando o que a pessoa já contou. Taxa e preço ficam com o time comercial.'],
  ['5. Passagem para a equipe', 'Tira a tag ia, põe atendimento-humano, deixa a conversa como não lida e grava uma nota com o motivo e o resumo. A pessoa não precisa repetir nada.'],
  ['6. Fora do horário', 'Aviso uma vez por período fechado (segunda a sexta, 9h às 18h) e a triagem segue normal; a equipe continua quando abrir.'],
]

const TRAVAS = [
  'Nunca informa taxa, preço, valor, prazo ou condição comercial: diz que a equipe passa e anota o pedido.',
  'Uma pergunta por mensagem; a pergunta do roteiro comercial não pode ser pulada.',
  'Não diz que vai passar para a equipe sem passar de verdade: a trava refaz a resposta com a ferramenta.',
  'Só passa com os dados mínimos do motivo (estorno de dias anteriores: comprovante, data e valor).',
  'Pediu uma pessoa: passa na hora, sem mais perguntas.',
  'Nunca pede nem envia senha; não promete aprovação de estorno, cadastro ou análise.',
  'Fora do horário, não promete atendimento imediato.',
  'Recua quando alguém da equipe escreveu na conversa nas últimas 6 horas.',
]

/** O roteiro e as travas (só leitura): mudar o comportamento passa pela Control Gestão, com o exame antes. */
export default function ComoConduz() {
  return (
    <div className="space-y-8">
      <section>
        <SectionTitle eyebrow="ROTEIRO DA INOVPAY · FAQ ATUALIZADO EM 06/10/2026" title="A jornada que a assistente segue." description="Só leitura. Mudança no roteiro ou nas regras passa pela Control Gestão e pelo mesmo exame antes de valer." />
        <div className="panel overflow-hidden">
          {ETAPAS.map(([t, d], i) => (
            <div key={t} className={`px-5 py-4 flex gap-4 ${i ? 'border-t border-line-soft' : ''}`}>
              <ListChecks size={15} className="text-cyan shrink-0 mt-0.5" />
              <div><div className="text-[13px] font-medium text-ink">{t}</div><p className="text-[12px] text-body-mid leading-relaxed mt-1">{d}</p></div>
            </div>
          ))}
        </div>
      </section>
      <section>
        <SectionTitle eyebrow="TRAVAS EM CÓDIGO" title="O que a assistente não faz, mesmo que o modelo tente." />
        <div className="grid md:grid-cols-2 gap-3">
          {TRAVAS.map(t => (
            <div key={t} className="panel p-4 flex gap-3"><ShieldCheck size={15} className="text-success shrink-0 mt-0.5" /><p className="text-[12.5px] text-body-mid leading-relaxed">{t}</p></div>
          ))}
        </div>
      </section>
    </div>
  )
}
