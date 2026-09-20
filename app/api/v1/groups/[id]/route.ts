/**
 * GET /api/v1/groups/{id} — detalhe do grupo.
 * PATCH /api/v1/groups/{id} — troca o modo (vigiado/semi/autonomo). Role manager+.
 *
 * organization_id sempre da sessão (nunca do body).
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const CAMPOS_DETALHE =
  "id, wa_group_id, subject, size, modo, somos_admin, announce, last_synced_at, " +
  "description, owner_pn, created_at_wa, restrict_info, member_add_mode, join_approval_mode, settings";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const requestId = randomUUID();
  const user = await loadAuthUser();
  if (!user) return fail("unauthenticated", "Auth required.", 401, { requestId });
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) return fail("forbidden_tenant", "Nenhuma organização ativa.", 403, { requestId });

  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: grupo, error } = await supabase
    .from("whatsapp_groups")
    .select(CAMPOS_DETALHE)
    .eq("organization_id", activeOrg.orgId)
    .eq("id", id)
    .maybeSingle();
  if (error) return fail("internal_error", error.message, 500, { requestId });
  if (!grupo) return fail("not_found", "Grupo não encontrado.", 404, { requestId });

  return ok(grupo, { requestId });
}

const corpoPatch = z.object({ modo: z.enum(["vigiado", "semi", "autonomo"]) });

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const requestId = randomUUID();

  // Acompanhamento administrativo só-leitura não escreve em grupo.
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const authz = await requireRole("manager", { requestId, resource: "whatsapp_groups" });
  if (!authz.ok) return authz.response;
  const { user, org: activeOrg } = authz;

  const parsed = corpoPatch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("invalid_input", parsed.error.issues[0]?.message ?? "Corpo inválido.", 400, { requestId });
  }
  const { id } = await ctx.params;
  const { modo } = parsed.data;

  const supabase = await createClient();
  const { data: grupo, error } = await supabase
    .from("whatsapp_groups")
    .update({ modo, updated_at: new Date().toISOString() })
    .eq("organization_id", activeOrg.orgId)
    .eq("id", id)
    .select("id, modo")
    .maybeSingle();
  if (error) return fail("internal_error", error.message, 500, { requestId });
  if (!grupo) return fail("not_found", "Grupo não encontrado.", 404, { requestId });

  void audit({
    action: "group.mode_changed",
    actorUserId: user.id,
    organizationId: activeOrg.orgId,
    resourceType: "whatsapp_group",
    resourceId: id,
    requestId,
    metadata: { modo },
  });

  return ok(grupo, { requestId });
}
