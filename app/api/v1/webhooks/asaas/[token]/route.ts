/**
 * POST /api/v1/webhooks/asaas/[token] — recebe eventos de cobrança do Asaas.
 *
 * Mesmo padrão dos webhooks per-tenant (WAHA/in): `path_token` resolve o
 * tenant a partir do banco — NUNCA do body. Loga em `webhook_events_log`
 * (idempotente por `organization_id + external_id`, provider `asaas`) e
 * emite `emit_event` só para os tipos de interesse; o resto fica só no log.
 */
import { randomUUID, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptWebhookSecret } from "@/lib/webhooks/secrets";
import { envelopeSchema, sanitizar, tipoInterno } from "@/lib/asaas/webhook";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteCtx {
  params: Promise<{ token: string }>;
}

export async function POST(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const requestId = randomUUID();
  const { token } = await ctx.params;

  const rl = await checkRateLimit(`webhook_asaas:${token}`, 120, 60);
  if (!rl.allowed) {
    return fail("rate_limited", "Too many requests.", 429, {
      requestId,
      headers: { "Retry-After": "60" },
    });
  }

  const admin = createAdminClient();
  const { data: integ } = await admin
    .from("tenant_integrations")
    .select("id, organization_id, status, webhook_secret_encrypted")
    .eq("provider", "asaas")
    .eq("webhook_path_token", token)
    .maybeSingle();
  // Token desconhecido ou integração não saudável: 200 vazio, sem log — não
  // dá ao chamador nenhum sinal de qual token existe.
  if (!integ || integ.status !== "healthy") {
    return new NextResponse(null, { status: 200 });
  }

  const rawBody = await req.text();
  const segredo = integ.webhook_secret_encrypted
    ? await decryptWebhookSecret(admin, integ.webhook_secret_encrypted as unknown as string)
    : null;
  const recebido = Buffer.from(req.headers.get("asaas-access-token") ?? "", "utf8");
  const esperado = Buffer.from(segredo ?? "", "utf8");
  // Comparar em BYTES, não em caracteres: um token multibyte de mesmo length
  // em caracteres quebraria (ou driblaria) o timingSafeEqual.
  const confere = !!segredo && recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
  if (!confere) {
    await audit({
      action: "asaas.webhook_invalid_signature",
      organizationId: integ.organization_id,
      resourceType: "tenant_integration",
      resourceId: integ.id,
      requestId,
    });
    return fail("unauthenticated", "invalid_token", 401, { requestId });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return fail("invalid_request", "invalid_json", 400, { requestId });
  }

  const env = envelopeSchema.safeParse(parsed);
  const tipo = env.success ? tipoInterno(env.data.event) : null;
  const { rawBody: rawSan, payloadParsed } = sanitizar(rawBody, parsed);

  const headersJson: Record<string, string> = {};
  req.headers.forEach((v, k) => {
    const kk = k.toLowerCase();
    if (kk.startsWith("authorization") || kk === "cookie" || kk === "asaas-access-token") return;
    headersJson[k] = v;
  });

  const externalId = env.success ? `${env.data.payment.id}:${env.data.event}` : null;

  const { data: logRow, error: logErr } = await admin
    .from("webhook_events_log")
    .insert({
      organization_id: integ.organization_id,
      provider: "asaas",
      webhook_path_token: token,
      http_method: "POST",
      headers: headersJson,
      raw_body: rawSan,
      payload_parsed: payloadParsed,
      signature_header: null,
      valid_signature: true,
      event_type: env.success ? env.data.event : "unknown",
      external_id: externalId,
      status: tipo ? "received" : "processed",
      attempts: 0,
    })
    .select("id")
    .single();

  if (logErr?.code === "23505") {
    return ok({ duplicate: true }, { requestId });
  }
  if (logErr || !logRow) {
    // Sem o registro forense não emitimos evento: 500 faz o Asaas reentregar.
    // Nunca "200 e perdeu".
    logger.error("[asaas.webhook] falha ao gravar webhook_events_log", {
      org: integ.organization_id,
      err: logErr?.message,
    });
    return fail("internal_error", "log_failed", 500, { requestId });
  }

  if (!tipo) {
    return ok({ ignored: true }, { requestId });
  }

  const { error: emitErr } = await admin.rpc("emit_event", {
    p_event_type: tipo,
    p_entity_kind: "asaas_webhook",
    p_entity_id: null,
    p_payload: payloadParsed,
    p_metadata: { external_id: externalId, log_id: logRow.id },
    p_organization_id: integ.organization_id,
  });
  if (emitErr) {
    await admin.from("webhook_events_log").update({ status: "error", error_message: emitErr.message }).eq("id", logRow.id);
  }

  return ok({ received: true }, { requestId });
}
