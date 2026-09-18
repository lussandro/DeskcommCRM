import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptWebhookSecret } from "@/lib/webhooks/secrets";
import { logger } from "@/lib/logger";
import { CONSULTAS_DO_ERP, capacidadeDaConsulta } from "@/lib/erp-mcp/config";
import { AsaasCliente } from "./cliente";

/**
 * `store_metadata` da linha de tenant_integrations. Sem default para a cerca: os
 * dois campos ou nenhum — metade preenchida é RECUSADA (`superRefine`), nunca
 * apagada em silêncio. Preencher só `dias` e a linha salvar sem prorrogação
 * nenhuma é o defeito que a Regra nº 1 proíbe: parece configurado e não é.
 */
export const configSchema = z
  .object({
    ambiente: z.enum(["sandbox", "producao"]),
    followup_pointer_id: z.string().uuid().nullable().optional().default(null),
    reemissao: z.object({ dias: z.number().int().min(1).max(90).optional(), max_por_cobranca: z.number().int().min(1).max(10).optional() }).nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (!v.reemissao) return;
    const { dias, max_por_cobranca } = v.reemissao;
    if (dias !== undefined && max_por_cobranca === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["reemissao", "max_por_cobranca"],
        message: "Informe também o máximo de prorrogações por cobrança.",
      });
    }
    if (max_por_cobranca !== undefined && dias === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["reemissao", "dias"],
        message: "Informe também os dias de prorrogação.",
      });
    }
  })
  .transform((v) => ({
    ambiente: v.ambiente,
    followup_pointer_id: v.followup_pointer_id ?? null,
    reemissao:
      v.reemissao && v.reemissao.dias !== undefined && v.reemissao.max_por_cobranca !== undefined
        ? { dias: v.reemissao.dias, max_por_cobranca: v.reemissao.max_por_cobranca }
        : null,
  }));
export type AsaasConfig = z.infer<typeof configSchema>;

export interface IntegracaoAsaas {
  id: string;
  status: string;
  config: AsaasConfig;
  cliente: AsaasCliente;
  webhookPathToken: string;
}

const COLS = "id, status, store_metadata, oauth_access_token_encrypted, webhook_path_token";

/**
 * null = módulo desligado/inexistente/quebrado. NUNCA lança: quem chama trata null como "sem módulo".
 * `safeParse` aqui é fail-closed de propósito: uma linha legada com `reemissao` pela metade
 * (só `dias` ou só `max_por_cobranca` — hoje impossível de GRAVAR, mas pode existir de antes
 * do `superRefine`) vira "config inválida → módulo desligado", nunca comportamento adivinhado.
 */
export async function carregarIntegracaoAsaas(admin: SupabaseClient, orgId: string, opts: { exigirHealthy?: boolean } = {}): Promise<IntegracaoAsaas | null> {
  const { data, error } = await admin.from("tenant_integrations").select(COLS).eq("organization_id", orgId).eq("provider", "asaas").maybeSingle();
  if (error || !data) return null;
  if ((opts.exigirHealthy ?? true) && data.status !== "healthy") return null;
  const parsed = configSchema.safeParse(data.store_metadata ?? {});
  if (!parsed.success) {
    logger.warn("[asaas] store_metadata inválido; módulo tratado como desligado", { org: orgId, issues: parsed.error.issues.map((i) => i.path.join(".")) });
    return null;
  }
  const apiKey = data.oauth_access_token_encrypted ? await decryptWebhookSecret(admin, data.oauth_access_token_encrypted as unknown as string) : null;
  if (!apiKey) {
    logger.warn("[asaas] não consegui decifrar a chave; módulo tratado como desligado", { org: orgId });
    return null;
  }
  return { id: data.id, status: data.status, config: parsed.data, cliente: new AsaasCliente(apiKey, parsed.data.ambiente), webhookPathToken: data.webhook_path_token };
}

/**
 * Capacidades de integração da org, para o filtro de ferramentas do turno. Sem decifrar chave.
 * "asaas" = ler cobranças; "asaas:reemitir" = também prorrogar (só com a cerca preenchida).
 * "mcp" = consultar o ERP externo (as cinco de `lib/mcp/tools/erp.ts`), só com `status='healthy'`:
 * é assim que as cinco ferramentas somem do turno quando a integração cai. E `mcp:<método>` =
 * ESTA consulta existe no servidor daquele cliente, lido do `catalogo` que o último
 * `tools/list` descobriu — sem isso, a tela media o catálogo e dizia "Não encontrada no
 * servidor" enquanto o runtime montava a ferramenta assim mesmo, para falhar na conversa.
 * Catálogo VAZIO degrada para conceder as cinco: é a linha salva antes desta mudança, e
 * fail-closed ali deixaria quem já está no ar sem ferramenta nenhuma sem nunca ter mudado nada.
 * Set vazio = nada de integração chega ao modelo (direção segura).
 */
export async function carregarCapacidadesDeIntegracao(admin: SupabaseClient, orgId: string): Promise<ReadonlySet<string>> {
  const { data } = await admin.from("tenant_integrations").select("provider, store_metadata").eq("organization_id", orgId).eq("status", "healthy");
  const caps = new Set<string>();
  for (const r of data ?? []) {
    if (r.provider === "mcp") {
      caps.add("mcp");
      const descoberto = (r.store_metadata as { catalogo?: unknown } | null)?.catalogo;
      const metodos = Array.isArray(descoberto) ? descoberto.filter((n): n is string => typeof n === "string") : [];
      for (const m of metodos.length > 0 ? metodos : CONSULTAS_DO_ERP.map((c) => c.metodo)) caps.add(capacidadeDaConsulta(m));
      continue;
    }
    if (r.provider !== "asaas") { caps.add(r.provider as string); continue; }
    const cfg = configSchema.safeParse(r.store_metadata ?? {});
    if (!cfg.success) continue;
    caps.add("asaas");
    if (cfg.data.reemissao) caps.add("asaas:reemitir");
  }
  return caps;
}
