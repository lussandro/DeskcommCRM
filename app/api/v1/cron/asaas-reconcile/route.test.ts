import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/env", () => ({ env: { INTERNAL_SECRET: "segredo", INTERNAL_CRON_SECRET: "" } }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({})) }));
vi.mock("@/lib/asaas/reconcile", () => ({ reconciliarTudo: vi.fn() }));

import { audit } from "@/lib/audit";
import { reconciliarTudo } from "@/lib/asaas/reconcile";

const req = () => new NextRequest("http://localhost/x", { headers: { authorization: "Bearer segredo" } });

beforeEach(() => vi.clearAllMocks());

describe("GET /api/v1/cron/asaas-reconcile", () => {
  it("sem o segredo, 403 e não roda a reconciliação", async () => {
    const { GET } = await import("./route");
    const resposta = await GET(new NextRequest("http://localhost/x"));
    expect(resposta.status).toBe(403);
    expect(reconciliarTudo).not.toHaveBeenCalled();
  });

  it("rodada sem efeito não audita", async () => {
    vi.mocked(reconciliarTudo).mockResolvedValue({ overdue_emitidos: 0, received_emitidos: 0, webhooks_religados: 0, avisos: 0 });
    const { GET } = await import("./route");
    const resposta = await GET(req());
    expect(resposta.status).toBe(200);
    expect(audit).not.toHaveBeenCalled();
  });

  it("rodada com efeito audita uma vez com a contagem", async () => {
    const totais = { overdue_emitidos: 2, received_emitidos: 1, webhooks_religados: 0, avisos: 0 };
    vi.mocked(reconciliarTudo).mockResolvedValue(totais);
    const { GET } = await import("./route");
    const resposta = await GET(req());
    const body = (await resposta.json()) as { data: typeof totais };
    expect(body.data).toEqual(totais);
    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "cron.asaas_reconcile", metadata: totais }));
  });

  it("um único aviso (sem cobrança) também conta como efeito e audita", async () => {
    vi.mocked(reconciliarTudo).mockResolvedValue({ overdue_emitidos: 0, received_emitidos: 0, webhooks_religados: 0, avisos: 1 });
    const { GET } = await import("./route");
    await GET(req());
    expect(audit).toHaveBeenCalledTimes(1);
  });
});
