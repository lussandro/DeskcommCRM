import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiError } from "@/lib/api/types";

vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
import { audit } from "@/lib/audit";

const ORG = "11111111-1111-4111-8111-111111111111";
const OUTRA = "22222222-2222-4222-8222-222222222222";
const ctx = { organization_id: ORG, actor: { type: "user" as const, id: "u1" }, requestId: "r1", idioma: "pt-BR" as const };

/**
 * Builder mínimo: grava os filtros e devolve o que `resultado` mandar.
 * Aceita um único resultado (repetido em toda resolução) ou uma fila de
 * resultados — cada resolução (`maybeSingle`/`single`/`then` implícito)
 * consome o próximo item, ficando no último quando a fila acaba. Necessário
 * para handlers com duas queries sequenciais (ex.: `unlinkContactHandler`).
 */
function fakeSb(resultado: { data: unknown; error: unknown } | Array<{ data: unknown; error: unknown }>) {
  const fila = Array.isArray(resultado) ? [...resultado] : null;
  const proximo = () => (fila ? (fila.length > 1 ? fila.shift()! : fila[0]) : (resultado as { data: unknown; error: unknown }));
  const calls: Record<string, unknown[]> = {};
  const b: Record<string, unknown> = {};
  for (const m of ["from","select","eq","ilike","or","order","limit","insert","update","delete","maybeSingle","single","in","is"]) {
    b[m] = vi.fn((...a: unknown[]) => { (calls[m] ??= []).push(a); return m === "maybeSingle" || m === "single" ? Promise.resolve(proximo()) : b; });
  }
  (b as { then?: unknown }).then = (res: (v: unknown) => void) => res(proximo());
  return { sb: b as never, calls };
}

describe("createCompanyHandler", () => {
  beforeEach(() => vi.clearAllMocks());

  it("grava com organization_id do ctx (nunca do input) e audita company.created", async () => {
    const { createCompanyHandler } = await import("./handler");
    const linha = { id: "c1", organization_id: ORG, name: "Adega", trade_name: null, cnpj: "11222333000181", asaas_customer_id: null, billing_contact_id: null, notes: null, created_at: "", updated_at: "" };
    const { sb, calls } = fakeSb({ data: linha, error: null });
    const out = await createCompanyHandler(sb, ctx, { name: "Adega", cnpj: "11222333000181", organization_id: OUTRA } as never);
    expect(out.id).toBe("c1");
    expect((calls.insert![0] as unknown[])[0]).toMatchObject({ organization_id: ORG, name: "Adega" });
    expect(vi.mocked(audit).mock.calls[0]![0]).toMatchObject({ action: "company.created", organizationId: ORG, resourceId: "c1" });
  });

  it("CNPJ repetido vira 409 cnpj_em_uso com a mensagem para o usuário", async () => {
    const { createCompanyHandler } = await import("./handler");
    const { sb } = fakeSb({ data: null, error: { code: "23505", message: "uq_crm_companies_org_cnpj" } });
    await expect(createCompanyHandler(sb, ctx, { name: "X", cnpj: "11222333000181" })).rejects.toMatchObject({ status: 409, code: "cnpj_em_uso" });
  });
});

describe("listCompaniesHandler", () => {
  it("desambigua o embed de contacts com o nome da FK (evita PGRST201 — NÃO MEDIDO contra PostgREST real, provado na VPS na Task 10)", async () => {
    const { listCompaniesHandler } = await import("./handler");
    const { sb, calls } = fakeSb({ data: [], error: null });
    await listCompaniesHandler(sb, ctx, { limit: 25 });
    const selectExpr = String((calls.select![0] as unknown[])[0]);
    expect(selectExpr).toContain("contacts!contacts_company_org_fk(count)");
  });

  it("cursor com nome contendo , ( ) \" não vaza esses caracteres pro valor entre aspas do .or()", async () => {
    const { listCompaniesHandler } = await import("./handler");
    const nomeMalicioso = 'Malicioso, (Sul)"drop';
    const cursor = Buffer.from(JSON.stringify({ name: nomeMalicioso, id: "c9" }), "utf8").toString("base64url");
    const { sb, calls } = fakeSb({ data: [], error: null });
    await listCompaniesHandler(sb, ctx, { limit: 25, cursor });
    const expr = String((calls.or!.at(-1) as unknown[])[0]);
    const valoresEntreAspas = expr.match(/"([^"]*)"/g) ?? [];
    expect(valoresEntreAspas.length).toBeGreaterThan(0);
    for (const trecho of valoresEntreAspas) {
      expect(trecho.slice(1, -1)).not.toMatch(/[,()"]/);
    }
  });

  it("busca com vírgula e parêntese não injeta condição no .or()", async () => {
    const { listCompaniesHandler } = await import("./handler");
    const { sb, calls } = fakeSb({ data: [], error: null });
    await listCompaniesHandler(sb, ctx, { search: "Adega, (Sul)", limit: 25 });
    const expr = String((calls.or![0] as unknown[])[0]);
    expect(expr).not.toMatch(/[()]{2}|,,/);
    expect(expr).toContain("Adega  Sul");
  });
  it("cursor é JSON base64url com name e id, e nome com espaço volta inteiro", async () => {
    const { listCompaniesHandler } = await import("./handler");
    const linhas = Array.from({ length: 3 }, (_, i) => ({ id: `c${i}`, organization_id: ORG, name: `Adega ${i}`, contacts: [{ count: 0 }] }));
    const { sb } = fakeSb({ data: linhas, error: null });
    const out = await listCompaniesHandler(sb, ctx, { limit: 2 });
    expect(out.has_more).toBe(true);
    expect(JSON.parse(Buffer.from(out.cursor!, "base64url").toString("utf8"))).toEqual({ name: "Adega 1", id: "c1" });
  });
});

describe("patchCompanyHandler — billing_contact_id", () => {
  it("recusa contato que não pertence à empresa (422 principal_fora_da_empresa)", async () => {
    const { patchCompanyHandler } = await import("./handler");
    // primeira consulta: o contato existe mas company_id é outra empresa
    const { sb } = fakeSb({ data: { id: "ct1", company_id: "outra" }, error: null });
    await expect(patchCompanyHandler(sb, ctx, { companyId: "c1", patch: { billing_contact_id: "ct1" } })).rejects.toMatchObject({ status: 422, code: "principal_fora_da_empresa" });
  });
});

describe("linkContactHandler", () => {
  it("grava company_id no contato filtrando organization_id e audita company.contact_linked", async () => {
    const { linkContactHandler } = await import("./handler");
    const { sb, calls } = fakeSb({ data: { id: "ct1", company_id: "c1" }, error: null });
    await linkContactHandler(sb, ctx, { companyId: "c1", contactId: "ct1" });
    expect((calls.update![0] as unknown[])[0]).toEqual({ company_id: "c1" });
    expect(calls.eq!.flat()).toEqual(expect.arrayContaining(["organization_id", ORG, "id", "ct1"]));
    expect(vi.mocked(audit).mock.calls.at(-1)![0]).toMatchObject({ action: "company.contact_linked" });
  });

  it("contato/empresa de outra organização (FK 23503) vira 422 validation_failed", async () => {
    const { linkContactHandler } = await import("./handler");
    const { sb } = fakeSb({ data: null, error: { code: "23503", message: "crm_companies_billing_contact_org_fk" } });
    await expect(linkContactHandler(sb, ctx, { companyId: "c1", contactId: "ct1" })).rejects.toMatchObject({ status: 422, code: "validation_failed" });
  });
});

describe("unlinkContactHandler", () => {
  it("filtra company_id no update de contacts (I2: não desvincula contato de outra empresa)", async () => {
    const { unlinkContactHandler } = await import("./handler");
    const { sb, calls } = fakeSb([
      { data: { id: "ct1", company_id: null }, error: null },
      { data: null, error: null },
    ]);
    await unlinkContactHandler(sb, ctx, { companyId: "c1", contactId: "ct1" });
    expect(calls.eq!.flat()).toEqual(
      expect.arrayContaining(["organization_id", ORG, "id", "ct1", "company_id", "c1"]),
    );
  });

  it("contato que não pertence a esta empresa vira 404 not_found com mensagem específica", async () => {
    const { unlinkContactHandler } = await import("./handler");
    const { sb } = fakeSb({ data: null, error: null });
    await expect(unlinkContactHandler(sb, ctx, { companyId: "c1", contactId: "ct1" })).rejects.toMatchObject({
      status: 404,
      code: "not_found",
      message: "Contato não pertence a esta empresa.",
    });
  });

  it("erro na segunda atualização (zerar billing_contact_id) não é engolido", async () => {
    const { unlinkContactHandler } = await import("./handler");
    const { sb } = fakeSb([
      { data: { id: "ct1", company_id: null }, error: null }, // update em contacts (mudarVinculo)
      { data: null, error: { message: "boom" } }, // update em crm_companies (zera billing_contact_id)
    ]);
    await expect(unlinkContactHandler(sb, ctx, { companyId: "c1", contactId: "ct1" })).rejects.toMatchObject({ status: 500, code: "internal_error" });
  });
});
