import { describe, it, expect, vi, afterEach } from "vitest";
import { AsaasCliente, AsaasErro } from "./cliente";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
afterEach(() => fetchMock.mockReset());

function resp(status: number, body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}

describe("AsaasCliente", () => {
  it("monta URL por ambiente e manda a chave no header access_token", async () => {
    fetchMock.mockReturnValueOnce(resp(200, { data: [], hasMore: false, totalCount: 0 }));
    const c = new AsaasCliente("k-123", "sandbox");
    await c.payments("cus_1", "OVERDUE");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api-sandbox.asaas.com/v3/payments?customer=cus_1&status=OVERDUE&limit=100&offset=0");
    expect((init as RequestInit).headers).toMatchObject({ access_token: "k-123" });
  });

  it("4xx vira AsaasErro com code e descricao do Asaas; invalid_action não é erro nosso", async () => {
    fetchMock.mockReturnValueOnce(resp(400, { errors: [{ code: "invalid_action", description: "Cobrança já recebida." }] }));
    const c = new AsaasCliente("k", "producao");
    await expect(c.alterarVencimento("pay_1", "2026-10-01")).rejects.toMatchObject({ status: 400, code: "invalid_action", descricao: "Cobrança já recebida.", nossoErro: false });
  });

  it("invalid_value é erro nosso", async () => {
    fetchMock.mockReturnValueOnce(resp(400, { errors: [{ code: "invalid_value", description: "dueDate inválida" }] }));
    await expect(new AsaasCliente("k", "producao").alterarVencimento("p", "x")).rejects.toMatchObject({ nossoErro: true });
  });

  it("a chave nunca aparece na mensagem de erro", async () => {
    fetchMock.mockReturnValueOnce(resp(401, { errors: [{ code: "invalid_api_key", description: "Chave inválida" }] }));
    const err = await new AsaasCliente("segredo-xyz", "producao").balance().catch((e) => e as AsaasErro);
    expect(String(err)).not.toContain("segredo-xyz");
  });

  it("timeout de 10s vira AsaasErro status 0", async () => {
    fetchMock.mockImplementationOnce((_u, init) => new Promise((_, rej) => (init as RequestInit).signal!.addEventListener("abort", () => rej(new DOMException("x", "AbortError")))));
    const c = new AsaasCliente("k", "sandbox", { timeoutMs: 5 });
    await expect(c.balance()).rejects.toMatchObject({ status: 0 });
  });
});
