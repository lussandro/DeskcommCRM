import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({})) }));
vi.mock("@/lib/companies/handler", () => ({
  listCompaniesHandler: vi.fn(async () => ({ companies: [], cursor: null, has_more: false })),
  createCompanyHandler: vi.fn(async (_sb, _ctx, input) => ({ id: "c1", ...input })),
}));
import { requireRole } from "@/lib/auth/require-role";
import { createCompanyHandler } from "@/lib/companies/handler";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
function sessao(role: "viewer" | "agent" | "manager") {
  vi.mocked(requireRole).mockImplementation(async (min) => {
    const rank = { viewer: 1, agent: 2, ai_operator: 3, manager: 4, admin: 5 } as const;
    if (rank[role] < rank[min]) {
      const { NextResponse } = await import("next/server");
      return { ok: false, response: NextResponse.json({ error: { code: "forbidden", message: "x" } }, { status: 403 }) } as never;
    }
    return { ok: true, user: { id: "u1", idioma: "pt-BR" }, org: { orgId: ORG_ID, name: "Org", role } } as never;
  });
}

describe("GET /api/v1/companies", () => {
  beforeEach(() => vi.clearAllMocks());
  it("viewer lê a lista", async () => {
    sessao("viewer");
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://x/api/v1/companies?limit=10"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ data: [], meta: { has_more: false } });
  });
  it("limit fora da faixa é 422", async () => {
    sessao("viewer");
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://x/api/v1/companies?limit=500"));
    expect(res.status).toBe(422);
  });
});

describe("POST /api/v1/companies", () => {
  beforeEach(() => vi.clearAllMocks());
  it("viewer recebe 403 e o handler não roda", async () => {
    sessao("viewer");
    const { POST } = await import("./route");
    const res = await POST(new NextRequest("http://x/api/v1/companies", { method: "POST", body: JSON.stringify({ name: "A" }), headers: { "content-type": "application/json" } }));
    expect(res.status).toBe(403);
    expect(createCompanyHandler).not.toHaveBeenCalled();
  });
  it("agent cria; organization_id do body é ignorado", async () => {
    sessao("agent");
    const { POST } = await import("./route");
    const res = await POST(new NextRequest("http://x/api/v1/companies", { method: "POST", body: JSON.stringify({ name: "A", organization_id: "zzz" }), headers: { "content-type": "application/json" } }));
    expect(res.status).toBe(201);
    const ctx = vi.mocked(createCompanyHandler).mock.calls[0]![1];
    expect(ctx.organization_id).toBe(ORG_ID);
    const input = vi.mocked(createCompanyHandler).mock.calls[0]![2] as Record<string, unknown>;
    expect(input.organization_id).toBeUndefined();
  });
});
