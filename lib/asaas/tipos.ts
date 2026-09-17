export type AsaasAmbiente = "sandbox" | "producao";
export const ASAAS_BASE_URLS: Record<AsaasAmbiente, string> = {
  sandbox: "https://api-sandbox.asaas.com/v3",
  producao: "https://api.asaas.com/v3",
};
export type AsaasStatus = "PENDING" | "OVERDUE" | "RECEIVED" | "CONFIRMED" | "RECEIVED_IN_CASH" | "REFUNDED" | "DELETED" | string;
/** Medido em sandbox (docs/superpowers/specs/asaas-sandbox-medido-crm.md): "pago" é esta tríade. */
export const STATUS_PAGO = new Set<AsaasStatus>(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]);
export interface AsaasPayment {
  id: string; customer: string; status: AsaasStatus; value: number; dueDate: string;
  billingType: "BOLETO" | "PIX" | "CREDIT_CARD" | "UNDEFINED" | string;
  invoiceUrl?: string | null; bankSlipUrl?: string | null; paymentDate?: string | null; description?: string | null;
}
export interface AsaasCustomer { id: string; name: string; cpfCnpj: string; mobilePhone?: string | null; phone?: string | null }
export interface AsaasList<T> { data: T[]; hasMore: boolean; totalCount: number }
export interface AsaasWebhook { id: string; url: string; enabled: boolean; interrupted: boolean }
/** Só o que a spec §3 lista; o resto é ignorado pelo Zod do webhook (Task 6). */
export const EVENTOS_DE_INTERESSE = ["PAYMENT_OVERDUE","PAYMENT_RECEIVED","PAYMENT_CONFIRMED","PAYMENT_DELETED","PAYMENT_REFUNDED","PAYMENT_UPDATED"] as const;
export type EventoAsaas = (typeof EVENTOS_DE_INTERESSE)[number];
