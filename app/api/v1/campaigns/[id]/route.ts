/**
 * GET   /api/v1/campaigns/:id — a campanha, com os números do snapshot.
 * PATCH /api/v1/campaigns/:id — edita o RASCUNHO.
 *
 * Só rascunho aceita edição: depois da preparação, cada destinatário carrega o
 * texto congelado com que foi preparado, e mudar a campanha ali faria a tela
 * mostrar um texto e a fila enviar outro. Para editar, volta-se ao rascunho
 * (o que invalida a lista) — e isso só vale enquanto nada saiu.
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { carregarCampanha } from "@/lib/campanhas/acoes";
import { ehEditavel } from "@/lib/campanhas/maquina-de-estados";
import { editarCampanhaSchema } from "@/lib/campanhas/schemas";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const COLUNAS =
  "id, name, description, status, channel_session_id, message_body, base_legal, lia_ref, " +
  "audience_filter, audience_version, content_version, snapshot_total, snapshot_eligible, " +
  "snapshot_excluded, scheduled_at, prepared_at, started_at, paused_at, completed_at, " +
  "cancelled_at, failure_code, intervalo_segundos, janela_inicio_hora, janela_fim_hora, " +
  "teto_diario, teto_horario, created_at, created_by";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "campaigns" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id } = await ctx.params;

  const supabase = await createClient();
  const { data } = await supabase
    .from("campaigns")
    .select(COLUNAS)
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!data) return fail("campanha_nao_encontrada", t("Campanha não encontrada."), 404, { requestId });

  return ok(data, { requestId });
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const negado = await requireSupportWrite();
  if (negado) return negado;

  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "campaigns" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id } = await ctx.params;

  const parsed = editarCampanhaSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", t("Dados inválidos."), 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }
  const entrada = parsed.data;

  // Client ADMIN na escrita (ver o comentário em `campaigns/route.ts`): o papel
  // `authenticated` só tem SELECT. O GET acima segue na sessão de propósito —
  // ali a RLS é a segunda tranca, de graça.
  const supabase = createAdminClient();
  const carregada = await carregarCampanha(supabase, authz.org.orgId, id);
  if (!carregada.ok) {
    return fail(carregada.codigo, t(carregada.mensagem), carregada.status, { requestId });
  }
  const campanha = carregada.campanha;
  if (!ehEditavel(campanha.status)) {
    return fail(
      "campanha_nao_editavel",
      t("Só um rascunho pode ser editado. Volte a campanha para rascunho para mudar a lista ou o texto."),
      409,
      { requestId },
    );
  }

  const baseLegal = entrada.base_legal ?? campanha.base_legal;
  const liaRef = entrada.lia_ref === undefined ? campanha.lia_ref : entrada.lia_ref;
  if (baseLegal === "legitimate_interest" && (liaRef ?? "").trim() === "") {
    return fail(
      "campanha_base_legal_invalida",
      t("Interesse legítimo exige a referência da avaliação (LIA)."),
      422,
      { requestId },
    );
  }

  const mudanca: Record<string, unknown> = { updated_by: authz.user.id };
  for (const campo of [
    "name",
    "description",
    "message_body",
    "audience_filter",
    "intervalo_segundos",
    "janela_inicio_hora",
    "janela_fim_hora",
    "teto_diario",
    "teto_horario",
    "channel_session_id",
  ] as const) {
    if (entrada[campo] !== undefined) mudanca[campo] = entrada[campo];
  }
  if (entrada.base_legal !== undefined) mudanca.base_legal = entrada.base_legal;
  if (entrada.lia_ref !== undefined) mudanca.lia_ref = entrada.lia_ref;
  // Mexer no TEXTO sobe a versão do conteúdo: é ela que o destinatário carrega,
  // e é por ela que se sabe se a mensagem preparada é a mensagem de hoje.
  if (entrada.message_body !== undefined && entrada.message_body !== campanha.message_body) {
    mudanca.content_version = campanha.content_version + 1;
  }

  if (entrada.channel_session_id !== undefined) {
    const { data: canal } = await supabase
      .from("channel_sessions")
      .select("id")
      .eq("organization_id", authz.org.orgId)
      .eq("id", entrada.channel_session_id)
      .maybeSingle();
    if (!canal) {
      return fail(
        "campanha_canal_indisponivel",
        t("Escolha uma conexão de WhatsApp desta organização."),
        409,
        { requestId },
      );
    }
  }

  const { data, error } = await supabase
    .from("campaigns")
    .update(mudanca)
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .eq("status", "draft")
    .select(COLUNAS)
    .maybeSingle();
  if (error) return fail("internal_error", error.message, 500, { requestId });
  if (!data) {
    return fail(
      "campanha_nao_editavel",
      t("O estado da campanha mudou enquanto esta edição era salva. Recarregue a tela."),
      409,
      { requestId },
    );
  }

  // Editar rascunho NÃO audita: nada saiu dele, e auditar cada tecla encheria o
  // log com o que não tem consequência. Quem audita são as mudanças de estado.
  return ok(data, { requestId });
}
