/**
 * POST /api/v1/campaigns/:id/recipients — monta a audiência (contatos já
 * existentes na organização).
 *
 * Aceita `contact_ids` explícitos. NÃO aceita "todos os contatos": uma
 * audiência sem recorte é o pedido que ninguém consegue revisar antes de
 * apertar, e é assim que 500 pessoas recebem por engano.
 *
 * Só em campanha `draft`: mexer na lista com a campanha rodando mudaria o
 * denominador do relatório no meio da corrida.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const corpoSchema = z.strictObject({
  // 500 é o mesmo teto do import de CSV (`CSV_MAX_DATA_ROWS`): uma régua só
  // para "quanta gente entra de uma vez", em vez de duas que divergem.
  contact_ids: z.array(z.string().uuid()).min(1).max(500),
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
  if (!parsed.success) return fail("validation_failed", "Campos inválidos.", 422, { requestId });

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

  // Os contatos são DESTA organização? Service role ignora RLS.
  const { data: contatos } = await admin
    .from("contacts")
    .select("id")
    .eq("organization_id", authz.org.orgId)
    .in("id", parsed.data.contact_ids);
  const validos = (contatos ?? []).map((c) => c.id as string);
  if (validos.length === 0) return fail("not_found", "Nenhum contato desta organização na lista.", 404, { requestId });

  // `ignoreDuplicates`: reenviar a mesma lista não duplica destinatário nem
  // falha — a unicidade é `(campaign_id, contact_id)` no banco.
  const { error } = await admin.from("campaign_recipients").upsert(
    validos.map((contactId) => ({
      organization_id: authz.org.orgId,
      campaign_id: id,
      contact_id: contactId,
    })),
    { onConflict: "campaign_id,contact_id", ignoreDuplicates: true },
  );
  if (error) return fail("internal_error", "Não foi possível montar a audiência.", 500, { requestId });

  const { count } = await admin
    .from("campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", id);

  return ok(
    { adicionados: validos.length, ignorados: parsed.data.contact_ids.length - validos.length, total: count ?? 0 },
    { requestId },
  );
}
