import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/auth/server", () => ({ loadAuthUser: vi.fn(), resolveActiveOrg: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ supportWriteError: vi.fn(() => null) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/webhooks/secrets", () => ({
  encryptWebhookSecret: vi.fn(async (_admin: unknown, plaintext: string) => `enc(${plaintext})`),
  decryptWebhookSecret: vi.fn(async (_admin: unknown, cifrada: string) => cifrada.replace(/^enc\(|\)$/g, "")),
}));
vi.mock("@/lib/erp-mcp/transporte", () => ({ chamarRpc: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { chamarRpc } from "@/lib/erp-mcp/transporte";

import { salvarConfigMcp, testarConexaoMcp, desativarMcp, esquecerChaveMcp } from "./mcp";

const ORG = "11111111-1111-1111-1111-111111111111";
const USER = "22222222-2222-2222-2222-222222222222";
const URL = "https://erp.exemplo.com/mcp";

type Linha = Record<string, unknown> & { id?: string };

/** Banco em memória: só `tenant_integrations`, que é a única tabela que estas actions tocam. */
function bancoFalso() {
  const tenant_integrations: Linha[] = [];
  const tabelas: Record<string, Linha[]> = { tenant_integrations };
  /** Toda `update`/`delete`, com as colunas do `eq()` — é aqui que a tenancy é conferida. */
  const operacoes: Array<{ tabela: string; op: string; colunasEq: string[] }> = [];
  const db = { tenant_integrations, operacoes };

  function builder(tabela: string) {
    const filtrosEq: Array<[string, unknown]> = [];
    let op: "select" | "insert" | "update" | "delete" = "select";
    let payload: Linha | null = null;
    const casa = (r: Linha) => filtrosEq.every(([c, v]) => r[c] === v);

    async function exec(): Promise<{ data: unknown; error: null }> {
      const linhas = tabelas[tabela] ?? (tabelas[tabela] = []);
      if (op === "select") return { data: linhas.filter(casa), error: null };
      if (op === "insert") {
        const nova = { id: `${tabela}-${linhas.length + 1}`, ...payload } as Linha;
        linhas.push(nova);
        return { data: nova, error: null };
      }
      operacoes.push({ tabela, op, colunasEq: filtrosEq.map(([c]) => c) });
      const alvos = linhas.filter(casa);
      if (op === "update") for (const r of alvos) Object.assign(r, payload);
      if (op === "delete") for (const r of alvos) linhas.splice(linhas.indexOf(r), 1);
      return { data: alvos, error: null };
    }

    const api = {
      select: () => api,
      insert: (p: Linha) => ((op = "insert"), (payload = p), api),
      update: (p: Linha) => ((op = "update"), (payload = p), api),
      delete: () => ((op = "delete"), api),
      eq: (c: string, v: unknown) => (filtrosEq.push([c, v]), api),
      maybeSingle: async () => {
        const r = await exec();
        return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: null };
      },
      single: async () => {
        const r = await exec();
        return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: null };
      },
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => exec().then(res, rej),
    };
    return api;
  }

  return { db, admin: { from: builder } as unknown as SupabaseClient };
}

function linhaConfigurada(status: string, extra: Record<string, unknown> = {}): Linha {
  return {
    id: "ti-1",
    organization_id: ORG,
    provider: "mcp",
    status,
    oauth_access_token_encrypted: "enc(chave-secreta-9876)",
    store_metadata: { url: URL, catalogo: [], falhas_consecutivas: 0 },
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadAuthUser).mockResolvedValue({ id: USER, support: null, is_platform_admin: false } as never);
  vi.mocked(resolveActiveOrg).mockResolvedValue({ orgId: ORG, role: "admin", name: "Org" } as never);
});

describe("salvarConfigMcp", () => {
  it("primeira gravação sem chave → chave_obrigatoria, sem linha criada", async () => {
    const { admin, db } = bancoFalso();
    vi.mocked(createAdminClient).mockReturnValue(admin);
    expect(await salvarConfigMcp({ url: URL })).toEqual({ ok: false, error: "chave_obrigatoria" });
    expect(db.tenant_integrations).toHaveLength(0);
  });

  it("URL inválida → url_invalida, nunca URL adivinhada", async () => {
    const { admin, db } = bancoFalso();
    vi.mocked(createAdminClient).mockReturnValue(admin);
    expect(await salvarConfigMcp({ url: "erp.exemplo.com", chave: "k" })).toEqual({ ok: false, error: "url_invalida" });
    expect(db.tenant_integrations).toHaveLength(0);
  });

  it("primeira gravação → cifra a chave, NÃO fabrica segredo de webhook, e audita só os 4 últimos dígitos", async () => {
    const { admin, db } = bancoFalso();
    vi.mocked(createAdminClient).mockReturnValue(admin);
    expect(await salvarConfigMcp({ url: URL, chave: "chave-secreta-9876" })).toEqual({ ok: true });

    const linha = db.tenant_integrations[0]!;
    expect(linha.oauth_access_token_encrypted).toBe("enc(chave-secreta-9876)");
    expect(linha.webhook_secret_encrypted).toBeUndefined();
    expect(linha.status).toBe("connecting");
    expect(linha.store_metadata).toEqual({ url: URL, catalogo: [], falhas_consecutivas: 0 });

    const chamada = vi.mocked(audit).mock.calls[0]![0] as { metadata?: Record<string, unknown> };
    expect(chamada.metadata).toEqual({ url_mudou: false, last4: "9876" });
    expect(JSON.stringify(chamada)).not.toContain("chave-secreta");
  });

  it("trocar a URL zera o catálogo descoberto — é outro servidor", async () => {
    const { admin, db } = bancoFalso();
    db.tenant_integrations.push(
      linhaConfigurada("healthy", { store_metadata: { url: URL, catalogo: ["customer.status"], falhas_consecutivas: 2 } }),
    );
    vi.mocked(createAdminClient).mockReturnValue(admin);

    expect(await salvarConfigMcp({ url: "https://outro.exemplo.com/mcp" })).toEqual({ ok: true });
    expect(db.tenant_integrations[0]!.store_metadata).toEqual({
      url: "https://outro.exemplo.com/mcp",
      catalogo: [],
      falhas_consecutivas: 2,
    });
    expect(db.tenant_integrations[0]!.status).toBe("connecting");
  });

  it("manager → forbidden", async () => {
    vi.mocked(resolveActiveOrg).mockResolvedValue({ orgId: ORG, role: "manager", name: "Org" } as never);
    const { admin } = bancoFalso();
    vi.mocked(createAdminClient).mockReturnValue(admin);
    expect(await salvarConfigMcp({ url: URL, chave: "k" })).toEqual({ ok: false, error: "forbidden" });
  });
});

describe("testarConexaoMcp", () => {
  it("sucesso → grava o catálogo do tools/list, status healthy e zera as falhas", async () => {
    const { admin, db } = bancoFalso();
    db.tenant_integrations.push(
      linhaConfigurada("error", { store_metadata: { url: URL, catalogo: [], falhas_consecutivas: 3 } }),
    );
    vi.mocked(createAdminClient).mockReturnValue(admin);
    vi.mocked(chamarRpc).mockResolvedValue({
      ok: true,
      dados: { tools: [{ name: "customer.status" }, { name: "invoice.list" }, { semNome: true }] },
    });

    expect(await testarConexaoMcp()).toEqual({ ok: true, ferramentas: 2 });
    expect(vi.mocked(chamarRpc).mock.calls[0]![1]).toBe("tools/list");

    const linha = db.tenant_integrations[0]!;
    expect(linha.status).toBe("healthy");
    expect(linha.last_health_check_at).toBeDefined();
    expect(linha.store_metadata).toEqual({ url: URL, catalogo: ["customer.status", "invoice.list"], falhas_consecutivas: 0 });
  });

  it("falha → status error com o motivo do operador, sem vazar chave nem URL", async () => {
    const { admin, db } = bancoFalso();
    db.tenant_integrations.push(linhaConfigurada("connecting"));
    vi.mocked(createAdminClient).mockReturnValue(admin);
    vi.mocked(chamarRpc).mockResolvedValue({ ok: false, falha: { tipo: "http", status: 401 } });

    const r = await testarConexaoMcp();
    expect(r).toEqual({ ok: false, mensagem: expect.stringContaining("401") });
    expect(db.tenant_integrations[0]!.status).toBe("error");
    expect(String(db.tenant_integrations[0]!.status_reason)).not.toContain("chave-secreta");
  });

  it("sem linha configurada → não sai para a rede", async () => {
    const { admin } = bancoFalso();
    vi.mocked(createAdminClient).mockReturnValue(admin);
    const r = await testarConexaoMcp();
    expect(r.ok).toBe(false);
    expect(vi.mocked(chamarRpc)).not.toHaveBeenCalled();
  });
});

describe("esquecerChaveMcp", () => {
  it("integração ativa → recusa e mantém a linha", async () => {
    const { admin, db } = bancoFalso();
    db.tenant_integrations.push(linhaConfigurada("healthy"));
    vi.mocked(createAdminClient).mockReturnValue(admin);
    expect(await esquecerChaveMcp()).toEqual({ ok: false, error: "integracao_ativa" });
    expect(db.tenant_integrations).toHaveLength(1);
  });

  it("integração desativada → apaga a linha", async () => {
    const { admin, db } = bancoFalso();
    db.tenant_integrations.push(linhaConfigurada("disconnected"));
    vi.mocked(createAdminClient).mockReturnValue(admin);
    expect(await esquecerChaveMcp()).toEqual({ ok: true });
    expect(db.tenant_integrations).toHaveLength(0);
  });
});

describe("tenancy sob service role", () => {
  it("todo update/delete em tenant_integrations filtra organization_id", async () => {
    const { admin, db } = bancoFalso();
    db.tenant_integrations.push(linhaConfigurada("connecting"));
    vi.mocked(createAdminClient).mockReturnValue(admin);
    vi.mocked(chamarRpc).mockResolvedValue({ ok: true, dados: { tools: [] } });

    await salvarConfigMcp({ url: URL, chave: "outra-chave-1234" });
    await testarConexaoMcp();
    await desativarMcp();
    await esquecerChaveMcp();

    expect(db.operacoes.length).toBeGreaterThan(0);
    for (const o of db.operacoes) expect(o.colunasEq).toContain("organization_id");
  });
});
