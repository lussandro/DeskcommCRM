/**
 * A suspensão do tenant fecha a API de sessão — não só a tela.
 *
 * Antes deste teste, `organizations.status` era lido em UM lugar do produto
 * (`app/app/layout.tsx`, um redirect). Layout não roda em rota de API: a
 * mesma sessão que via a tela de "conta suspensa" seguia chamando
 * `/api/v1/*` normalmente — inclusive enviar mensagem pela inbox.
 *
 * Platform admin NÃO é bloqueado de propósito: é quem reativa.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireRole } from "@/lib/auth/require-role";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { audit } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";
import type { ActiveOrg, AuthUser } from "@/lib/auth/types";

vi.mock("@/lib/auth/server", () => ({
  mfaEmDivida: vi.fn(async () => false),
  loadAuthUser: vi.fn(),
  resolveActiveOrg: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";

function sessao(status: string | null, platformAdmin = false): void {
  const user: AuthUser = {
    id: USER_ID,
    email: "quem@invariant.test",
    full_name: null,
    avatar_url: null,
    is_platform_admin: platformAdmin,
    idioma: "pt-BR" as const,
    organizations: [
      {
        organization_id: ORG_ID,
        organization_name: "Vinícola",
        role: "admin",
        organization_status: status,
      },
    ],
  };
  const org: ActiveOrg = { orgId: ORG_ID, name: "Vinícola", role: "admin", status };
  vi.mocked(loadAuthUser).mockResolvedValue(user);
  vi.mocked(resolveActiveOrg).mockResolvedValue(org);
  vi.mocked(createClient).mockResolvedValue({
    rpc: vi.fn(async () => ({ data: "admin", error: null })),
  } as unknown as Awaited<ReturnType<typeof createClient>>);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requireRole sob organização suspensa", () => {
  it("fecha em 403 tenant_suspended", async () => {
    sessao("suspended");
    const r = await requireRole("agent", { requestId: "req-1", resource: "messages" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.response.status).toBe(403);
    const corpo = await r.response.json();
    expect(corpo.error.code).toBe("tenant_suspended");
  });

  it("registra a recusa na auditoria, com o motivo", async () => {
    sessao("suspended");
    await requireRole("agent", { requestId: "req-2", resource: "messages" });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "authz.denied",
        organizationId: ORG_ID,
        metadata: expect.objectContaining({ reason: "tenant_suspended" }),
      }),
    );
  });

  it("não atrapalha organização ativa", async () => {
    sessao("active");
    const r = await requireRole("agent", { requestId: "req-3" });
    expect(r.ok).toBe(true);
  });

  it("não atrapalha quando o status não veio (sessão de acompanhamento)", async () => {
    sessao(null);
    const r = await requireRole("agent", { requestId: "req-4" });
    expect(r.ok).toBe(true);
  });

  it("platform admin com opt-in passa — é quem reativa", async () => {
    sessao("suspended", true);
    const r = await requireRole("admin", { requestId: "req-5", allowPlatformAdmin: true });
    expect(r.ok).toBe(true);
  });

  it("o override de organização também fecha em 403", async () => {
    sessao("suspended");
    const r = await requireRole("agent", { requestId: "req-6", organizationId: ORG_ID });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.response.status).toBe(403);
    expect((await r.response.json()).error.code).toBe("tenant_suspended");
  });

  it("o redirect de suspensão deixa passar só o acompanhamento de leitura", () => {
    const layout = readFileSync(join(process.cwd(), "app", "app", "layout.tsx"), "utf8");
    const bloco = layout.slice(
      Math.max(0, layout.indexOf('redirect("/account-suspended")') - 400),
      layout.indexOf('redirect("/account-suspended")') + 60,
    );
    expect(bloco, "o redirect de suspensão existe").toContain("/account-suspended");
    // A distinção é o ponto todo: `!user.support` solto deixaria entrar o modo
    // `full`, que `require-role.ts:68` mapeia para papel `admin`.
    expect(bloco).toContain("support_readonly");
    expect(bloco).not.toMatch(/&&\s*!user\.support\s*\)\s*redirect\("\/account-suspended"\)/);
  });
});
