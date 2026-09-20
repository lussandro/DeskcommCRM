/**
 * O QUE FAZER COM O PEDIDO — decisão pura, sem banco.
 *
 * Separada do `consumidor.ts` pela mesma razão do `pedido.ts`: esta é a parte
 * ramificada (criar ou reusar card, avançar ou não, ganho ou perda) e é onde um
 * erro passa despercebido. Com banco no meio, testar isso exigiria Postgres, e
 * o que exige Postgres não é testado no `test:unit`.
 *
 * O consumidor executa o que esta função decide. Ela não conhece Supabase.
 */
import type { ActivityType } from "@/lib/leads/activity-vocabulary";

import {
  ATIVIDADE_DO_EVENTO,
  EVENTO_PEDIDO_CANCELADO,
  EVENTO_PEDIDO_PAGO,
  STATUS_DO_EVENTO,
  type EventoDeComercio,
} from "./vocabulario";

/** Como o card deve terminar depois deste evento. */
export interface FechamentoDoCard {
  /** `is_won` ou `is_lost` — qual etapa procurar no funil. */
  etapa: "ganho" | "perda";
  status: "won" | "lost";
  /** O CHECK `crm_leads_lost_reason_required` exige motivo na perda. */
  lostReason: string | null;
}

export interface DecisaoDoEvento {
  /** `orders.status` que esta entrega afirma. */
  statusDoPedido: string;
  /** O que vai para a timeline. */
  atividade: ActivityType;
  /** `null` = o card não se move; só a atividade é registrada. */
  fechamento: FechamentoDoCard | null;
}

export function decidir(evento: EventoDeComercio): DecisaoDoEvento | null {
  const statusDoPedido = STATUS_DO_EVENTO[evento];
  if (!statusDoPedido) return null;

  let fechamento: FechamentoDoCard | null = null;
  if (evento === EVENTO_PEDIDO_PAGO) {
    fechamento = { etapa: "ganho", status: "won", lostReason: null };
  } else if (evento === EVENTO_PEDIDO_CANCELADO) {
    // O motivo é fixo e específico: quem cancelou foi a LOJA (ou o cliente
    // dentro dela), não alguém do CRM. Um motivo genérico faria a métrica de
    // perda somar cancelamento de loja com desistência de negociação.
    fechamento = { etapa: "perda", status: "lost", lostReason: "cancelled_in_store" };
  }

  return { statusDoPedido, atividade: ATIVIDADE_DO_EVENTO[evento], fechamento };
}

/**
 * O pedido enviado (`fulfilled`) NÃO fecha o card, e isso é decisão, não
 * esquecimento: entre pagar e entregar existe a operação de envio, e fechar o
 * card no pagamento já contou a venda. Marcar "enviado" como ganho de novo
 * contaria duas vezes na mesma métrica.
 */
export function fechaOCard(evento: EventoDeComercio): boolean {
  return decidir(evento)?.fechamento != null;
}
