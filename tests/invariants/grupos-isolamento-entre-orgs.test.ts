import { beforeAll, describe, expect, it } from "vitest";
import { sql, countAs } from "./gov-helpers";
import { seedOrg, ORG_A, ORG_B, USER_A, USER_B } from "./rls-isolation.helpers";

/**
 * Migration 0269 — grupos de WhatsApp: mesma régua de
 * rls-isolation.test.ts (G1-02), tabelas novas.
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
});
