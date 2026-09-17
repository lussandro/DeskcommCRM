import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { validarFluxoDeCobranca } from "./validacao-do-fluxo";
import { TOOLS_COBRANCA } from "@/lib/mcp/tools/catalogo/cobranca";

const ORG = "11111111-1111-1111-1111-111111111111";
const POINTER = "22222222-2222-2222-2222-222222222222";
const AGENT = "33333333-3333-3333-3333-333333333333";
const TODAS_AS_TOOLS = TOOLS_COBRANCA.map((t) => t.name);

/** Postgrest-like chainable: .select().eq()...eq().maybeSingle(), ou awaited direto (thenable). */
class FakeQuery {
  constructor(private result: { data: unknown; error: null }) {}
  select() {
    return this;
  }
  eq() {
    return this;
  }
  maybeSingle() {
    return Promise.resolve(this.result);
  }
  then(onfulfilled: (v: unknown) => unknown, onrejected?: (e: unknown) => unknown) {
    return Promise.resolve(this.result).then(onfulfilled, onrejected);
  }
}

interface Cenario {
  pointer: { id: string; status: string; trigger_config: unknown; active_version_id: string | null } | null;
  agentesPublicados: Array<{ agent_id: string; followup: { enabled: boolean; flow_pointer_ids: string[] } | null }>;
  toolIds: string[] | null;
  graph: { nodes: Array<{ type: string; config?: { mode?: string } }> } | null;
}

function fakeAdmin(c: Cenario): SupabaseClient {
  return {
    from(table: string) {
      return {
        select(cols: string) {
          if (table === "followup_flow_pointers") return new FakeQuery({ data: c.pointer, error: null });
          if (table === "ai_agent_versions" && cols.includes("followup")) {
            return new FakeQuery({ data: c.agentesPublicados, error: null });
          }
          if (table === "ai_agent_versions") {
            return new FakeQuery({ data: c.toolIds ? { tool_ids: c.toolIds } : null, error: null });
          }
          if (table === "followup_flow_versions") return new FakeQuery({ data: c.graph ? { graph: c.graph } : null, error: null });
          throw new Error(`tabela inesperada no teste: ${table}`);
        },
      };
    },
  } as unknown as SupabaseClient;
}

const pointerAtivoWebhook = {
  id: POINTER,
  status: "active",
  trigger_config: { kind: "webhook" },
  active_version_id: "44444444-4444-4444-4444-444444444444",
};

const agenteArmaOPointer = [{ agent_id: AGENT, followup: { enabled: true, flow_pointer_ids: [POINTER] } }];

describe("validarFluxoDeCobranca", () => {
  it("pointer inativo → inativo", async () => {
    const admin = fakeAdmin({
      pointer: { ...pointerAtivoWebhook, status: "disabled" },
      agentesPublicados: [],
      toolIds: null,
      graph: null,
    });
    const r = await validarFluxoDeCobranca(admin, ORG, POINTER);
    expect(r).toMatchObject({ ok: false, motivo: "inativo" });
  });

  it("trigger_config.kind != webhook → gatilho_errado", async () => {
    const admin = fakeAdmin({
      pointer: { ...pointerAtivoWebhook, trigger_config: { kind: "manual" } },
      agentesPublicados: [],
      toolIds: null,
      graph: null,
    });
    const r = await validarFluxoDeCobranca(admin, ORG, POINTER);
    expect(r).toMatchObject({ ok: false, motivo: "gatilho_errado" });
  });

  it("nenhum agente publicado arma o pointer → sem_agente", async () => {
    const admin = fakeAdmin({
      pointer: pointerAtivoWebhook,
      agentesPublicados: [],
      toolIds: null,
      graph: null,
    });
    const r = await validarFluxoDeCobranca(admin, ORG, POINTER);
    expect(r).toMatchObject({ ok: false, motivo: "sem_agente" });
  });

  it("agente arma mas tool_ids não tem as capacidades → agente_sem_capacidades com a lista do que falta", async () => {
    const admin = fakeAdmin({
      pointer: pointerAtivoWebhook,
      agentesPublicados: agenteArmaOPointer,
      toolIds: [TODAS_AS_TOOLS[0] as string],
      graph: { nodes: [] },
    });
    const r = await validarFluxoDeCobranca(admin, ORG, POINTER);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("esperava ok:false");
    expect(r.motivo).toBe("agente_sem_capacidades");
    expect(r.detalhe).toContain(TOOLS_COBRANCA[1]!.rotulo);
  });

  it("fluxo com nó action mode=text → ok com avisoTextoFixo=true", async () => {
    const admin = fakeAdmin({
      pointer: pointerAtivoWebhook,
      agentesPublicados: agenteArmaOPointer,
      toolIds: TODAS_AS_TOOLS,
      graph: { nodes: [{ type: "trigger" }, { type: "action", config: { mode: "text" } }] },
    });
    const r = await validarFluxoDeCobranca(admin, ORG, POINTER);
    expect(r).toMatchObject({ ok: true, agentId: AGENT, avisoTextoFixo: true });
  });
});
