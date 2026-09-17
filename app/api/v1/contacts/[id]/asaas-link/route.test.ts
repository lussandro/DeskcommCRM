import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/asaas/titular", () => ({ vincularPeloOperador: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { vincularPeloOperador } from "@/lib/asaas/titular";
import { audit } from "@/lib/audit";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const CONTACT_ID = "22222222-2222-4222-8222-222222222222";

function sessao(role: "viewer" | "agent" | "manager" = "agent") {
  vi.mocked(requireRole).mockImplementation(async (min) => {
    const rank = { viewer: 1, agent: 2, ai_operator: 3, manager: 4, admin: 5 } as const;
    if (rank[role] < rank[min as keyof typeof rank]) {
      const { NextResponse } = await import("next/server");
      return { ok: false, response: NextResponse.json({ error: { code: "forbidden", message: "x" } }, { status: 403 }) } as never;
    }
    return { ok: true, user: { id: "u1", idioma: "pt-BR" }, org: { orgId: ORG_ID, name: "Org", role } } as never;
  });
}

function fakeAdmin(contato: { id: string } | null) {
  return {
    from: (table: string) => {
      if (table === "contacts") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: contato, error: null }),
              }),
            }),
          }),
        };
      }
      throw new Error(`tabela inesperada: ${table}`);
    },
  };
}

function ctxFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

function postReq(body: unknown) {
  return new NextRequest(`http://x/api/v1/contacts/${CONTACT_ID}/asaas-link`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createAdminClient).mockReturnValue(fakeAdmin({ id: CONTACT_ID }) as never);
});

describe("POST /api/v1/contacts/[id]/asaas-link", () => {
  it("viewer recebe 403 e o handler não roda", async () => {
    sessao("viewer");
    const { POST } = await import("./route");
    const res = await POST(postReq({ customer_id: "cus_1" }), ctxFor(CONTACT_ID));
    expect(res.status).toBe(403);
    expect(vincularPeloOperador).not.toHaveBeenCalled();
  });

  it("agent vincula e audita com actor operator", async () => {
    sessao("agent");
    vi.mocked(vincularPeloOperador).mockResolvedValue(undefined);
    const { POST } = await import("./route");
    const res = await POST(postReq({ customer_id: "cus_1" }), ctxFor(CONTACT_ID));
    expect(res.status).toBe(200);
    expect(vincularPeloOperador).toHaveBeenCalledWith(expect.anything(), ORG_ID, { kind: "contact", id: CONTACT_ID }, "cus_1");
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "asaas.contact_linked",
        organizationId: ORG_ID,
        resourceType: "contact",
        resourceId: CONTACT_ID,
        metadata: expect.objectContaining({ customer_id: "cus_1", actor: "operator" }),
      }),
    );
  });

  it("customer já vinculado a outro cadastro → 409", async () => {
    sessao("agent");
    vi.mocked(vincularPeloOperador).mockRejectedValue(new Error("este cliente do Asaas já está vinculado a outro cadastro"));
    const { POST } = await import("./route");
    const res = await POST(postReq({ customer_id: "cus_1" }), ctxFor(CONTACT_ID));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("customer_ja_vinculado");
  });

  it("body sem customer_id é 422", async () => {
    sessao("agent");
    const { POST } = await import("./route");
    const res = await POST(postReq({}), ctxFor(CONTACT_ID));
    expect(res.status).toBe(422);
    expect(vincularPeloOperador).not.toHaveBeenCalled();
  });
});
