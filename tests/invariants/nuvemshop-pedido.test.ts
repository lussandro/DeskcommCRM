import { describe, it, expect, beforeAll } from "vitest";

import { sql, countAs, lastLine } from "./gov-helpers";
import { seedOrg, ORG_A, ORG_B, USER_A, USER_B } from "./rls-isolation.helpers";

// Uuids próprios, para não colidir com os de outros invariantes na mesma base.
const SESS_A = "aaaaaaaa-4444-4000-8000-00000000d5a1";
const SESS_B = "bbbbbbbb-4444-4000-8000-00000000d5b1";

/**
 * O PEDIDO DA LOJA NO BANCO.
 *
 * O que estas provas guardam é a base do consumidor (`lib/nuvemshop/consumidor.ts`):
 * ele faz upsert pela unique natural e confia que a RLS não deixa o pedido de
 * uma organização aparecer na de outra. As duas coisas precisam ser verdade no
 * Postgres, não só no TypeScript.
 */
describe("nuvemshop: o pedido da loja", () => {
  beforeAll(() => {
    sql(seedOrg(ORG_A, USER_A, SESS_A, "ns-a") + seedOrg(ORG_B, USER_B, SESS_B, "ns-b"));
  });

  it("a unique natural existe — é ela que faz reentrega não virar pedido novo", () => {
    // A Nuvemshop reentrega em timeout. Sem esta constraint o consumidor criaria
    // uma segunda linha do MESMO pedido, e o faturamento contaria duas vezes.
    const ins = (total: number) => `insert into public.orders
      (organization_id, external_id, external_provider, status, total_cents, ordered_at)
      values ('${ORG_A}','ped-1','nuvemshop','pending',${total},'2026-09-19T10:00:00Z')`;
    sql(ins(1000));
    expect(() => sql(ins(1000))).toThrow(/orders_organization_id_external_provider_external_id_key/);

    // E o upsert que o consumidor usa passa, atualizando em vez de duplicar.
    sql(`${ins(2500)} on conflict (organization_id, external_provider, external_id)
         do update set total_cents = excluded.total_cents, status = excluded.status;`);
    expect(
      countAs(USER_A, `select count(*) from public.orders where organization_id='${ORG_A}' and external_id='ped-1';`),
    ).toBe(1);
  });

  it("o mesmo external_id em OUTRA organização é outro pedido — a unique é por org", () => {
    sql(`insert into public.orders
         (organization_id, external_id, external_provider, status, total_cents, ordered_at)
         values ('${ORG_B}','ped-1','nuvemshop','pending',9900,'2026-09-19T10:00:00Z');`);
    expect(countAs(USER_B, `select count(*) from public.orders where external_id='ped-1';`)).toBe(1);
  });

  it("RLS: organização B não enxerga o pedido de A", () => {
    expect(countAs(USER_B, `select count(*) from public.orders where organization_id='${ORG_A}';`)).toBe(0);
    expect(countAs(USER_A, `select count(*) from public.orders where organization_id='${ORG_A}';`)).toBe(1);
  });

  it("o status do pedido é vocabulário fechado — 'abandoned' NÃO é status de pedido", () => {
    // É por isso que o carrinho abandonado não vira linha aqui: ele não é
    // pedido, e forçá-lo nesta tabela faria "quanto a loja vendeu" somar
    // carrinho que ninguém pagou.
    expect(() =>
      sql(`insert into public.orders
           (organization_id, external_id, external_provider, status, total_cents, ordered_at)
           values ('${ORG_A}','car-1','nuvemshop','abandoned',100,'2026-09-19T10:00:00Z');`),
    ).toThrow(/orders_status_check/);
  });

  it("total negativo é recusado pelo banco, não só pelo TypeScript", () => {
    expect(() =>
      sql(`insert into public.orders
           (organization_id, external_id, external_provider, status, total_cents, ordered_at)
           values ('${ORG_A}','ped-neg','nuvemshop','paid',-1,'2026-09-19T10:00:00Z');`),
    ).toThrow(/orders_total_cents_check/);
  });

  it("o vínculo pedido↔card aceita 'order' — o CHECK previa o comércio", () => {
    const pedido = sql(
      `select id from public.orders where organization_id='${ORG_A}' and external_id='ped-1';`,
    );
    expect(String(pedido)).toMatch(/[0-9a-f-]{36}/);
  });

  /**
   * O CAMINHO INTEIRO, no banco de verdade: pedido → card → avanço por
   * pagamento → timeline. Escrito em SQL porque é o que o consumidor executa
   * (`lib/nuvemshop/consumidor.ts`); o TypeScript decide, o banco é quem aceita
   * ou recusa. Um teste que só exercita a decisão não prova que o INSERT passa
   * pelas constraints — e foi numa constraint (`lost_reason`) que a sabotagem
   * mostrou que o card ficaria aberto para sempre.
   */
  describe("o caminho do pedido até o card", () => {
    const PIPE = "44444444-4444-4000-8000-000000000001";
    const ETAPA_ENTRADA = "55555555-5555-4000-8000-000000000001";
    const ETAPA_GANHO = "55555555-5555-4000-8000-000000000002";
    const ETAPA_PERDA = "55555555-5555-4000-8000-000000000003";

    beforeAll(() => {
      sql(`insert into public.crm_pipelines (id, organization_id, name, slug, is_default, position, is_archived)
           values ('${PIPE}','${ORG_A}','Pedidos NS','pedidos-ns', false, 99, false)
           on conflict do nothing;
        insert into public.crm_stages (id, organization_id, pipeline_id, name, slug, position, is_won, is_lost, is_archived) values
         ('${ETAPA_ENTRADA}','${ORG_A}','${PIPE}','Aguardando','ns-aguardando',1,false,false,false),
         ('${ETAPA_GANHO}','${ORG_A}','${PIPE}','Pago','ns-pago',2,true,false,false),
         ('${ETAPA_PERDA}','${ORG_A}','${PIPE}','Cancelado','ns-cancelado',3,false,true,false)
         on conflict do nothing;`);
    });

    it("o card nasce vinculado ao pedido, e o vínculo é único por pedido", () => {
      const pedidoId = lastLine(
        sql(`select id from public.orders where organization_id='${ORG_A}' and external_id='ped-1';`),
      ).trim();

      sql(`insert into public.crm_leads (id, organization_id, pipeline_id, stage_id, title, status, value_cents, currency, source, external_id)
           values ('66666666-6666-4000-8000-000000000001','${ORG_A}','${PIPE}','${ETAPA_ENTRADA}','Pedido #ped-1','open',2500,'BRL','nuvemshop','ped-1');
        insert into public.crm_lead_links (organization_id, lead_id, target_kind, target_id, link_kind)
           values ('${ORG_A}','66666666-6666-4000-8000-000000000001','order','${pedidoId}','ordered');`);

      expect(
        countAs(USER_A, `select count(*) from public.crm_lead_links
          where organization_id='${ORG_A}' and target_kind='order' and target_id='${pedidoId}';`),
      ).toBe(1);
    });

    it("pagamento fecha o card na etapa de GANHO do próprio funil", () => {
      sql(`update public.crm_leads
             set stage_id='${ETAPA_GANHO}', status='won', closed_at=now()
           where id='66666666-6666-4000-8000-000000000001';`);

      expect(
        countAs(USER_A, `select count(*) from public.crm_leads
          where id='66666666-6666-4000-8000-000000000001' and status='won' and stage_id='${ETAPA_GANHO}';`),
      ).toBe(1);
    });

    it("PERDA SEM MOTIVO é recusada — é o que a sabotagem previu", () => {
      // Quem barra é o TRIGGER `fn_validate_lost_reason_required()`, que lança
      // `lost_reason_required` — não o CHECK de mesmo nome, como esta prova
      // supunha antes de rodar. A proteção é mais forte do que o CHECK (alcança
      // o UPDATE que só muda o status), e o efeito para o consumidor é o mesmo:
      // sem `lost_reason` o card ficaria aberto para sempre.
      expect(() =>
        sql(`update public.crm_leads set stage_id='${ETAPA_PERDA}', status='lost', closed_at=now(), lost_reason=null
             where id='66666666-6666-4000-8000-000000000001';`),
      ).toThrow(/lost_reason_required/);
    });

    it("a atividade do comércio entra na timeline com o tipo que o código emite", () => {
      sql(`insert into public.crm_lead_activities
             (organization_id, lead_id, type, source_module, actor_kind, reason, payload)
           values ('${ORG_A}','66666666-6666-4000-8000-000000000001','order_paid','nuvemshop','system','Pedido #ped-1 na loja','{}'::jsonb);`);

      expect(
        countAs(USER_A, `select count(*) from public.crm_lead_activities
          where lead_id='66666666-6666-4000-8000-000000000001' and type='order_paid';`),
      ).toBe(1);
    });
  });
});
