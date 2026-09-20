/**
 * GET /api/v1/groups — grupos cadastrados da organização ativa.
 *
 * organization_id sempre da sessão (nunca do body).
 */
import { randomUUID } from "node:crypto";

import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { fail, ok } from "@/lib/api/wrappers";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const user = await loadAuthUser();
  if (!user) return fail("unauthenticated", "Auth required.", 401, { requestId });
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) return fail("forbidden_tenant", "Nenhuma organização ativa.", 403, { requestId });

  const supabase = await createClient();
  const { data: grupos, error } = await supabase
    .from("whatsapp_groups")
    .select("id, wa_group_id, subject, size, modo, somos_admin, announce, last_synced_at")
    .eq("organization_id", activeOrg.orgId)
    .order("updated_at", { ascending: false });
  if (error) return fail("internal_error", error.message, 500, { requestId });

  return ok(
    (grupos ?? []).map((g) => ({
      id: g.id,
      wa_group_id: g.wa_group_id,
      subject: g.subject,
      size: g.size,
      modo: g.modo,
      somos_admin: g.somos_admin,
      announce: g.announce,
      last_synced_at: g.last_synced_at,
    })),
    { requestId },
  );
}
