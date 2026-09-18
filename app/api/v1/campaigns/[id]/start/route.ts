/**
 * POST /api/v1/campaigns/:id/start — começa (ou retoma) a campanha.
 * POST com `{ "pause": true }` — pausa.
 *
 * É o gesto que faz mensagem sair para gente de verdade, então ele confere as
 * condições AQUI em vez de confiar que a tela conferiu: número vivo, audiência
 * não vazia e base legal declarada. A tela pode ser contornada; esta rota não.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { baseLegalValida } from "@/lib/campanha/decisao";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const corpoSchema = z.strictObject({ pause: z.boolean().optional() });

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const { id } = await ctx.params;
  if (!UUID_RX.test(id)) return fail("invalid_request", "id inválido.", 400, { requestId });

  const authz = await requireRole("admin", { requestId, resource: "campaigns" });
  if (!authz.ok) return authz.response;

  const parsed = corpoSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail("validation_failed", "Campos inválidos.", 422, { requestId });
  const pausar = parsed.data.pause === true;

  const admin = createAdminClient();
  const { data: campanha } = await admin
    .from("campaigns")
    .select("id, status, base_legal, lia_ref, channel_session_id")
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!campanha) return fail("not_found", "Campanha não encontrada.", 404, { requestId });

  if (pausar) {
    await admin.from("campaigns").update({ status: "paused" }).eq("id", id).eq("status", "running");
    void audit({
      action: "campaign.paused",
      actorUserId: authz.user.id,
      organizationId: authz.org.orgId,
      resourceType: "campaign",
      resourceId: id,
      requestId,
    });
    return ok({ status: "paused" }, { requestId });
  }

  if (campanha.status === "done" || campanha.status === "cancelled") {
    return fail("conflict", "Esta campanha já terminou.", 409, { requestId });
  }

  if (!baseLegalValida({ baseLegal: campanha.base_legal as string, liaRef: (campanha.lia_ref as string | null) ?? null })) {
    return fail("validation_failed", "Sem base legal declarada, a campanha não pode começar.", 422, { requestId });
  }

  const { data: canal } = await admin
    .from("channel_sessions")
    .select("id, status")
    .eq("organization_id", authz.org.orgId)
    .eq("id", campanha.channel_session_id)
    .is("archived_at", null)
    .maybeSingle();
  if (!canal) return fail("not_found", "O número desta campanha não existe mais.", 404, { requestId });
  if ((canal as { status: string }).status !== "WORKING") {
    return fail("conflict", "O número desta campanha não está conectado.", 409, { requestId });
  }

  const { count } = await admin
    .from("campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", id)
    .eq("status", "pending");
  if (!count) return fail("conflict", "Não há ninguém pendente nesta campanha.", 409, { requestId });

  await admin
    .from("campaigns")
    .update({ status: "running", started_at: campanha.status === "draft" ? new Date().toISOString() : undefined })
    .eq("id", id);

  void audit({
    action: "campaign.started",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "campaign",
    resourceId: id,
    requestId,
    metadata: { pendentes: count },
  });

  return ok({ status: "running", pendentes: count }, { requestId });
}
