import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/asaas/config", () => ({ carregarIntegracaoAsaas: vi.fn() }));
vi.mock("@/lib/asaas/titular", () => ({ vincularPeloOperador: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { carregarIntegracaoAsaas } from "@/lib/asaas/config";
import { vincularPeloOperador } from "@/lib/asaas/titular";
import { audit } from "@/lib/audit";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const COMPANY_ID = "22222222-2222-4222-8222-222222222222";

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

function fakeAdmin(empresa: { id: string; asaas_customer_id?: string | null } | null) {
  return {
    from: (table: string) => {
      if (table === "crm_companies") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: empresa, error: null }),
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createAdminClient).mockReturnValue(fakeAdmin({ id: COMPANY_ID, asaas_customer_id: null }) as never);
});

describe("GET /api/v1/companies/[id]/asaas", () => {
  it("módulo desligado → 409 asaas_inativo", async () => {
    sessao();
    vi.mocked(carregarIntegracaoAsaas).mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(new NextRequest(`http://x/api/v1/companies/${COMPANY_ID}/asaas`), ctxFor(COMPANY_ID));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("asaas_inativo");
  });

  it("empresa sem vínculo → linked:false, charges vazio", async () => {
    sessao();
    vi.mocked(createAdminClient).mockReturnValue(fakeAdmin({ id: COMPANY_ID, asaas_customer_id: null }) as never);
    vi.mocked(carregarIntegracaoAsaas).mockResolvedValue({ cliente: {} } as never);
    const { GET } = await import("./route");
    const res = await GET(new NextRequest(`http://x/api/v1/companies/${COMPANY_ID}/asaas`), ctxFor(COMPANY_ID));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ data: { linked: false, charges: [] } });
  });

  it("empresa vinculada → pendências projetadas, sem documento", async () => {
    sessao();
    vi.mocked(createAdminClient).mockReturnValue(fakeAdmin({ id: COMPANY_ID, asaas_customer_id: "cus_1" }) as never);
    const payments = vi.fn(async (_id: string, status: string) => ({
      data:
        status === "OVERDUE"
          ? [{ id: "pay_1", customer: "cus_1", status: "OVERDUE", value: 100.5, dueDate: "2026-09-01", billingType: "BOLETO", invoiceUrl: "https://x/1" }]
          : [{ id: "pay_2", customer: "cus_1", status: "PENDING", value: 50, dueDate: "2026-09-10", billingType: "PIX", invoiceUrl: null }],
      hasMore: false,
    }));
    vi.mocked(carregarIntegracaoAsaas).mockResolvedValue({ cliente: { payments } } as never);
    const { GET } = await import("./route");
    const res = await GET(new NextRequest(`http://x/api/v1/companies/${COMPANY_ID}/asaas`), ctxFor(COMPANY_ID));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.linked).toBe(true);
    expect(body.data.charges).toHaveLength(2);
    // Nunca documento (CPF/CNPJ) na projeção.
    const serialized = JSON.stringify(body.data.charges);
    expect(serialized).not.toMatch(/cpf|cnpj|document/i);
    expect(body.data.charges[0]).toMatchObject({
      payment_id: expect.any(String),
      status: expect.any(String),
      billing_type: expect.any(String),
      value_cents: expect.any(Number),
      due_date: expect.any(String),
    });
  });
});

describe("POST /api/v1/companies/[id]/asaas", () => {
  function postReq(body: unknown) {
    return new NextRequest(`http://x/api/v1/companies/${COMPANY_ID}/asaas`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  }

  it("CNPJ sem customer no Asaas → 404 customer_nao_encontrado", async () => {
    sessao();
    vi.mocked(carregarIntegracaoAsaas).mockResolvedValue({
      cliente: { customerPorDocumento: vi.fn(async () => ({ data: [], hasMore: false })) },
    } as never);
    const { POST } = await import("./route");
    const res = await POST(postReq({ cnpj: "11222333000181" }), ctxFor(COMPANY_ID));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("customer_nao_encontrado");
  });

  it("customer já vinculado a outro cadastro → 409 customer_ja_vinculado", async () => {
    sessao();
    vi.mocked(carregarIntegracaoAsaas).mockResolvedValue({
      cliente: { customerPorDocumento: vi.fn(async () => ({ data: [{ id: "cus_1" }], hasMore: false })) },
    } as never);
    vi.mocked(vincularPeloOperador).mockRejectedValue(new Error("este cliente do Asaas já está vinculado a outro cadastro"));
    const { POST } = await import("./route");
    const res = await POST(postReq({ cnpj: "11222333000181" }), ctxFor(COMPANY_ID));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("customer_ja_vinculado");
  });

  it("vincula com sucesso e audita com resourceId = uuid da empresa", async () => {
    sessao();
    vi.mocked(carregarIntegracaoAsaas).mockResolvedValue({
      cliente: { customerPorDocumento: vi.fn(async () => ({ data: [{ id: "cus_1" }], hasMore: false })) },
    } as never);
    vi.mocked(vincularPeloOperador).mockResolvedValue(undefined);
    const { POST } = await import("./route");
    const res = await POST(postReq({ cnpj: "11222333000181" }), ctxFor(COMPANY_ID));
    expect(res.status).toBe(200);
    expect(vincularPeloOperador).toHaveBeenCalledWith(expect.anything(), ORG_ID, { kind: "company", id: COMPANY_ID }, "cus_1");
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "asaas.company_linked",
        organizationId: ORG_ID,
        resourceType: "company",
        resourceId: COMPANY_ID,
        metadata: expect.objectContaining({ customer_id: "cus_1" }),
      }),
    );
  });

  it("viewer não alcança POST", async () => {
    sessao("viewer");
    vi.mocked(carregarIntegracaoAsaas).mockResolvedValue({ cliente: {} } as never);
    const { POST } = await import("./route");
    const res = await POST(postReq({ cnpj: "11222333000181" }), ctxFor(COMPANY_ID));
    expect(res.status).toBe(403);
    expect(vincularPeloOperador).not.toHaveBeenCalled();
  });
});
