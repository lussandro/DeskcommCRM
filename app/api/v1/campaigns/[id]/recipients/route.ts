/**
 * POST /api/v1/campaigns/:id/recipients — monta a audiência por FILTRO.
 *
 * `previa: true` só conta e devolve amostra; sem ela, grava os destinatários.
 * A MESMA função decide as duas coisas (`lib/campanha/audiencia.ts`) — duas
 * implementações divergiriam no dia em que alguém mexesse numa, e a divergência
 * apareceria como "a prévia dizia 30 e foram 47".
 *
 * Não existe "todos os contatos": o schema exige pelo menos um critério.
 * Audiência sem recorte é o pedido que ninguém revisa antes de apertar.
 *
 * Só em campanha `draft` — mexer na lista com a campanha rodando mudaria o
 * denominador do relatório no meio da corrida.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { aplicarFiltro, filtroDeAudienciaSchema, quantosAlcanca, type ContatoParaFiltrar } from "@/lib/campanha/audiencia";
import { rotuloDoContato } from "@/lib/contacts/rotulo-do-contato";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const corpoSchema = z.strictObject({
  filtro: filtroDeAudienciaSchema,
  previa: z.boolean().optional(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const { id } = await ctx.params;
  if (!UUID_RX.test(id)) return fail("invalid_request", "id inválido.", 400, { requestId });

  const authz = await requireRole("admin", { requestId, resource: "campaigns" });
  if (!authz.ok) return authz.response;

  const parsed = corpoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", parsed.error.issues[0]?.message ?? "Campos inválidos.", 422, { requestId });
  }
  const { filtro, previa } = parsed.data;

  const admin = createAdminClient();
  const { data: campanha } = await admin
    .from("campaigns")
    .select("id, status")
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!campanha) return fail("not_found", "Campanha não encontrada.", 404, { requestId });
  if (campanha.status !== "draft") {
    return fail("conflict", "A audiência só muda enquanto a campanha é rascunho.", 409, { requestId });
  }

  // O recorte por tag desce para o banco (índice GIN em `tags`); DDD e os vetos
  // ficam na função pura, porque prefixo de telefone não tem índice e a régua
  // precisa ser a mesma da prévia.
  let consulta = admin
    .from("contacts")
    .select("id, phone_number, tags, is_blocked, is_anonymized, name, display_name")
    .eq("organization_id", authz.org.orgId)
    .is("is_merged_into", null);
  if (filtro.com_tags && filtro.com_tags.length > 0) consulta = consulta.contains("tags", filtro.com_tags);
  const { data: contatos, error } = await consulta;
  if (error) return fail("internal_error", "Não foi possível ler os contatos.", 500, { requestId });

  const universo = (contatos ?? []) as Array<ContatoParaFiltrar & { name: string | null; display_name: string | null }>;
  const alcancados = quantosAlcanca(universo, filtro);
  const lote = aplicarFiltro(universo, filtro);

  if (previa) {
    return ok(
      {
        alcancados,
        neste_lote: lote.length,
        amostra: lote.slice(0, 5).map((c) => {
          const cheio = universo.find((u) => u.id === c.id)!;
          return rotuloDoContato({
            name: cheio.name,
            display_name: cheio.display_name,
            phone_number: cheio.phone_number,
          });
        }),
      },
      { requestId },
    );
  }

  const { error: insErr } = await admin.from("campaign_recipients").upsert(
    lote.map((c) => ({ organization_id: authz.org.orgId, campaign_id: id, contact_id: c.id })),
    { onConflict: "campaign_id,contact_id", ignoreDuplicates: true },
  );
  if (insErr) return fail("internal_error", "Não foi possível montar a audiência.", 500, { requestId });

  const { count } = await admin
    .from("campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", id);

  return ok({ alcancados, adicionados: lote.length, total: count ?? 0 }, { requestId });
}
