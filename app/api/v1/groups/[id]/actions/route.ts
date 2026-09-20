/**
 * POST /api/v1/groups/{id}/actions — ação manual do operador.
 *
 * Fatia 1: só ação HUMANA (`decidido_por: "humano"`). A escada automática
 * da IA entra na fatia 2 e passará por este mesmo caminho.
 *
 * `add` NÃO é oferecido: medido, ele devolve 451 para número que não
 * aceita ser adicionado, e o caminho suportado é o link de convite.
 *
 * ⚠️ Nunca marca `status='concluida'` olhando o HTTP do WAHA — só
 * `pos_condicao_ok === true` autoriza (ver lib/grupos/executar-acao.ts).
 * organization_id sempre da sessão, nunca do body.
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
import { chamarAcaoDeParticipante, lerParticipantes, type ConfigWaha, type RotaDeParticipante } from "@/lib/waha/client-grupos";
import { executarAcaoDeGrupo } from "@/lib/grupos/executar-acao";
import type { PapelDeMembro } from "@/lib/grupos/tipos";

export const dynamic = "force-dynamic";

const corpo = z.object({
  member_id: z.string().uuid(),
  acao: z.enum(["remover", "promover", "rebaixar", "silenciar"]),
  silenciar_ate: z.string().datetime().optional(),
});

const ACOES_QUE_EXIGEM_ADMIN = new Set(["remover", "promover", "rebaixar"]);

/** Papel de destino na tabela de membros quando a ação de fato mudou o WhatsApp. */
function papelAposAcao(acao: string, atual: PapelDeMembro): PapelDeMembro {
  if (acao === "promover") return "admin";
  if (acao === "rebaixar") return "participant";
  if (acao === "remover") return "left";
  return atual;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const requestId = randomUUID();

  // Acompanhamento administrativo só-leitura não move ninguém de grupo.
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  // Piso de papel: remover alguém de um grupo é DESTRUTIVO e o CRM não
  // desfaz — `participants/add` devolve 451 para quem não tem o número
  // salvo, então a volta é só por link de convite, com a pessoa aceitando.
  // Sem este gate, um `viewer` esvaziava um grupo de 500. O cadastro
  // (POST /groups/cadastrar) já exige `manager`; a ação destrutiva não
  // pode ser mais frouxa que ele.
  const authz = await requireRole("manager", { requestId, resource: "whatsapp_groups" });
  if (!authz.ok) return authz.response;
  const user = authz.user;
  const activeOrg = { orgId: authz.org.orgId };

  const parsed = corpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("invalid_input", parsed.error.issues[0]?.message ?? "Corpo inválido.", 400, { requestId });
  }
  const entrada = parsed.data;
  const { id: groupId } = await ctx.params;

  const supabase = await createClient();
  const { data: grupo, error: grupoErr } = await supabase
    .from("whatsapp_groups")
    .select("id, wa_group_id, channel_session_id, somos_admin")
    .eq("organization_id", activeOrg.orgId)
    .eq("id", groupId)
    .maybeSingle();
  if (grupoErr) return fail("internal_error", grupoErr.message, 500, { requestId });
  if (!grupo) return fail("not_found", "Grupo não encontrado.", 404, { requestId });

  const { data: membro, error: membroErr } = await supabase
    .from("whatsapp_group_members")
    .select("id, wa_lid, wa_pn, role")
    .eq("organization_id", activeOrg.orgId)
    .eq("group_id", grupo.id)
    .eq("id", entrada.member_id)
    .maybeSingle();
  if (membroErr) return fail("internal_error", membroErr.message, 500, { requestId });
  if (!membro) return fail("not_found", "Membro não encontrado.", 404, { requestId });

  if (ACOES_QUE_EXIGEM_ADMIN.has(entrada.acao) && !grupo.somos_admin) {
    return fail("group_not_admin", "A sessão do WhatsApp não é administradora deste grupo.", 409, { requestId });
  }

  const { data: sessao, error: sessaoErr } = await supabase
    .from("channel_sessions")
    .select("waha_session_name")
    .eq("organization_id", activeOrg.orgId)
    .eq("id", grupo.channel_session_id)
    .maybeSingle();
  if (sessaoErr) return fail("internal_error", sessaoErr.message, 500, { requestId });
  if (!sessao?.waha_session_name) {
    return fail("not_found", "Conexão WhatsApp não encontrada nesta organização.", 404, { requestId });
  }

  const baseUrl = process.env.WAHA_API_BASE_URL;
  const apiKey = process.env.WAHA_API_KEY;
  if (!baseUrl || !apiKey) {
    return fail("waha_not_configured", "WAHA_API_BASE_URL e/ou WAHA_API_KEY ausentes.", 503, { requestId });
  }
  const cfg: ConfigWaha = { baseUrl, apiKey };

  const admin = createAdminClient();

  const { data: acaoInserida, error: insErr } = await admin
    .from("whatsapp_group_actions")
    .insert({
      organization_id: activeOrg.orgId,
      group_id: grupo.id,
      member_id: membro.id,
      acao: entrada.acao,
      decidido_por: "humano",
      aprovado_por_user_id: user.id,
      status: "pendente",
    })
    .select("id")
    .single();
  if (insErr) return fail("internal_error", insErr.message, 500, { requestId });
  const acaoId = acaoInserida.id as string;

  await admin
    .from("whatsapp_group_actions")
    .update({ status: "executando" })
    .eq("id", acaoId)
    .eq("organization_id", activeOrg.orgId);

  const deps = {
    chamarAcao: (s: string, g: string, r: RotaDeParticipante, j: string[]) =>
      chamarAcaoDeParticipante(cfg, s, g, r, j),
    lerParticipantes: (s: string, g: string) => lerParticipantes(cfg, s, g),
  };
  const resultado = await executarAcaoDeGrupo(deps, {
    acao: entrada.acao,
    waGroupId: grupo.wa_group_id,
    sessao: sessao.waha_session_name,
    alvoLid: membro.wa_lid,
    alvoJid: membro.wa_pn ?? membro.wa_lid,
    papelAtual: membro.role as PapelDeMembro,
  });

  await admin
    .from("whatsapp_group_actions")
    .update({
      status: resultado.posCondicaoOk ? "concluida" : "falhou",
      waha_http_status: resultado.httpStatus,
      waha_status_participante: resultado.statusParticipante,
      waha_resposta: resultado.respostaCrua as never,
      pos_condicao_ok: resultado.posCondicaoOk,
      erro_texto: resultado.erroTexto,
      executada_em: new Date().toISOString(),
    })
    .eq("id", acaoId)
    .eq("organization_id", activeOrg.orgId);

  if (resultado.posCondicaoOk) {
    if (entrada.acao === "silenciar") {
      await admin
        .from("whatsapp_group_members")
        .update({ silenciado_ate: entrada.silenciar_ate ?? null })
        .eq("id", membro.id)
        .eq("organization_id", activeOrg.orgId);
    } else if (entrada.acao === "remover") {
      await admin
        .from("whatsapp_group_members")
        .update({ role: "left", saiu_em: new Date().toISOString() })
        .eq("id", membro.id)
        .eq("organization_id", activeOrg.orgId);
    } else {
      await admin
        .from("whatsapp_group_members")
        .update({ role: papelAposAcao(entrada.acao, membro.role as PapelDeMembro) })
        .eq("id", membro.id)
        .eq("organization_id", activeOrg.orgId);
    }
  }

  void audit({
    action: "group.action_executed",
    actorUserId: user.id,
    organizationId: activeOrg.orgId,
    resourceType: "whatsapp_group_action",
    resourceId: acaoId,
    requestId,
    metadata: { group_id: grupo.id, member_id: membro.id, acao: entrada.acao, pos_condicao_ok: resultado.posCondicaoOk },
  });

  return ok(
    {
      action_id: acaoId,
      status: resultado.posCondicaoOk ? "concluida" : "falhou",
      pos_condicao_ok: resultado.posCondicaoOk,
      erro_texto: resultado.erroTexto,
      waha_status_participante: resultado.statusParticipante,
    },
    { requestId },
  );
}
