import { describe, expect, it, vi } from "vitest";

import { sincronizarPedidos, TETO_DO_SYNC } from "./sync-inicial";

vi.mock("./consumidor", () => ({
  processarEvento: vi.fn(async (_db: unknown, row: { payload: Record<string, unknown> }) => {
    const data = (row.payload as { data: { total?: unknown } }).data;
    return data?.total === undefined
      ? { status: "error" as const, detail: "sem_total_valido" }
      : { status: "ok" as const };
  }),
}));

const DB = {} as never;
const pedido = (id: number) => ({ id, total: "10.00", created_at: "2026-01-01T00:00:00Z" });

function apiCom(paginas: unknown[][]) {
  return {
    listOrders: vi.fn(async ({ page }: { page?: number }) => paginas[(page ?? 1) - 1] ?? []),
  };
}

describe("sincronizarPedidos", () => {
  it("anda até a última página e para — página curta é o fim", () => {
    const api = apiCom([[pedido(1), pedido(2)]]);
    return sincronizarPedidos(DB, api, "org").then((r) => {
      expect(r).toEqual({ lidos: 2, gravados: 2, recusados: 0, truncado: false });
      expect(api.listOrders).toHaveBeenCalledTimes(1);
    });
  });

  it("conta o recusado separado do gravado — não finge que entrou", async () => {
    const api = apiCom([[pedido(1), { id: 2, created_at: "x" }]]);
    const r = await sincronizarPedidos(DB, api, "org");
    expect(r.gravados).toBe(1);
    expect(r.recusados).toBe(1);
  });

  it("para no teto e DIZ que truncou — parar calado seria mentir sobre o histórico", async () => {
    const cheia = Array.from({ length: 50 }, (_, i) => pedido(i));
    const api = apiCom([cheia, cheia, cheia]);
    const r = await sincronizarPedidos(DB, api, "org", { teto: 60 });
    expect(r.lidos).toBe(60);
    expect(r.truncado).toBe(true);
  });

  it("falha de rede no meio NÃO descarta o que já entrou", async () => {
    const api = {
      listOrders: vi.fn(async ({ page }: { page?: number }) => {
        if (page === 1) return Array.from({ length: 50 }, (_, i) => pedido(i));
        throw new Error("ECONNRESET");
      }),
    };
    const r = await sincronizarPedidos(DB, api, "org");
    expect(r.gravados).toBe(50);
    expect(r.truncado).toBe(false);
  });

  it("loja vazia devolve zero, sem erro", async () => {
    const r = await sincronizarPedidos(DB, apiCom([[]]), "org");
    expect(r).toEqual({ lidos: 0, gravados: 0, recusados: 0, truncado: false });
  });

  it("o teto existe e é finito — sem ele uma loja grande derruba a VPS", () => {
    expect(TETO_DO_SYNC).toBeGreaterThan(0);
    expect(Number.isFinite(TETO_DO_SYNC)).toBe(true);
  });
});
