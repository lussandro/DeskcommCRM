/**
 * Resolução do titular da cobrança: empresa antes de contato (spec 2026-09-17 §5.3).
 *
 * O documento (CPF/CNPJ) só transita até o Asaas — nunca é persistido, nunca aparece
 * em log ou mensagem de erro (Regra nº 1).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { canonicalPhoneBR } from "@/lib/channels/phone-variants";
import type { AsaasCliente } from "./cliente";

export type Titular =
  | { kind: "company"; id: string; customerId: string; billingContactId: string | null }
  | { kind: "contact"; id: string; customerId: string };
export type SemVinculo = { kind: "sem_vinculo"; contactId: string; companyId: string | null };

export async function titularDoContato(admin: SupabaseClient, orgId: string, contactId: string): Promise<Titular | SemVinculo> {
  const { data: c } = await admin.from("contacts").select("id, company_id, asaas_customer_id").eq("organization_id", orgId).eq("id", contactId).maybeSingle();
  if (!c) return { kind: "sem_vinculo", contactId, companyId: null };
  if (c.company_id) {
    const { data: e } = await admin.from("crm_companies").select("id, asaas_customer_id, billing_contact_id").eq("organization_id", orgId).eq("id", c.company_id).maybeSingle();
    if (e?.asaas_customer_id) return { kind: "company", id: e.id, customerId: e.asaas_customer_id, billingContactId: e.billing_contact_id };
    return { kind: "sem_vinculo", contactId, companyId: c.company_id };
  }
  if (c.asaas_customer_id) return { kind: "contact", id: c.id, customerId: c.asaas_customer_id };
  return { kind: "sem_vinculo", contactId, companyId: null };
}

export async function titularPorCustomer(admin: SupabaseClient, orgId: string, customerId: string): Promise<Titular | null> {
  const { data: e } = await admin.from("crm_companies").select("id, billing_contact_id").eq("organization_id", orgId).eq("asaas_customer_id", customerId).maybeSingle();
  if (e) return { kind: "company", id: e.id, customerId, billingContactId: e.billing_contact_id };
  const { data: c } = await admin.from("contacts").select("id").eq("organization_id", orgId).eq("asaas_customer_id", customerId).maybeSingle();
  if (c) return { kind: "contact", id: c.id, customerId };
  return null;
}

function digitos(s: string | null | undefined): string { return (s ?? "").replace(/\D/g, ""); }

/** §5.3: pessoa física só. O documento NÃO é persistido; só transita até o Asaas. */
export async function vincularContatoPorDocumento(
  admin: SupabaseClient, orgId: string, contactId: string, document: string, cliente: AsaasCliente,
): Promise<{ ok: true; customerId: string } | { ok: false; motivo: "nao_encontrado" | "telefone_nao_confere" | "contato_de_empresa" }> {
  const { data: c } = await admin.from("contacts").select("id, company_id, phone_number").eq("organization_id", orgId).eq("id", contactId).maybeSingle();
  if (!c) return { ok: false, motivo: "nao_encontrado" };
  if (c.company_id) return { ok: false, motivo: "contato_de_empresa" };
  const lista = await cliente.customerPorDocumento(document);
  if (lista.data.length === 0) return { ok: false, motivo: "nao_encontrado" };
  const doContato = c.phone_number ? digitos(canonicalPhoneBR(c.phone_number)) : "";
  // Asaas permite mais de um customer por documento — confere o telefone de CADA um,
  // não só do primeiro, e liga no primeiro cujo telefone bate.
  const customer = doContato
    ? lista.data.find((cand) => {
        const doCandidato = [cand.mobilePhone, cand.phone]
          .map((p) => digitos(p))
          .filter(Boolean)
          .map((p) => (p.startsWith("55") ? p : `55${p}`))
          .map((p) => digitos(canonicalPhoneBR(`+${p}`)));
        return doCandidato.includes(doContato);
      })
    : undefined;
  if (!customer) return { ok: false, motivo: "telefone_nao_confere" };
  const { error } = await admin.from("contacts").update({ asaas_customer_id: customer.id }).eq("organization_id", orgId).eq("id", contactId);
  if (error) throw new Error(`asaas_vinculo_falhou: ${error.message}`);
  return { ok: true, customerId: customer.id };
}

/**
 * Ato humano (Central/tela): a pessoa já decidiu o vínculo, sem conferência de telefone.
 * Grava no contato ou na empresa, sempre filtrado por organization_id.
 */
export async function vincularPeloOperador(
  admin: SupabaseClient,
  orgId: string,
  alvo: { kind: "contact" | "company"; id: string },
  customerId: string,
): Promise<void> {
  const table = alvo.kind === "contact" ? "contacts" : "crm_companies";
  const { error } = await admin.from(table).update({ asaas_customer_id: customerId }).eq("organization_id", orgId).eq("id", alvo.id);
  if (error) {
    if (error.code === "23505") throw new Error("este cliente do Asaas já está vinculado a outro cadastro");
    throw new Error(`asaas_vinculo_falhou: ${error.message}`);
  }
}
