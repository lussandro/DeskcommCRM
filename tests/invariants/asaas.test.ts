import { describe, it, expect, beforeAll } from "vitest";
import { sql, countAs } from "./gov-helpers";
import { seedOrg, ORG_A, ORG_B, USER_A, USER_B } from "./rls-isolation.helpers";

// ponytail: seedOrg grava `sess` na coluna uuid `channel_sessions.id` — precisa
// ser um uuid de verdade (mesmo achado do empresas.test.ts). Uuids dedicados,
// diferentes dos de rls-isolation.test.ts e empresas.test.ts, para não colidir.
const SESS_A = "aaaaaaaa-4444-4000-8000-00000000a5a1";
const SESS_B = "bbbbbbbb-4444-4000-8000-00000000a5b1";

describe("asaas (migration 0261)", () => {
  beforeAll(() => {
    sql(seedOrg(ORG_A, USER_A, SESS_A, "asaas-a") + seedOrg(ORG_B, USER_B, SESS_B, "asaas-b"));
  });

  it("webhook_events_log: segundo evento igual do Asaas é recusado pelo índice", () => {
    const ins = `insert into public.webhook_events_log (organization_id, provider, http_method, raw_body, external_id, status, attempts)
                 values ('${ORG_A}','asaas','POST','{}','pay_1:PAYMENT_OVERDUE','received',0);`;
    sql(ins);
    expect(() => sql(ins)).toThrow(/uq_webhook_events_asaas_external/);
    // e para outro provider a duplicata continua passando (o índice é parcial)
    const gen = ins.replace("'asaas'", "'generic'");
    sql(gen); sql(gen);
  });

  it("RLS: org B não lê asaas_charges nem asaas_charge_actions de A", () => {
    sql(`insert into public.asaas_charges (organization_id, payment_id, customer_id, status, due_date, value_cents)
         values ('${ORG_A}','pay_1','cus_1','OVERDUE','2026-09-01',1000) on conflict do nothing;`);
    expect(countAs(USER_B, `select count(*) from public.asaas_charges where organization_id='${ORG_A}';`)).toBe(0);
    expect(countAs(USER_A, `select count(*) from public.asaas_charges where organization_id='${ORG_A}';`)).toBe(1);
  });

  it("RLS: org B não lê asaas_charge_actions de A", () => {
    sql(`insert into public.asaas_charge_actions (organization_id, payment_id, action, actor_kind, old_due_date, new_due_date)
         values ('${ORG_A}','pay_1','reissue','system','2026-09-01','2026-09-08');`);
    expect(countAs(USER_B, `select count(*) from public.asaas_charge_actions where organization_id='${ORG_A}';`)).toBe(0);
    expect(countAs(USER_A, `select count(*) from public.asaas_charge_actions where organization_id='${ORG_A}';`)).toBe(1);
  });

  it("authenticated não escreve em asaas_charges — é o GRANT que barra (só select), antes da RLS", () => {
    expect(() => sql(`set role authenticated; select set_config('request.jwt.claims','{"sub":"${USER_A}"}',false);
      insert into public.asaas_charges (organization_id, payment_id, customer_id, status, due_date, value_cents)
      values ('${ORG_A}','pay_2','cus_1','PENDING','2026-10-01',1000);`)).toThrow();
  });

  it("kinds novos entram e o CHECK bate com o TypeScript", () => {
    for (const k of ["charge_unmatched","charge_overdue_no_flow","charge_reissue_failed","charge_webhook_paused"]) {
      sql(`insert into public.agent_inbox_items (organization_id, kind, severity, title, body) values ('${ORG_A}','${k}','warn','t','b');`);
    }
  });
});
