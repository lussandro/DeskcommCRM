/**
 * A linha de integração do ERP externo (`tenant_integrations`, `provider='mcp'`).
 *
 * Molde literal de `lib/asaas/config.ts`: `null` significa "módulo desligado" e
 * esta função NUNCA lança — quem chama é um handler de ferramenta no meio do
 * turno do agente, e uma exceção ali derruba o turno inteiro.
 *
 * O `store_metadata` é validado FAIL-CLOSED: linha com URL ausente ou inválida
 * vira "desligado", nunca URL adivinhada (Regra nº 1). A chave é decifrada aqui
 * e não sai daqui — nem para log, nem para erro.
 */
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";
import { decryptWebhookSecret } from "@/lib/webhooks/secrets";

/**
 * `catalogo` é o que o `tools/list` devolveu no último teste de conexão (a tela
 * da Task 6 grava). `falhas_consecutivas` é o contador do aviso da Central.
 * Os dois têm default porque uma linha recém-criada legitimamente não os tem —
 * a URL não tem default nenhum, e é ela que fecha a porta quando falta.
 */
export const metadataErpMcpSchema = z.object({
  url: z.string().url(),
  catalogo: z.array(z.string()).default([]),
  falhas_consecutivas: z.number().int().min(0).default(0),
});

export interface IntegracaoErpMcp {
  id: string;
  url: string;
  chave: string;
  catalogo: string[];
  falhasConsecutivas: number;
}

const COLS = "id, status, store_metadata, oauth_access_token_encrypted";

/** null = desligado/inexistente/quebrado. NUNCA lança. */
export async function carregarIntegracaoErpMcp(
  admin: SupabaseClient,
  orgId: string,
  opts: { exigirHealthy?: boolean } = {},
): Promise<IntegracaoErpMcp | null> {
  const { data, error } = await admin
    .from("tenant_integrations")
    .select(COLS)
    .eq("organization_id", orgId)
    .eq("provider", "mcp")
    .maybeSingle();
  if (error || !data) return null;
  if ((opts.exigirHealthy ?? true) && data.status !== "healthy") return null;

  const parsed = metadataErpMcpSchema.safeParse(data.store_metadata ?? {});
  if (!parsed.success) {
    logger.warn("[erp-mcp] store_metadata inválido; módulo tratado como desligado", {
      org: orgId,
      issues: parsed.error.issues.map((i) => i.path.join(".")),
    });
    return null;
  }

  const chave = data.oauth_access_token_encrypted
    ? await decryptWebhookSecret(admin, data.oauth_access_token_encrypted as unknown as string)
    : null;
  if (!chave) {
    logger.warn("[erp-mcp] não consegui decifrar a chave; módulo tratado como desligado", { org: orgId });
    return null;
  }

  return {
    id: data.id,
    url: parsed.data.url,
    chave,
    catalogo: parsed.data.catalogo,
    falhasConsecutivas: parsed.data.falhas_consecutivas,
  };
}
