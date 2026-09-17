import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * POST /api/v1/companies/[id]/asaas-link — vincular pelo customer id do Asaas
 * já conhecido (botão "Vincular" do aviso `charge_unmatched` na Central).
 * Vínculo pelo CNPJ digitado pelo operador é a rota irmã `[id]/asaas` (§5.2a).
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { traduzir } from "@/lib/i18n/dicionario";
import { validateRequest } from "@/lib/schemas";
import { vincularPeloOperador } from "@/lib/asaas/titular";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/api/types";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ customer_id: z.string().min(1) });

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

  let input: { customer_id: string };
  try {
    input = (await validateRequest(bodySchema, req)) as { customer_id: string };
  } catch (err) {
    if (err instanceof ApiError) return fail(err.code, err.message, err.status, { details: err.details as Record<string, unknown> | undefined, requestId });
    throw err;
  }

  const admin = createAdminClient();
  const { data: empresa, error } = await admin
    .from("crm_companies")
    .select("id")
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .maybeSingle();
  if (error) return fail("internal_error", error.message, 500, { requestId });
  if (!empresa) return fail("not_found", t("Empresa não encontrada."), 404, { requestId });

  try {
    await vincularPeloOperador(admin, authz.org.orgId, { kind: "company", id }, input.customer_id);
    await audit({
      action: "asaas.company_linked",
      actorUserId: authz.user.id,
      organizationId: authz.org.orgId,
      resourceType: "company",
      resourceId: id,
      requestId,
      metadata: { customer_id: input.customer_id },
    });
    return ok({ linked: true }, { requestId });
  } catch (err) {
    if (err instanceof Error && err.message.includes("já está vinculado a outro cadastro")) {
      return fail("customer_ja_vinculado", t("Este cliente do Asaas já está vinculado a outro cadastro."), 409, { requestId });
    }
    throw err;
  }
}
