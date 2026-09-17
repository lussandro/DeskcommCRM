import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Task 4 — contato carrega `company_id` e, no detalhe, a `company` resolvida.
 *
 * Mock por tabela (padrão de `tests/unit/contato-audit-from-to.test.ts`): cada
 * `from(tabela)` devolve a resposta certa para aquela tabela, sem depender da
 * ORDEM das chamadas de método (`eq`/`is`/`in`/`order` só encadeiam).
 */
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

const ORG = "11111111-1111-4111-8111-111111111111";
const ctx = {
  organization_id: ORG,
  actor: { type: "user" as const, id: "u1" },
  requestId: "r1",
  idioma: "pt-BR" as const,
};

function chain(resolve: () => Promise<{ data: unknown; error: unknown }>) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "in", "order", "limit"]) {
    c[m] = () => c;
  }
  c.maybeSingle = resolve;
  c.single = resolve;
  // withConversas faz `await query` sem `.maybeSingle()` — o builder precisa
  // ser thenable para essa cadeia.
  c.then = (res: (v: { data: unknown; error: unknown }) => unknown) => resolve().then(res);
  return c;
}

describe("getContactHandler anexa company", () => {
  it("company_id existe → out.company com is_billing_contact certo", async () => {
    const { getContactHandler } = await import("./_handler");
    const supabase = {
      from: (tabela: string) => {
        if (tabela === "contacts") {
          return chain(async () => ({
            data: { id: "ct1", organization_id: ORG, company_id: "c1", tags: [], custom_fields: {} },
            error: null,
          }));
        }
        if (tabela === "crm_companies") {
          return chain(async () => ({
            data: { id: "c1", name: "Adega", billing_contact_id: "ct1" },
            error: null,
          }));
        }
        if (tabela === "conversations") {
          return chain(async () => ({ data: [], error: null }));
        }
        throw new Error(`tabela inesperada: ${tabela}`);
      },
    };
    // GetContactResult estende Contact (_handler.ts:272): o campo é direto em `out`.
    const out = await getContactHandler(supabase as never, ctx, { contactId: "ct1" } as never);
    expect(out.company).toEqual({ id: "c1", name: "Adega", is_billing_contact: true });
  });

  it("company_id ausente → sem company_id, sem consulta a crm_companies", async () => {
    const { getContactHandler } = await import("./_handler");
    const supabase = {
      from: (tabela: string) => {
        if (tabela === "contacts") {
          return chain(async () => ({
            data: { id: "ct1", organization_id: ORG, company_id: null, tags: [], custom_fields: {} },
            error: null,
          }));
        }
        if (tabela === "conversations") {
          return chain(async () => ({ data: [], error: null }));
        }
        throw new Error(`tabela inesperada (não devia consultar company): ${tabela}`);
      },
    };
    const out = await getContactHandler(supabase as never, ctx, { contactId: "ct1" } as never);
    expect(out.company).toBeUndefined();
  });
});

describe("createContactHandler e patchContactHandler gravam company_id", () => {
  it("createContactHandler grava company_id no insert (a whitelist precisa da linha nova)", async () => {
    const { createContactHandler } = await import("./_handler");
    const inserts: Record<string, unknown>[] = [];
    const supabase = {
      from: () => {
        const c: Record<string, unknown> = {
          insert: (row: Record<string, unknown>) => {
            inserts.push(row);
            return c;
          },
          select: () => c,
          single: async () => ({
            data: { id: "ct1", organization_id: ORG, company_id: "c1", tags: [], custom_fields: {}, phone_number: null },
            error: null,
          }),
        };
        return c;
      },
      rpc: () => ({ then: (r: (v: unknown) => unknown) => r({ error: null }) }),
    };
    await createContactHandler(supabase as never, ctx, { source: "manual", company_id: "c1" } as never);
    expect(inserts[0]).toMatchObject({ company_id: "c1" });
  });

  it("patchContactHandler grava company_id (a whitelist do patch precisa da linha nova)", async () => {
    const { patchContactHandler } = await import("./_handler");
    const updates: Record<string, unknown>[] = [];
    const estadoAtual = {
      id: "ct1",
      organization_id: ORG,
      is_anonymized: false,
      tags: [],
      email: null,
      phone_number: null,
      name: null,
      display_name: null,
      consent: {},
      custom_fields: {},
      company_id: null,
    };
    const supabase = {
      from: () => ({
        select: () => {
          const c: Record<string, unknown> = { eq: () => c, maybeSingle: async () => ({ data: estadoAtual, error: null }) };
          return c;
        },
        update: (patch: Record<string, unknown>) => {
          updates.push(patch);
          const c: Record<string, unknown> = {
            eq: () => c,
            select: () => c,
            maybeSingle: async () => ({ data: { ...estadoAtual, ...patch }, error: null }),
          };
          return c;
        },
      }),
      rpc: () => ({ then: (r: (v: unknown) => unknown) => r({ error: null }) }),
    };
    await patchContactHandler(supabase as never, ctx, "ct1", { company_id: "c1" } as never);
    expect(updates[0]).toMatchObject({ company_id: "c1" });
  });

  it("company_id ausente no input → patch sem company_id (C1: PATCH não mexe no vínculo por acidente)", async () => {
    const { patchContactHandler } = await import("./_handler");
    const updates: Record<string, unknown>[] = [];
    const estadoAtual = {
      id: "ct1",
      organization_id: ORG,
      is_anonymized: false,
      tags: [],
      email: null,
      phone_number: null,
      name: "Fulano",
      display_name: null,
      consent: {},
      custom_fields: {},
      company_id: "c1",
    };
    const supabase = {
      from: () => ({
        select: () => {
          const c: Record<string, unknown> = { eq: () => c, maybeSingle: async () => ({ data: estadoAtual, error: null }) };
          return c;
        },
        update: (patch: Record<string, unknown>) => {
          updates.push(patch);
          const c: Record<string, unknown> = {
            eq: () => c,
            select: () => c,
            maybeSingle: async () => ({ data: { ...estadoAtual, ...patch }, error: null }),
          };
          return c;
        },
      }),
      rpc: () => ({ then: (r: (v: unknown) => unknown) => r({ error: null }) }),
    };
    await patchContactHandler(supabase as never, ctx, "ct1", { name: "Outro" } as never);
    expect(updates[0]).not.toHaveProperty("company_id");
  });

  it("company_id: null → patch com company_id: null (C1: tirar o contato da empresa pelo PATCH)", async () => {
    const { patchContactHandler } = await import("./_handler");
    const updates: Record<string, unknown>[] = [];
    const estadoAtual = {
      id: "ct1",
      organization_id: ORG,
      is_anonymized: false,
      tags: [],
      email: null,
      phone_number: null,
      name: null,
      display_name: null,
      consent: {},
      custom_fields: {},
      company_id: "c1",
    };
    const supabase = {
      from: () => ({
        select: () => {
          const c: Record<string, unknown> = { eq: () => c, maybeSingle: async () => ({ data: estadoAtual, error: null }) };
          return c;
        },
        update: (patch: Record<string, unknown>) => {
          updates.push(patch);
          const c: Record<string, unknown> = {
            eq: () => c,
            select: () => c,
            maybeSingle: async () => ({ data: { ...estadoAtual, ...patch }, error: null }),
          };
          return c;
        },
      }),
      rpc: () => ({ then: (r: (v: unknown) => unknown) => r({ error: null }) }),
    };
    await patchContactHandler(supabase as never, ctx, "ct1", { company_id: null } as never);
    expect(updates[0]).toMatchObject({ company_id: null });
  });

  it("23503 de company_id vira validation_failed no PATCH (não internal_error)", async () => {
    const { patchContactHandler } = await import("./_handler");
    const estadoAtual = {
      id: "ct1",
      organization_id: ORG,
      is_anonymized: false,
      tags: [],
      email: null,
      phone_number: null,
      name: null,
      display_name: null,
      consent: {},
      custom_fields: {},
      company_id: null,
    };
    const supabase = {
      from: () => ({
        select: () => {
          const c: Record<string, unknown> = { eq: () => c, maybeSingle: async () => ({ data: estadoAtual, error: null }) };
          return c;
        },
        update: () => {
          const c: Record<string, unknown> = {
            eq: () => c,
            select: () => c,
            maybeSingle: async () => ({
              data: null,
              error: {
                code: "23503",
                message:
                  'insert or update on table "contacts" violates foreign key constraint "contacts_company_org_fk" (company_id)',
              },
            }),
          };
          return c;
        },
      }),
    };
    await expect(
      patchContactHandler(supabase as never, ctx, "ct1", { company_id: "c-inexistente" } as never),
    ).rejects.toMatchObject({ status: 422, code: "validation_failed" });
  });
});
