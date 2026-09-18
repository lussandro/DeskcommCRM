import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/env", () => ({ env: { INTERNAL_SECRET: "segredo", INTERNAL_CRON_SECRET: "" } }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({})) }));
vi.mock("@/lib/asaas/reconcile", () => ({ reconciliarTudo: vi.fn() }));
// A conferência diária das integrações MCP pega carona nesta rodada (D9 da spec
// do MCP cliente). Aqui ela é mockada: o assunto deste arquivo é a REGRA DE
// AUDITORIA do cron, e o comportamento dela é medido em `lib/erp-mcp/aviso.test.ts`.
vi.mock("@/lib/erp-mcp/aviso", () => ({ revisarSaudeDasIntegracoesMcp: vi.fn() }));

import { audit } from "@/lib/audit";
import { reconciliarTudo } from "@/lib/asaas/reconcile";
import { revisarSaudeDasIntegracoesMcp } from "@/lib/erp-mcp/aviso";

const SEM_MCP = { verificadas: 0, erros: 0, recuperadas: 0, adiadas: 0 };

const req = () => new NextRequest("http://localhost/x", { headers: { authorization: "Bearer segredo" } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(revisarSaudeDasIntegracoesMcp).mockResolvedValue(SEM_MCP);
});

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
    const body = (await resposta.json()) as { data: typeof totais & { mcp: typeof SEM_MCP } };
    expect(body.data).toEqual({ ...totais, mcp: SEM_MCP });
    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "cron.asaas_reconcile",
        metadata: { ...totais, mcp_verificadas: 0, mcp_erros: 0, mcp_recuperadas: 0, mcp_adiadas: 0 },
      }),
    );
  });

  /**
   * A conferência do MCP é a única coisa que aconteceu na rodada: ou ela conta
   * como efeito, ou o cron que derruba (ou levanta) a integração de um cliente
   * não deixa rastro nenhum na auditoria.
   */
  it.each([
    ["uma integração caiu", { verificadas: 1, erros: 1, recuperadas: 0, adiadas: 0 }],
    ["uma integração voltou sozinha", { verificadas: 1, erros: 0, recuperadas: 1, adiadas: 0 }],
  ])("efeito só do MCP (%s) audita", async (_rotulo, mcp) => {
    vi.mocked(reconciliarTudo).mockResolvedValue({ overdue_emitidos: 0, received_emitidos: 0, webhooks_religados: 0, avisos: 0 });
    vi.mocked(revisarSaudeDasIntegracoesMcp).mockResolvedValue(mcp);
    const { GET } = await import("./route");
    await GET(req());
    expect(audit).toHaveBeenCalledTimes(1);
  });

  it("conferência do MCP que não mudou nada NÃO transforma rodada vazia em rodada auditada", async () => {
    vi.mocked(reconciliarTudo).mockResolvedValue({ overdue_emitidos: 0, received_emitidos: 0, webhooks_religados: 0, avisos: 0 });
    // Conferiu três integrações e todas continuam como estavam: não é mutação.
    vi.mocked(revisarSaudeDasIntegracoesMcp).mockResolvedValue({ verificadas: 3, erros: 0, recuperadas: 0, adiadas: 0 });
    const { GET } = await import("./route");
    await GET(req());
    expect(audit).not.toHaveBeenCalled();
  });

  it("um único aviso (sem cobrança) também conta como efeito e audita", async () => {
    vi.mocked(reconciliarTudo).mockResolvedValue({ overdue_emitidos: 0, received_emitidos: 0, webhooks_religados: 0, avisos: 1 });
    const { GET } = await import("./route");
    await GET(req());
    expect(audit).toHaveBeenCalledTimes(1);
  });
});
