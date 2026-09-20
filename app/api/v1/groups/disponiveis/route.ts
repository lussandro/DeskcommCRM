/**
 * GET /api/v1/groups/disponiveis — grupos que o WAHA vê nas conexões
 * WhatsApp da org, com `ja_cadastrado` cruzado com `whatsapp_groups`.
 *
 * organization_id sempre da sessão (nunca do body). Erro do WAHA chega cru
 * ao usuário — nunca lista vazia mentindo "sem grupos" (Regra Nº 1).
 */
import { randomUUID } from "node:crypto";

import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { fail, ok } from "@/lib/api/wrappers";
import { createClient } from "@/lib/supabase/server";
import { STATUS_SAUDAVEL } from "@/lib/channels/health";
import { somosAdminDoGrupo } from "@/lib/grupos/tipos";
import { listarGrupos, type ConfigWaha, type GrupoWaha } from "@/lib/waha/client-grupos";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const user = await loadAuthUser();
  if (!user) return fail("unauthenticated", "Auth required.", 401, { requestId });
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) return fail("forbidden_tenant", "Nenhuma organização ativa.", 403, { requestId });

  const baseUrl = process.env.WAHA_API_BASE_URL;
  const apiKey = process.env.WAHA_API_KEY;
  if (!baseUrl || !apiKey) {
    return fail("waha_not_configured", "WAHA_API_BASE_URL e/ou WAHA_API_KEY ausentes.", 503, { requestId });
  }
  const cfg: ConfigWaha = { baseUrl, apiKey };

  const supabase = await createClient();
  const { data: sessoes, error: sessoesErr } = await supabase
    .from("channel_sessions")
    .select("id, waha_session_name, phone_number")
    .eq("organization_id", activeOrg.orgId)
    .eq("status", STATUS_SAUDAVEL)
    .not("waha_session_name", "is", null);
  if (sessoesErr) return fail("internal_error", sessoesErr.message, 500, { requestId });

  const { data: cadastradosRows, error: cadErr } = await supabase
    .from("whatsapp_groups")
    .select("wa_group_id")
    .eq("organization_id", activeOrg.orgId);
  if (cadErr) return fail("internal_error", cadErr.message, 500, { requestId });
  const cadastrados = new Set((cadastradosRows ?? []).map((r) => r.wa_group_id as string));

  const linhas: {
    wa_group_id: string;
    subject: string | null;
    size: number;
    somos_admin: boolean;
    ja_cadastrado: boolean;
    channel_session_id: string;
  }[] = [];

  for (const sessao of sessoes ?? []) {
    if (!sessao.waha_session_name) continue;
    let grupos: GrupoWaha[];
    try {
      grupos = await listarGrupos(cfg, sessao.waha_session_name);
    } catch (e) {
      // Erro cru do WAHA — nunca lista vazia (mentiria "sem grupos").
      return fail("waha_unreachable", e instanceof Error ? e.message : String(e), 502, { requestId });
    }
    for (const g of grupos) {
      linhas.push({
        wa_group_id: g.id,
        subject: g.subject,
        size: g.size ?? g.participants.length,
        // `null` (conexão sem telefone conhecido) vira `false` NESTA tela: aqui
        // é uma sugestão do que provavelmente dá para fazer, não o gate.
        somos_admin: somosAdminDoGrupo(g.participants, sessao.phone_number as string | null) ?? false,
        ja_cadastrado: cadastrados.has(g.id),
        channel_session_id: sessao.id as string,
      });
    }
  }

  return ok(linhas, { requestId });
}
