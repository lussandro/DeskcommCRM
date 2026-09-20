/**
 * GET /api/v1/groups/{id}/members — membros do grupo.
 *
 * organization_id sempre da sessão (nunca do body).
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { fail, ok } from "@/lib/api/wrappers";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const requestId = randomUUID();
  const user = await loadAuthUser();
  if (!user) return fail("unauthenticated", "Auth required.", 401, { requestId });
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) return fail("forbidden_tenant", "Nenhuma organização ativa.", 403, { requestId });

  const { id } = await ctx.params;
  const supabase = await createClient();

  // Confere o grupo pertence à org antes de listar membros (a tabela de
  // membros também tem organization_id, mas 404 explícito > lista vazia
  // ambígua entre "sem membros" e "grupo de outra org").
  const { data: grupo, error: grupoErr } = await supabase
    .from("whatsapp_groups")
    .select("id")
    .eq("organization_id", activeOrg.orgId)
    .eq("id", id)
    .maybeSingle();
  if (grupoErr) return fail("internal_error", grupoErr.message, 500, { requestId });
  if (!grupo) return fail("not_found", "Grupo não encontrado.", 404, { requestId });

  const { data: membros, error } = await supabase
    .from("whatsapp_group_members")
    .select("id, wa_lid, wa_pn, push_name, role, contact_id, strikes, silenciado_ate, entrou_em")
    .eq("organization_id", activeOrg.orgId)
    .eq("group_id", id)
    .order("entrou_em", { ascending: true, nullsFirst: false });
  if (error) return fail("internal_error", error.message, 500, { requestId });

  return ok(
    (membros ?? []).map((m) => ({
      id: m.id,
      wa_lid: m.wa_lid,
      wa_pn: m.wa_pn,
      push_name: m.push_name,
      role: m.role,
      contact_id: m.contact_id,
      strikes: m.strikes,
      silenciado_ate: m.silenciado_ate,
      entrou_em: m.entrou_em,
    })),
    { requestId },
  );
}
