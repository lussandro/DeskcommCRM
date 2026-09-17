import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({})) }));
vi.mock("@/lib/companies/handler", () => ({
  linkContactHandler: vi.fn(async () => undefined),
  unlinkContactHandler: vi.fn(async () => undefined),
}));
import { requireRole } from "@/lib/auth/require-role";
import { linkContactHandler, unlinkContactHandler } from "@/lib/companies/handler";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const COMPANY_ID = "22222222-2222-4222-8222-222222222222";
const CONTACT_ID = "33333333-3333-4333-8333-333333333333";

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

describe("POST /api/v1/companies/[id]/contacts", () => {
  beforeEach(() => vi.clearAllMocks());
  it("agent vincula contato", async () => {
    sessao("agent");
    const { POST } = await import("./route");
    const res = await POST(
      new NextRequest(`http://x/api/v1/companies/${COMPANY_ID}/contacts`, { method: "POST", body: JSON.stringify({ contact_id: CONTACT_ID }), headers: { "content-type": "application/json" } }),
      ctxFor(COMPANY_ID),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ data: { linked: true } });
    expect(vi.mocked(linkContactHandler).mock.calls[0]![2]).toMatchObject({ companyId: COMPANY_ID, contactId: CONTACT_ID });
  });
  it("body sem contact_id é 422", async () => {
    sessao("agent");
    const { POST } = await import("./route");
    const res = await POST(
      new NextRequest(`http://x/api/v1/companies/${COMPANY_ID}/contacts`, { method: "POST", body: JSON.stringify({}), headers: { "content-type": "application/json" } }),
      ctxFor(COMPANY_ID),
    );
    expect(res.status).toBe(422);
    expect(linkContactHandler).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/v1/companies/[id]/contacts", () => {
  beforeEach(() => vi.clearAllMocks());
  it("agent desvincula com 204", async () => {
    sessao("agent");
    const { DELETE } = await import("./route");
    const res = await DELETE(
      new NextRequest(`http://x/api/v1/companies/${COMPANY_ID}/contacts`, { method: "DELETE", body: JSON.stringify({ contact_id: CONTACT_ID }), headers: { "content-type": "application/json" } }),
      ctxFor(COMPANY_ID),
    );
    expect(res.status).toBe(204);
    expect(unlinkContactHandler).toHaveBeenCalled();
  });
});
