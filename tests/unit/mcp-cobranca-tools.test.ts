/**
 * As quatro capacidades de COBRANÇA (módulo Asaas), contra os handlers REAIS.
 *
 * O isolamento por contato é o coração deste arquivo: o Asaas não separa
 * cobrança por cliente do CRM, então o handler confere `payment.customer ===
 * titular.customerId` antes de devolver link ou mexer em qualquer coisa —
 * ver `payment_info: cobrança de outro customer`.
 *
 * `titularDoContato`/`vincularContatoPorDocumento` (lib/asaas/titular.ts) NÃO
 * são mockados: rodam de verdade contra o `fakeSupabase` — é assim que o
 * "documento confere com o telefone" fica provado de ponta a ponta.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// `poolQuery` precisa existir ANTES do `vi.mock` (hoisted) para o teto atômico
// (Fix round 1): a mesma função atende `fusoDaOrganizacao` (select timezone) e
// o UPDATE condicional de `reissue_count` — cada teste sobrescreve com
// `mockImplementation` só o segundo, via o texto do SQL.
const { poolQuery } = vi.hoisted(() => ({ poolQuery: vi.fn() }));

vi.mock("@/lib/audit", () => ({ audit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/agent-engine/db/request-pool", () => ({
  getRequestPool: vi.fn(() => ({ query: poolQuery })),
}));
vi.mock("@/lib/leads/agent-activity", () => ({
  emitAgentActivityForContact: vi.fn().mockResolvedValue({ routed: true, leadId: "lead-1" }),
}));
vi.mock("@/lib/asaas/config", () => ({ carregarIntegracaoAsaas: vi.fn() }));

import {
  crmListContactCharges,
  crmGetChargePaymentInfo,
  crmLinkContactToBilling,
  crmReissueOverdueCharge,
} from "@/lib/mcp/tools/cobranca";
import { carregarIntegracaoAsaas } from "@/lib/asaas/config";
import { AsaasErro } from "@/lib/asaas/cliente";
import { audit } from "@/lib/audit";
import { emitAgentActivityForContact } from "@/lib/leads/agent-activity";
import type { McpContext } from "@/lib/mcp/types";

const mockCarregarIntegracaoAsaas = vi.mocked(carregarIntegracaoAsaas);

/**
 * Comportamento padrão do pool: `fusoDaOrganizacao` (select timezone) sempre
 * responde; o UPDATE atômico de `reissue_count` responde conforme os
 * parâmetros do teste — é o teste que decide se a corrida "ganha" (rowCount 1)
 * ou "perde" (rowCount 0, o caminho de `limite`).
 */
function poolPadrao(opts: { incremento?: { rowCount: number; reissueCount?: number } } = {}) {
  const { rowCount: incRowCount = 1, reissueCount: incReissueCount = 1 } = opts.incremento ?? {};
  poolQuery.mockImplementation((sql: string) => {
    if (sql.includes("from organizations")) return Promise.resolve({ rows: [{ timezone: null }] });
    if (sql.includes("reissue_count + 1")) {
      return Promise.resolve(
        incRowCount > 0
          ? { rows: [{ reissue_count: incReissueCount }], rowCount: incRowCount }
          : { rows: [], rowCount: 0 },
      );
    }
    if (sql.includes("reissue_count - 1")) return Promise.resolve({ rows: [], rowCount: 1 });
    return Promise.resolve({ rows: [], rowCount: 0 });
  });
}

const ORG = "aaaaaaaa-1111-4111-8111-111111111111";
const CONTATO = "aaaaaaaa-2222-4222-8222-222222222222";
const CUSTOMER = "cus_000001";
const OUTRO_CUSTOMER = "cus_999999";
const PAYMENT = "pay_000001";
const TELEFONE = "+5511999998888";

type Resposta = { data: unknown; error: unknown };
type Resolver = (c: Consulta) => Resposta;
interface Consulta {
  table: string;
  op: "select" | "insert" | "update" | "upsert";
  terminal: "maybeSingle" | "single" | "list";
  filtros: Record<string, unknown>;
  values?: Record<string, unknown>;
}
interface Capturas {
  inserts: Array<{ table: string; values: Record<string, unknown> }>;
  updates: Array<{ table: string; values: Record<string, unknown> }>;
  upserts: Array<{ table: string; values: Record<string, unknown> }>;
}
function novasCapturas(): Capturas {
  return { inserts: [], updates: [], upserts: [] };
}

function fakeSupabase(resolve: Resolver, cap: Capturas) {
  const from = (table: string) => {
    const c: Consulta = { table, op: "select", terminal: "list", filtros: {} };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {
      select: () => chain,
      insert: (values: Record<string, unknown>) => {
        cap.inserts.push({ table, values });
        c.op = "insert";
        c.values = values;
        return chain;
      },
      update: (values: Record<string, unknown>) => {
        cap.updates.push({ table, values });
        c.op = "update";
        c.values = values;
        return chain;
      },
      upsert: (values: Record<string, unknown>) => {
        cap.upserts.push({ table, values });
        c.op = "upsert";
        c.values = values;
        return chain;
      },
      eq: (col: string, val: unknown) => {
        c.filtros[col] = val;
        return chain;
      },
      maybeSingle: () => Promise.resolve(resolve({ ...c, terminal: "maybeSingle" })),
      single: () => Promise.resolve(resolve({ ...c, terminal: "single" })),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve(resolve({ ...c, terminal: "list" })).then(res, rej),
    };
    return chain;
  };
  return { from };
}

function ctxDe(resolve: Resolver, cap: Capturas, actor: McpContext["actor"] = { type: "ai_agent", id: "run-1", role: "agent", agent_id: "agente-1" }): McpContext {
  return {
    organizationId: ORG,
    role: "agent",
    actor,
    apiTokenId: "tok",
    requestId: "req-1",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: fakeSupabase(resolve, cap) as any,
  } as McpContext;
}

function integracaoStub(overrides: Partial<Record<string, unknown>> = {}, config: Record<string, unknown> = { ambiente: "sandbox", followup_pointer_id: null, reemissao: { dias: 5, max_por_cobranca: 2 } }) {
  return {
    id: "integ-1",
    status: "healthy",
    config,
    webhookPathToken: "tok",
    cliente: {
      customerPorDocumento: vi.fn(),
      customer: vi.fn(),
      payments: vi.fn(),
      payment: vi.fn(),
      identificationField: vi.fn(),
      pixQrCode: vi.fn(),
      alterarVencimento: vi.fn(),
      ...overrides,
    },
  };
}

/** Contato sem company_id e sem vínculo — o caminho `needs_document`. */
const contatoSemVinculo: Resolver = (c) => {
  if (c.table === "contacts" && c.terminal === "maybeSingle") {
    return { data: { id: CONTATO, company_id: null, asaas_customer_id: null }, error: null };
  }
  return { data: null, error: null };
};

/** Contato já vinculado diretamente ao customer (pessoa física). */
function contatoVinculado(customerId = CUSTOMER): Resolver {
  return (c) => {
    if (c.table === "contacts" && c.terminal === "maybeSingle") {
      return { data: { id: CONTATO, company_id: null, asaas_customer_id: customerId }, error: null };
    }
    return { data: null, error: null };
  };
}

beforeEach(() => {
  poolQuery.mockReset();
  poolPadrao();
});

describe("crm_link_contact_to_billing", () => {
  it("sem integração ativa → { error }, sem chamar o Asaas", async () => {
    mockCarregarIntegracaoAsaas.mockResolvedValue(null);
    const cap = novasCapturas();
    const res = (await crmLinkContactToBilling.handler({ contact_id: CONTATO, document: "11144477735" }, ctxDe(contatoSemVinculo, cap))) as { error: string };
    expect(res.error).toContain("Asaas");
    expect(cap.updates).toHaveLength(0);
  });

  it("documento confere com o telefone → grava asaas_customer_id e audita asaas.contact_linked", async () => {
    const integ = integracaoStub();
    (integ.cliente.customerPorDocumento as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ id: CUSTOMER, name: "Cliente", cpfCnpj: "11144477735", mobilePhone: TELEFONE }],
      hasMore: false,
      totalCount: 1,
    });
    mockCarregarIntegracaoAsaas.mockResolvedValue(integ as never);
    const cap = novasCapturas();
    const contatoComTelefone: Resolver = (c) => {
      if (c.table === "contacts" && c.terminal === "maybeSingle") {
        return { data: { id: CONTATO, company_id: null, phone_number: TELEFONE }, error: null };
      }
      if (c.table === "contacts" && c.op === "update") return { data: null, error: null };
      return { data: null, error: null };
    };

    const res = (await crmLinkContactToBilling.handler({ contact_id: CONTATO, document: "11144477735" }, ctxDe(contatoComTelefone, cap))) as { ok: boolean };

    expect(res.ok).toBe(true);
    const upd = cap.updates.find((u) => u.table === "contacts");
    expect(upd?.values.asaas_customer_id).toBe(CUSTOMER);
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "asaas.contact_linked", resourceType: "contact", resourceId: CONTATO }),
    );
  });

  it("telefone não confere → { refused: 'documento_nao_confere' }, sem escrita", async () => {
    const integ = integracaoStub();
    (integ.cliente.customerPorDocumento as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ id: CUSTOMER, name: "Cliente", cpfCnpj: "11144477735", mobilePhone: "+5511900000000" }],
      hasMore: false,
      totalCount: 1,
    });
    mockCarregarIntegracaoAsaas.mockResolvedValue(integ as never);
    const cap = novasCapturas();
    const contatoComTelefone: Resolver = (c) => {
      if (c.table === "contacts" && c.terminal === "maybeSingle") {
        return { data: { id: CONTATO, company_id: null, phone_number: TELEFONE }, error: null };
      }
      return { data: null, error: null };
    };

    const res = (await crmLinkContactToBilling.handler({ contact_id: CONTATO, document: "11144477735" }, ctxDe(contatoComTelefone, cap))) as { refused: string };
    expect(res.refused).toBe("documento_nao_confere");
    expect(cap.updates).toHaveLength(0);
  });

  it("contato de empresa → { refused: 'contato_de_empresa' }", async () => {
    const integ = integracaoStub();
    mockCarregarIntegracaoAsaas.mockResolvedValue(integ as never);
    const cap = novasCapturas();
    const contatoDeEmpresa: Resolver = (c) => {
      if (c.table === "contacts" && c.terminal === "maybeSingle") {
        return { data: { id: CONTATO, company_id: "empresa-1", phone_number: TELEFONE }, error: null };
      }
      return { data: null, error: null };
    };
    const res = (await crmLinkContactToBilling.handler({ contact_id: CONTATO, document: "11144477735" }, ctxDe(contatoDeEmpresa, cap))) as { refused: string };
    expect(res.refused).toBe("contato_de_empresa");
  });
});

describe("crm_list_contact_charges", () => {
  it("contato sem vínculo → { needs_document: true }, sem chamar o Asaas nem escrever", async () => {
    const integ = integracaoStub();
    mockCarregarIntegracaoAsaas.mockResolvedValue(integ as never);
    const cap = novasCapturas();
    const res = (await crmListContactCharges.handler({ contact_id: CONTATO }, ctxDe(contatoSemVinculo, cap))) as { needs_document: boolean };
    expect(res.needs_document).toBe(true);
    expect(integ.cliente.payments).not.toHaveBeenCalled();
    expect(cap.inserts).toHaveLength(0);
    expect(cap.updates).toHaveLength(0);
  });

  it("contato de empresa vinculada → lista PENDING+OVERDUE do customer da empresa, com value_cents e days_overdue", async () => {
    const integ = integracaoStub();
    (integ.cliente.payments as ReturnType<typeof vi.fn>).mockImplementation((_customerId: string, status: string) => {
      if (status === "OVERDUE") {
        return Promise.resolve({ data: [{ id: PAYMENT, customer: CUSTOMER, status: "OVERDUE", value: 150.5, dueDate: "2026-08-01", billingType: "BOLETO", invoiceUrl: "https://x" }], hasMore: false, totalCount: 1 });
      }
      return Promise.resolve({ data: [], hasMore: false, totalCount: 0 });
    });
    mockCarregarIntegracaoAsaas.mockResolvedValue(integ as never);
    const cap = novasCapturas();
    const contatoDeEmpresaVinculada: Resolver = (c) => {
      if (c.table === "contacts" && c.terminal === "maybeSingle") {
        return { data: { id: CONTATO, company_id: "empresa-1", asaas_customer_id: null }, error: null };
      }
      if (c.table === "crm_companies" && c.terminal === "maybeSingle") {
        return { data: { id: "empresa-1", asaas_customer_id: CUSTOMER, billing_contact_id: null }, error: null };
      }
      return { data: null, error: null };
    };

    const res = (await crmListContactCharges.handler({ contact_id: CONTATO }, ctxDe(contatoDeEmpresaVinculada, cap))) as {
      holder: string;
      charges: Array<{ value_cents: number; days_overdue: number }>;
    };
    expect(res.holder).toBe("company");
    expect(res.charges).toHaveLength(1);
    expect(res.charges[0]?.value_cents).toBe(15050);
    expect(res.charges[0]?.days_overdue).toBeGreaterThan(0);
  });
});

describe("crm_get_charge_payment_info", () => {
  it("cobrança de outro customer → { error }, sem devolver link (isolamento por contato)", async () => {
    const integ = integracaoStub();
    (integ.cliente.payment as ReturnType<typeof vi.fn>).mockResolvedValue({ id: PAYMENT, customer: OUTRO_CUSTOMER, status: "PENDING", value: 100, dueDate: "2026-09-01", billingType: "PIX" });
    mockCarregarIntegracaoAsaas.mockResolvedValue(integ as never);
    const cap = novasCapturas();

    const res = (await crmGetChargePaymentInfo.handler({ contact_id: CONTATO, payment_id: PAYMENT }, ctxDe(contatoVinculado(CUSTOMER), cap))) as { error?: string; pix_copy_paste?: string };
    expect(res.error).toBeTruthy();
    expect(res.pix_copy_paste).toBeUndefined();
  });
});

describe("crm_reissue_overdue_charge", () => {
  it("sem cerca de reemissão na config → recusa { refused: 'sem_cerca' }", async () => {
    const integ = integracaoStub({}, { ambiente: "sandbox", followup_pointer_id: null, reemissao: null });
    mockCarregarIntegracaoAsaas.mockResolvedValue(integ as never);
    const cap = novasCapturas();
    const res = (await crmReissueOverdueCharge.handler({ contact_id: CONTATO, payment_id: PAYMENT }, ctxDe(contatoVinculado(), cap))) as { refused: string };
    expect(res.refused).toBe("sem_cerca");
    expect(integ.cliente.payment).not.toHaveBeenCalled();
  });

  it("status RECEIVED ao vivo → recusa como RESPOSTA { refused: 'ja_paga' }, não exceção", async () => {
    const integ = integracaoStub();
    (integ.cliente.payment as ReturnType<typeof vi.fn>).mockResolvedValue({ id: PAYMENT, customer: CUSTOMER, status: "RECEIVED", value: 100, dueDate: "2026-08-01", billingType: "BOLETO" });
    mockCarregarIntegracaoAsaas.mockResolvedValue(integ as never);
    const cap = novasCapturas();
    const res = (await crmReissueOverdueCharge.handler({ contact_id: CONTATO, payment_id: PAYMENT }, ctxDe(contatoVinculado(), cap))) as { refused: string };
    expect(res.refused).toBe("ja_paga");
  });

  it("PENDING (ainda não venceu ao vivo) → { refused: 'ainda_nao_venceu' }", async () => {
    const integ = integracaoStub();
    (integ.cliente.payment as ReturnType<typeof vi.fn>).mockResolvedValue({ id: PAYMENT, customer: CUSTOMER, status: "PENDING", value: 100, dueDate: "2026-12-01", billingType: "BOLETO" });
    mockCarregarIntegracaoAsaas.mockResolvedValue(integ as never);
    const cap = novasCapturas();
    const res = (await crmReissueOverdueCharge.handler({ contact_id: CONTATO, payment_id: PAYMENT }, ctxDe(contatoVinculado(), cap))) as { refused: string };
    expect(res.refused).toBe("ainda_nao_venceu");
  });

  it("teto ATÔMICO no banco (Fix round 1): UPDATE condicional falha (rowCount 0) → recusa { refused: 'limite' } e o Asaas NUNCA é chamado", async () => {
    const integ = integracaoStub();
    (integ.cliente.payment as ReturnType<typeof vi.fn>).mockResolvedValue({ id: PAYMENT, customer: CUSTOMER, status: "OVERDUE", value: 100, dueDate: "2026-08-01", billingType: "BOLETO" });
    mockCarregarIntegracaoAsaas.mockResolvedValue(integ as never);
    poolPadrao({ incremento: { rowCount: 0 } });
    const cap = novasCapturas();
    const resolver: Resolver = (c) => {
      // Fallback de leitura só para compor a mensagem — o rowCount 0 é quem decide.
      if (c.table === "asaas_charges" && c.terminal === "maybeSingle") return { data: { reissue_count: 2 }, error: null };
      return contatoVinculado()(c);
    };
    const res = (await crmReissueOverdueCharge.handler({ contact_id: CONTATO, payment_id: PAYMENT }, ctxDe(resolver, cap))) as { refused: string; vezes: number };
    expect(res.refused).toBe("limite");
    expect(res.vezes).toBe(2);
    expect(integ.cliente.alterarVencimento).not.toHaveBeenCalled();
    // A guarda tem de estar no SQL — tirar o `where reissue_count < $3` faz este teste ficar vermelho.
    expect(poolQuery).toHaveBeenCalledWith(expect.stringContaining("reissue_count < $3"), [ORG, PAYMENT, 2]);
  });

  it("teto ATÔMICO (Fix round 1): UPDATE condicional ganha (rowCount 1) → PUT chamado, upsert de estado (sem reissue_count) + update de status/due_date, insert em asaas_charge_actions, atividade e audit com uuid resourceId e payment_id em metadata", async () => {
    const integ = integracaoStub();
    (integ.cliente.payment as ReturnType<typeof vi.fn>).mockResolvedValue({ id: PAYMENT, customer: CUSTOMER, status: "OVERDUE", value: 100, dueDate: "2026-08-01", billingType: "BOLETO" });
    (integ.cliente.alterarVencimento as ReturnType<typeof vi.fn>).mockResolvedValue({ id: PAYMENT, customer: CUSTOMER, status: "PENDING", value: 100, dueDate: "2026-08-06", billingType: "BOLETO", invoiceUrl: "https://x", bankSlipUrl: "https://y" });
    (integ.cliente.identificationField as ReturnType<typeof vi.fn>).mockResolvedValue({ identificationField: "34191..." });
    mockCarregarIntegracaoAsaas.mockResolvedValue(integ as never);
    poolPadrao({ incremento: { rowCount: 1, reissueCount: 1 } });
    const cap = novasCapturas();

    const res = (await crmReissueOverdueCharge.handler({ contact_id: CONTATO, payment_id: PAYMENT }, ctxDe(contatoVinculado(), cap))) as { new_due_date: string };

    expect(poolQuery).toHaveBeenCalledWith(expect.stringContaining("reissue_count + 1"), [ORG, PAYMENT, 2]);
    expect(integ.cliente.alterarVencimento).toHaveBeenCalledWith(PAYMENT, expect.any(String));
    expect(res.new_due_date).toEqual(expect.any(String));
    // O upsert de estado NÃO toca reissue_count — quem incrementa é o UPDATE atômico.
    const upsert = cap.upserts.find((u) => u.table === "asaas_charges");
    expect(upsert?.values.reissue_count).toBeUndefined();
    const update = cap.updates.find((u) => u.table === "asaas_charges");
    expect(update?.values.status).toBe("PENDING");
    expect(update?.values.due_date).toEqual(expect.any(String));
    const action = cap.inserts.find((i) => i.table === "asaas_charge_actions");
    expect(action?.values.action).toBe("reissue");
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "asaas.charge_reissued",
        resourceType: "contact",
        resourceId: CONTATO,
        metadata: expect.objectContaining({ payment_id: PAYMENT, vezes: 1 }),
      }),
    );
    expect(emitAgentActivityForContact).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG, contactId: CONTATO, type: "charge_reissued" }),
    );
  });

  it("teto ATÔMICO (Fix round 1): PUT no Asaas falha DEPOIS do incremento → compensa (decrementa) a vaga", async () => {
    const integ = integracaoStub();
    (integ.cliente.payment as ReturnType<typeof vi.fn>).mockResolvedValue({ id: PAYMENT, customer: CUSTOMER, status: "OVERDUE", value: 100, dueDate: "2026-08-01", billingType: "BOLETO" });
    (integ.cliente.alterarVencimento as ReturnType<typeof vi.fn>).mockRejectedValue(new AsaasErro(400, "invalid_action", "Este boleto não pode ser alterado."));
    mockCarregarIntegracaoAsaas.mockResolvedValue(integ as never);
    poolPadrao({ incremento: { rowCount: 1, reissueCount: 1 } });
    const cap = novasCapturas();

    const res = (await crmReissueOverdueCharge.handler({ contact_id: CONTATO, payment_id: PAYMENT }, ctxDe(contatoVinculado(), cap))) as { error: string };

    expect(res.error).toBe("Este boleto não pode ser alterado.");
    expect(poolQuery).toHaveBeenCalledWith(expect.stringContaining("reissue_count - 1"), [ORG, PAYMENT]);
    // Falha de negócio (invalid_action) — nada gravado além da compensação.
    expect(cap.inserts.find((i) => i.table === "asaas_charge_actions")).toBeUndefined();
  });

  it("AsaasErro invalid_action → { error: descricao } sem item na Central", async () => {
    const integ = integracaoStub();
    (integ.cliente.payment as ReturnType<typeof vi.fn>).mockRejectedValue(new AsaasErro(400, "invalid_action", "Este boleto não pode ser alterado."));
    mockCarregarIntegracaoAsaas.mockResolvedValue(integ as never);
    const cap = novasCapturas();
    const res = (await crmReissueOverdueCharge.handler({ contact_id: CONTATO, payment_id: PAYMENT }, ctxDe(contatoVinculado(), cap))) as { error: string };
    expect(res.error).toBe("Este boleto não pode ser alterado.");
    expect(cap.inserts.find((i) => i.table === "agent_inbox_items")).toBeUndefined();
  });

  it("AsaasErro invalid_value (nosso erro) → item charge_reissue_failed na Central", async () => {
    const integ = integracaoStub();
    (integ.cliente.payment as ReturnType<typeof vi.fn>).mockRejectedValue(new AsaasErro(400, "invalid_value", "Data inválida."));
    mockCarregarIntegracaoAsaas.mockResolvedValue(integ as never);
    const cap = novasCapturas();
    const res = (await crmReissueOverdueCharge.handler({ contact_id: CONTATO, payment_id: PAYMENT }, ctxDe(contatoVinculado(), cap))) as { error: string };
    expect(res.error).toBe("Data inválida.");
    const item = cap.inserts.find((i) => i.table === "agent_inbox_items");
    expect(item?.values.kind).toBe("charge_reissue_failed");
  });
});
