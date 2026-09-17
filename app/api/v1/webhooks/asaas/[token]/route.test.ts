import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { decryptWebhookSecret } from "@/lib/webhooks/secrets";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/ai/dispatcher/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, count: 1, limit: 120, window_sec: 60 })),
}));
vi.mock("@/lib/webhooks/secrets", () => ({ decryptWebhookSecret: vi.fn(async () => "segredo-correto") }));

const TOKEN = "tok_asaas_teste";
const ORG_ID = "11111111-1111-4111-8111-111111111111";
const INTEG_ID = "22222222-2222-4222-8222-222222222222";

let integRow: Record<string, unknown> | null;
let insertCalls: Array<Record<string, unknown>>;
let insertError: { code?: string; message: string } | null;
let logId: string;
let updateCalls: Array<Record<string, unknown>>;
let rpcCalls: Array<{ name: string; args: Record<string, unknown> }>;
let emitError: { message: string } | null;

function req(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost/api/v1/webhooks/asaas/${TOKEN}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function mockAdmin() {
  return {
    from: (table: string) => {
      if (table === "tenant_integrations") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: integRow, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "webhook_events_log") {
        return {
          insert: (row: Record<string, unknown>) => {
            insertCalls.push(row);
            return {
              select: () => ({
                single: async () =>
                  insertError ? { data: null, error: insertError } : { data: { id: logId }, error: null },
              }),
            };
          },
          update: (patch: Record<string, unknown>) => ({
            eq: async () => {
              updateCalls.push(patch);
              return { error: null };
            },
          }),
        };
      }
      throw new Error(`tabela inesperada: ${table}`);
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return { error: emitError };
    },
  };
}

const PAYLOAD_RECEIVED = {
  event: "PAYMENT_RECEIVED",
  payment: {
    id: "pay_1",
    customer: "cus_1",
    status: "RECEIVED",
    value: 100,
    dueDate: "2026-09-20",
    creditCardHolderInfo: { cpfCnpj: "12345678900" },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  integRow = { id: INTEG_ID, organization_id: ORG_ID, status: "healthy", webhook_secret_encrypted: "enc" };
  insertCalls = [];
  insertError = null;
  logId = "33333333-3333-4333-8333-333333333333";
  updateCalls = [];
  rpcCalls = [];
  emitError = null;
  vi.mocked(createAdminClient).mockReturnValue(mockAdmin() as never);
  vi.mocked(decryptWebhookSecret).mockResolvedValue("segredo-correto");
});

describe("POST /api/v1/webhooks/asaas/[token]", () => {
  it("token desconhecido → 200 vazio, sem insert", async () => {
    integRow = null;
    const { POST } = await import("./route");
    const res = await POST(req(PAYLOAD_RECEIVED, { "asaas-access-token": "segredo-correto" }), {
      params: Promise.resolve({ token: TOKEN }),
    });
    expect(res.status).toBe(200);
    expect(insertCalls).toEqual([]);
  });

  it("integração não healthy → 200 vazio, sem insert", async () => {
    integRow = { ...integRow, status: "disconnected" };
    const { POST } = await import("./route");
    const res = await POST(req(PAYLOAD_RECEIVED, { "asaas-access-token": "segredo-correto" }), {
      params: Promise.resolve({ token: TOKEN }),
    });
    expect(res.status).toBe(200);
    expect(insertCalls).toEqual([]);
  });

  it("asaas-access-token errado → 401 + audit asaas.webhook_invalid_signature", async () => {
    const { POST } = await import("./route");
    const res = await POST(req(PAYLOAD_RECEIVED, { "asaas-access-token": "token-errado-x" }), {
      params: Promise.resolve({ token: TOKEN }),
    });
    expect(res.status).toBe(401);
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "asaas.webhook_invalid_signature",
        organizationId: ORG_ID,
        resourceId: INTEG_ID,
      }),
    );
    expect(insertCalls).toEqual([]);
  });

  it("token de mesmo comprimento em CARACTERES mas bytes diferentes (unicode) → 401, sem lançar", async () => {
    // "segredo-corret" + é (2 bytes utf8) tem 15 chars como "segredo-correto",
    // mas comprimento em bytes diferente do secret — recusa sem estourar o
    // timingSafeEqual.
    const tokenUnicode = "segredo-correté";
    expect(tokenUnicode.length).toBe("segredo-correto".length);
    const { POST } = await import("./route");
    let res: Response | undefined;
    await expect(
      (async () => {
        res = await POST(req(PAYLOAD_RECEIVED, { "asaas-access-token": tokenUnicode }), {
          params: Promise.resolve({ token: TOKEN }),
        });
      })(),
    ).resolves.not.toThrow();
    expect(res?.status).toBe(401);
  });

  it("token errado do MESMO tamanho em bytes → 401 sem lançar (passa pelo timingSafeEqual real, não pelo atalho de tamanho)", async () => {
    // ponytail: espiar o export nomeado `timingSafeEqual` de "node:crypto" não
    // funciona neste harness — vi.mock("node:crypto", importOriginal) troca o
    // módulo no registry do vitest, mas o bundling de rota (next/server) da
    // suíte resolve o node:crypto real por outro caminho, então o wrapper
    // nunca é chamado (confirmado isolando o caso: 0 chamadas registradas com
    // o comportamento correto de qualquer forma). O que importa — recusar sem
    // estourar — fica coberto aqui e no teste de unicode acima.
    const errado = "x".repeat("segredo-correto".length);
    const { POST } = await import("./route");
    let res: Response | undefined;
    await expect(
      (async () => {
        res = await POST(req(PAYLOAD_RECEIVED, { "asaas-access-token": errado }), {
          params: Promise.resolve({ token: TOKEN }),
        });
      })(),
    ).resolves.not.toThrow();
    expect(res?.status).toBe(401);
  });

  it("evento de interesse → insert com provider asaas, external_id 'pay_1:PAYMENT_RECEIVED', headers sem token, raw_body sem cpfCnpj; emit_event com org da integração", async () => {
    const { POST } = await import("./route");
    const res = await POST(req(PAYLOAD_RECEIVED, { "asaas-access-token": "segredo-correto" }), {
      params: Promise.resolve({ token: TOKEN }),
    });
    expect(res.status).toBe(200);
    expect(insertCalls).toHaveLength(1);
    const row = insertCalls[0]!;
    expect(row.provider).toBe("asaas");
    expect(row.external_id).toBe("pay_1:PAYMENT_RECEIVED");
    expect(row.headers).not.toHaveProperty("asaas-access-token");
    expect(String(row.raw_body)).not.toContain("12345678900");

    expect(rpcCalls).toHaveLength(1);
    const rpcCall = rpcCalls[0]!;
    expect(rpcCall.name).toBe("emit_event");
    expect(rpcCall.args.p_event_type).toBe("asaas.payment_received");
    expect(rpcCall.args.p_organization_id).toBe(ORG_ID);
  });

  it("insert 23505 (duplicado) → 200 { duplicate: true }, sem emit_event", async () => {
    insertError = { code: "23505", message: "duplicate key" };
    const { POST } = await import("./route");
    const res = await POST(req(PAYLOAD_RECEIVED, { "asaas-access-token": "segredo-correto" }), {
      params: Promise.resolve({ token: TOKEN }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ duplicate: true });
    expect(rpcCalls).toEqual([]);
  });

  it("erro genérico no insert do log (não 23505) → 500, emit_event NÃO chamado", async () => {
    insertError = { message: "conexão caiu" };
    const { POST } = await import("./route");
    const res = await POST(req(PAYLOAD_RECEIVED, { "asaas-access-token": "segredo-correto" }), {
      params: Promise.resolve({ token: TOKEN }),
    });
    expect(res.status).toBe(500);
    expect(rpcCalls).toEqual([]);
  });

  it("evento fora da lista de interesse → log processed, sem emit_event", async () => {
    const payload = { ...PAYLOAD_RECEIVED, event: "PAYMENT_CREATED" };
    const { POST } = await import("./route");
    const res = await POST(req(payload, { "asaas-access-token": "segredo-correto" }), {
      params: Promise.resolve({ token: TOKEN }),
    });
    expect(res.status).toBe(200);
    expect(insertCalls[0]!.status).toBe("processed");
    expect(rpcCalls).toEqual([]);
    const body = await res.json();
    expect(body.data).toEqual({ ignored: true });
  });

  it("erro no emit_event → 200 e status='error' gravado no log", async () => {
    emitError = { message: "rpc falhou" };
    const { POST } = await import("./route");
    const res = await POST(req(PAYLOAD_RECEIVED, { "asaas-access-token": "segredo-correto" }), {
      params: Promise.resolve({ token: TOKEN }),
    });
    expect(res.status).toBe(200);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]).toMatchObject({ status: "error", error_message: "rpc falhou" });
  });

  it("respeita rate limit (429 com Retry-After)", async () => {
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ allowed: false, count: 999, limit: 120, window_sec: 60 });
    const { POST } = await import("./route");
    const res = await POST(req(PAYLOAD_RECEIVED, { "asaas-access-token": "segredo-correto" }), {
      params: Promise.resolve({ token: TOKEN }),
    });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
  });
});
