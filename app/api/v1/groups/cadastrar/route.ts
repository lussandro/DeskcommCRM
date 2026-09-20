/**
 * POST /api/v1/groups/cadastrar — porta de entrada do módulo de grupos.
 *
 * `sincronizarGrupo` (Task 5) só ATUALIZA grupo já cadastrado; esta rota
 * insere a linha em `whatsapp_groups` e faz a carga inicial de metadados +
 * participantes, reusando `sincronizarGrupo` para o UPSERT em vez de
 * reescrever o laço. Daí em diante, os eventos `group.v2.*` mantêm o grupo
 * em dia.
 *
 * organization_id sempre da sessão (nunca do body). Role mínimo: manager.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { listarGrupos, lerParticipantes, type ConfigWaha } from "@/lib/waha/client-grupos";
import { sincronizarGrupo } from "@/lib/grupos/sincronizar";

export const dynamic = "force-dynamic";

const corpoSchema = z.object({
  wa_group_id: z.string().min(1),
  channel_session_id: z.string().uuid(),
});

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  // Acompanhamento administrativo só-leitura não escreve em grupo.
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const authz = await requireRole("manager", { requestId, resource: "whatsapp_groups" });
  if (!authz.ok) return authz.response;
  const { user, org: activeOrg } = authz;

  const parsed = corpoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("invalid_input", parsed.error.issues[0]?.message ?? "Corpo inválido.", 400, { requestId });
  }
  const { wa_group_id, channel_session_id } = parsed.data;

  const supabase = await createClient();
  const { data: sessao, error: sessaoErr } = await supabase
    .from("channel_sessions")
    .select("id, waha_session_name")
    .eq("organization_id", activeOrg.orgId)
    .eq("id", channel_session_id)
    .maybeSingle();
  if (sessaoErr) return fail("internal_error", sessaoErr.message, 500, { requestId });
  if (!sessao || !sessao.waha_session_name) {
    return fail("not_found", "Conexão WhatsApp não encontrada nesta organização.", 404, { requestId });
  }

  const baseUrl = process.env.WAHA_API_BASE_URL;
  const apiKey = process.env.WAHA_API_KEY;
  if (!baseUrl || !apiKey) {
    return fail("waha_not_configured", "WAHA_API_BASE_URL e/ou WAHA_API_KEY ausentes.", 503, { requestId });
  }
  const cfg: ConfigWaha = { baseUrl, apiKey };

  const admin = createAdminClient();

  // INSERT idempotente: `on conflict` na unique devolve o existente em vez
  // de erro (doutrina de idempotência — CLAUDE.md).
  const { data: inserido, error: insErr } = await admin
    .from("whatsapp_groups")
    .insert({
      organization_id: activeOrg.orgId,
      channel_session_id,
      wa_group_id,
      modo: "vigiado",
    })
    .select("id")
    .single();

  let grupoId: string;
  if (insErr) {
    if (insErr.code !== "23505") return fail("internal_error", insErr.message, 500, { requestId });
    const { data: existente, error: selErr } = await admin
      .from("whatsapp_groups")
      .select("id")
      .eq("organization_id", activeOrg.orgId)
      .eq("channel_session_id", channel_session_id)
      .eq("wa_group_id", wa_group_id)
      .single();
    if (selErr || !existente) return fail("internal_error", selErr?.message ?? "grupo não encontrado", 500, { requestId });
    grupoId = existente.id as string;
  } else {
    grupoId = inserido.id as string;
  }

  // Carga inicial: metadados por listarGrupos + participantes ricos (pn
  // resolvido) por lerParticipantes — a spec §6.3 pede as duas chamadas.
  // O UPSERT em si é feito por sincronizarGrupo, não reescrito aqui.
  let grupos;
  try {
    grupos = await listarGrupos(cfg, sessao.waha_session_name);
  } catch (e) {
    return fail("waha_unreachable", e instanceof Error ? e.message : String(e), 502, { requestId });
  }
  const metadados = grupos.find((g) => g.id === wa_group_id);
  if (!metadados) {
    return fail("not_found", "Grupo não encontrado no WhatsApp desta conexão.", 404, { requestId });
  }

  let participantes;
  try {
    participantes = await lerParticipantes(cfg, sessao.waha_session_name, wa_group_id);
  } catch (e) {
    return fail("waha_unreachable", e instanceof Error ? e.message : String(e), 502, { requestId });
  }

  await sincronizarGrupo(admin, activeOrg.orgId, channel_session_id, {
    ...metadados,
    participants: participantes.length > 0 ? participantes : metadados.participants,
  });

  void audit({
    action: "group.registered",
    actorUserId: user.id,
    organizationId: activeOrg.orgId,
    resourceType: "whatsapp_group",
    resourceId: grupoId,
    requestId,
    metadata: { wa_group_id, channel_session_id, subject: metadados.subject },
  });

  return ok({ id: grupoId }, { requestId, status: 201 });
}
