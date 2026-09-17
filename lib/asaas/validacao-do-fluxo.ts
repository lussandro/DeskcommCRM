/**
 * Valida se um `followup_flow_pointer` serve como "fluxo de retorno para
 * cobrança vencida" da integração Asaas — chamada ao SALVAR a configuração
 * (`app/actions/integrations/asaas.ts`) e pelo consumidor que decide se
 * arma o enrollment (Task 7).
 *
 * Regra: o pointer precisa estar ATIVO, com gatilho `webhook` (é o Asaas quem
 * dispara, não o silêncio/etapa/caso), armado por um agente PUBLICADO com
 * `followup.enabled`, e esse agente precisa ter as capacidades de cobrança
 * (`TOOLS_COBRANCA`) na versão publicada — sem elas o fluxo entra, mas o
 * agente não sabe consultar boleto nenhum.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveAgentForAutomaticTrigger, createSupabaseFollowupGateDb } from "@/lib/followup/agent-followup-gate";
import { TOOLS_COBRANCA } from "@/lib/mcp/tools/catalogo/cobranca";

export type ResultadoValidacaoFluxo =
  | { ok: true; agentId: string; avisoTextoFixo: boolean }
  | {
      ok: false;
      motivo: "inexistente" | "inativo" | "gatilho_errado" | "sem_agente" | "agente_sem_capacidades";
      detalhe: string;
    };

interface PointerRow {
  id: string;
  status: string;
  trigger_config: unknown;
  active_version_id: string | null;
}

export async function validarFluxoDeCobranca(
  admin: SupabaseClient,
  orgId: string,
  pointerId: string,
): Promise<ResultadoValidacaoFluxo> {
  const { data: pointer } = await admin
    .from("followup_flow_pointers")
    .select("id, status, trigger_config, active_version_id")
    .eq("organization_id", orgId)
    .eq("id", pointerId)
    .maybeSingle<PointerRow>();

  if (!pointer) {
    return { ok: false, motivo: "inexistente", detalhe: "Este fluxo de retorno não existe mais nesta organização." };
  }
  if (pointer.status !== "active") {
    return { ok: false, motivo: "inativo", detalhe: "Este fluxo de retorno está desativado." };
  }
  const kind = (pointer.trigger_config as { kind?: unknown } | null)?.kind;
  if (kind !== "webhook") {
    return {
      ok: false,
      motivo: "gatilho_errado",
      detalhe: "Este fluxo não é do tipo \"disparado por sistema externo\" — troque o gatilho dele ou escolha outro fluxo.",
    };
  }

  const agentId = await resolveAgentForAutomaticTrigger(createSupabaseFollowupGateDb(admin), orgId, pointerId);
  if (!agentId) {
    return {
      ok: false,
      motivo: "sem_agente",
      detalhe: "Nenhum agente publicado arma este fluxo. Habilite o follow-up dele para este fluxo em Agentes.",
    };
  }

  const { data: versao } = await admin
    .from("ai_agent_versions")
    .select("tool_ids")
    .eq("organization_id", orgId)
    .eq("agent_id", agentId)
    .eq("status", "published")
    .maybeSingle<{ tool_ids: string[] | null }>();

  const toolIds = new Set(versao?.tool_ids ?? []);
  const faltando = TOOLS_COBRANCA.filter((t) => !toolIds.has(t.name));
  if (faltando.length > 0) {
    return {
      ok: false,
      motivo: "agente_sem_capacidades",
      detalhe: `Faltam no agente: ${faltando.map((t) => t.rotulo).join("; ")}.`,
    };
  }

  let avisoTextoFixo = false;
  if (pointer.active_version_id) {
    const { data: versaoDoFluxo } = await admin
      .from("followup_flow_versions")
      .select("graph")
      .eq("organization_id", orgId)
      .eq("id", pointer.active_version_id)
      .maybeSingle<{ graph: { nodes?: Array<{ type?: string; config?: { mode?: string } }> } | null }>();
    const nodes = versaoDoFluxo?.graph?.nodes ?? [];
    avisoTextoFixo = nodes.some((n) => n.type === "action" && n.config?.mode === "text");
  }

  return { ok: true, agentId, avisoTextoFixo };
}
