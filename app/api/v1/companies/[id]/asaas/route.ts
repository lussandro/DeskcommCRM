import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * GET  /api/v1/companies/[id]/asaas — pendências ao vivo (spec §5.2a)
 * POST /api/v1/companies/[id]/asaas — vincular a empresa a um cliente do Asaas pelo CNPJ
 *
 * Documento nunca é persistido nem devolvido ao browser — só transita até o Asaas.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { traduzir } from "@/lib/i18n/dicionario";
import { companyAsaasLinkSchema, validateRequest, type CompanyAsaasLink } from "@/lib/schemas";
import { carregarIntegracaoAsaas } from "@/lib/asaas/config";
import { AsaasErro } from "@/lib/asaas/cliente";
import { vincularPeloOperador } from "@/lib/asaas/titular";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/api/types";
import type { AsaasPayment } from "@/lib/asaas/tipos";

export const dynamic = "force-dynamic";

function projetar(p: AsaasPayment) {
  return {
    payment_id: p.id,
    status: p.status,
    billing_type: p.billingType,
    value_cents: Math.round(p.value * 100),
    due_date: p.dueDate,
    invoice_url: p.invoiceUrl ?? null,
  };
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const { id } = await ctx.params;
  const authz = await requireRole("agent", { requestId, resource: "companies" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma ?? "pt-BR");
  const admin = createAdminClient();

  const integ = await carregarIntegracaoAsaas(admin, authz.org.orgId);
  if (!integ) {
    return fail("asaas_inativo", t("A integração com o Asaas não está ativa nesta organização."), 409, { requestId });
  }

  const { data: empresa, error } = await admin
    .from("crm_companies")
    .select("id, asaas_customer_id")
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .maybeSingle();
  if (error) return fail("internal_error", error.message, 500, { requestId });
  if (!empresa) return fail("not_found", t("Empresa não encontrada."), 404, { requestId });
  if (!empresa.asaas_customer_id) return ok({ linked: false, charges: [] }, { requestId });

  try {
    const [pend, venc] = await Promise.all([
      integ.cliente.payments(empresa.asaas_customer_id, "PENDING"),
      integ.cliente.payments(empresa.asaas_customer_id, "OVERDUE"),
    ]);
    const charges = [...venc.data, ...pend.data].sort((a, b) => b.dueDate.localeCompare(a.dueDate)).map(projetar);
    return ok({ linked: true, charges }, { requestId });
  } catch (err) {
    if (err instanceof AsaasErro) return fail("asaas_error", err.descricao, 502, { requestId });
    throw err;
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const { id } = await ctx.params;
  const authz = await requireRole("agent", { requestId, resource: "companies" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma ?? "pt-BR");

  let input: CompanyAsaasLink;
  try {
    input = (await validateRequest(companyAsaasLinkSchema, req)) as CompanyAsaasLink;
  } catch (err) {
    if (err instanceof ApiError) return fail(err.code, err.message, err.status, { details: err.details as Record<string, unknown> | undefined, requestId });
    throw err;
  }

  const admin = createAdminClient();
  const integ = await carregarIntegracaoAsaas(admin, authz.org.orgId);
  if (!integ) {
    return fail("asaas_inativo", t("A integração com o Asaas não está ativa nesta organização."), 409, { requestId });
  }

  const { data: empresa, error: errEmpresa } = await admin
    .from("crm_companies")
    .select("id")
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .maybeSingle();
  if (errEmpresa) return fail("internal_error", errEmpresa.message, 500, { requestId });
  if (!empresa) return fail("not_found", t("Empresa não encontrada."), 404, { requestId });

  try {
    const lista = await integ.cliente.customerPorDocumento(input.cnpj);
    const customer = lista.data[0];
    if (!customer) {
      return fail("customer_nao_encontrado", t("Nenhum cliente no Asaas com este CNPJ."), 404, { requestId });
    }
    if (lista.data.length > 1) {
      const msg = t("Há {n} clientes no Asaas com este CNPJ; vincule pela Central usando o id do cliente.").replace("{n}", String(lista.data.length));
      return fail("customer_ambiguo", msg, 409, { requestId });
    }
    await vincularPeloOperador(admin, authz.org.orgId, { kind: "company", id }, customer.id);
    await audit({
      action: "asaas.company_linked",
      actorUserId: authz.user.id,
      organizationId: authz.org.orgId,
      resourceType: "company",
      resourceId: id,
      requestId,
      metadata: { customer_id: customer.id },
    });
    return ok({ linked: true, customer_id: customer.id }, { requestId });
  } catch (err) {
    if (err instanceof AsaasErro) return fail("asaas_error", err.descricao, 502, { requestId });
    if (err instanceof Error && err.message.includes("já está vinculado a outro cadastro")) {
      return fail("customer_ja_vinculado", t("Este cliente do Asaas já está vinculado a outro cadastro."), 409, { requestId });
    }
    throw err;
  }
}
