/**
 * POST /api/v1/campaigns/resolver-telefones — telefone → contato DESTA organização.
 *
 * Existe para a tela poder dizer, antes de qualquer envio, quantos números da
 * lista colada são gente que já está no CRM e quantos ficaram de fora. Sem isso
 * o operador cola 30 linhas, vê "campanha criada" e só descobre na régua que
 * metade não entrou.
 *
 * NÃO cria contato: importar é outro gesto, com outra tela e outra auditoria.
 * Esconder um import dentro de "montar campanha" é como o cadastro de uma
 * organização inteira nasce sujo.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { phoneLookupVariants } from "@/lib/channels/phone-variants";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const corpoSchema = z.strictObject({
  telefones: z.array(z.string().trim().min(8).max(24)).min(1).max(500),
});

export async function POST(req: NextRequest): Promise<Response> {
  // Só consulta, mas segue a convenção de POST do app: quem está em suporte
  // (acesso de leitura a uma organização que não é sua) não monta audiência de
  // campanha. A guarda é o que `tests/unit/suporte-cobertura-de-efeitos.test.ts`
  // cobra de todo handler mutante — e a exceção custaria mais que a linha.
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "campaigns" });
  if (!authz.ok) return authz.response;

  const parsed = corpoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", "Campos inválidos.", 422, { requestId });

  const admin = createAdminClient();

  // `phoneVariants` resolve o 9º dígito: 570 dos números de lista pública vêm
  // com 12 dígitos, e procurar só a forma exata perderia todos eles.
  const variantes = new Map<string, string[]>();
  const todas: string[] = [];
  for (const t of parsed.data.telefones) {
    const v = phoneLookupVariants(t);
    variantes.set(t, v);
    todas.push(...v);
  }

  const { data } = await admin
    .from("contacts")
    .select("id, phone_number")
    .eq("organization_id", authz.org.orgId)
    .in("phone_number", [...new Set(todas)]);

  const porTelefone = new Map<string, string>();
  for (const c of data ?? []) {
    porTelefone.set((c as { phone_number: string }).phone_number, (c as { id: string }).id);
  }

  const contactIds: string[] = [];
  const naoEncontrados: string[] = [];
  for (const [original, v] of variantes) {
    const achado = v.map((x) => porTelefone.get(x)).find(Boolean);
    if (achado) contactIds.push(achado);
    else naoEncontrados.push(original);
  }

  return ok({ contact_ids: [...new Set(contactIds)], nao_encontrados: naoEncontrados }, { requestId });
}
