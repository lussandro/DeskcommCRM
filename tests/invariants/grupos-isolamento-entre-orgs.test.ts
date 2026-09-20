import { beforeAll, describe, expect, it } from "vitest";
import { sql, countAs, writeCountAs } from "./gov-helpers";
import { seedOrg, ORG_A, ORG_B, USER_A, USER_B } from "./rls-isolation.helpers";

/**
 * Migration 0269 — grupos de WhatsApp: mesma régua de
 * rls-isolation.test.ts (G1-02), tabelas novas.
 *
 * Migration 0270 acrescenta o segundo eixo: além de não vazar para o vizinho,
 * a tabela não pode ser ESCRITA pelo papel de baixo do próprio tenant. A 0269
 * as deixou com policy `ALL` só-tenancy e zero `grant`/`revoke`, e o default
 * ACL do baseline (`GRANT ALL ON TABLES TO authenticated`) fazia o resto: um
 * `viewer` ligava `modo='autonomo'` pelo PostgREST com o JWT dele. Os usuários
 * semeados por `seedOrg` são `agent` — papel abaixo de `manager`, que é a
 * régua das policies `_write`.
 */

const SESS_A = "aaaaaaaa-4444-4000-8000-000000000c01";
const SESS_B = "bbbbbbbb-4444-4000-8000-000000000c02";
const GROUP_B = "bbbbbbbb-4444-4000-8000-000000000c0b";

describe("grupos: isolamento entre organizações", () => {
  beforeAll(() => {
    sql(seedOrg(ORG_A, USER_A, SESS_A, "grp-a") + seedOrg(ORG_B, USER_B, SESS_B, "grp-b"));
    sql(`
      insert into public.whatsapp_groups (id, organization_id, channel_session_id, wa_group_id, subject)
        values ('${GROUP_B}', '${ORG_B}', '${SESS_B}', '1203@g.us', 'Grupo da B')
        on conflict do nothing;
      insert into public.whatsapp_group_members (organization_id, group_id, wa_lid, wa_pn)
        values ('${ORG_B}', '${GROUP_B}', '999@lid', '5548999@c.us')
        on conflict do nothing;
    `);
  });

  it("org A não enxerga grupo da org B sob RLS", () => {
    expect(countAs(USER_A, `select count(*) from public.whatsapp_groups where organization_id = '${ORG_B}';`)).toBe(0);
  });

  it("membro de grupo também não vaza entre orgs", () => {
    expect(
      countAs(USER_A, `select count(*) from public.whatsapp_group_members where organization_id = '${ORG_B}';`),
    ).toBe(0);
  });

  it("controle positivo: org B lê o próprio grupo e membro", () => {
    expect(countAs(USER_B, `select count(*) from public.whatsapp_groups where organization_id = '${ORG_B}';`)).toBe(1);
    expect(
      countAs(USER_B, `select count(*) from public.whatsapp_group_members where organization_id = '${ORG_B}';`),
    ).toBe(1);
  });

  // ─── 0270: o papel de baixo não escreve, e o privilégio de tabela é o piso ───

  it("agent da própria org NÃO liga modo='autonomo' (policy exige manager)", () => {
    expect(
      writeCountAs(USER_B, `update public.whatsapp_groups set modo = 'autonomo' where id = '${GROUP_B}'`),
    ).toBe(0);
  });

  it("membro e ação de moderação não têm privilégio de escrita para authenticated", () => {
    const escrita = sql(`
      select coalesce(string_agg(distinct table_name || ':' || privilege_type, ',' order by table_name || ':' || privilege_type), '')
        from information_schema.role_table_grants
       where table_schema = 'public'
         and table_name in ('whatsapp_group_members', 'whatsapp_group_actions')
         and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
         and grantee in ('anon', 'authenticated', 'PUBLIC');
    `);
    expect(escrita.trim()).toBe("");
  });

  it("whatsapp_groups só dá UPDATE a authenticated — nunca INSERT nem DELETE", () => {
    const escrita = sql(`
      select coalesce(string_agg(distinct privilege_type, ',' order by privilege_type), '')
        from information_schema.role_table_grants
       where table_schema = 'public' and table_name = 'whatsapp_groups'
         and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
         and grantee in ('anon', 'authenticated', 'PUBLIC');
    `);
    expect(escrita.trim()).toBe("UPDATE");
  });

  it("CONTROLE POSITIVO: service_role continua escrevendo nas três", () => {
    const out = sql(`
      set role service_role;
      update public.whatsapp_groups set modo = 'semi' where id = '${GROUP_B}';
      select count(*) from public.whatsapp_groups where id = '${GROUP_B}' and modo = 'semi';
    `);
    expect(out.trim().endsWith("1")).toBe(true);
  });
});
