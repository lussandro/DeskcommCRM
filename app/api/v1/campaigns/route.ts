/**
 * GET/POST /api/v1/campaigns — campanhas de prospecção ativa.
 *
 * A campanha nasce `draft` e SEM destinatários: montar a audiência é outro
 * gesto (`POST /campaigns/:id/recipients`) e iniciar é um terceiro
 * (`POST /campaigns/:id/start`). Três gestos porque são três decisões
 * diferentes, e a que dispara mensagem para gente de verdade não pode ser
 * efeito colateral de "salvei o rascunho".
 *
 * `base_legal` é obrigatória e sem default — campanha sem base legal declarada
 * não deve existir. Interesse legítimo exige a referência da LIA: é ela que
 * responde "com base em quê você me mandou isto?" quando alguém perguntar.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { baseLegalValida } from "@/lib/campanha/decisao";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const criarSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  channel_session_id: z.string().uuid(),
  template_body: z.string().trim().min(1).max(4000),
  base_legal: z.enum(["consent", "legitimate_interest"]),
  lia_ref: z.string().trim().min(1).max(200).nullable().optional(),
});

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "campaigns" });
  if (!authz.ok) return authz.response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("campaigns")
    .select("id, name, status, channel_session_id, base_legal, started_at, finished_at, created_at")
    .eq("organization_id", authz.org.orgId)
    .order("created_at", { ascending: false });
  if (error) return fail("internal_error", "Não foi possível listar as campanhas.", 500, { requestId });

  // A régua viva de cada campanha: sem ela a tela mostraria nome e status, e
  // quem dispara para uma lista precisa saber quantos foram e quantos pularam.
  const ids = (data ?? []).map((c) => c.id as string);
  const contagem = new Map<string, Record<string, number>>();
  if (ids.length > 0) {
    const { data: destinatarios } = await admin
      .from("campaign_recipients")
      .select("campaign_id, status")
      .eq("organization_id", authz.org.orgId)
      .in("campaign_id", ids);
    for (const d of destinatarios ?? []) {
      const chave = d.campaign_id as string;
      const atual = contagem.get(chave) ?? { pending: 0, sent: 0, failed: 0, skipped: 0 };
      atual[d.status as string] = (atual[d.status as string] ?? 0) + 1;
      contagem.set(chave, atual);
    }
  }

  return ok(
    (data ?? []).map((c) => ({ ...c, totais: contagem.get(c.id as string) ?? { pending: 0, sent: 0, failed: 0, skipped: 0 } })),
    { requestId },
  );
}

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "campaigns" });
  if (!authz.ok) return authz.response;

  const parsed = criarSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", "Campos inválidos.", 422, {
      requestId,
      details: { issues: parsed.error.issues.map((i) => i.path.join(".")) },
    });
  }
  const input = parsed.data;

  if (!baseLegalValida({ baseLegal: input.base_legal, liaRef: input.lia_ref ?? null })) {
    return fail(
      "validation_failed",
      "Interesse legítimo exige a referência da avaliação (LIA) — sem ela não há base legal para o primeiro contato.",
      422,
      { requestId },
    );
  }

  const admin = createAdminClient();
  // O número é da organização? Service role ignora RLS, então o filtro é manual.
  const { data: canal } = await admin
    .from("channel_sessions")
    .select("id")
    .eq("organization_id", authz.org.orgId)
    .eq("id", input.channel_session_id)
    .is("archived_at", null)
    .maybeSingle();
  if (!canal) return fail("not_found", "Número não encontrado nesta organização.", 404, { requestId });

  const { data, error } = await admin
    .from("campaigns")
    .insert({
      organization_id: authz.org.orgId,
      name: input.name,
      channel_session_id: input.channel_session_id,
      template_body: input.template_body,
      base_legal: input.base_legal,
      lia_ref: input.lia_ref ?? null,
      created_by: authz.user.id,
    })
    .select("id, name, status, channel_session_id, base_legal, created_at")
    .single();
  if (error || !data) return fail("internal_error", "Não foi possível criar a campanha.", 500, { requestId });

  void audit({
    action: "campaign.created",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "campaign",
    resourceId: data.id as string,
    requestId,
    metadata: { base_legal: input.base_legal, channel_session_id: input.channel_session_id },
  });

  return ok(data, { status: 201, requestId });
}
