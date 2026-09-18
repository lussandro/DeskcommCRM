/**
 * Consumidor do `event_log` para os 4 eventos do Asaas (spec §8). Matricula o
 * titular no fluxo de retorno quando uma cobrança vence, cancela quando paga
 * ou é apagada, e avisa a Central quando não dá para agir.
 *
 * Lógica pura sobre `ConsumidorDb` — o adapter real (`consumidor.db.ts`) fica
 * fora daqui, no molde de `gatilho-caso.ts`.
 */
import { z } from "zod";

import type { EventRow } from "@/lib/event-log/dispatcher";
import type { EnrollFollowupResult } from "@/lib/followup/enroll";
import { chaveDeAviso } from "./avisos";
import { formatCentsBRL } from "@/lib/money";

const payloadSchema = z.object({
  event: z.string(),
  payment: z
    .object({
      id: z.string(),
      customer: z.string(),
      status: z.string(),
      value: z.number(),
      dueDate: z.string(),
    })
    .passthrough(),
});

export const EVENTO_OVERDUE = "asaas.payment_overdue";
export const EVENTO_RECEIVED = "asaas.payment_received";
export const EVENTO_DELETED = "asaas.payment_deleted";
export const EVENTO_UPDATED = "asaas.payment_updated";

export type Titular =
  | { kind: "company"; id: string; customerId: string; billingContactId: string | null }
  | { kind: "contact"; id: string; customerId: string };

export type ResultadoValidacaoFluxo =
  | { ok: true; agentId: string; channelSessionId: string; avisoTextoFixo: boolean }
  | { ok: false; motivo: string; detalhe: string };

export interface ConsumidorDb {
  /** Upsert por `(organization_id, payment_id)`; devolve o `enrollment_id` vivo, se houver. */
  upsertCharge(input: {
    organizationId: string;
    paymentId: string;
    customerId: string;
    status: string;
    dueDate: string;
    valueCents: number;
    holderKind?: "company" | "contact";
    holderId?: string;
  }): Promise<void>;
  carregarCharge(organizationId: string, paymentId: string): Promise<{ enrollmentId: string | null; dueDate: string } | null>;
  titularPorCustomer(organizationId: string, customerId: string): Promise<Titular | null>;
  nomeDaEmpresa(organizationId: string, companyId: string): Promise<string>;
  /** `null` quando a consulta ao Asaas falhar ou o nome não vier — nunca lança. */
  nomeDoCustomer(customerId: string): Promise<string | null>;
  enrollmentViva(enrollmentId: string): Promise<boolean>;
  /**
   * Cobrança do evento não carrega `enrollment_id` (ex.: 2ª cobrança vencida do
   * mesmo customer, que caiu em `409 conflict` ao matricular) — procura QUALQUER
   * matrícula viva das outras cobranças deste customer, para pagar/apagar uma
   * cobrança "órfã" ainda encerrar o retorno certo. `null` quando não há nenhuma.
   */
  enrollmentVivoDoCustomer(customerId: string): Promise<{ paymentId: string; enrollmentId: string; contactId: string } | null>;
  /** `channelSessionId` é o número do FLUXO — ver `EnrollFollowupInput.channelSessionId`. */
  enroll(pointerId: string, contactId: string, channelSessionId: string): Promise<EnrollFollowupResult>;
  cancelaEnrollment(id: string, reason: string, outcome: "converted" | "exhausted"): Promise<boolean>;
  gravaEnrollmentNaCharge(organizationId: string, paymentId: string, enrollmentId: string | null): Promise<void>;
  /** Dedup por `(organization_id, kind, ref_id)` aberto — não insere de novo se já existe. */
  abrirAviso(kind: string, refKind: "contact" | null, refId: string, title: string, body: string): Promise<void>;
  atividade(contactId: string, type: string, reason: string, payload: Record<string, unknown>): Promise<void>;
  /** `"falhou"` quando a consulta ao vivo ao Asaas deu erro. */
  vencidasAoVivo(customerId: string): Promise<number | "falhou">;
  validarFluxo(pointerId: string): Promise<ResultadoValidacaoFluxo>;
  /** Os fluxos de cobrança configurados, na ordem da config. */
  fluxosDeCobranca(organizationId: string): Promise<string[]>;
  /** Números em que este contato TEM conversa (não-grupo). Vazio = nunca escreveu. */
  canaisDoContato(contactId: string): Promise<string[]>;
  diaLocalDaOrg(organizationId: string): Promise<string>;
  existeAcaoComVencimento(organizationId: string, paymentId: string, newDueDate: string): Promise<boolean>;
}

export interface ConsumidorDeps {
  db: ConsumidorDb;
  agora: () => Date;
}

export type ConsumidorResultado = { status: "ok" | "skipped"; detail: string };

function centavos(v: number): number {
  return Math.round(v * 100);
}

async function tratarOverdue(deps: ConsumidorDeps, row: EventRow, p: z.infer<typeof payloadSchema>["payment"]): Promise<ConsumidorResultado> {
  const { db } = deps;
  const orgId = row.organization_id;

  await db.upsertCharge({
    organizationId: orgId,
    paymentId: p.id,
    customerId: p.customer,
    status: p.status,
    dueDate: p.dueDate,
    valueCents: centavos(p.value),
  });

  const titular = await db.titularPorCustomer(orgId, p.customer);
  if (!titular) {
    const nome = await db.nomeDoCustomer(p.customer);
    const body = `Cliente do Asaas ${p.customer}${nome ? ` (${nome})` : ""}: cobrança vencida ${p.id}, ${formatCentsBRL(centavos(p.value))} com vencimento em ${p.dueDate}. Vincule a uma empresa ou a um contato.`;
    await db.abrirAviso("charge_unmatched", null, chaveDeAviso("charge_unmatched", p.customer), "Cobrança sem cliente cadastrado", body);
    return { status: "skipped", detail: "titular_nao_encontrado" };
  }
  await db.upsertCharge({
    organizationId: orgId,
    paymentId: p.id,
    customerId: p.customer,
    status: p.status,
    dueDate: p.dueDate,
    valueCents: centavos(p.value),
    holderKind: titular.kind,
    holderId: titular.id,
  });

  let contactId: string;
  if (titular.kind === "company") {
    if (!titular.billingContactId) {
      const nome = await db.nomeDaEmpresa(orgId, titular.id);
      await db.abrirAviso("charge_overdue_no_flow", null, chaveDeAviso("charge_overdue_no_flow", titular.id), "Empresa sem contato de cobrança", `A empresa "${nome}" tem uma cobrança vencida, mas não há contato de cobrança definido.`);
      return { status: "skipped", detail: "empresa_sem_principal" };
    }
    contactId = titular.billingContactId;
  } else {
    contactId = titular.id;
  }

  const charge = await db.carregarCharge(orgId, p.id);
  if (charge?.enrollmentId && (await db.enrollmentViva(charge.enrollmentId))) {
    return { status: "ok", detail: "enrollment_ja_vivo" };
  }

  const configurados = await db.fluxosDeCobranca(orgId);
  const diaOrg = await db.diaLocalDaOrg(orgId);
  if (configurados.length === 0) {
    await db.abrirAviso("charge_overdue_no_flow", null, chaveDeAviso("charge_overdue_no_flow", diaOrg), "Sem fluxo de retorno configurado", "A integração Asaas está ativa, mas nenhum fluxo de retorno foi escolhido para cobrança vencida.");
    return { status: "skipped", detail: "sem_pointer_configurado" };
  }

  // Revalida AGORA, nunca pelo número guardado na config: publicar outro agente
  // que arme o mesmo fluxo troca o dono dele sem ninguém abrir a tela do Asaas.
  const validos: Array<{ pointerId: string; channelSessionId: string }> = [];
  let ultimoInvalido: ResultadoValidacaoFluxo | null = null;
  for (const id of configurados) {
    const v = await db.validarFluxo(id);
    if (v.ok) validos.push({ pointerId: id, channelSessionId: v.channelSessionId });
    else ultimoInvalido = v;
  }
  if (validos.length === 0) {
    const detalhe = ultimoInvalido && !ultimoInvalido.ok ? ultimoInvalido.detalhe : "Nenhum fluxo de cobrança está pronto.";
    await db.abrirAviso("charge_overdue_no_flow", null, chaveDeAviso("charge_overdue_no_flow", diaOrg), "Fluxo de retorno não está pronto", detalhe);
    return { status: "skipped", detail: `fluxo_invalido:${ultimoInvalido && !ultimoInvalido.ok ? ultimoInvalido.motivo : "nenhum"}` };
  }

  // A escolha por NÚMERO. Um fluxo só: ele atende — inclusive contato que ainda
  // não escreveu (não há outro financeiro para errar, e barrar aqui desligaria a
  // cobrança de cliente novo na instalação de um número, que é o self-host comum).
  // Dois ou mais: só dispara quando o contato amarra a exatamente um; senão a
  // Central decide, porque adivinhar quem cobra é o defeito que se conserta.
  const canais = await db.canaisDoContato(contactId);
  const candidatos = validos.filter((f) => canais.includes(f.channelSessionId));
  let escolhido: { pointerId: string; channelSessionId: string };
  if (candidatos.length === 1) {
    escolhido = candidatos[0]!;
  } else if (candidatos.length === 0 && validos.length === 1) {
    escolhido = validos[0]!;
  } else {
    const ambiguo = candidatos.length > 1;
    await db.abrirAviso(
      "charge_overdue_no_flow",
      "contact",
      contactId,
      ambiguo ? "Mais de um fluxo de cobrança serve este cliente" : "Nenhum fluxo de cobrança atende o número deste cliente",
      ambiguo
        ? `Este cliente tem cobrança vencida (${p.id}) e conversa em mais de um número com fluxo de cobrança. Escolha por qual número ele deve ser cobrado.`
        : `Este cliente tem cobrança vencida (${p.id}), mas nenhum fluxo de cobrança está no número em que ele conversa. Crie um fluxo para esse número, ou fale com ele manualmente.`,
    );
    return { status: "skipped", detail: ambiguo ? "fluxo_ambiguo" : "sem_fluxo_para_o_numero" };
  }
  const { pointerId, channelSessionId } = escolhido;

  try {
    const resultado = await db.enroll(pointerId, contactId, channelSessionId);
    if (!resultado.ok) {
      if (resultado.code === "conflict") {
        // Zera o enrollment_id da charge: sem isto o estado aponta para uma
        // matrícula que nunca foi desta cobrança (T7) — próximo evento desta
        // cobrança leria um enrollment de outra, possivelmente já encerrada.
        await db.gravaEnrollmentNaCharge(orgId, p.id, null);
        await db.atividade(contactId, "charge_waiting_slot", "Cobrança vencida aguardando outro retorno terminar", { payment_id: p.id });
        return { status: "ok", detail: "aguardando_outro_fluxo" };
      }
      await db.abrirAviso("charge_overdue_no_flow", null, chaveDeAviso("charge_overdue_no_flow", diaOrg), "Não consegui matricular o cliente no retorno", resultado.message);
      return { status: "skipped", detail: `enroll_falhou:${resultado.code}` };
    }
    const enrollmentId = String((resultado.enrollment as { id?: unknown }).id ?? "");
    await db.gravaEnrollmentNaCharge(orgId, p.id, enrollmentId || null);
    await db.atividade(contactId, "charge_overdue", `Cobrança vencida em ${p.dueDate}`, { payment_id: p.id, due_date: p.dueDate });
    return { status: "ok", detail: "matriculado" };
  } catch (err) {
    const detalhe = err instanceof Error ? err.message : String(err);
    await db.abrirAviso("charge_overdue_no_flow", null, chaveDeAviso("charge_overdue_no_flow", diaOrg), "Não consegui matricular o cliente no retorno", detalhe);
    return { status: "skipped", detail: `enroll_lancou:${detalhe}` };
  }
}

async function tratarPagaOuApagada(deps: ConsumidorDeps, row: EventRow, p: z.infer<typeof payloadSchema>["payment"], tipo: "paid" | "deleted"): Promise<ConsumidorResultado> {
  const { db } = deps;
  const orgId = row.organization_id;

  await db.upsertCharge({ organizationId: orgId, paymentId: p.id, customerId: p.customer, status: p.status, dueDate: p.dueDate, valueCents: centavos(p.value) });

  const charge = await db.carregarCharge(orgId, p.id);
  let enrollmentId = charge?.enrollmentId ?? null;
  if (enrollmentId) {
    if (!(await db.enrollmentViva(enrollmentId))) return { status: "ok", detail: "enrollment_ja_encerrada" };
  } else {
    // A cobrança do evento não carrega matrícula (ex.: caiu em 409 ao matricular,
    // T7). Antes de desistir, procura qualquer matrícula viva de OUTRA cobrança
    // do mesmo customer — sem isto, pagar/apagar essa cobrança nunca encerra o
    // retorno que outra cobrança do mesmo cliente abriu (I1).
    const achado = await db.enrollmentVivoDoCustomer(p.customer);
    if (!achado) return { status: "ok", detail: "sem_enrollment" };
    enrollmentId = achado.enrollmentId;
  }

  const restantes = await db.vencidasAoVivo(p.customer);
  const falhouConsulta = restantes === "falhou";
  if (!falhouConsulta && (restantes as number) > 0) {
    return { status: "ok", detail: `mantido_restam_${restantes}` };
  }

  // Estorno/exclusão não é conversão (I2): `outcome-stats.ts` conta "converted"
  // como venda, e uma cobrança apagada/estornada não vendeu nada.
  const outcome = tipo === "paid" ? "converted" : "exhausted";
  const cancelReason = tipo === "paid" ? "charge_settled" : "charge_deleted";
  const cancelou = await db.cancelaEnrollment(enrollmentId, cancelReason, outcome);
  const titular = await db.titularPorCustomer(orgId, p.customer);
  const contactId = titular ? (titular.kind === "company" ? titular.billingContactId : titular.id) : null;
  if (contactId) {
    const type = tipo === "paid" ? "charge_paid" : "charge_deleted";
    const reason = falhouConsulta
      ? `Cobrança ${tipo === "paid" ? "paga" : "cancelada"} no Asaas — não consegui confirmar se restam outras vencidas, encerrei o retorno`
      : `Cobrança ${tipo === "paid" ? "paga" : "cancelada"} no Asaas`;
    await db.atividade(contactId, type, reason, { payment_id: p.id, consulta_falhou: falhouConsulta });
  }
  return { status: cancelou ? "ok" : "ok", detail: falhouConsulta ? "cancelado_apesar_da_falha" : "cancelado" };
}

async function tratarUpdated(deps: ConsumidorDeps, row: EventRow, p: z.infer<typeof payloadSchema>["payment"]): Promise<ConsumidorResultado> {
  const { db } = deps;
  const orgId = row.organization_id;
  const anterior = await db.carregarCharge(orgId, p.id);
  await db.upsertCharge({ organizationId: orgId, paymentId: p.id, customerId: p.customer, status: p.status, dueDate: p.dueDate, valueCents: centavos(p.value) });

  if (!anterior || anterior.dueDate === p.dueDate) return { status: "ok", detail: "sem_mudanca_de_vencimento" };
  if (await db.existeAcaoComVencimento(orgId, p.id, p.dueDate)) return { status: "ok", detail: "vencimento_por_acao_conhecida" };

  const titular = await db.titularPorCustomer(orgId, p.customer);
  const contactId = titular ? (titular.kind === "company" ? titular.billingContactId : titular.id) : null;
  if (contactId) {
    await db.atividade(contactId, "charge_due_changed", `Vencimento alterado no painel do Asaas para ${p.dueDate}`, { payment_id: p.id, old_due_date: anterior.dueDate, new_due_date: p.dueDate });
  }
  return { status: "ok", detail: "vencimento_alterado" };
}

/** Uma linha de `asaas.*`. Devolve `{status, detail}` — o handler cuida de `error` (try/catch em volta). */
export async function processarEvento(deps: ConsumidorDeps, row: EventRow): Promise<ConsumidorResultado> {
  const parsed = payloadSchema.safeParse(row.payload);
  if (!parsed.success) return { status: "skipped", detail: "payload_invalido" };
  const p = parsed.data.payment;

  switch (row.event_type) {
    case EVENTO_OVERDUE:
      return tratarOverdue(deps, row, p);
    case EVENTO_RECEIVED:
      return tratarPagaOuApagada(deps, row, p, "paid");
    case EVENTO_DELETED:
      return tratarPagaOuApagada(deps, row, p, "deleted");
    case EVENTO_UPDATED:
      return tratarUpdated(deps, row, p);
    default:
      return { status: "skipped", detail: "evento_nao_tratado" };
  }
}
