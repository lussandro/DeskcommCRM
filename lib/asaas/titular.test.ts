import { describe, it, expect, vi } from "vitest";
import { titularDoContato, titularPorCustomer, vincularContatoPorDocumento, vincularPeloOperador } from "./titular";
import type { AsaasCliente } from "./cliente";

const ORG = "11111111-1111-4111-8111-111111111111";

/** Builder mínimo no molde de lib/companies/handler.test.ts: grava filtros, devolve uma fila de resultados. */
function fakeSb(resultado: { data: unknown; error: unknown } | Array<{ data: unknown; error: unknown }>) {
  const fila = Array.isArray(resultado) ? [...resultado] : null;
  const proximo = () => (fila ? (fila.length > 1 ? fila.shift()! : fila[0]) : (resultado as { data: unknown; error: unknown }));
  const calls: Record<string, unknown[]> = {};
  const b: Record<string, unknown> = {};
  for (const m of ["from", "select", "eq", "update", "maybeSingle"]) {
    b[m] = vi.fn((...a: unknown[]) => { (calls[m] ??= []).push(a); return m === "maybeSingle" ? Promise.resolve(proximo()) : b; });
  }
  (b as { then?: unknown }).then = (res: (v: unknown) => void) => res(proximo());
  return { sb: b as never, calls };
}

describe("titularDoContato", () => {
  it("contato com empresa vinculada → titular é a empresa, mesmo que o contato tenha asaas_customer_id próprio", async () => {
    const { sb } = fakeSb([
      { data: { id: "ct1", company_id: "co1", asaas_customer_id: "cus_contato" }, error: null },
      { data: { id: "co1", asaas_customer_id: "cus_empresa", billing_contact_id: "ct1" }, error: null },
    ]);
    const out = await titularDoContato(sb, ORG, "ct1");
    expect(out).toEqual({ kind: "company", id: "co1", customerId: "cus_empresa", billingContactId: "ct1" });
  });

  it("contato sem empresa e com asaas_customer_id → titular contato", async () => {
    const { sb } = fakeSb({ data: { id: "ct1", company_id: null, asaas_customer_id: "cus_contato" }, error: null });
    const out = await titularDoContato(sb, ORG, "ct1");
    expect(out).toEqual({ kind: "contact", id: "ct1", customerId: "cus_contato" });
  });

  it("contato de empresa sem vínculo → sem_vinculo com companyId", async () => {
    const { sb } = fakeSb([
      { data: { id: "ct1", company_id: "co1", asaas_customer_id: null }, error: null },
      { data: { id: "co1", asaas_customer_id: null, billing_contact_id: null }, error: null },
    ]);
    const out = await titularDoContato(sb, ORG, "ct1");
    expect(out).toEqual({ kind: "sem_vinculo", contactId: "ct1", companyId: "co1" });
  });
});

describe("titularPorCustomer", () => {
  it("acha empresa antes de contato", async () => {
    const { sb, calls } = fakeSb({ data: { id: "co1", billing_contact_id: "ct1" }, error: null });
    const out = await titularPorCustomer(sb, ORG, "cus_1");
    expect(out).toEqual({ kind: "company", id: "co1", customerId: "cus_1", billingContactId: "ct1" });
    expect(calls.from![0]).toEqual(["crm_companies"]);
  });
});

describe("vincularContatoPorDocumento", () => {
  it("recusa contato de empresa", async () => {
    const { sb } = fakeSb({ data: { id: "ct1", company_id: "co1", phone_number: "+5551999990001" }, error: null });
    const cliente = { customerPorDocumento: vi.fn() } as unknown as AsaasCliente;
    const out = await vincularContatoPorDocumento(sb, ORG, "ct1", "24971563792", cliente);
    expect(out).toEqual({ ok: false, motivo: "contato_de_empresa" });
    expect(cliente.customerPorDocumento).not.toHaveBeenCalled();
  });

  it("recusa quando o telefone do customer não bate (+55 51 99999-0001 vs 51 98888-0000)", async () => {
    const { sb } = fakeSb({ data: { id: "ct1", company_id: null, phone_number: "+5551999990001" }, error: null });
    const cliente = {
      customerPorDocumento: vi.fn(async () => ({ data: [{ id: "cus_1", name: "X", cpfCnpj: "24971563792", mobilePhone: "51988880000" }], totalCount: 1, hasMore: false, limit: 10, offset: 0 })),
    } as unknown as AsaasCliente;
    const out = await vincularContatoPorDocumento(sb, ORG, "ct1", "24971563792", cliente);
    expect(out).toEqual({ ok: false, motivo: "telefone_nao_confere" });
  });

  it("grava asaas_customer_id quando bate, com update filtrado por organization_id", async () => {
    const { sb, calls } = fakeSb([
      { data: { id: "ct1", company_id: null, phone_number: "+5551999990001" }, error: null },
      { data: null, error: null },
    ]);
    const cliente = {
      customerPorDocumento: vi.fn(async () => ({ data: [{ id: "cus_1", name: "X", cpfCnpj: "24971563792", mobilePhone: "51999990001" }], totalCount: 1, hasMore: false, limit: 10, offset: 0 })),
    } as unknown as AsaasCliente;
    const out = await vincularContatoPorDocumento(sb, ORG, "ct1", "24971563792", cliente);
    expect(out).toEqual({ ok: true, customerId: "cus_1" });
    expect((calls.update![0] as unknown[])[0]).toEqual({ asaas_customer_id: "cus_1" });
    expect(calls.eq!.flat()).toEqual(expect.arrayContaining(["organization_id", ORG, "id", "ct1"]));
  });
});

describe("vincularPeloOperador", () => {
  it("grava asaas_customer_id no contato, filtrando organization_id", async () => {
    const { sb, calls } = fakeSb({ data: null, error: null });
    await vincularPeloOperador(sb, ORG, { kind: "contact", id: "ct1" }, "cus_1");
    expect(calls.from![0]).toEqual(["contacts"]);
    expect((calls.update![0] as unknown[])[0]).toEqual({ asaas_customer_id: "cus_1" });
    expect(calls.eq!.flat()).toEqual(expect.arrayContaining(["organization_id", ORG, "id", "ct1"]));
  });

  it("grava asaas_customer_id na empresa; 23505 vira a mensagem de já vinculado", async () => {
    const { sb: sbOk, calls } = fakeSb({ data: null, error: null });
    await vincularPeloOperador(sbOk, ORG, { kind: "company", id: "co1" }, "cus_1");
    expect(calls.from![0]).toEqual(["crm_companies"]);

    const { sb: sbErr } = fakeSb({ data: null, error: { code: "23505", message: "uq_crm_companies_org_asaas_customer" } });
    await expect(vincularPeloOperador(sbErr, ORG, { kind: "company", id: "co1" }, "cus_1")).rejects.toThrow(
      "este cliente do Asaas já está vinculado a outro cadastro",
    );
  });
});
