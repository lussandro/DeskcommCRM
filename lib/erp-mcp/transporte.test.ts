/**
 * NENHUM TESTE AQUI TOCA A REDE. `fetchImpl` é injetado em todos, e os dois
 * casos de URL recusada usam literal de IP — que `assertDestinoResolvidoSeguro`
 * julga sem passar por DNS.
 *
 * As respostas são as FORMAS medidas no servidor real (SSE, JSON puro,
 * `isError`, `-32602` com a mensagem literal). O que este arquivo vigia é
 * exatamente o que a medição ensinou e a documentação não dizia.
 */
import { describe, expect, it, vi } from "vitest";

import { chamarRpc } from "./transporte";

/** Um `fetch` que devolve sempre a mesma resposta, e registra como foi chamado. */
function fetchQueDevolve(corpo: string, init: ResponseInit = {}) {
  return vi.fn(async () => new Response(corpo, init)) as unknown as typeof fetch;
}

/**
 * O host dos testes de sucesso é um literal de IP PÚBLICO: passa nos dois guards
 * sem consultar DNS nenhum. Documentação (203.0.113.x) não serve — está na lista
 * de faixas especiais de `outbound-ip.ts`.
 */
const CFG_OK = { url: "https://8.8.8.8/api/mcp", chave: "bck_segredo" };

const SSE_OK = `event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"{\\"emAtraso\\":false}"}]}}\n\n`;

describe("chamarRpc — as duas formas de resposta (medidas)", () => {
  it("lê SSE: a carga está na linha data:", async () => {
    const r = await chamarRpc(CFG_OK, "tools/call", {}, { fetchImpl: fetchQueDevolve(SSE_OK) });
    expect(r.ok).toBe(true);
    expect(r).toEqual({ ok: true, dados: { content: [{ type: "text", text: '{"emAtraso":false}' }] } });
  });

  it("lê JSON puro: servidor que não usa SSE", async () => {
    const corpo = JSON.stringify({ jsonrpc: "2.0", id: 1, result: { tools: [{ name: "customer.status" }] } });
    const r = await chamarRpc(CFG_OK, "tools/list", {}, { fetchImpl: fetchQueDevolve(corpo) });
    expect(r).toEqual({ ok: true, dados: { tools: [{ name: "customer.status" }] } });
  });

  it("com várias linhas data:, vale a ÚLTIMA que parseia", async () => {
    // Progresso primeiro, resposta depois — a ordem do protocolo.
    const corpo =
      `data: {"jsonrpc":"2.0","method":"notifications/progress","params":{"progress":1}}\n\n` +
      `data: {"jsonrpc":"2.0","id":1,"result":{"final":true}}\n\n`;
    const r = await chamarRpc(CFG_OK, "tools/call", {}, { fetchImpl: fetchQueDevolve(corpo) });
    expect(r).toEqual({ ok: true, dados: { final: true } });
  });

  it("uma última linha data: truncada não apaga a resposta inteira que veio antes", async () => {
    const corpo = `data: {"jsonrpc":"2.0","id":1,"result":{"final":true}}\n\ndata: {"jsonrpc":"2.0","res`;
    const r = await chamarRpc(CFG_OK, "tools/call", {}, { fetchImpl: fetchQueDevolve(corpo) });
    expect(r).toEqual({ ok: true, dados: { final: true } });
  });
});

describe("chamarRpc — corpo que não serve", () => {
  it("corpo vazio", async () => {
    const r = await chamarRpc(CFG_OK, "tools/call", {}, { fetchImpl: fetchQueDevolve("") });
    expect(r).toMatchObject({ ok: false, falha: { tipo: "corpo_invalido" } });
  });

  it("corpo truncado no meio", async () => {
    const r = await chamarRpc(CFG_OK, "tools/call", {}, { fetchImpl: fetchQueDevolve('{"jsonrpc":"2.0","res') });
    expect(r).toMatchObject({ ok: false, falha: { tipo: "corpo_invalido" } });
  });

  it("envelope sem result nem error", async () => {
    const r = await chamarRpc(CFG_OK, "tools/call", {}, { fetchImpl: fetchQueDevolve('{"jsonrpc":"2.0","id":1}') });
    expect(r).toMatchObject({ ok: false, falha: { tipo: "corpo_invalido" } });
  });

  it("o detalhe do corpo inválido não carrega o corpo", async () => {
    // O corpo traz dado do cliente; só o tamanho pode ir para o log.
    const r = await chamarRpc(CFG_OK, "tools/call", {}, { fetchImpl: fetchQueDevolve("CPF 13030349000118 aqui") });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(JSON.stringify(r.falha)).not.toContain("13030349000118");
  });
});

describe("chamarRpc — HTTP", () => {
  it("500 vira falha http com o status", async () => {
    const r = await chamarRpc(CFG_OK, "tools/call", {}, { fetchImpl: fetchQueDevolve("erro", { status: 500 }) });
    expect(r).toEqual({ ok: false, falha: { tipo: "http", status: 500 } });
  });

  it("401 vira falha http com o status", async () => {
    const r = await chamarRpc(CFG_OK, "tools/call", {}, { fetchImpl: fetchQueDevolve("", { status: 401 }) });
    expect(r).toEqual({ ok: false, falha: { tipo: "http", status: 401 } });
  });

  it("302 NÃO é seguido: chega como falha, e o fetch pediu redirect manual", async () => {
    const fetchImpl = fetchQueDevolve("", { status: 302, headers: { location: "http://169.254.169.254/" } });
    const r = await chamarRpc(CFG_OK, "tools/call", {}, { fetchImpl });
    expect(r).toEqual({ ok: false, falha: { tipo: "http", status: 302 } });
    expect(vi.mocked(fetchImpl).mock.calls[0]?.[1]).toMatchObject({ redirect: "manual" });
  });
});

describe("chamarRpc — tempo e rede", () => {
  it("fetch que nunca resolve vira timeout", async () => {
    const fetchImpl = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject((init.signal as AbortSignal).reason));
      })) as unknown as typeof fetch;
    const r = await chamarRpc(CFG_OK, "tools/call", {}, { fetchImpl, timeoutMs: 20 });
    expect(r).toEqual({ ok: false, falha: { tipo: "timeout" } });
  });

  it("conexão que falha sem resposta vira `rede`, não timeout nem corpo inválido", async () => {
    const fetchImpl = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const r = await chamarRpc(CFG_OK, "tools/call", {}, { fetchImpl });
    expect(r).toMatchObject({ ok: false, falha: { tipo: "rede" } });
  });
});

describe("chamarRpc — erro é resposta (medido)", () => {
  it("-32602 do envelope vira falha rpc com código e mensagem reais", async () => {
    const mensagem = "Input validation error: Invalid arguments for tool customer.status: Required at documento";
    const corpo = `data: ${JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32602, message: mensagem } })}\n\n`;
    const r = await chamarRpc(CFG_OK, "tools/call", {}, { fetchImpl: fetchQueDevolve(corpo) });
    expect(r).toEqual({ ok: false, falha: { tipo: "rpc", codigo: -32602, mensagem } });
  });

  it("isError:true vira tool_error com o texto do conteúdo", async () => {
    const corpo = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      result: { isError: true, content: [{ type: "text", text: '{"erro":"cliente não encontrado"}' }] },
    });
    const r = await chamarRpc(CFG_OK, "tools/call", {}, { fetchImpl: fetchQueDevolve(corpo) });
    expect(r).toEqual({ ok: false, falha: { tipo: "tool_error", mensagem: '{"erro":"cliente não encontrado"}' } });
  });
});

describe("chamarRpc — os DOIS guards anti-SSRF, a cada chamada", () => {
  it("localhost é recusado (guard textual) e o fetch nem acontece", async () => {
    const fetchImpl = fetchQueDevolve(SSE_OK);
    const r = await chamarRpc({ url: "http://localhost:3000/api/mcp", chave: "x" }, "tools/list", {}, { fetchImpl });
    expect(r).toMatchObject({ ok: false, falha: { tipo: "url_recusada" } });
    expect(vi.mocked(fetchImpl)).not.toHaveBeenCalled();
  });

  it("IP privado que o guard TEXTUAL não cobre é recusado pelo que resolve", async () => {
    // 100.64.0.1 é CGNAT: passa por `assertSafeOutboundUrl` (a regex dele não
    // conhece essa faixa) e morre em `assertDestinoResolvidoSeguro`. É por isso
    // que os DOIS são chamados — este caso prova o segundo, e só ele.
    const fetchImpl = fetchQueDevolve(SSE_OK);
    const r = await chamarRpc({ url: "https://100.64.0.1/api/mcp", chave: "x" }, "tools/list", {}, { fetchImpl });
    expect(r).toEqual({ ok: false, falha: { tipo: "url_recusada", detalhe: "unsafe_url:private_ip" } });
    expect(vi.mocked(fetchImpl)).not.toHaveBeenCalled();
  });

  it("metadata da nuvem (169.254.169.254) é recusado", async () => {
    const r = await chamarRpc({ url: "http://169.254.169.254/api/mcp", chave: "x" }, "tools/list", {}, {});
    expect(r).toMatchObject({ ok: false, falha: { tipo: "url_recusada" } });
  });
});

describe("chamarRpc — o que vai no fio", () => {
  it("manda JSON-RPC 2.0 com o método e os params, e a chave só no cabeçalho", async () => {
    const fetchImpl = fetchQueDevolve(SSE_OK);
    await chamarRpc(CFG_OK, "tools/call", { name: "customer.status", arguments: { documento: "1" } }, { fetchImpl });
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(CFG_OK.url);
    expect(JSON.parse(init.body as string)).toEqual({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "customer.status", arguments: { documento: "1" } },
    });
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer bck_segredo");
    expect(headers.Accept).toBe("application/json, text/event-stream");
    // A chave não pode vazar para a URL (log de proxy/CDN guarda query string).
    expect(url).not.toContain("bck_segredo");
  });
});
