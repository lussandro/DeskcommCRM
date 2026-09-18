"use server";

/**
 * Server Actions da integração com o ERP externo por MCP (spec
 * 2026-09-18-mcp-cliente-design, D7).
 *
 * Molde literal de `asaas.ts`: `loadAuthUser` → `supportWriteError` →
 * `resolveActiveOrg` → só `admin` → união discriminada, nunca throw.
 *
 * Duas diferenças que vêm da spec e não são estilo:
 *
 *  1. **Não há webhook.** O ERP não nos chama; nós perguntamos a ele. Por isso
 *     `webhook_secret_encrypted` fica NULO (a 0263 tirou o `not null`) em vez de
 *     receber um segredo fabricado que ninguém usa — o que o Asaas faz e a spec
 *     recusou (D7).
 *  2. **Testar a conexão é `tools/list` DE VERDADE.** O que ele devolve fica em
 *     `store_metadata.catalogo`, e é disso que a tela tira "o servidor expõe N
 *     ferramentas e estas consultas ficaram disponíveis". Sem a chamada real,
 *     "testado" seria só uma palavra na tela.
 *
 * A chave só aparece na auditoria pelos QUATRO ÚLTIMOS dígitos — nunca inteira,
 * nunca em log, nunca na URL registrada.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { supportWriteError } from "@/lib/impersonate/support";
import { audit } from "@/lib/audit";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptWebhookSecret } from "@/lib/webhooks/secrets";
import { carregarIntegracaoErpMcp, metadataErpMcpSchema } from "@/lib/erp-mcp/config";
import { chamarRpc } from "@/lib/erp-mcp/transporte";
import { motivoDaFalha } from "@/lib/erp-mcp/motivo";

const ROTA = "/app/integrations/mcp";

type ErroComum = "auth_required" | "no_active_org" | "forbidden" | "db_error";

/** A URL do servidor MCP. `https` de verdade é cobrado pelos guards do transporte, a cada chamada. */
const urlSchema = z.string().url();

async function guardaAdmin(): Promise<{ ok: true; userId: string; orgId: string } | { ok: false; error: ErroComum }> {
  const user = await loadAuthUser();
  if (!user) return { ok: false, error: "auth_required" };
  if (supportWriteError(user.support)) return { ok: false, error: "forbidden" };
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) return { ok: false, error: "no_active_org" };
  if (activeOrg.role !== "admin" && !user.is_platform_admin) return { ok: false, error: "forbidden" };
  return { ok: true, userId: user.id, orgId: activeOrg.orgId };
}

type Linha = { id: string; status: string; store_metadata: unknown };

async function linhaDaOrg(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
): Promise<{ ok: true; linha: Linha | null } | { ok: false }> {
  const { data, error } = await admin
    .from("tenant_integrations")
    .select("id, status, store_metadata")
    .eq("organization_id", orgId)
    .eq("provider", "mcp")
    .maybeSingle();
  if (error) return { ok: false };
  return { ok: true, linha: (data as Linha | null) ?? null };
}

/** O `store_metadata` atual, ou o mínimo — nunca um objeto adivinhado. */
function metadataAtual(linha: Linha | null): { url: string; catalogo: string[]; falhas_consecutivas: number } | null {
  if (!linha) return null;
  const parsed = metadataErpMcpSchema.safeParse(linha.store_metadata ?? {});
  return parsed.success ? parsed.data : null;
}

export type SalvarResult =
  | { ok: true }
  | { ok: false; error: ErroComum | "chave_obrigatoria" | "url_invalida" | "cifra_indisponivel" };

export async function salvarConfigMcp(input: { url: string; chave?: string }): Promise<SalvarResult> {
  const guarda = await guardaAdmin();
  if (!guarda.ok) return guarda;
  const { userId, orgId } = guarda;
  const admin = createAdminClient();

  const url = urlSchema.safeParse(input.url.trim());
  if (!url.success) return { ok: false, error: "url_invalida" };

  const busca = await linhaDaOrg(admin, orgId);
  if (!busca.ok) return { ok: false, error: "db_error" };
  const linha = busca.linha;
  const anterior = metadataAtual(linha);

  const chave = input.chave?.trim();
  if (!linha && !chave) return { ok: false, error: "chave_obrigatoria" };

  // Trocar a URL invalida o catálogo descoberto: é outro servidor, e dizer que
  // as consultas continuam disponíveis seria afirmar o que não foi medido.
  const mudouUrl = anterior !== null && anterior.url !== url.data;
  const metadata = {
    url: url.data,
    catalogo: mudouUrl ? [] : (anterior?.catalogo ?? []),
    falhas_consecutivas: anterior?.falhas_consecutivas ?? 0,
  };

  let chaveCifrada: string | null = null;
  if (chave) {
    chaveCifrada = await encryptWebhookSecret(admin, chave);
    if (!chaveCifrada) return { ok: false, error: "cifra_indisponivel" };
  }

  const metadataDeAuditoria: Record<string, unknown> = { url_mudou: mudouUrl };
  if (chave) metadataDeAuditoria.last4 = chave.slice(-4);

  if (!linha) {
    const { data: inserido, error: insErr } = await admin
      .from("tenant_integrations")
      .insert({
        organization_id: orgId,
        provider: "mcp",
        oauth_access_token_encrypted: chaveCifrada,
        // Sem webhook: a 0263 tirou o `not null` justamente para não fabricar
        // segredo de um aviso que o ERP nunca vai mandar.
        status: "connecting",
        store_metadata: metadata,
      })
      .select("id")
      .single();
    if (insErr || !inserido) return { ok: false, error: "db_error" };

    await audit({
      action: "mcp.integration_config_changed",
      actorUserId: userId,
      organizationId: orgId,
      resourceType: "tenant_integration",
      resourceId: inserido.id,
      metadata: metadataDeAuditoria,
    });
    revalidatePath(ROTA);
    return { ok: true };
  }

  const patch: Record<string, unknown> = { store_metadata: metadata };
  if (chaveCifrada) patch.oauth_access_token_encrypted = chaveCifrada;
  // Config nova volta para "a conferir": o status saudável anterior falava de
  // outra configuração.
  if (mudouUrl || chaveCifrada) {
    patch.status = "connecting";
    patch.status_reason = null;
  }

  const { error: updErr } = await admin
    .from("tenant_integrations")
    .update(patch)
    .eq("id", linha.id)
    .eq("organization_id", orgId);
  if (updErr) return { ok: false, error: "db_error" };

  await audit({
    action: "mcp.integration_config_changed",
    actorUserId: userId,
    organizationId: orgId,
    resourceType: "tenant_integration",
    resourceId: linha.id,
    metadata: metadataDeAuditoria,
  });
  revalidatePath(ROTA);
  return { ok: true };
}

/** Os nomes de `tools/list`. Formato inválido vira lista vazia, nunca nome inventado. */
function nomesDoCatalogo(result: unknown): string[] {
  const tools = (result as { tools?: unknown })?.tools;
  if (!Array.isArray(tools)) return [];
  return tools.map((t) => (t as { name?: unknown })?.name).filter((n): n is string => typeof n === "string");
}

export type TestarResult = { ok: true; ferramentas: number } | { ok: false; mensagem: string };

/**
 * Fala com o servidor e grava o que foi medido. **Não LIGA nada por conta
 * própria.**
 *
 * Testar era ativar: o sucesso gravava `status='healthy'`, e `healthy` é
 * exatamente o que liga as cinco ferramentas no agente — quem tinha desativado
 * e depois clicava em "Testar conexão" para diagnosticar reativava a
 * integração sem pedir, e `ativarMcp` era decoração (só chamava o testar).
 * Diagnosticar e ligar são intenções diferentes e agora são botões diferentes:
 * `ativar:true` só vem de `ativarMcp`.
 *
 * Integração DESATIVADA que passa no teste continua desativada: o carimbo, o
 * catálogo e o contador são atualizados (é o que o admin foi ver), o status
 * não.
 */
async function conferirConexao(userId: string, orgId: string, opts: { ativar: boolean }): Promise<TestarResult> {
  const admin = createAdminClient();

  const busca = await linhaDaOrg(admin, orgId);
  if (!busca.ok) return { ok: false, mensagem: "Não consegui ler a configuração desta integração." };
  const integ = await carregarIntegracaoErpMcp(admin, orgId, { exigirHealthy: false });
  if (!integ || !busca.linha) return { ok: false, mensagem: "Informe o endereço e a chave do servidor antes de testar." };
  const desativada = busca.linha.status === "disconnected";

  const r = await chamarRpc({ url: integ.url, chave: integ.chave }, "tools/list", {});
  if (!r.ok) {
    const mensagem = motivoDaFalha(r.falha);
    await admin
      .from("tenant_integrations")
      .update({
        // Desativada que falha no teste continua DESATIVADA: `error` diria que
        // ela caiu, quando quem a desligou foi uma pessoa.
        ...(desativada ? {} : { status: "error" }),
        status_reason: mensagem,
        last_health_check_at: new Date().toISOString(),
      })
      .eq("id", integ.id)
      .eq("organization_id", orgId);
    revalidatePath(ROTA);
    return { ok: false, mensagem };
  }

  const catalogo = nomesDoCatalogo(r.dados);
  const anterior = (busca.linha.store_metadata ?? {}) as Record<string, unknown>;
  const ligar = opts.ativar || !desativada;
  await admin
    .from("tenant_integrations")
    .update({
      ...(ligar ? { status: "healthy", status_reason: null } : { status_reason: null }),
      last_health_check_at: new Date().toISOString(),
      // O catálogo é o que a tela mostra ao admin — e zerar as falhas aqui é o
      // mesmo zeramento do aviso: uma chamada que funciona apaga a contagem.
      // O resto do `store_metadata` é preservado: este write não é o dono dele.
      store_metadata: { ...anterior, url: integ.url, catalogo, falhas_consecutivas: 0 },
    })
    .eq("id", integ.id)
    .eq("organization_id", orgId);

  await audit({
    action: "mcp.integration_tested",
    actorUserId: userId,
    organizationId: orgId,
    resourceType: "tenant_integration",
    resourceId: integ.id,
    metadata: { ferramentas: catalogo.length, ativou: ligar && desativada },
  });
  revalidatePath(ROTA);
  return { ok: true, ferramentas: catalogo.length };
}

export async function testarConexaoMcp(): Promise<TestarResult> {
  const guarda = await guardaAdmin();
  if (!guarda.ok) return { ok: false, mensagem: "Sem permissão para testar esta integração." };
  return conferirConexao(guarda.userId, guarda.orgId, { ativar: false });
}

export type AtivarResult = { ok: true } | { ok: false; error: ErroComum | "nao_configurado" | "conexao_falhou"; mensagem?: string };

export async function ativarMcp(): Promise<AtivarResult> {
  const guarda = await guardaAdmin();
  if (!guarda.ok) return guarda;
  const { userId, orgId } = guarda;
  const admin = createAdminClient();

  const integ = await carregarIntegracaoErpMcp(admin, orgId, { exigirHealthy: false });
  if (!integ) return { ok: false, error: "nao_configurado" };

  // Ativar sem provar que fala com o servidor ligaria as cinco ferramentas no
  // agente para falhar na primeira pergunta do cliente. Este é o ÚNICO caminho
  // que passa `ativar:true` — o botão de testar não liga nada.
  const teste = await conferirConexao(userId, orgId, { ativar: true });
  if (!teste.ok) return { ok: false, error: "conexao_falhou", mensagem: teste.mensagem };

  await audit({
    action: "mcp.integration_enabled",
    actorUserId: userId,
    organizationId: orgId,
    resourceType: "tenant_integration",
    resourceId: integ.id,
    metadata: { ferramentas: teste.ferramentas },
  });
  revalidatePath(ROTA);
  return { ok: true };
}

export type DesativarResult = { ok: true } | { ok: false; error: ErroComum | "nao_configurado" };

export async function desativarMcp(): Promise<DesativarResult> {
  const guarda = await guardaAdmin();
  if (!guarda.ok) return guarda;
  const { userId, orgId } = guarda;
  const admin = createAdminClient();

  const busca = await linhaDaOrg(admin, orgId);
  if (!busca.ok) return { ok: false, error: "db_error" };
  if (!busca.linha) return { ok: false, error: "nao_configurado" };

  const { error: updErr } = await admin
    .from("tenant_integrations")
    .update({ status: "disconnected", status_reason: "user_disconnected" })
    .eq("id", busca.linha.id)
    .eq("organization_id", orgId);
  if (updErr) return { ok: false, error: "db_error" };

  await audit({
    action: "mcp.integration_disabled",
    actorUserId: userId,
    organizationId: orgId,
    resourceType: "tenant_integration",
    resourceId: busca.linha.id,
  });
  revalidatePath(ROTA);
  return { ok: true };
}

export type EsquecerResult = { ok: true } | { ok: false; error: ErroComum | "nao_configurado" | "integracao_ativa" };

export async function esquecerChaveMcp(): Promise<EsquecerResult> {
  const guarda = await guardaAdmin();
  if (!guarda.ok) return guarda;
  const { userId, orgId } = guarda;
  const admin = createAdminClient();

  const busca = await linhaDaOrg(admin, orgId);
  if (!busca.ok) return { ok: false, error: "db_error" };
  if (!busca.linha) return { ok: false, error: "nao_configurado" };
  // Apagar a linha com o módulo ATIVO tiraria as cinco ferramentas do agente no
  // meio de um atendimento, sem ninguém pedir. Desative primeiro.
  if (busca.linha.status === "healthy") return { ok: false, error: "integracao_ativa" };

  const { error: delErr } = await admin
    .from("tenant_integrations")
    .delete()
    .eq("id", busca.linha.id)
    .eq("organization_id", orgId);
  if (delErr) return { ok: false, error: "db_error" };

  await audit({
    action: "mcp.integration_disabled",
    actorUserId: userId,
    organizationId: orgId,
    resourceType: "tenant_integration",
    resourceId: busca.linha.id,
    metadata: { forgot_key: true },
  });
  revalidatePath(ROTA);
  return { ok: true };
}
