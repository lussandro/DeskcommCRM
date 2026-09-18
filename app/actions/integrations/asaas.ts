"use server";

/**
 * Server Actions da integração Asaas — chave, ambiente, cerca de prorrogação,
 * fluxo de retorno para cobrança vencida e endereço do aviso (Webhook).
 *
 * Guarda o mesmo molde de `disconnectNuvemshop.ts`: `loadAuthUser` →
 * `supportWriteError` → `resolveActiveOrg` → só `admin` → resultado em união
 * discriminada, nunca throw.
 *
 * O segredo do aviso (`webhook_secret_encrypted`) só sai do servidor em CLARO
 * duas vezes na vida da integração: na primeira gravação (`salvarConfigAsaas`)
 * e ao girar (`girarTokenAsaas`). Depois disso só existe cifrado no banco —
 * quem perdeu gera um novo, não recupera o antigo.
 */
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";

import { supportWriteError } from "@/lib/impersonate/support";
import { audit } from "@/lib/audit";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptWebhookSecret } from "@/lib/webhooks/secrets";
import { configSchema, carregarIntegracaoAsaas } from "@/lib/asaas/config";
import { AsaasErro } from "@/lib/asaas/cliente";
import { validarFluxoDeCobranca } from "@/lib/asaas/validacao-do-fluxo";
import { env } from "@/lib/env";
import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import { emitAgentActivityForContact } from "@/lib/leads/agent-activity";
import { logger } from "@/lib/logger";

const ROTA = "/app/integrations/asaas";

function webhookUrlDe(pathToken: string): string {
  return `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/api/v1/webhooks/asaas/${pathToken}`;
}

type ErroComum = "auth_required" | "no_active_org" | "forbidden" | "db_error";

interface SalvarInput {
  apiKey?: string;
  ambiente: "sandbox" | "producao";
  /** Forma antiga, aceita para não quebrar chamador que ainda manda um só. */
  followup_pointer_id?: string | null;
  /** Um fluxo de cobrança por número — a forma nova. */
  followup_pointer_ids?: string[];
  reemissao?: { dias?: number; max_por_cobranca?: number } | null;
}

export type SalvarResult =
  | { ok: true; token?: string; webhookUrl?: string }
  | { ok: false; error: ErroComum | "chave_obrigatoria" | "config_invalida" | "fluxo_invalido" | "cifra_indisponivel"; detalhe?: string };

/** Guarda comum às seis actions: auth → suporte → org ativa → só admin. */
async function guardaAdmin(): Promise<
  | { ok: true; userId: string; orgId: string }
  | { ok: false; error: ErroComum }
> {
  const user = await loadAuthUser();
  if (!user) return { ok: false, error: "auth_required" };
  if (supportWriteError(user.support)) return { ok: false, error: "forbidden" };
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) return { ok: false, error: "no_active_org" };
  if (activeOrg.role !== "admin" && !user.is_platform_admin) return { ok: false, error: "forbidden" };
  return { ok: true, userId: user.id, orgId: activeOrg.orgId };
}

export async function salvarConfigAsaas(input: SalvarInput): Promise<SalvarResult> {
  const guarda = await guardaAdmin();
  if (!guarda.ok) return guarda;
  const { userId, orgId } = guarda;
  const admin = createAdminClient();

  const pointersPedidos = input.followup_pointer_ids ?? (input.followup_pointer_id ? [input.followup_pointer_id] : []);
  const parsedConfig = configSchema.safeParse({
    ambiente: input.ambiente,
    // O espelho singular é gravado junto por um ciclo: rollback de imagem não
    // reverte banco, e imagem antiga que só saiba ler a chave antiga precisa
    // achar alguma coisa lá — senão a cobrança morre em silêncio.
    followup_pointer_id: pointersPedidos[0] ?? null,
    followup_pointer_ids: pointersPedidos,
    reemissao: input.reemissao ?? null,
  });
  if (!parsedConfig.success) {
    return { ok: false, error: "config_invalida", detalhe: parsedConfig.error.issues[0]?.message };
  }
  const config = parsedConfig.data;

  const numeros = new Set<string>();
  for (const pointerId of config.followup_pointer_ids) {
    const validacao = await validarFluxoDeCobranca(admin, orgId, pointerId);
    if (!validacao.ok) return { ok: false, error: "fluxo_invalido", detalhe: validacao.detalhe };
    // Dois fluxos no MESMO número: a escolha do disparo viraria empate, e empate
    // vira aviso na Central em vez de cobrança. Recusar aqui é mais barato.
    if (numeros.has(validacao.channelSessionId)) {
      return { ok: false, error: "fluxo_invalido", detalhe: "Dois fluxos de cobrança estão no mesmo número — deixe um por número." };
    }
    numeros.add(validacao.channelSessionId);
  }

  const { data: existente, error: lookupErr } = await admin
    .from("tenant_integrations")
    .select("id")
    .eq("organization_id", orgId)
    .eq("provider", "asaas")
    .maybeSingle();
  if (lookupErr) return { ok: false, error: "db_error" };

  if (!existente) {
    // Primeira gravação: `oauth_access_token_encrypted` e `webhook_secret_encrypted`
    // são bytea NOT NULL — sem chave não há como criar a linha.
    if (!input.apiKey) return { ok: false, error: "chave_obrigatoria" };

    const oauthEnc = await encryptWebhookSecret(admin, input.apiKey);
    if (!oauthEnc) return { ok: false, error: "cifra_indisponivel" };
    const tokenClaro = randomBytes(32).toString("hex");
    const webhookEnc = await encryptWebhookSecret(admin, tokenClaro);
    if (!webhookEnc) return { ok: false, error: "cifra_indisponivel" };

    const { data: inserido, error: insErr } = await admin
      .from("tenant_integrations")
      .insert({
        organization_id: orgId,
        provider: "asaas",
        oauth_access_token_encrypted: oauthEnc,
        webhook_secret_encrypted: webhookEnc,
        status: "connecting",
        store_metadata: config,
      })
      .select("id, webhook_path_token")
      .single();
    if (insErr || !inserido) return { ok: false, error: "db_error" };

    await audit({
      action: "asaas.integration_config_changed",
      actorUserId: userId,
      organizationId: orgId,
      resourceType: "tenant_integration",
      resourceId: inserido.id,
      metadata: { last4: input.apiKey.slice(-4), ambiente: config.ambiente },
    });
    revalidatePath(ROTA);
    return { ok: true, token: tokenClaro, webhookUrl: webhookUrlDe(inserido.webhook_path_token as string) };
  }

  // Gravações seguintes: chave é opcional (troca de chave).
  const patch: Record<string, unknown> = { store_metadata: config };
  const metadata: Record<string, unknown> = { ambiente: config.ambiente };
  if (input.apiKey) {
    const oauthEnc = await encryptWebhookSecret(admin, input.apiKey);
    if (!oauthEnc) return { ok: false, error: "cifra_indisponivel" };
    patch.oauth_access_token_encrypted = oauthEnc;
    metadata.last4 = input.apiKey.slice(-4);
  }

  const { error: updErr } = await admin.from("tenant_integrations").update(patch).eq("id", existente.id).eq("organization_id", orgId);
  if (updErr) return { ok: false, error: "db_error" };

  await audit({
    action: "asaas.integration_config_changed",
    actorUserId: userId,
    organizationId: orgId,
    resourceType: "tenant_integration",
    resourceId: existente.id,
    metadata,
  });
  revalidatePath(ROTA);
  return { ok: true };
}

export type TestarResult = { ok: boolean; mensagem: string };

export async function testarConexaoAsaas(): Promise<TestarResult> {
  const guarda = await guardaAdmin();
  if (!guarda.ok) return { ok: false, mensagem: "Sem permissão para testar esta integração." };
  const { orgId } = guarda;
  const admin = createAdminClient();

  const integ = await carregarIntegracaoAsaas(admin, orgId, { exigirHealthy: false });
  if (!integ) return { ok: false, mensagem: "Configure a chave do Asaas antes de testar a conexão." };

  try {
    await integ.cliente.balance();
  } catch (err) {
    const mensagem = err instanceof AsaasErro ? err.descricao : "Não foi possível falar com o Asaas.";
    await admin.from("tenant_integrations").update({ status: "error", status_reason: mensagem }).eq("id", integ.id).eq("organization_id", orgId);
    return { ok: false, mensagem };
  }

  await admin
    .from("tenant_integrations")
    .update({ status: "healthy", status_reason: null, last_health_check_at: new Date().toISOString() })
    .eq("id", integ.id)
    .eq("organization_id", orgId);
  revalidatePath(ROTA);
  return { ok: true, mensagem: "Conexão com o Asaas funcionando." };
}

export type AtivarResult = { ok: true; webhookUrl: string } | { ok: false; error: ErroComum | "nao_configurado" | "conexao_falhou"; mensagem?: string };

export async function ativarAsaas(): Promise<AtivarResult> {
  const guarda = await guardaAdmin();
  if (!guarda.ok) return guarda;
  const { userId, orgId } = guarda;
  const admin = createAdminClient();

  const integ = await carregarIntegracaoAsaas(admin, orgId, { exigirHealthy: false });
  if (!integ) return { ok: false, error: "nao_configurado" };

  try {
    await integ.cliente.balance();
  } catch (err) {
    const mensagem = err instanceof AsaasErro ? err.descricao : "Não foi possível falar com o Asaas.";
    await admin.from("tenant_integrations").update({ status: "error", status_reason: mensagem }).eq("id", integ.id).eq("organization_id", orgId);
    return { ok: false, error: "conexao_falhou", mensagem };
  }

  await admin
    .from("tenant_integrations")
    .update({ status: "healthy", status_reason: null, last_health_check_at: new Date().toISOString() })
    .eq("id", integ.id)
    .eq("organization_id", orgId);

  await audit({
    action: "asaas.integration_enabled",
    actorUserId: userId,
    organizationId: orgId,
    resourceType: "tenant_integration",
    resourceId: integ.id,
  });

  // Fire-and-forget: acorda o reconciliador de cobranças agora, sem esperar
  // por ele (a rota do cron chega na Task 8 — 404 hoje é esperado).
  try {
    void fetch(`${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/api/v1/cron/asaas-reconcile`, {
      headers: { Authorization: `Bearer ${env.INTERNAL_SECRET}` },
    }).catch((err) => logger.warn("[asaas] disparo do reconciliador falhou", { error: String(err) }));
  } catch (err) {
    logger.warn("[asaas] disparo do reconciliador falhou", { error: String(err) });
  }

  revalidatePath(ROTA);
  return { ok: true, webhookUrl: webhookUrlDe(integ.webhookPathToken) };
}

export type GirarTokenResult = { ok: true; token: string } | { ok: false; error: ErroComum | "nao_configurado" | "cifra_indisponivel" };

export async function girarTokenAsaas(): Promise<GirarTokenResult> {
  const guarda = await guardaAdmin();
  if (!guarda.ok) return guarda;
  const { userId, orgId } = guarda;
  const admin = createAdminClient();

  const { data: existente, error: lookupErr } = await admin
    .from("tenant_integrations")
    .select("id")
    .eq("organization_id", orgId)
    .eq("provider", "asaas")
    .maybeSingle();
  if (lookupErr) return { ok: false, error: "db_error" };
  if (!existente) return { ok: false, error: "nao_configurado" };

  const tokenClaro = randomBytes(32).toString("hex");
  const webhookEnc = await encryptWebhookSecret(admin, tokenClaro);
  if (!webhookEnc) return { ok: false, error: "cifra_indisponivel" };

  const { error: updErr } = await admin
    .from("tenant_integrations")
    .update({ webhook_secret_encrypted: webhookEnc })
    .eq("id", existente.id)
    .eq("organization_id", orgId);
  if (updErr) return { ok: false, error: "db_error" };

  await audit({
    action: "asaas.webhook_token_rotated",
    actorUserId: userId,
    organizationId: orgId,
    resourceType: "tenant_integration",
    resourceId: existente.id,
  });
  revalidatePath(ROTA);
  return { ok: true, token: tokenClaro };
}

export type DesativarResult = { ok: true; enrollmentsCanceled: number } | { ok: false; error: ErroComum | "nao_configurado" };

/** Estados de enrollment vivo — mesmo vocabulário de `followup_enrollments.status`. */
const STATUS_VIVOS = ["active", "waiting_reply", "paused_handoff", "paused_manual"] as const;

export async function desativarAsaas(): Promise<DesativarResult> {
  const guarda = await guardaAdmin();
  if (!guarda.ok) return guarda;
  const { userId, orgId } = guarda;
  const admin = createAdminClient();

  const { data: existente, error: lookupErr } = await admin
    .from("tenant_integrations")
    .select("id")
    .eq("organization_id", orgId)
    .eq("provider", "asaas")
    .maybeSingle();
  if (lookupErr) return { ok: false, error: "db_error" };
  if (!existente) return { ok: false, error: "nao_configurado" };

  const { data: charges, error: chargesErr } = await admin
    .from("asaas_charges")
    .select("enrollment_id")
    .eq("organization_id", orgId)
    .not("enrollment_id", "is", null);
  if (chargesErr) return { ok: false, error: "db_error" };

  const enrollmentIds = [...new Set((charges ?? []).map((c) => c.enrollment_id as string))];
  let canceladas = 0;

  if (enrollmentIds.length > 0) {
    const { data: vivos, error: vivosErr } = await admin
      .from("followup_enrollments")
      .select("id, contact_id")
      .eq("organization_id", orgId)
      .in("id", enrollmentIds)
      .in("status", STATUS_VIVOS);
    if (vivosErr) return { ok: false, error: "db_error" };

    for (const enrollment of vivos ?? []) {
      // Guard otimista: a mesma trava de `gatilho-caso.ts:400-419` — o `.in("status", ...)`
      // no UPDATE garante que só cancela quem AINDA está vivo, sem ressuscitar
      // um enrollment que o motor já concluiu entre a leitura e aqui.
      const { data: atualizado, error: cancelErr } = await admin
        .from("followup_enrollments")
        .update({
          status: "cancelled",
          outcome: "exhausted",
          cancel_reason: "asaas_disabled",
          next_eval_at: null,
          claimed_until: null,
          completed_at: new Date().toISOString(),
        })
        .eq("organization_id", orgId)
        .eq("id", enrollment.id)
        .in("status", STATUS_VIVOS)
        .select("id");
      if (cancelErr) continue;
      if ((atualizado ?? []).length === 0) continue;
      canceladas += 1;

      try {
        await emitAgentActivityForContact({
          pool: getRequestPool(),
          organizationId: orgId,
          contactId: enrollment.contact_id as string,
          type: "followup_cancelled",
          reason: "Integração Asaas desativada",
          sourceModule: "asaas",
          sourceId: enrollment.id as string,
          usuarioId: userId,
        });
      } catch (err) {
        logger.warn("[asaas] falha ao registrar atividade de cancelamento", { error: String(err) });
      }
    }
  }

  const { error: updErr } = await admin
    .from("tenant_integrations")
    .update({ status: "disconnected", status_reason: "user_disconnected" })
    .eq("id", existente.id)
    .eq("organization_id", orgId);
  if (updErr) return { ok: false, error: "db_error" };

  await audit({
    action: "asaas.integration_disabled",
    actorUserId: userId,
    organizationId: orgId,
    resourceType: "tenant_integration",
    resourceId: existente.id,
    metadata: { enrollments_canceled: canceladas },
  });
  revalidatePath(ROTA);
  return { ok: true, enrollmentsCanceled: canceladas };
}

export type EsquecerResult = { ok: true } | { ok: false; error: ErroComum | "nao_configurado" | "integracao_ativa" };

export async function esquecerChaveAsaas(): Promise<EsquecerResult> {
  const guarda = await guardaAdmin();
  if (!guarda.ok) return guarda;
  const { userId, orgId } = guarda;
  const admin = createAdminClient();

  const { data: existente, error: lookupErr } = await admin
    .from("tenant_integrations")
    .select("id, status")
    .eq("organization_id", orgId)
    .eq("provider", "asaas")
    .maybeSingle();
  if (lookupErr) return { ok: false, error: "db_error" };
  if (!existente) return { ok: false, error: "nao_configurado" };
  // I3: apagar a linha com a integração ativa perde o vínculo com matrículas
  // vivas em curso — desativar primeiro cancela e audita a contagem.
  if (existente.status === "healthy") return { ok: false, error: "integracao_ativa" };

  const { error: delErr } = await admin.from("tenant_integrations").delete().eq("id", existente.id).eq("organization_id", orgId);
  if (delErr) return { ok: false, error: "db_error" };

  await audit({
    action: "asaas.integration_disabled",
    actorUserId: userId,
    organizationId: orgId,
    resourceType: "tenant_integration",
    resourceId: existente.id,
    metadata: { forgot_key: true },
  });
  revalidatePath(ROTA);
  return { ok: true };
}
