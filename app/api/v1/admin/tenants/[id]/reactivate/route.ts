import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * POST /api/v1/admin/tenants/[id]/reactivate (S-11.08)
 *
 * Reactivates a suspended tenant. Requires platform admin + MFA AAL2.
 * Clears status back to 'active', nulls suspended_at/reason/by.
 * 404 if tenant not found; 409 if not in 'suspended' state.
 * Emits audit + event_log domain event.
 */
import { type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { limparFilaRepresada } from "@/lib/tenancy/limpar-fila-represada";

const bodySchema = z.object({
  reason: z
    .string()
    .min(10, "Motivo deve ter ao menos 10 caracteres")
    .max(500, "Motivo deve ter no máximo 500 caracteres"),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supportDenied = await requireSupportWrite((await params).id);
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const { id: tenantId } = await params;

  let adminCtx: Awaited<ReturnType<typeof requirePlatformAdmin>>;
  try {
    adminCtx = await requirePlatformAdmin();
  } catch {
    return fail("forbidden", "Platform admin required", 403, { requestId });
  }

  // Validate body
  let body: z.infer<typeof bodySchema>;
  try {
    const raw = await req.json();
    body = bodySchema.parse(raw);
  } catch {
    return fail("validation_failed", "Invalid request body", 400, { requestId });
  }

  const admin = createAdminClient();

  // Load tenant — service role bypasses RLS intentionally
  const { data: org, error: orgError } = await admin
    .from("organizations")
    .select("id, slug, display_name, status")
    .eq("id", tenantId)
    .maybeSingle();

  if (orgError || !org) {
    return fail("not_found", "Tenant not found", 404, { requestId });
  }

  if (org.status !== "suspended") {
    return fail(
      "state_conflict",
      "Tenant is not suspended — cannot reactivate",
      409,
      { requestId },
    );
  }

  // ANTES de virar o status, e não depois: enquanto a organização ainda está
  // `suspended`, o claim a ignora e a limpeza não corre com worker em voo. Um
  // milissegundo depois do commit, o `agent-worker` já estaria drenando tudo.
  let jobsDescartados = 0;
  try {
    ({ descartados: jobsDescartados } = await limparFilaRepresada(admin, tenantId));
  } catch (err) {
    // Reativar com a fila cheia é o dano que esta task existe para impedir —
    // então a reativação FALHA e o operador tenta de novo.
    return fail(
      "internal_error",
      `Failed to clear queued work: ${err instanceof Error ? err.message : String(err)}`,
      500,
      { requestId },
    );
  }

  // Perform the UPDATE — clear all suspension fields
  const now = new Date().toISOString();
  const { error: updateError } = await admin
    .from("organizations")
    .update({
      status: "active",
      suspended_at: null,
      suspended_reason: null,
      suspended_by: null,
      updated_at: now,
    })
    .eq("id", tenantId);

  if (updateError) {
    return fail("internal_error", "Failed to reactivate tenant", 500, { requestId });
  }

  // Audit (fire-and-forget)
  void audit({
    action: "tenant.reactivated",
    actorUserId: adminCtx.user.id,
    actingAsPlatformAdmin: true,
    bypassedRls: true,
    organizationId: tenantId,
    resourceType: "organization",
    resourceId: tenantId,
    requestId,
    metadata: {
      tenant_id: tenantId,
      tenant_slug: org.slug,
      reactivated_by: adminCtx.user.id,
      reason: body.reason,
    },
  });

  // Domain event
  //
  // Continua fire-and-forget — a reativação não deve falhar por causa do aviso
  // —, mas a falha para de ser SILENCIOSA: é deste evento que pende o único
  // aviso ao operador de que N jobs foram descartados. Sem o log, eles morriam
  // e ninguém ficava sabendo.
  void admin
    .from("event_log")
    .insert({
      organization_id: tenantId,
      entity_kind: "organization",
      entity_id: tenantId,
      event_type: "tenant.reactivated",
      payload: {
        tenant_id: tenantId,
        reactivated_by: adminCtx.user.id,
        reason: body.reason,
        jobs_descartados: jobsDescartados,
      },
    })
    .then(({ error }) => {
      if (error) {
        logger.error(
          "admin-reactivate: evento tenant.reactivated não registrado — o operador não será avisado do descarte",
          { tenant_id: tenantId, jobs_descartados: jobsDescartados, error: error.message },
        );
      }
    });

  return ok({ id: tenantId, status: "active" }, { requestId });
}
