import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({})) }));
vi.mock("@/lib/companies/handler", () => ({
  getCompanyHandler: vi.fn(async (_sb, _ctx, input) => ({ id: input.companyId, name: "A", contacts: [] })),
  patchCompanyHandler: vi.fn(async (_sb, _ctx, input) => ({ id: input.companyId, ...input.patch })),
  deleteCompanyHandler: vi.fn(async () => undefined),
}));
import { requireRole } from "@/lib/auth/require-role";
import { getCompanyHandler, patchCompanyHandler, deleteCompanyHandler } from "@/lib/companies/handler";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const COMPANY_ID = "22222222-2222-4222-8222-222222222222";

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

function ctxFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/v1/companies/[id]", () => {
  beforeEach(() => vi.clearAllMocks());
  it("viewer lê a empresa", async () => {
    sessao("viewer");
    const { GET } = await import("./route");
    const res = await GET(new NextRequest(`http://x/api/v1/companies/${COMPANY_ID}`), ctxFor(COMPANY_ID));
    expect(res.status).toBe(200);
    expect(vi.mocked(getCompanyHandler).mock.calls[0]![2]).toMatchObject({ companyId: COMPANY_ID });
    expect(vi.mocked(getCompanyHandler).mock.calls[0]![1]).toMatchObject({ organization_id: ORG_ID });
  });
});

describe("PATCH /api/v1/companies/[id]", () => {
  beforeEach(() => vi.clearAllMocks());
  it("viewer recebe 403 e o handler não roda", async () => {
    sessao("viewer");
    const { PATCH } = await import("./route");
    const res = await PATCH(
      new NextRequest(`http://x/api/v1/companies/${COMPANY_ID}`, { method: "PATCH", body: JSON.stringify({ name: "B" }), headers: { "content-type": "application/json" } }),
      ctxFor(COMPANY_ID),
    );
    expect(res.status).toBe(403);
    expect(patchCompanyHandler).not.toHaveBeenCalled();
  });
  it("agent atualiza billing_contact_id", async () => {
    sessao("agent");
    const { PATCH } = await import("./route");
    const billing_contact_id = "33333333-3333-4333-8333-333333333333";
    const res = await PATCH(
      new NextRequest(`http://x/api/v1/companies/${COMPANY_ID}`, { method: "PATCH", body: JSON.stringify({ billing_contact_id }), headers: { "content-type": "application/json" } }),
      ctxFor(COMPANY_ID),
    );
    expect(res.status).toBe(200);
    expect(vi.mocked(patchCompanyHandler).mock.calls[0]![2]).toMatchObject({ companyId: COMPANY_ID, patch: { billing_contact_id } });
  });
});

describe("DELETE /api/v1/companies/[id]", () => {
  beforeEach(() => vi.clearAllMocks());
  it("agent recebe 403", async () => {
    sessao("agent");
    const { DELETE } = await import("./route");
    const res = await DELETE(new NextRequest(`http://x/api/v1/companies/${COMPANY_ID}`, { method: "DELETE" }), ctxFor(COMPANY_ID));
    expect(res.status).toBe(403);
    expect(deleteCompanyHandler).not.toHaveBeenCalled();
  });
  it("manager apaga com 204", async () => {
    sessao("manager");
    const { DELETE } = await import("./route");
    const res = await DELETE(new NextRequest(`http://x/api/v1/companies/${COMPANY_ID}`, { method: "DELETE" }), ctxFor(COMPANY_ID));
    expect(res.status).toBe(204);
    expect(deleteCompanyHandler).toHaveBeenCalled();
  });
});
