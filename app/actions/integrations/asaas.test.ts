import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/auth/server", () => ({ loadAuthUser: vi.fn(), resolveActiveOrg: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ supportWriteError: vi.fn(() => null) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/webhooks/secrets", () => ({
  encryptWebhookSecret: vi.fn(async (_admin: unknown, plaintext: string) => `enc(${plaintext})`),
  decryptWebhookSecret: vi.fn(async () => null),
}));
vi.mock("@/lib/asaas/validacao-do-fluxo", () => ({ validarFluxoDeCobranca: vi.fn() }));
vi.mock("@/lib/agent-engine/db/request-pool", () => ({ getRequestPool: vi.fn(() => ({})) }));
vi.mock("@/lib/leads/agent-activity", () => ({ emitAgentActivityForContact: vi.fn(async () => ({ routed: true, leadId: "lead-1" })) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { encryptWebhookSecret } from "@/lib/webhooks/secrets";
import { validarFluxoDeCobranca } from "@/lib/asaas/validacao-do-fluxo";

import { salvarConfigAsaas, desativarAsaas } from "./asaas";

const ORG = "11111111-1111-1111-1111-111111111111";
const USER = "22222222-2222-2222-2222-222222222222";

type Linha = Record<string, unknown> & { id?: string };

/** Banco em memória: só o que as actions tocam (tenant_integrations, asaas_charges, followup_enrollments). */
function bancoFalso() {
  const tenant_integrations: Linha[] = [];
  const asaas_charges: Linha[] = [];
  const followup_enrollments: Linha[] = [];
  const tabelas: Record<string, Linha[]> = { tenant_integrations, asaas_charges, followup_enrollments };
  const db = { tenant_integrations, asaas_charges, followup_enrollments };

  function builder(tabela: string) {
    const filtrosEq: Array<[string, unknown]> = [];
    const filtrosNot: Array<[string, unknown]> = [];
    const filtrosIn: Array<[string, unknown[]]> = [];
    let op: "select" | "insert" | "update" | "delete" = "select";
    let payload: Linha | null = null;

    const casa = (r: Linha) =>
      filtrosEq.every(([c, v]) => r[c] === v) &&
      filtrosNot.every(([c, v]) => (v === null ? r[c] != null : r[c] !== v)) &&
      filtrosIn.every(([c, vals]) => vals.includes(r[c]));

    async function exec(): Promise<{ data: unknown; error: null }> {
      const linhas = tabelas[tabela] ?? (tabelas[tabela] = []);
      if (op === "select") return { data: linhas.filter(casa), error: null };
      if (op === "insert") {
        const nova = { id: `${tabela}-${linhas.length + 1}`, ...payload } as Linha;
        linhas.push(nova);
        return { data: nova, error: null };
      }
      if (op === "update") {
        const alvos = linhas.filter(casa);
        for (const r of alvos) Object.assign(r, payload);
        return { data: alvos, error: null };
      }
      if (op === "delete") {
        const alvos = linhas.filter(casa);
        for (const r of alvos) linhas.splice(linhas.indexOf(r), 1);
        return { data: alvos, error: null };
      }
      return { data: null, error: null };
    }

    const api = {
      select: () => api,
      insert: (p: Linha) => {
        op = "insert";
        payload = p;
        return api;
      },
      update: (p: Linha) => {
        op = "update";
        payload = p;
        return api;
      },
      delete: () => {
        op = "delete";
        return api;
      },
      eq: (c: string, v: unknown) => {
        filtrosEq.push([c, v]);
        return api;
      },
      not: (c: string, _o: string, v: unknown) => {
        filtrosNot.push([c, v]);
        return api;
      },
      in: (c: string, v: unknown[]) => {
        filtrosIn.push([c, v]);
        return api;
      },
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadAuthUser).mockResolvedValue({
    id: USER,
    support: null,
    is_platform_admin: false,
  } as never);
  vi.mocked(resolveActiveOrg).mockResolvedValue({ orgId: ORG, role: "admin", name: "Org" } as never);
});

describe("salvarConfigAsaas", () => {
  it("primeira gravação sem apiKey → chave_obrigatoria", async () => {
    const { admin } = bancoFalso();
    vi.mocked(createAdminClient).mockReturnValue(admin);
    const r = await salvarConfigAsaas({ ambiente: "sandbox" });
    expect(r).toEqual({ ok: false, error: "chave_obrigatoria" });
  });

  it("primeira gravação com apiKey → devolve o token uma vez e grava os dois valores cifrados", async () => {
    const { admin, db } = bancoFalso();
    vi.mocked(createAdminClient).mockReturnValue(admin);
    const r = await salvarConfigAsaas({ apiKey: "asaas_key_123", ambiente: "sandbox" });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("esperava ok:true");
    expect(r.token).toBeDefined();
    expect(r.webhookUrl).toContain("/api/v1/webhooks/asaas/");
    expect(db.tenant_integrations).toHaveLength(1);
    expect(db.tenant_integrations[0]!.oauth_access_token_encrypted).toBe("enc(asaas_key_123)");
    expect(db.tenant_integrations[0]!.webhook_secret_encrypted).toBe(`enc(${r.token})`);
    expect(db.tenant_integrations[0]!.status).toBe("connecting");
    expect(vi.mocked(encryptWebhookSecret)).toHaveBeenCalledTimes(2);
  });

  it("segunda gravação → sem token", async () => {
    const { admin, db } = bancoFalso();
    db.tenant_integrations.push({ id: "ti-1", organization_id: ORG, provider: "asaas", status: "healthy" });
    vi.mocked(createAdminClient).mockReturnValue(admin);
    const r = await salvarConfigAsaas({ ambiente: "producao" });
    expect(r).toEqual({ ok: true });
    expect("token" in r).toBe(false);
  });

  it("manager → forbidden", async () => {
    vi.mocked(resolveActiveOrg).mockResolvedValue({ orgId: ORG, role: "manager", name: "Org" } as never);
    const { admin } = bancoFalso();
    vi.mocked(createAdminClient).mockReturnValue(admin);
    const r = await salvarConfigAsaas({ apiKey: "asaas_key_123", ambiente: "sandbox" });
    expect(r).toEqual({ ok: false, error: "forbidden" });
  });

  it("fluxo de retorno inválido → não salva", async () => {
    const { admin, db } = bancoFalso();
    vi.mocked(createAdminClient).mockReturnValue(admin);
    vi.mocked(validarFluxoDeCobranca).mockResolvedValue({
      ok: false,
      motivo: "inativo",
      detalhe: "Este fluxo de retorno está desativado.",
    });
    const pointerId = "33333333-3333-4333-8333-333333333333";
    const r = await salvarConfigAsaas({ apiKey: "asaas_key_123", ambiente: "sandbox", followup_pointer_id: pointerId });
    expect(r).toEqual({ ok: false, error: "fluxo_invalido", detalhe: "Este fluxo de retorno está desativado." });
    expect(db.tenant_integrations).toHaveLength(0);
  });
});

describe("desativarAsaas", () => {
  it("cancela as matrículas vivas com outcome exhausted e audita a contagem", async () => {
    const { admin, db } = bancoFalso();
    db.tenant_integrations.push({ id: "ti-1", organization_id: ORG, provider: "asaas", status: "healthy" });
    db.asaas_charges.push(
      { organization_id: ORG, enrollment_id: "e1" },
      { organization_id: ORG, enrollment_id: "e2" },
      { organization_id: ORG, enrollment_id: null },
    );
    db.followup_enrollments.push(
      { id: "e1", organization_id: ORG, contact_id: "c1", status: "active" },
      { id: "e2", organization_id: ORG, contact_id: "c2", status: "completed" },
    );
    vi.mocked(createAdminClient).mockReturnValue(admin);

    const r = await desativarAsaas();
    expect(r).toEqual({ ok: true, enrollmentsCanceled: 1 });

    const e1 = db.followup_enrollments.find((e) => e.id === "e1")!;
    expect(e1.status).toBe("cancelled");
    expect(e1.outcome).toBe("exhausted");
    expect(e1.cancel_reason).toBe("asaas_disabled");

    const e2 = db.followup_enrollments.find((e) => e.id === "e2")!;
    expect(e2.status).toBe("completed"); // não estava vivo — intocado

    expect(db.tenant_integrations[0]!.status).toBe("disconnected");
    expect(vi.mocked(audit)).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "asaas.integration_disabled",
        metadata: expect.objectContaining({ enrollments_canceled: 1 }),
      }),
    );
  });
});
