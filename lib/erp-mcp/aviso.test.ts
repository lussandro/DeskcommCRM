import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock("./transporte", () => ({ chamarRpc: vi.fn() }));
vi.mock("@/lib/webhooks/secrets", () => ({
  decryptWebhookSecret: vi.fn(async (_admin: unknown, cifrada: string) => cifrada.replace(/^enc\(|\)$/g, "")),
}));

import { chamarRpc } from "./transporte";
import { registrarFalha, registrarSucesso, revisarSaudeDasIntegracoesMcp, FALHAS_ATE_AVISAR } from "./aviso";

const ORG = "11111111-1111-1111-1111-111111111111";
const INTEG = "ti-1";
const URL = "https://erp.exemplo.com/mcp";

type Linha = Record<string, unknown>;

/** Banco em memória com as duas tabelas que este módulo toca. */
function bancoFalso(falhas = 0, status = "healthy") {
  const tenant_integrations: Linha[] = [
    {
      id: INTEG,
      organization_id: ORG,
      provider: "mcp",
      status,
      oauth_access_token_encrypted: "enc(chave)",
      store_metadata: { url: URL, catalogo: ["customer.status"], falhas_consecutivas: falhas },
    },
  ];
  const agent_inbox_items: Linha[] = [];
  const tabelas: Record<string, Linha[]> = { tenant_integrations, agent_inbox_items };

  function builder(tabela: string) {
    const eq: Array<[string, unknown]> = [];
    let op: "select" | "insert" | "update" | "delete" = "select";
    let payload: Linha | null = null;
    const casa = (r: Linha) => eq.every(([c, v]) => r[c] === v);

    async function exec(): Promise<{ data: unknown; error: null }> {
      const linhas = tabelas[tabela] ?? (tabelas[tabela] = []);
      if (op === "insert") {
        linhas.push({ id: `${tabela}-${linhas.length + 1}`, status: "open", ...payload });
        return { data: null, error: null };
      }
      const alvos = linhas.filter(casa);
      if (op === "update") for (const r of alvos) Object.assign(r, payload);
      return { data: alvos, error: null };
    }

    const api = {
      select: () => api,
      insert: (p: Linha) => ((op = "insert"), (payload = p), api),
      update: (p: Linha) => ((op = "update"), (payload = p), api),
      eq: (c: string, v: unknown) => (eq.push([c, v]), api),
      limit: () => api,
      maybeSingle: async () => {
        const r = await exec();
        return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: null };
      },
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => exec().then(res, rej),
    };
    return api;
  }

  return { tenant_integrations, agent_inbox_items, admin: { from: builder } as unknown as SupabaseClient };
}

const metadataDe = (linha: Linha) => linha.store_metadata as { falhas_consecutivas: number };

beforeEach(() => vi.clearAllMocks());

describe("contador de falhas consecutivas", () => {
  it("primeira e segunda falha somam, sem ocupar a Central", async () => {
    const db = bancoFalso();
    await registrarFalha(db.admin, ORG, INTEG, { tipo: "timeout" });
    expect(metadataDe(db.tenant_integrations[0]!).falhas_consecutivas).toBe(1);
    await registrarFalha(db.admin, ORG, INTEG, { tipo: "timeout" });
    expect(metadataDe(db.tenant_integrations[0]!).falhas_consecutivas).toBe(2);
    expect(db.agent_inbox_items).toHaveLength(0);
  });

  it(`a ${FALHAS_ATE_AVISAR}ª abre UM aviso, com o motivo real e o caminho da tela`, async () => {
    const db = bancoFalso(FALHAS_ATE_AVISAR - 1);
    await registrarFalha(db.admin, ORG, INTEG, { tipo: "http", status: 401 });

    expect(db.agent_inbox_items).toHaveLength(1);
    const aviso = db.agent_inbox_items[0]!;
    expect(aviso).toMatchObject({ organization_id: ORG, kind: "mcp_externo_falhou", ref_id: INTEG, severity: "critical" });
    expect(String(aviso.body)).toContain("401");
    expect(String(aviso.body)).toContain("Sistema de gestão (MCP)");

    // A quarta falha não abre um segundo: um aberto por integração.
    await registrarFalha(db.admin, ORG, INTEG, { tipo: "timeout" });
    expect(db.agent_inbox_items).toHaveLength(1);
  });

  it("falha do SERVIDOR respondendo (rpc/tool_error) não conta — o ERP não está fora do ar", async () => {
    const db = bancoFalso(2);
    await registrarFalha(db.admin, ORG, INTEG, { tipo: "rpc", codigo: -32602, mensagem: "Required at documento" });
    await registrarFalha(db.admin, ORG, INTEG, { tipo: "tool_error", mensagem: "cliente não encontrado" });
    expect(metadataDe(db.tenant_integrations[0]!).falhas_consecutivas).toBe(2);
    expect(db.agent_inbox_items).toHaveLength(0);
  });

  it("sucesso zera o contador e retrata o aviso aberto", async () => {
    const db = bancoFalso(FALHAS_ATE_AVISAR - 1);
    await registrarFalha(db.admin, ORG, INTEG, { tipo: "timeout" });
    expect(db.agent_inbox_items[0]!.status).toBe("open");

    await registrarSucesso(db.admin, ORG, INTEG);
    expect(metadataDe(db.tenant_integrations[0]!).falhas_consecutivas).toBe(0);
    expect(db.agent_inbox_items[0]!.status).toBe("resolved");
  });
});

describe("conferência diária (anti-morte D9)", () => {
  it("tools/list responde → só carimba o último teste e mantém healthy", async () => {
    const db = bancoFalso(2);
    vi.mocked(chamarRpc).mockResolvedValue({ ok: true, dados: { tools: [] } });

    expect(await revisarSaudeDasIntegracoesMcp(db.admin)).toEqual({ verificadas: 1, erros: 0 });
    expect(db.tenant_integrations[0]!.status).toBe("healthy");
    expect(db.tenant_integrations[0]!.last_health_check_at).toBeDefined();
    // Uma conferência que funciona também zera o contador.
    expect(metadataDe(db.tenant_integrations[0]!).falhas_consecutivas).toBe(0);
  });

  it("tools/list falha → status error com motivo, e aviso na hora (a capacidade sumiu)", async () => {
    const db = bancoFalso();
    vi.mocked(chamarRpc).mockResolvedValue({ ok: false, falha: { tipo: "http", status: 401 } });

    expect(await revisarSaudeDasIntegracoesMcp(db.admin)).toEqual({ verificadas: 1, erros: 1 });
    expect(db.tenant_integrations[0]!.status).toBe("error");
    expect(String(db.tenant_integrations[0]!.status_reason)).toContain("401");
    expect(db.agent_inbox_items).toHaveLength(1);
    expect(String(db.agent_inbox_items[0]!.body)).toContain("conferência diária");
  });

  it("integração que não está healthy não é conferida", async () => {
    const db = bancoFalso(0, "disconnected");
    expect(await revisarSaudeDasIntegracoesMcp(db.admin)).toEqual({ verificadas: 0, erros: 0 });
    expect(vi.mocked(chamarRpc)).not.toHaveBeenCalled();
  });
});
