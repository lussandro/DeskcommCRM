/**
 * Token de servidor de organização suspensa não trabalha.
 *
 * UM ponto cobre DUAS linhas da matriz: `resolveAuthDual`
 * (`/api/v1/*` com `Authorization: Bearer`) e `app/api/mcp/route.ts:41`
 * chamam a mesma `validateBearerToken`. Sem isto, a organização suspensa
 * seguia operando o CRM inteiro por integração — inclusive escrevendo.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { McpAuthError, validateBearerToken } from "@/lib/mcp/auth";
import { createAdminClient } from "@/lib/supabase/admin";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

const TOKEN = "dsk_abc_segredo";
const ORG = "22222222-2222-4222-8222-222222222222";

function bancoComStatus(status: string | null, forma: "objeto" | "array" = "objeto") {
  const linha = {
    id: "33333333-3333-4333-8333-333333333333",
    organization_id: ORG,
    scopes: ["mcp:read"],
    revoked_at: null,
    expires_at: null,
    organizations: forma === "array" ? [{ status }] : { status },
  };
  const colunasPedidas: string[] = [];
  const update = { eq: vi.fn(async () => ({ error: null })) };
  vi.mocked(createAdminClient).mockReturnValue({
    from: vi.fn(() => ({
      select: vi.fn((colunas: string) => {
        colunasPedidas.push(colunas);
        return {
          eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: linha, error: null })) })),
        };
      }),
      update: vi.fn(() => update),
    })),
  } as unknown as ReturnType<typeof createAdminClient>);
  return { colunasPedidas };
}

beforeEach(() => vi.clearAllMocks());

describe("validateBearerToken sob organização suspensa", () => {
  it("recusa com 403 e código MCP -32002", async () => {
    bancoComStatus("suspended");
    await expect(validateBearerToken(`Bearer ${TOKEN}`)).rejects.toMatchObject({
      httpStatus: 403,
      mcpCode: -32002,
    });
    await expect(validateBearerToken(`Bearer ${TOKEN}`)).rejects.toBeInstanceOf(McpAuthError);
  });

  it("não atrapalha organização ativa", async () => {
    bancoComStatus("active");
    const r = await validateBearerToken(`Bearer ${TOKEN}`);
    expect(r.organizationId).toBe(ORG);
  });

  // O PostgREST devolve o embed como OBJETO ou como ARRAY conforme a inferência
  // do relacionamento, e `validateBearerToken` trata os dois. Sem estes dois
  // casos o ramo do array não é exercitado por ninguém: se `orgJoin[0]`
  // estivesse errado, a suíte seguiria verde e o gate nunca dispararia — que é
  // exatamente o que o comentário do código chama de falha silenciosa.
  // O gate inteiro depende de UMA string: sem `organizations(status)` no select,
  // o embed nunca vem, `orgStatus` é sempre null e a organização suspensa passa
  // — com a suíte verde, porque os dublês devolvem a linha pronta e ignoram o
  // que foi pedido. Este caso vigia a string, que é a peça que ninguém olhava.
  it("pede o status da organização no select — sem o embed o gate fica cego", async () => {
    const { colunasPedidas } = bancoComStatus("active");
    await validateBearerToken(`Bearer ${TOKEN}`);
    expect(colunasPedidas).toHaveLength(1);
    expect(colunasPedidas[0]).toContain("organizations(status)");
  });

  it("recusa também quando o embed vem como ARRAY", async () => {
    bancoComStatus("suspended", "array");
    await expect(validateBearerToken(`Bearer ${TOKEN}`)).rejects.toMatchObject({
      httpStatus: 403,
      mcpCode: -32002,
      apiCode: "tenant_suspended",
    });
  });

  it("não atrapalha organização ativa com embed em ARRAY", async () => {
    bancoComStatus("active", "array");
    const r = await validateBearerToken(`Bearer ${TOKEN}`);
    expect(r.organizationId).toBe(ORG);
  });

  it("não atrapalha quando o embed vem vazio", async () => {
    bancoComStatus(null);
    const r = await validateBearerToken(`Bearer ${TOKEN}`);
    expect(r.organizationId).toBe(ORG);
  });

  it("o envelope REST diz tenant_suspended, não forbidden genérico", async () => {
    bancoComStatus("suspended");
    const { resolveAuthDual } = await import("@/lib/api/auth-dual");
    const req = new Request("https://x/api/v1/contacts", {
      headers: { authorization: `Bearer ${TOKEN}` },
    }) as unknown as import("next/server").NextRequest;
    const r = await resolveAuthDual(req, {
      requestId: "req-t",
      resource: "contacts",
      role: "agent",
      scope: "mcp:read",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.response.status).toBe(403);
    expect((await r.response.json()).error.code).toBe("tenant_suspended");
  });
});
