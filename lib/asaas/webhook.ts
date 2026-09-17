/**
 * Webhook do Asaas — envelope Zod, sanitização e mapeamento evento→tipo interno.
 *
 * Envelope NÃO medido (sandbox compartilhado com o ERP — nenhum webhook criado
 * nele). O schema é PERMISSIVO de propósito: só exige o que o handler usa
 * (`event`, `payment.id/customer/status/value/dueDate`); o resto passa por
 * `.passthrough()`. Ver ruling do controller na Task 6.
 */
import { z } from "zod";

export const envelopeSchema = z.object({
  event: z.string(),
  payment: z
    .object({
      id: z.string(),
      customer: z.string(),
      status: z.string(),
      value: z.number(),
      dueDate: z.string(),
    })
    .passthrough(),
});
export type AsaasEnvelope = z.infer<typeof envelopeSchema>;

export type TipoInternoAsaas =
  | "asaas.payment_overdue"
  | "asaas.payment_received"
  | "asaas.payment_deleted"
  | "asaas.payment_updated";

/** Mapeia o `event` bruto do Asaas para o tipo interno do event_log. Fora da lista de interesse → null. */
export function tipoInterno(event: string): TipoInternoAsaas | null {
  switch (event) {
    case "PAYMENT_OVERDUE":
      return "asaas.payment_overdue";
    case "PAYMENT_RECEIVED":
    case "PAYMENT_CONFIRMED":
    case "PAYMENT_RECEIVED_IN_CASH":
      return "asaas.payment_received";
    case "PAYMENT_DELETED":
    case "PAYMENT_REFUNDED":
      return "asaas.payment_deleted";
    case "PAYMENT_UPDATED":
      return "asaas.payment_updated";
    default:
      return null;
  }
}

const CHAVES_SENSIVEIS = new Set(["cpfCnpj", "creditCard", "creditCardHolderInfo"]);

function sanitizarValor(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sanitizarValor);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = CHAVES_SENSIVEIS.has(k) ? "[redigido]" : sanitizarValor(val);
    }
    return out;
  }
  return v;
}

/**
 * Substitui os valores de `cpfCnpj`, `creditCard` e `creditCardHolderInfo` (em
 * qualquer profundidade) por `"[redigido]"`. `rawBody` sai do `JSON.stringify`
 * do parsed já sanitizado — nunca regex sobre o texto bruto.
 */
export function sanitizar(_raw: string, parsed: unknown): { rawBody: string; payloadParsed: Record<string, unknown> } {
  const payloadParsed = sanitizarValor(parsed) as Record<string, unknown>;
  return { rawBody: JSON.stringify(payloadParsed), payloadParsed };
}
