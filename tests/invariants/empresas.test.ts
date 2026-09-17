import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect, beforeAll } from "vitest";
// helpers: mesmos de rls-isolation.test.ts
import { sql, countAs } from "./gov-helpers";
import { seedOrg, ORG_A, ORG_B, USER_A, USER_B } from "./rls-isolation.helpers";

// ponytail: seedOrg grava `sess` na coluna uuid `channel_sessions.id` — precisa
// ser um uuid de verdade (o brief original usava "sess-a"/"sess-b", que o
// Postgres rejeita com invalid input syntax for type uuid). Uuids dedicados,
// diferentes dos de rls-isolation.test.ts, para não colidir se algum dia
// dividirem banco.
const SESS_A = "aaaaaaaa-3333-4000-8000-00000000c0a1";
const SESS_B = "bbbbbbbb-3333-4000-8000-00000000c0b1";

const EMP_A = "aaaaaaaa-0000-0000-0000-00000000c0a1";
const EMP_B = "bbbbbbbb-0000-0000-0000-00000000c0b1";
const CT_A1 = "aaaaaaaa-0000-0000-0000-00000000cca1";
const CT_A2 = "aaaaaaaa-0000-0000-0000-00000000cca2";

// Fix round 1 (finding 1) — o caso "revoke de anon" tinha dente de leite: ele
// digitava o `revoke` de novo dentro do teste, então apagar a linha do
// apêndice não derrubava nada. Lemos o BLOCO DA 0260 do próprio
// `supabase/baseline.sql` pelo rótulo (mesmo padrão de
// audit-log-sob-o-default-acl-do-supabase.test.ts) e executamos o comando
// EXTRAÍDO — não um literal digitado aqui.
const BASELINE = readFileSync(join(process.cwd(), "supabase", "baseline.sql"), "utf8");
const ROTULO_0260 = "-- ---- empresas (migration 0260, bacco) ----";

/** O bloco rotulado da 0260, do rótulo até o próximo rótulo de apêndice. */
function blocoDaEmpresas(): string {
  const inicio = BASELINE.indexOf(ROTULO_0260);
  if (inicio === -1) throw new Error("rótulo da 0260 não encontrado no baseline");
  if (BASELINE.indexOf(ROTULO_0260, inicio + 1) !== -1) throw new Error("rótulo da 0260 repetido no baseline");
  const fim = BASELINE.indexOf("\n-- ---- ", inicio + ROTULO_0260.length);
  return fim === -1 ? BASELINE.slice(inicio) : BASELINE.slice(inicio, fim);
}

describe("empresas (migration 0260)", () => {
  beforeAll(() => {
    sql(seedOrg(ORG_A, USER_A, SESS_A, "a") + seedOrg(ORG_B, USER_B, SESS_B, "b"));
    sql(`
      insert into public.crm_companies (id, organization_id, name, cnpj) values
        ('${EMP_A}', '${ORG_A}', 'Adega A', '11222333000181'),
        ('${EMP_B}', '${ORG_B}', 'Adega B', '11222333000262')
      on conflict do nothing;
      insert into public.contacts (id, organization_id, name, phone_number, company_id) values
        ('${CT_A1}', '${ORG_A}', 'Fin 1', '+5551999990001', '${EMP_A}'),
        ('${CT_A2}', '${ORG_A}', 'Fin 2', '+5551999990002', '${EMP_A}')
      on conflict do nothing;
      update public.crm_companies set billing_contact_id = '${CT_A1}'
        where id = '${EMP_A}' and organization_id = '${ORG_A}';
    `);
  });

  it("RLS: org B não lê a empresa de A, e lê a própria", () => {
    expect(countAs(USER_B, `select count(*) from public.crm_companies where organization_id = '${ORG_A}';`)).toBe(0);
    expect(countAs(USER_B, `select count(*) from public.crm_companies where organization_id = '${ORG_B}';`)).toBe(1);
  });

  it("revoke de anon segura mesmo sob o default ACL do Supabase — comando extraído do baseline", () => {
    const bloco = blocoDaEmpresas();
    const match = bloco.match(/^revoke all on public\.crm_companies from anon;$/m);
    expect(
      match,
      "o apêndice da 0260 no baseline perdeu `revoke all on public.crm_companies from anon;`",
    ).not.toBeNull();
    const comandoDoBaseline = match![0];

    // O Postgres do test-db não reproduz o default ACL de TABELAS do Supabase (só o de
    // funções) — sem este grant prévio o caso ficaria verde com o revoke ausente.
    sql(`grant all on public.crm_companies to anon;`);
    sql(comandoDoBaseline); // o comando de VERDADE, lido do baseline — não digitado aqui
    const out = sql(`select count(*) from information_schema.role_table_grants
      where table_schema='public' and table_name='crm_companies' and grantee='anon';`);
    expect(out.trim()).toBe("0");
  });

  it("CNPJ só dígitos e único por org", () => {
    expect(() => sql(`insert into public.crm_companies (organization_id, name, cnpj) values ('${ORG_A}','X','11.222.333/0001-81');`)).toThrow();
    expect(() => sql(`insert into public.crm_companies (organization_id, name, cnpj) values ('${ORG_A}','Y','11222333000181');`)).toThrow();
    // a mesma sequência noutra org passa
    sql(`insert into public.crm_companies (organization_id, name, cnpj) values ('${ORG_B}','Z','11222333000181');`);
  });

  // Fix round 1 (finding 2) — as FKs eram de coluna única e aceitavam linha de
  // OUTRA organização. Agora são compostas contra (organization_id, id).
  it("FK cercada por organização: contato de A não aponta empresa de B, nem o inverso", () => {
    expect(() =>
      sql(`insert into public.contacts (organization_id, name, company_id)
        values ('${ORG_A}', 'Cross-tenant', '${EMP_B}');`),
    ).toThrow();
    expect(() =>
      sql(`update public.crm_companies set billing_contact_id = '${CT_A1}'
        where id = '${EMP_B}';`),
    ).toThrow();
  });

  it("target_kind tem exatamente os sete antigos + company", () => {
    const out = sql(`select pg_get_constraintdef(oid) from pg_constraint where conname='crm_lead_links_target_kind_enum';`);
    const valores = [...out.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(valores).toEqual(["appointment","company","contact","conversation","external","lead","message","order"]);
  });

  it("anonimizar o principal solta o vínculo e o contato sai da empresa", () => {
    sql(`update public.contacts set is_anonymized = true, anonymized_at = now() where id = '${CT_A1}';`);
    expect(sql(`select coalesce(billing_contact_id::text,'null') from public.crm_companies where id='${EMP_A}';`).trim()).toBe("null");
    expect(sql(`select coalesce(company_id::text,'null') from public.contacts where id='${CT_A1}';`).trim()).toBe("null");
    // o outro contato continua na empresa
    expect(sql(`select company_id::text from public.contacts where id='${CT_A2}';`).trim()).toBe(EMP_A);
  });

  it("apagar a empresa não apaga contatos", () => {
    sql(`delete from public.crm_companies where id='${EMP_A}';`);
    expect(sql(`select count(*) from public.contacts where id in ('${CT_A1}','${CT_A2}');`).trim()).toBe("2");
  });
});
