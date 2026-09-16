/**
 * O CONTATO DO TURNO CHEGA À TOOL QUE O EXIGE — sem depender do modelo.
 *
 * `crm_book_appointment` exige `contact_id` (uuid). O modelo não tem esse id:
 * ele não está no contexto, e o que o modelo inventa para "não sei" a higiene
 * de `lib/mcp/uuid-de-aterro.ts` apaga. Medido em produção em 2026-09-16, na
 * organização do dono: a agente consultou a agenda, ofereceu horários reais,
 * a cliente escolheu — e nenhuma marcação aconteceu, três vezes, porque a
 * chamada nunca chegava ao handler com um contato. Quem está sendo atendido é
 * quem escreveu: o seam preenche.
 */
import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/agenda/consulta", async (original) => {
  const real = await original<typeof import("@/lib/agenda/consulta")>();
  return { ...real, idDoTipoPorSlug: vi.fn() };
});
vi.mock("@/app/api/v1/agenda/agendamentos/_handler", () => ({
  marcarAgendamentoHandler: vi.fn(),
  alterarAgendamentoHandler: vi.fn(),
  cancelarAgendamentoHandler: vi.fn(),
}));
vi.mock("@/lib/mcp/audit", () => ({ auditMcpToolCall: vi.fn().mockResolvedValue(undefined) }));
// O portão de escopo de funil precisa de banco para achar o negócio do contato;
// não é o objeto desta medição — aqui ele libera.
vi.mock("@/lib/leads/escopo-de-funil", async (original) => {
  const real = await original<typeof import("@/lib/leads/escopo-de-funil")>();
  return { ...real, podeChamarFerramenta: vi.fn().mockResolvedValue({ permitido: true }) };
});

const { idDoTipoPorSlug } = await import("@/lib/agenda/consulta");
const { marcarAgendamentoHandler } = await import("@/app/api/v1/agenda/agendamentos/_handler");
const { pickToolsFromMcp } = await import("@/lib/ai/runtime/tools");

const CONTATO_DO_TURNO = "11111111-1111-4111-8111-111111111111";
const OUTRO_CONTATO = "22222222-2222-4222-8222-222222222222";
const ATERRO = "00000000-0000-0000-0000-000000000000";

function montarTurno(contactId: string | null | undefined) {
  return pickToolsFromMcp({
    toolIds: ["crm_book_appointment"],
    auth: {
      organizationId: "org-1",
      role: "ai_operator",
      scopes: ["mcp:read", "mcp:write"],
      actor: { type: "ai_agent", id: "ag-1", role: "ai_operator" },
      apiTokenId: "tok-1",
    },
    ctx: {
      organizationId: "org-1",
      role: "ai_operator",
      actor: { type: "ai_agent", id: "ag-1", role: "ai_operator" },
      apiTokenId: "tok-1",
      requestId: "req-1",
    },
    supabase: {} as never,
    pipelineIds: null,
    handoffToolEnabled: false,
    handoffSignal: { triggered: false },
    ...(contactId !== undefined ? { contactId } : {}),
  } as never);
}

async function marcar(contactId: string | null | undefined, args: Record<string, unknown>) {
  vi.mocked(idDoTipoPorSlug).mockResolvedValue({ id: "tipo-1", name: "Reunião" } as never);
  vi.mocked(marcarAgendamentoHandler).mockResolvedValue({
    ok: true,
    appointment: { id: "ag-1", starts_at: "2026-09-17T20:00:00.000Z", status: "scheduled" },
  } as never);
  const tools = montarTurno(contactId);
  const alvo = tools["crm_book_appointment"] as unknown as { execute: (a: unknown) => Promise<unknown> };
  expect(alvo, "pickToolsFromMcp não montou crm_book_appointment").toBeTruthy();
  await alvo.execute({ event_type_slug: "reuniao", starts_at: "2026-09-17T20:00:00.000Z", ...args });
  const chamada = vi.mocked(marcarAgendamentoHandler).mock.calls[0];
  return chamada ? JSON.stringify(chamada) : "";
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("o seam preenche o contato do turno quando a tool o exige", () => {
  it("modelo sem contact_id → o handler recebe o contato do turno", async () => {
    const chamada = await marcar(CONTATO_DO_TURNO, {});
    expect(chamada).toContain(CONTATO_DO_TURNO);
  });

  it("modelo com o uuid de aterro → a higiene apaga, e o contato do turno entra no lugar", async () => {
    const chamada = await marcar(CONTATO_DO_TURNO, { contact_id: ATERRO });
    expect(chamada).toContain(CONTATO_DO_TURNO);
    expect(chamada).not.toContain(ATERRO);
  });

  it("um contact_id legítimo passado pelo modelo atravessa intacto", async () => {
    // O controle: a regra é preencher o vazio, nunca sobrescrever dado bom.
    const chamada = await marcar(CONTATO_DO_TURNO, { contact_id: OUTRO_CONTATO });
    expect(chamada).toContain(OUTRO_CONTATO);
    expect(chamada).not.toContain(CONTATO_DO_TURNO);
  });

  it("sem contato no turno, nada é inventado no lugar", async () => {
    // Chamando `execute` direto não há validação de schema; o que se mede é
    // que o seam não fabrica contato algum quando o turno não tem um.
    const chamada = await marcar(undefined, {});
    expect(chamada).not.toContain(CONTATO_DO_TURNO);
    expect(chamada).not.toContain(OUTRO_CONTATO);
  });
});

describe("onde o contact_id é OPCIONAL, o seam não preenche", () => {
  it("crm_list_appointments sem contato continua sendo a agenda da equipe, não a deste contato", async () => {
    const tools = pickToolsFromMcp({
      toolIds: ["crm_list_appointments"],
      auth: { organizationId: "org-1", role: "ai_operator", scopes: ["mcp:read", "mcp:write"], actor: { type: "ai_agent", id: "ag-1", role: "ai_operator" }, apiTokenId: "tok-1" },
      ctx: { organizationId: "org-1", role: "ai_operator", actor: { type: "ai_agent", id: "ag-1", role: "ai_operator" }, apiTokenId: "tok-1", requestId: "req-1" },
      supabase: {} as never,
      pipelineIds: null,
      handoffToolEnabled: false,
      handoffSignal: { triggered: false },
      contactId: CONTATO_DO_TURNO,
    } as never);
    const alvo = tools["crm_list_appointments"] as unknown as { execute: (a: unknown) => Promise<unknown> };
    expect(alvo).toBeTruthy();
    // O handler real vai ao banco (fingido, vazio) e falha — o que se mede é o
    // payload que chegou ao gate de funil, que recebe os argumentos já tratados.
    const { podeChamarFerramenta } = await import("@/lib/leads/escopo-de-funil");
    await alvo.execute({ dia: "2026-09-17" }).catch(() => undefined);
    const argumentos = vi.mocked(podeChamarFerramenta).mock.calls.at(-1)?.[0]?.argumentos ?? {};
    expect(argumentos).not.toHaveProperty("contact_id");
  });
});

describe("a fiação existe — quem monta as tools passa o contato do turno", () => {
  // Cerca no código-fonte: o preenchimento só vale se os DOIS chamadores
  // entregarem o contato. Sabotar um deles reprova aqui, não em produção.
  it("o turno do motor passa leadId a buildMcpTurnTools", () => {
    const fonte = readFileSync("lib/agent-engine/agent/inbound-turn.ts", "utf8");
    expect(fonte).toMatch(/buildMcpTurnTools\([\s\S]{0,400}contactId: leadId/);
  });
  it("o runtime nativo passa run.contact_id a pickToolsFromMcp", () => {
    const fonte = readFileSync("lib/ai/runtime/agent.ts", "utf8");
    expect(fonte).toMatch(/pickToolsFromMcp\(\{[\s\S]{0,600}contactId: run\.contact_id/);
  });
  it("buildMcpTurnTools repassa o contato ao seam", () => {
    const fonte = readFileSync("lib/agent-engine/edge/crm/mcp-tools.ts", "utf8");
    expect(fonte).toMatch(/pickToolsFromMcp\(\{[\s\S]{0,900}contactId: ids\.contactId/);
  });
});
