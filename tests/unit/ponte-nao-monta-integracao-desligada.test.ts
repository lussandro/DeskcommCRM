/**
 * A capacidade marcada `requerIntegracao` não chega ao turno sem a organização
 * ter a capacidade de integração LIGADA (`lib/asaas/config.ts` →
 * `carregarCapacidadesDeIntegracao`). Molde: `ponte-nao-monta-apenas-humano.test.ts`.
 *
 * `capacidadesDeIntegracao` é OPCIONAL em `PickToolsInput` — ausente = fechado,
 * a direção segura. É o que este arquivo prova antes de provar o resto.
 */
import { describe, expect, it } from "vitest";

import { pickToolsFromMcp } from "@/lib/ai/runtime/tools";
import type { McpAuthResult } from "@/lib/mcp/auth";
import type { McpContext } from "@/lib/mcp/types";

const ORG = "11111111-1111-4111-8111-111111111111";

function base() {
  const ctx = {
    organizationId: ORG,
    role: "ai_operator",
    actor: { type: "ai_agent", id: "agente-1", role: "ai_operator" },
    apiTokenId: "tok-1",
    requestId: "run-1",
    supabase: {} as never,
  } as unknown as McpContext;
  const auth = {
    organizationId: ORG,
    role: "ai_operator",
    actor: ctx.actor,
    apiTokenId: "tok-1",
    scopes: ["mcp:read", "mcp:write", "actor:ai_agent", "role:ai_operator"],
  } as unknown as McpAuthResult;
  return { supabase: ctx.supabase, ctx, auth, handoffToolEnabled: false, handoffSignal: { triggered: false } };
}

const IDS = [
  "crm_list_contact_charges",
  "crm_get_charge_payment_info",
  "crm_link_contact_to_billing",
  "crm_reissue_overdue_charge",
  "crm_get_contact",
];

describe("a ponte do turno respeita `requerIntegracao`", () => {
  it("sem capacidadesDeIntegracao (campo ausente) nenhuma tool de cobrança vai ao modelo", () => {
    const tools = pickToolsFromMcp({ ...base(), toolIds: IDS });
    expect(Object.keys(tools)).toEqual(["crm_get_contact"]);
  });

  it("com {asaas} entram as três de leitura/vínculo, mas NÃO a reemissão", () => {
    const tools = pickToolsFromMcp({ ...base(), toolIds: IDS, capacidadesDeIntegracao: new Set(["asaas"]) });
    expect(Object.keys(tools).sort()).toEqual([
      "crm_get_charge_payment_info",
      "crm_get_contact",
      "crm_link_contact_to_billing",
      "crm_list_contact_charges",
    ]);
  });

  it("com {asaas, asaas:reemitir} as quatro entram", () => {
    const tools = pickToolsFromMcp({
      ...base(),
      toolIds: IDS,
      capacidadesDeIntegracao: new Set(["asaas", "asaas:reemitir"]),
    });
    expect(Object.keys(tools)).toHaveLength(5);
  });
});
