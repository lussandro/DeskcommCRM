/**
 * POST /api/v1/campaigns/audiencia — quantos o filtro alcança, SEM campanha.
 *
 * Existe para a tela poder perguntar "quem entra?" antes de criar nada. A
 * alternativa seria criar um rascunho só para ver a conta, e aí a lista de
 * campanhas encheria de rascunhos abandonados — o operador aprenderia a
 * ignorar a própria lista, que é como uma tela de campanha morre.
 *
 * Mesma função de filtro da materialização (`lib/campanha/audiencia.ts`): a
 * prévia que mente é pior que prévia nenhuma.
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

const corpoSchema = z.strictObject({ filtro: filtroDeAudienciaSchema });

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "campaigns" });
  if (!authz.ok) return authz.response;

  const parsed = corpoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", parsed.error.issues[0]?.message ?? "Campos inválidos.", 422, { requestId });
  }
  const { filtro } = parsed.data;

  const admin = createAdminClient();
  let consulta = admin
    .from("contacts")
    .select("id, phone_number, tags, is_blocked, is_anonymized, name, display_name")
    .eq("organization_id", authz.org.orgId)
    .is("is_merged_into", null);
  if (filtro.com_tags && filtro.com_tags.length > 0) consulta = consulta.contains("tags", filtro.com_tags);
  const { data, error } = await consulta;
  if (error) return fail("internal_error", "Não foi possível ler os contatos.", 500, { requestId });

  const universo = (data ?? []) as Array<ContatoParaFiltrar & { name: string | null; display_name: string | null }>;
  const lote = aplicarFiltro(universo, filtro);

  return ok(
    {
      alcancados: quantosAlcanca(universo, filtro),
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
