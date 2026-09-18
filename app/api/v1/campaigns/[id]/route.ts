/**
 * PATCH /api/v1/campaigns/:id — corrige a campanha enquanto ela é RASCUNHO.
 *
 * Existe porque a alternativa é recriar: a primeira campanha do produto teve o
 * texto reprovado pelo dono ("mensagem chumbada com bom dia"), e sem esta rota
 * o conserto seria apagar e montar a audiência de novo. Campanha que não se
 * corrige empurra o operador a disparar o texto errado por preguiça.
 *
 * Só em `draft`, e só estes campos. Depois de começar, o texto é histórico:
 * quem já recebeu recebeu aquilo, e mudar o corpo faria o relatório descrever
 * uma mensagem que nunca foi enviada.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { baseLegalValida } from "@/lib/campanha/decisao";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const patchSchema = z.strictObject({
  name: z.string().trim().min(1).max(120).optional(),
  template_body: z.string().trim().min(1).max(4000).optional(),
  lia_ref: z.string().trim().min(1).max(200).nullable().optional(),
  intervalo_segundos: z.number().int().min(30).max(86400).nullable().optional(),
  janela_inicio_hora: z.number().int().min(0).max(23).nullable().optional(),
  janela_fim_hora: z.number().int().min(1).max(24).nullable().optional(),
  teto_diario: z.number().int().min(1).max(1000).nullable().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const { id } = await ctx.params;
  if (!UUID_RX.test(id)) return fail("invalid_request", "id inválido.", 400, { requestId });

  const authz = await requireRole("admin", { requestId, resource: "campaigns" });
  if (!authz.ok) return authz.response;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", "Campos inválidos.", 422, { requestId });
  if (Object.keys(parsed.data).length === 0) {
    return fail("validation_failed", "Nada para mudar.", 422, { requestId });
  }

  const admin = createAdminClient();
  const { data: campanha } = await admin
    .from("campaigns")
    .select("id, status, base_legal, lia_ref")
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!campanha) return fail("not_found", "Campanha não encontrada.", 404, { requestId });
  if (campanha.status !== "draft") {
    return fail("conflict", "Só dá para corrigir enquanto a campanha é rascunho.", 409, { requestId });
  }

  // Apagar a referência da LIA numa campanha de interesse legítimo é tirar a
  // base legal por baixo dela — o CHECK do banco recusaria, e uma 500 seria
  // resposta pior do que a frase que explica.
  if (parsed.data.lia_ref !== undefined) {
    const valida = baseLegalValida({ baseLegal: campanha.base_legal as string, liaRef: parsed.data.lia_ref });
    if (!valida) {
      return fail("validation_failed", "Interesse legítimo exige a referência da avaliação (LIA).", 422, { requestId });
    }
  }

  const { data, error } = await admin
    .from("campaigns")
    .update(parsed.data)
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .select("id, name, status, template_body, lia_ref, intervalo_segundos, janela_inicio_hora, janela_fim_hora, teto_diario")
    .single();
  if (error || !data) return fail("internal_error", "Não foi possível salvar.", 500, { requestId });

  return ok(data, { requestId });
}
