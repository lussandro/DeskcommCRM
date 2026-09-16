/**
 * Quando o modelo manda um `appointment_id` que não existe, a tool age sobre o
 * ÚNICO compromisso futuro do contato do turno — e só nesse caso.
 *
 * Medido em 2026-09-16: a agente listou o compromisso (`755e792a…`) e, ao
 * remarcar, mandou `004edec5…`; a tool respondeu "não encontrado" e a agente
 * disse "vou confirmar" para sempre. Com dois compromissos abertos, nada é
 * adivinhado — remarcar o errado é pior do que responder "não encontrado".
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/api/v1/agenda/agendamentos/_handler", () => ({
  marcarAgendamentoHandler: vi.fn(),
  alterarAgendamentoHandler: vi.fn(),
  cancelarAgendamentoHandler: vi.fn(),
}));

const { compromissoAlvo } = await import("@/lib/mcp/tools/agendamento");

const REAL = "755e792a-535f-475d-aea2-111f4a422aa1";
const INVENTADO = "004edec5-d8a6-450d-b790-f3ede9a4e7bc";
const CONTATO = "c8600251-ee44-4bdc-9210-bd555a0f21ab";

/** Supabase fingido: `existe` responde ao lookup por id; `abertos` à lista do contato. */
function supabaseFalso(existe: boolean, abertos: string[]) {
  const cadeia = (resposta: unknown) => {
    const c: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "gt", "limit"]) c[m] = () => c;
    c["maybeSingle"] = async () => ({ data: existe ? { id: REAL } : null });
    c["then"] = (ok: (v: unknown) => unknown) => Promise.resolve(resposta).then(ok);
    return c;
  };
  let chamada = 0;
  return {
    from: () => {
      chamada += 1;
      return chamada === 1
        ? cadeia({ data: existe ? { id: REAL } : null })
        : cadeia({ data: abertos.map((id) => ({ id })) });
    },
  };
}

function ctx(existe: boolean, abertos: string[], turnContactId: string | null = CONTATO) {
  return {
    organizationId: "org-1",
    role: "ai_operator",
    actor: { type: "ai_agent", id: "ag-1", role: "ai_operator" },
    apiTokenId: "tok-1",
    requestId: "req-1",
    supabase: supabaseFalso(existe, abertos),
    turnContactId,
  } as never;
}

describe("compromissoAlvo — o compromisso sobre o qual a tool age", () => {
  it("id existente atravessa intacto", async () => {
    expect(await compromissoAlvo(ctx(true, []), REAL)).toBe(REAL);
  });
  it("id inventado + um único compromisso futuro do contato → usa o do contato", async () => {
    expect(await compromissoAlvo(ctx(false, [REAL]), INVENTADO)).toBe(REAL);
  });
  it("id inventado + dois compromissos futuros → não adivinha, devolve o original", async () => {
    expect(await compromissoAlvo(ctx(false, [REAL, "22222222-2222-4222-8222-222222222222"]), INVENTADO)).toBe(INVENTADO);
  });
  it("id inventado + nenhum compromisso → devolve o original", async () => {
    expect(await compromissoAlvo(ctx(false, []), INVENTADO)).toBe(INVENTADO);
  });
  it("sem contato do turno (cliente MCP externo) → nada muda", async () => {
    expect(await compromissoAlvo(ctx(false, [REAL], null), INVENTADO)).toBe(INVENTADO);
  });
  it("consulta que falha não derruba a tool — volta o id original", async () => {
    expect(await compromissoAlvo({ organizationId: "org-1", supabase: {}, turnContactId: CONTATO } as never, INVENTADO)).toBe(INVENTADO);
  });
});
