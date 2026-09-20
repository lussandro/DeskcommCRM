import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AsaasPayment, AsaasWebhook } from "./tipos";
import { AsaasErro } from "./cliente";
import { reconciliarOrg, type ClienteReconcile, type OrgAsaas, type ReconcileDb } from "./reconcile";

const ORG = "org-1";

function payment(id: string, over: Partial<AsaasPayment> = {}): AsaasPayment {
  return { id, customer: "cus_1", status: "OVERDUE", value: 100, dueDate: "2026-09-10", billingType: "PIX", ...over };
}

function stubCliente(over: Partial<ClienteReconcile> = {}): ClienteReconcile {
  return {
    paymentsPorStatus: vi.fn(async () => ({ data: [], hasMore: false, totalCount: 0 })),
    webhooks: vi.fn(async () => ({ data: [], hasMore: false, totalCount: 0 })),
    religarWebhook: vi.fn(async (id: string) => ({ id, url: "", enabled: true, interrupted: false }) as AsaasWebhook),
    ...over,
  };
}

class FakeDb implements ReconcileDb {
  precisaOverdueMap: Record<string, boolean> = {};
  aindaVencidaMap: Record<string, boolean> = {};
  emitidos: Array<{ tipo: string; payment: AsaasPayment }> = [];
  avisos: Array<{ kind: string; refId: string; title: string; body: string }> = [];
  dia = "2026-09-17";
  async precisaOverdue(id: string) { return this.precisaOverdueMap[id] ?? false; }
  async aindaVencidaLocalmente(id: string) { return this.aindaVencidaMap[id] ?? false; }
  async emitir(tipo: "asaas.payment_overdue" | "asaas.payment_received", payment: AsaasPayment) { this.emitidos.push({ tipo, payment }); }
  async abrirAviso(kind: string, refId: string, title: string, body: string) { this.avisos.push({ kind, refId, title, body }); }
  async diaLocalDaOrg() { return this.dia; }
}

function org(cliente: ClienteReconcile, webhookPathToken = "tok123"): OrgAsaas {
  return { organizationId: ORG, webhookPathToken, cliente };
}

describe("reconciliarOrg — vencidas", () => {
  it("OVERDUE sem enrollment viva emite; com enrollment viva não emite nada", async () => {
    const cliente = stubCliente({
      paymentsPorStatus: vi.fn(async (status: string) => {
        if (status !== "OVERDUE") return { data: [], hasMore: false, totalCount: 0 };
        return { data: [payment("pay_perdida"), payment("pay_viva")], hasMore: false, totalCount: 2 };
      }),
    });
    const db = new FakeDb();
    db.precisaOverdueMap = { pay_perdida: true, pay_viva: false };

    const totais = await reconciliarOrg(org(cliente), db);

    expect(totais.overdue_emitidos).toBe(1);
    expect(db.emitidos).toEqual([{ tipo: "asaas.payment_overdue", payment: expect.objectContaining({ id: "pay_perdida" }) }]);
  });

  it("pagina até hasMore=false", async () => {
    const pagina1 = { data: [payment("p1")], hasMore: true, totalCount: 2 };
    const pagina2 = { data: [payment("p2")], hasMore: false, totalCount: 2 };
    const chamadas: number[] = [];
    const cliente = stubCliente({
      paymentsPorStatus: vi.fn(async (status: string, offset: number) => {
        if (status !== "OVERDUE") return { data: [], hasMore: false, totalCount: 0 };
        chamadas.push(offset);
        return offset === 0 ? pagina1 : pagina2;
      }),
    });
    const db = new FakeDb();
    db.precisaOverdueMap = { p1: true, p2: true };

    const totais = await reconciliarOrg(org(cliente), db);

    expect(chamadas).toEqual([0, 100]);
    expect(totais.overdue_emitidos).toBe(2);
  });
});

describe("reconciliarOrg — pagas", () => {
  it("paga desde ontem e ainda OVERDUE localmente → emite payment_received", async () => {
    const extrasVistos: Array<Record<string, string> | undefined> = [];
    const cliente = stubCliente({
      paymentsPorStatus: vi.fn(async (status: string, _offset: number, extra?: Record<string, string>) => {
        if (status === "OVERDUE") return { data: [], hasMore: false, totalCount: 0 };
        if (status === "RECEIVED") {
          extrasVistos.push(extra);
          return { data: [payment("pay_paga", { status: "RECEIVED" })], hasMore: false, totalCount: 1 };
        }
        return { data: [], hasMore: false, totalCount: 0 };
      }),
    });
    const db = new FakeDb();
    db.dia = "2026-09-17";
    db.aindaVencidaMap = { pay_paga: true };

    const totais = await reconciliarOrg(org(cliente), db);

    expect(totais.received_emitidos).toBe(1);
    expect(db.emitidos).toEqual([{ tipo: "asaas.payment_received", payment: expect.objectContaining({ id: "pay_paga" }) }]);
    // O filtro usa o dia de ONTEM no fuso da org, não hoje.
    expect(extrasVistos[0]).toEqual({ "paymentDate[ge]": "2026-09-16" });
  });

  it("paga mas já não está mais OVERDUE/PENDING localmente → nada", async () => {
    const cliente = stubCliente({
      paymentsPorStatus: vi.fn(async (status: string) => {
        if (status === "CONFIRMED") return { data: [payment("pay_ja_ok", { status: "CONFIRMED" })], hasMore: false, totalCount: 1 };
        return { data: [], hasMore: false, totalCount: 0 };
      }),
    });
    const db = new FakeDb();
    db.aindaVencidaMap = { pay_ja_ok: false };

    const totais = await reconciliarOrg(org(cliente), db);

    expect(totais.received_emitidos).toBe(0);
    expect(db.emitidos).toHaveLength(0);
  });
});

describe("reconciliarOrg — webhook", () => {
  it("sem a nossa URL na lista → aviso charge_webhook_paused, sem religar", async () => {
    const cliente = stubCliente({
      webhooks: vi.fn(async () => ({ data: [{ id: "wh_outro", url: "https://x/api/v1/webhooks/asaas/outro-token", enabled: true, interrupted: false }], hasMore: false, totalCount: 1 })),
    });
    const db = new FakeDb();

    const totais = await reconciliarOrg(org(cliente, "meu-token"), db);

    expect(totais.avisos).toBe(1);
    expect(totais.webhooks_religados).toBe(0);
    expect(db.avisos).toHaveLength(1);
    expect(db.avisos[0]).toMatchObject({ kind: "charge_webhook_paused", title: expect.stringContaining("não tem o endereço de aviso") });
    expect(cliente.religarWebhook).not.toHaveBeenCalled();
  });

  it("interrupted:true → religa e avisa", async () => {
    const cliente = stubCliente({
      webhooks: vi.fn(async () => ({ data: [{ id: "wh_meu", url: "https://x/api/v1/webhooks/asaas/meu-token", enabled: true, interrupted: true }], hasMore: false, totalCount: 1 })),
    });
    const db = new FakeDb();

    const totais = await reconciliarOrg(org(cliente, "meu-token"), db);

    expect(totais.webhooks_religados).toBe(1);
    expect(totais.avisos).toBe(1);
    expect(cliente.religarWebhook).toHaveBeenCalledWith("wh_meu");
    expect(db.avisos[0]).toMatchObject({ kind: "charge_webhook_paused", title: expect.stringContaining("pausou os avisos") });
  });

  it("achou a nossa URL e não está interrompido → nada", async () => {
    const cliente = stubCliente({
      webhooks: vi.fn(async () => ({ data: [{ id: "wh_meu", url: "https://x/api/v1/webhooks/asaas/meu-token", enabled: true, interrupted: false }], hasMore: false, totalCount: 1 })),
    });
    const db = new FakeDb();

    const totais = await reconciliarOrg(org(cliente, "meu-token"), db);

    expect(totais.avisos).toBe(0);
    expect(totais.webhooks_religados).toBe(0);
    expect(cliente.religarWebhook).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// reconciliarTudo — orquestração: org não-healthy pulada, 401 marca erro,
// erro genérico não aborta a passada.
// ────────────────────────────────────────────────────────────────────────────

vi.mock("@/lib/agent-engine/db/request-pool", () => ({ getRequestPool: () => ({}) }));
vi.mock("@/lib/agent-engine/agent/fuso-da-org", () => ({ fusoDaOrganizacao: vi.fn(async () => "America/Sao_Paulo") }));
vi.mock("./config", () => ({ carregarIntegracaoAsaas: vi.fn() }));

describe("reconciliarTudo", () => {
  interface Capturado {
    updates: Array<{ tabela: string; patch: unknown; filtros: Record<string, unknown> }>;
    inserts: Array<{ tabela: string; row: Record<string, unknown> }>;
    selects: Array<{ tabela: string; filtros: Record<string, unknown> }>;
  }

  /** Resposta scriptada de `.maybeSingle()`, por tabela — default `{data: null}`. */
  type Respostas = Record<string, (filtros: Record<string, unknown>) => { data: unknown }>;

  function fakeAdmin(listaOrgs: Array<{ organization_id: string }>, cap: Capturado, respostas: Respostas = {}) {
    function chain(tabela: string) {
      const filtros: Record<string, unknown> = {};
      let modo: "select" | "update" | "insert" = "select";
      let patch: unknown = null;
      let insertRow: Record<string, unknown> = {};
      const api: Record<string, unknown> = {
        select() { modo = "select"; return api; },
        eq(k: string, v: unknown) { filtros[k] = v; return api; },
        update(p: unknown) { modo = "update"; patch = p; return api; },
        insert(row: Record<string, unknown>) { modo = "insert"; insertRow = row; return api; },
        async maybeSingle() {
          cap.selects.push({ tabela, filtros: { ...filtros } });
          return { data: respostas[tabela]?.(filtros).data ?? null, error: null };
        },
        then(resolve: (v: { data: unknown; error: null }) => void) {
          if (modo === "update") {
            cap.updates.push({ tabela, patch, filtros });
            resolve({ data: null, error: null });
          } else if (modo === "insert") {
            cap.inserts.push({ tabela, row: insertRow });
            resolve({ data: null, error: null });
          } else if (tabela === "tenant_integrations") {
            resolve({ data: listaOrgs, error: null });
          } else {
            resolve({ data: [], error: null });
          }
        },
      };
      return api;
    }
    return { from: chain, rpc: vi.fn(async () => ({ error: null })) };
  }

  const vazio = (): Capturado => ({ updates: [], inserts: [], selects: [] });

  beforeEach(() => vi.clearAllMocks());

  it("sem org healthy → totais zerados, nada chamado", async () => {
    const { reconciliarTudo } = await import("./reconcile");
    const { carregarIntegracaoAsaas } = await import("./config");
    const totais = await reconciliarTudo(fakeAdmin([], vazio()) as never);
    expect(totais).toEqual({ overdue_emitidos: 0, received_emitidos: 0, webhooks_religados: 0, avisos: 0 });
    expect(carregarIntegracaoAsaas).not.toHaveBeenCalled();
  });

  it("org listada mas integração apodreceu (carregarIntegracaoAsaas null) → pulada sem erro", async () => {
    const { reconciliarTudo } = await import("./reconcile");
    const { carregarIntegracaoAsaas } = await import("./config");
    vi.mocked(carregarIntegracaoAsaas).mockResolvedValue(null);
    const totais = await reconciliarTudo(fakeAdmin([{ organization_id: ORG }], vazio()) as never);
    expect(totais.overdue_emitidos).toBe(0);
  });

  it("401 → integração marcada status=error com o motivo real, aviso 'other', segue sem lançar", async () => {
    const cap = vazio();
    const cliente = stubCliente({
      paymentsPorStatus: vi.fn(async () => {
        throw new AsaasErro(401, "invalid_api_key", "Chave de API inválida.");
      }),
    });
    const { reconciliarTudo } = await import("./reconcile");
    const { carregarIntegracaoAsaas } = await import("./config");
    vi.mocked(carregarIntegracaoAsaas).mockResolvedValue({
      id: "integ-1",
      status: "healthy",
      config: {
        ambiente: "sandbox",
        followup_pointer_id: null,
        followup_pointer_ids: [],
        reemissao: null,
      },
      cliente: cliente as never,
      webhookPathToken: "tok",
    });

    const totais = await reconciliarTudo(fakeAdmin([{ organization_id: ORG }], cap) as never);

    expect(totais.avisos).toBe(1);
    expect(cap.updates).toEqual([
      { tabela: "tenant_integrations", patch: { status: "error", status_reason: "Chave de API inválida." }, filtros: { organization_id: ORG, id: "integ-1" } },
    ]);
    expect(cap.inserts).toHaveLength(1);
    expect(cap.inserts[0]).toMatchObject({ tabela: "agent_inbox_items", row: expect.objectContaining({ kind: "other", organization_id: ORG }) });
  });

  it("consulta de enrollment viva filtra organization_id, não só o id (doutrina de tenancy sob service role)", async () => {
    const cap = vazio();
    const cliente = stubCliente({
      paymentsPorStatus: vi.fn(async (status: string) => (status === "OVERDUE" ? { data: [payment("pay1")], hasMore: false, totalCount: 1 } : { data: [], hasMore: false, totalCount: 0 })),
    });
    const { reconciliarTudo } = await import("./reconcile");
    const { carregarIntegracaoAsaas } = await import("./config");
    vi.mocked(carregarIntegracaoAsaas).mockResolvedValue({
      id: "integ-1",
      status: "healthy",
      config: {
        ambiente: "sandbox",
        followup_pointer_id: null,
        followup_pointer_ids: [],
        reemissao: null,
      },
      cliente: cliente as never,
      webhookPathToken: "tok",
    });

    const totais = await reconciliarTudo(
      fakeAdmin([{ organization_id: ORG }], cap, {
        asaas_charges: () => ({ data: { enrollment_id: "enr-1" } }),
        followup_enrollments: () => ({ data: { status: "active" } }),
      }) as never,
    );

    // Enrollment viva ("active") → precisaOverdue devolve false, nada emitido.
    expect(totais.overdue_emitidos).toBe(0);
    const consultaEnrollment = cap.selects.find((s) => s.tabela === "followup_enrollments");
    expect(consultaEnrollment?.filtros).toEqual({ organization_id: ORG, id: "enr-1" });
  });

  it("erro genérico numa org não aborta a passada (e não marca status=error)", async () => {
    const cap = vazio();
    const cliente = stubCliente({
      paymentsPorStatus: vi.fn(async () => {
        throw new Error("Não foi possível falar com o Asaas.");
      }),
    });
    const { reconciliarTudo } = await import("./reconcile");
    const { carregarIntegracaoAsaas } = await import("./config");
    vi.mocked(carregarIntegracaoAsaas).mockResolvedValue({
      id: "integ-1",
      status: "healthy",
      config: {
        ambiente: "sandbox",
        followup_pointer_id: null,
        followup_pointer_ids: [],
        reemissao: null,
      },
      cliente: cliente as never,
      webhookPathToken: "tok",
    });

    await expect(reconciliarTudo(fakeAdmin([{ organization_id: ORG }], cap) as never)).resolves.toEqual({
      overdue_emitidos: 0,
      received_emitidos: 0,
      webhooks_religados: 0,
      avisos: 0,
    });
    expect(cap.updates).toHaveLength(0);
  });
});
