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

import { agentesQueArmamOPointer, createSupabaseFollowupGateDb } from "@/lib/followup/agent-followup-gate";
import { TOOLS_COBRANCA } from "@/lib/mcp/tools/catalogo/cobranca";

export type ResultadoValidacaoFluxo =
  | { ok: true; agentId: string; channelSessionId: string; avisoTextoFixo: boolean }
  | {
      ok: false;
      motivo:
        | "inexistente"
        | "inativo"
        | "gatilho_errado"
        | "sem_agente"
        | "agente_sem_capacidades"
        | "canal_arquivado"
        | "fluxo_de_dois_numeros";
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

  // Uma leitura só dos agentes: `resolveAgentForAutomaticTrigger` e a checagem de
  // dois donos liam a MESMA lista, e esta função é chamada uma vez por fluxo na
  // tela de configuração — duas idas viravam 2N.
  const armadores = await agentesQueArmamOPointer(createSupabaseFollowupGateDb(admin), orgId, pointerId);
  const agentId = armadores[0] ?? null;
  if (!agentId) {
    return {
      ok: false,
      motivo: "sem_agente",
      detalhe: "Nenhum agente publicado arma este fluxo. Habilite o follow-up dele para este fluxo em Agentes.",
    };
  }

  const { data: versao } = await admin
    .from("ai_agent_versions")
    .select("tool_ids, channel_session_id")
    .eq("organization_id", orgId)
    .eq("agent_id", agentId)
    .eq("status", "published")
    .maybeSingle<{ tool_ids: string[] | null; channel_session_id: string | null }>();

  const toolIds = new Set(versao?.tool_ids ?? []);
  const faltando = TOOLS_COBRANCA.filter((t) => !toolIds.has(t.name));
  if (faltando.length > 0) {
    return {
      ok: false,
      motivo: "agente_sem_capacidades",
      detalhe: `Faltam no agente: ${faltando.map((t) => t.rotulo).join("; ")}.`,
    };
  }

  // O NÚMERO do fluxo — é ele que decide por qual linha a cobrança fala, e é o
  // único lugar onde essa verdade existe. Não é cacheado na config de propósito:
  // publicar outro agente que arme o mesmo pointer troca o dono do fluxo sem
  // ninguém abrir a tela do Asaas, então quem dispara revalida e usa ESTE valor.
  //
  // `ai_agent_versions.channel_session_id` é NOT NULL no schema, então a guarda
  // abaixo só estreita o tipo: versão sem número não existe, e versão AUSENTE já
  // saiu acima como `agente_sem_capacidades` (o conjunto de tools fica vazio).
  // Não há motivo público para ela — inventar um seria vender recusa que o banco
  // torna impossível.
  const channelSessionId = versao?.channel_session_id;
  if (!channelSessionId) {
    return { ok: false, motivo: "agente_sem_capacidades", detalhe: `Faltam no agente: ${TOOLS_COBRANCA.map((t) => t.rotulo).join("; ")}.` };
  }

  // Canal ARQUIVADO, porém, existe: a linha sobrevive ao arquivamento e a FK do
  // agente continua válida. Sem esta recusa, `fn_service_begin` levanta
  // `service_channel_not_found` lá na frente e o admin lê um aviso críptico.
  const { data: canalVivo } = await admin
    .from("channel_sessions")
    .select("id")
    .eq("organization_id", orgId)
    .eq("id", channelSessionId)
    .is("archived_at", null)
    .maybeSingle();
  if (!canalVivo) {
    return {
      ok: false,
      motivo: "canal_arquivado",
      detalhe: "O número em que o agente deste fluxo está publicado foi excluído — publique-o num número ativo.",
    };
  }

  // Dois financeiros de números diferentes armando o MESMO fluxo: o resolvedor
  // escolheria o menor uuid e a cobrança sairia pela linha errada em silêncio.
  if (armadores.length > 1) {
    const { data: versoes } = await admin
      .from("ai_agent_versions")
      .select("channel_session_id")
      .eq("organization_id", orgId)
      .eq("status", "published")
      .in("agent_id", armadores);
    const numeros = new Set((versoes ?? []).map((v) => (v as { channel_session_id: string | null }).channel_session_id).filter(Boolean));
    if (numeros.size > 1) {
      return {
        ok: false,
        motivo: "fluxo_de_dois_numeros",
        detalhe: "Este fluxo é armado por agentes de números diferentes — deixe só um deles com o follow-up ligado, ou crie um fluxo por número.",
      };
    }
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

  return { ok: true, agentId, channelSessionId, avisoTextoFixo };
}
