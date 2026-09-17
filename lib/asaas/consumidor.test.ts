import { describe, expect, it } from "vitest";

import type { EventRow } from "@/lib/event-log/dispatcher";
import type { EnrollFollowupResult } from "@/lib/followup/enroll";
import {
  EVENTO_DELETED,
  EVENTO_OVERDUE,
  EVENTO_RECEIVED,
  EVENTO_UPDATED,
  processarEvento,
  type ConsumidorDb,
  type ResultadoValidacaoFluxo,
  type Titular,
} from "./consumidor";

const ORG = "11111111-1111-1111-1111-111111111111";
const POINTER = "22222222-2222-2222-2222-222222222222";
const CONTATO = "33333333-3333-3333-3333-333333333333";
const EMPRESA = "44444444-4444-4444-4444-444444444444";
const BILLING_CONTATO = "55555555-5555-5555-5555-555555555555";
const ENROLLMENT = "66666666-6666-6666-6666-666666666666";
const CUSTOMER = "cus_000001";

function evento(tipo: string, payment: Record<string, unknown>): EventRow {
  return {
    id: "77777777-7777-7777-7777-777777777777",
    organization_id: ORG,
    event_type: tipo,
    entity_kind: "asaas_webhook",
    entity_id: null,
    payload: { event: "X", payment: { id: "pay_1", customer: CUSTOMER, status: "OVERDUE", value: 100, dueDate: "2026-09-20", ...payment } },
    metadata: {},
    consumed_by: [],
    attempts: 0,
  };
}

interface Registro {
  charges: Array<Record<string, unknown>>;
  avisos: Array<{ kind: string; refKind: string | null; refId: string; title: string; body: string }>;
  atividades: Array<{ contactId: string; type: string; reason: string; payload: Record<string, unknown> }>;
  enrolls: Array<{ pointerId: string; contactId: string }>;
  cancelamentos: Array<{ id: string; reason: string; outcome: string }>;
  gravacoes: Array<{ paymentId: string; enrollmentId: string | null }>;
}

function registro(): Registro {
  return { charges: [], avisos: [], atividades: [], enrolls: [], cancelamentos: [], gravacoes: [] };
}

function fakeDb(opts: {
  reg: Registro;
  titular?: Titular | null;
  chargeExistente?: { enrollmentId: string | null; dueDate: string } | null;
  enrollmentViva?: boolean;
  pointerId?: string | null;
  validarFluxo?: ResultadoValidacaoFluxo;
  enrollResultado?: EnrollFollowupResult;
  enrollLanca?: Error;
  vencidasAoVivo?: number | "falhou";
  existeAcao?: boolean;
  cancelaOk?: boolean;
}): ConsumidorDb {
  return {
    async upsertCharge(input) {
      opts.reg.charges.push(input as unknown as Record<string, unknown>);
    },
    async carregarCharge() {
      return opts.chargeExistente === undefined ? null : opts.chargeExistente;
    },
    async titularPorCustomer() {
      return opts.titular === undefined ? null : opts.titular;
    },
    async nomeDaEmpresa() {
      return "Empresa Exemplo";
    },
    async enrollmentViva() {
      return opts.enrollmentViva ?? true;
    },
    async enroll(pointerId, contactId) {
      opts.reg.enrolls.push({ pointerId, contactId });
      if (opts.enrollLanca) throw opts.enrollLanca;
      return opts.enrollResultado ?? { ok: true, enrollment: { id: ENROLLMENT } };
    },
    async cancelaEnrollment(id, reason, outcome) {
      opts.reg.cancelamentos.push({ id, reason, outcome });
      return opts.cancelaOk ?? true;
    },
    async gravaEnrollmentNaCharge(_org, paymentId, enrollmentId) {
      opts.reg.gravacoes.push({ paymentId, enrollmentId });
    },
    async abrirAviso(kind, refKind, refId, title, body) {
      opts.reg.avisos.push({ kind, refKind, refId, title, body });
    },
    async atividade(contactId, type, reason, payload) {
      opts.reg.atividades.push({ contactId, type, reason, payload });
    },
    async vencidasAoVivo() {
      return opts.vencidasAoVivo ?? 0;
    },
    async validarFluxo() {
      return opts.validarFluxo ?? { ok: true, agentId: "agent-1", avisoTextoFixo: false };
    },
    async followupPointerId() {
      return opts.pointerId === undefined ? POINTER : opts.pointerId;
    },
    async diaLocalDaOrg() {
      return "2026-09-17";
    },
    async existeAcaoComVencimento() {
      return opts.existeAcao ?? false;
    },
  };
}

const deps = (db: ConsumidorDb) => ({ db, agora: () => new Date("2026-09-17T12:00:00.000Z") });

describe("processarEvento — asaas.payment_overdue", () => {
  it("titular empresa com principal → 1 enroll no principal", async () => {
    const reg = registro();
    const titular: Titular = { kind: "company", id: EMPRESA, customerId: CUSTOMER, billingContactId: BILLING_CONTATO };
    const db = fakeDb({ reg, titular });
    const r = await processarEvento(deps(db), evento(EVENTO_OVERDUE, {}));
    expect(r.status).toBe("ok");
    expect(reg.enrolls).toEqual([{ pointerId: POINTER, contactId: BILLING_CONTATO }]);
    expect(reg.gravacoes).toEqual([{ paymentId: "pay_1", enrollmentId: ENROLLMENT }]);
    expect(reg.atividades.map((a) => a.type)).toEqual(["charge_overdue"]);
  });

  it("overdue de novo do mesmo payment com enrollment vivo → nada de novo", async () => {
    const reg = registro();
    const titular: Titular = { kind: "contact", id: CONTATO, customerId: CUSTOMER };
    const db = fakeDb({ reg, titular, chargeExistente: { enrollmentId: ENROLLMENT, dueDate: "2026-09-20" }, enrollmentViva: true });
    const r = await processarEvento(deps(db), evento(EVENTO_OVERDUE, {}));
    expect(r.status).toBe("ok");
    expect(reg.enrolls).toEqual([]);
  });

  it("empresa sem principal → aviso charge_overdue_no_flow com nome; zero enroll", async () => {
    const reg = registro();
    const titular: Titular = { kind: "company", id: EMPRESA, customerId: CUSTOMER, billingContactId: null };
    const db = fakeDb({ reg, titular });
    const r = await processarEvento(deps(db), evento(EVENTO_OVERDUE, {}));
    expect(r.status).toBe("skipped");
    expect(reg.enrolls).toEqual([]);
    expect(reg.avisos).toHaveLength(1);
    expect(reg.avisos[0]!.kind).toBe("charge_overdue_no_flow");
    expect(reg.avisos[0]!.body).toContain("Empresa Exemplo");
  });

  it("sem titular → aviso charge_unmatched (1 por customer); zero enroll", async () => {
    const reg = registro();
    const db = fakeDb({ reg, titular: null });
    const r = await processarEvento(deps(db), evento(EVENTO_OVERDUE, {}));
    expect(r.status).toBe("skipped");
    expect(reg.enrolls).toEqual([]);
    expect(reg.avisos).toHaveLength(1);
    expect(reg.avisos[0]!.kind).toBe("charge_unmatched");
    expect(reg.avisos[0]!.refKind).toBeNull();
  });

  it("config sem followup_pointer_id → charge_overdue_no_flow 1x por dia (ref_id = data)", async () => {
    const reg = registro();
    const titular: Titular = { kind: "contact", id: CONTATO, customerId: CUSTOMER };
    const db = fakeDb({ reg, titular, pointerId: null });
    const r = await processarEvento(deps(db), evento(EVENTO_OVERDUE, {}));
    expect(r.status).toBe("skipped");
    expect(reg.enrolls).toEqual([]);
    expect(reg.avisos[0]!.kind).toBe("charge_overdue_no_flow");
  });

  it("validarFluxo falha (agente sem capacidades) → charge_overdue_no_flow com detalhe", async () => {
    const reg = registro();
    const titular: Titular = { kind: "contact", id: CONTATO, customerId: CUSTOMER };
    const db = fakeDb({ reg, titular, validarFluxo: { ok: false, motivo: "agente_sem_capacidades", detalhe: "Faltam ferramentas." } });
    const r = await processarEvento(deps(db), evento(EVENTO_OVERDUE, {}));
    expect(r.status).toBe("skipped");
    expect(reg.enrolls).toEqual([]);
    expect(reg.avisos[0]!.body).toBe("Faltam ferramentas.");
  });

  it("enroll devolve 409 → atividade charge_waiting_slot, enrollment_id null, sem aviso", async () => {
    const reg = registro();
    const titular: Titular = { kind: "contact", id: CONTATO, customerId: CUSTOMER };
    const db = fakeDb({ reg, titular, enrollResultado: { ok: false, code: "conflict", message: "Este contato já está em um follow-up ativo.", status: 409 } });
    const r = await processarEvento(deps(db), evento(EVENTO_OVERDUE, {}));
    expect(r.status).toBe("ok");
    expect(reg.avisos).toEqual([]);
    expect(reg.gravacoes).toEqual([]);
    expect(reg.atividades).toEqual([{ contactId: CONTATO, type: "charge_waiting_slot", reason: "Cobrança vencida aguardando outro retorno terminar", payload: { payment_id: "pay_1" } }]);
  });

  it("enroll lança service_channel_not_found → charge_overdue_no_flow com o texto real", async () => {
    const reg = registro();
    const titular: Titular = { kind: "contact", id: CONTATO, customerId: CUSTOMER };
    const db = fakeDb({ reg, titular, enrollLanca: new Error("service_channel_not_found") });
    const r = await processarEvento(deps(db), evento(EVENTO_OVERDUE, {}));
    expect(r.status).toBe("skipped");
    expect(reg.avisos[0]!.kind).toBe("charge_overdue_no_flow");
    expect(reg.avisos[0]!.body).toBe("service_channel_not_found");
  });
});

describe("processarEvento — asaas.payment_received / payment_deleted", () => {
  it("enrollment viva e vencidasAoVivo=0 → cancela converted/charge_settled + atividade charge_paid", async () => {
    const reg = registro();
    const titular: Titular = { kind: "contact", id: CONTATO, customerId: CUSTOMER };
    const db = fakeDb({ reg, titular, chargeExistente: { enrollmentId: ENROLLMENT, dueDate: "2026-09-10" }, enrollmentViva: true, vencidasAoVivo: 0 });
    const r = await processarEvento(deps(db), evento(EVENTO_RECEIVED, { status: "RECEIVED" }));
    expect(r.status).toBe("ok");
    expect(reg.cancelamentos).toEqual([{ id: ENROLLMENT, reason: "charge_settled", outcome: "converted" }]);
    expect(reg.atividades.map((a) => a.type)).toEqual(["charge_paid"]);
  });

  it("vencidasAoVivo=2 → mantém", async () => {
    const reg = registro();
    const titular: Titular = { kind: "contact", id: CONTATO, customerId: CUSTOMER };
    const db = fakeDb({ reg, titular, chargeExistente: { enrollmentId: ENROLLMENT, dueDate: "2026-09-10" }, enrollmentViva: true, vencidasAoVivo: 2 });
    const r = await processarEvento(deps(db), evento(EVENTO_RECEIVED, { status: "RECEIVED" }));
    expect(r.status).toBe("ok");
    expect(reg.cancelamentos).toEqual([]);
    expect(reg.atividades).toEqual([]);
  });

  it("vencidasAoVivo='falhou' → cancela mesmo assim e a atividade registra o erro", async () => {
    const reg = registro();
    const titular: Titular = { kind: "contact", id: CONTATO, customerId: CUSTOMER };
    const db = fakeDb({ reg, titular, chargeExistente: { enrollmentId: ENROLLMENT, dueDate: "2026-09-10" }, enrollmentViva: true, vencidasAoVivo: "falhou" });
    const r = await processarEvento(deps(db), evento(EVENTO_RECEIVED, { status: "RECEIVED" }));
    expect(r.status).toBe("ok");
    expect(reg.cancelamentos).toEqual([{ id: ENROLLMENT, reason: "charge_settled", outcome: "converted" }]);
    expect(reg.atividades[0]!.payload.consulta_falhou).toBe(true);
  });

  it("payment_deleted com enrollment viva e sem vencidas → cancela e atividade charge_deleted", async () => {
    const reg = registro();
    const titular: Titular = { kind: "contact", id: CONTATO, customerId: CUSTOMER };
    const db = fakeDb({ reg, titular, chargeExistente: { enrollmentId: ENROLLMENT, dueDate: "2026-09-10" }, enrollmentViva: true, vencidasAoVivo: 0 });
    const r = await processarEvento(deps(db), evento(EVENTO_DELETED, { status: "DELETED" }));
    expect(r.status).toBe("ok");
    expect(reg.atividades.map((a) => a.type)).toEqual(["charge_deleted"]);
  });

  it("sem enrollment vivo → nada acontece", async () => {
    const reg = registro();
    const db = fakeDb({ reg, chargeExistente: { enrollmentId: null, dueDate: "2026-09-10" } });
    const r = await processarEvento(deps(db), evento(EVENTO_RECEIVED, { status: "RECEIVED" }));
    expect(r.status).toBe("ok");
    expect(reg.cancelamentos).toEqual([]);
  });
});

describe("processarEvento — asaas.payment_updated", () => {
  it("dueDate diferente do último e sem charge_action com essa data → atividade charge_due_changed", async () => {
    const reg = registro();
    const titular: Titular = { kind: "contact", id: CONTATO, customerId: CUSTOMER };
    const db = fakeDb({ reg, titular, chargeExistente: { enrollmentId: null, dueDate: "2026-09-10" }, existeAcao: false });
    const r = await processarEvento(deps(db), evento(EVENTO_UPDATED, { dueDate: "2026-09-25" }));
    expect(r.status).toBe("ok");
    expect(reg.atividades).toEqual([
      { contactId: CONTATO, type: "charge_due_changed", reason: "Vencimento alterado no painel do Asaas para 2026-09-25", payload: { payment_id: "pay_1", old_due_date: "2026-09-10", new_due_date: "2026-09-25" } },
    ]);
  });

  it("com charge_action igual → nada", async () => {
    const reg = registro();
    const titular: Titular = { kind: "contact", id: CONTATO, customerId: CUSTOMER };
    const db = fakeDb({ reg, titular, chargeExistente: { enrollmentId: null, dueDate: "2026-09-10" }, existeAcao: true });
    const r = await processarEvento(deps(db), evento(EVENTO_UPDATED, { dueDate: "2026-09-25" }));
    expect(r.status).toBe("ok");
    expect(reg.atividades).toEqual([]);
  });
});
