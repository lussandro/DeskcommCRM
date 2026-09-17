/**
 * Adapter de produção do `ConsumidorDb` sobre o client service-role — todo
 * SELECT/UPDATE/INSERT filtrado por `organizationId` (fechado sobre esta
 * função, uma org por vez: o handler cria um adapter por evento).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { enrollFollowupFlow } from "@/lib/followup/enroll";
import { emitAgentActivityForContact } from "@/lib/leads/agent-activity";
import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import { fusoDaOrganizacao } from "@/lib/agent-engine/agent/fuso-da-org";
import { diaLocalISO } from "@/lib/agenda/fuso";
import { validarFluxoDeCobranca } from "./validacao-do-fluxo";
import { titularPorCustomer } from "./titular";
import type { IntegracaoAsaas } from "./config";
import type { ActivityType } from "@/lib/leads/activity-vocabulary";
import type { ConsumidorDb } from "./consumidor";
import { logger } from "@/lib/logger";

/** Mesmo vocabulário de `followup_enrollments.status` — `desativarAsaas` guarda a cópia dela. */
const STATUS_VIVOS = ["active", "waiting_reply", "paused_handoff", "paused_manual"] as const;

export function createSupabaseConsumidorDb(admin: SupabaseClient, orgId: string, integ: IntegracaoAsaas): ConsumidorDb {
  return {
    async upsertCharge(input) {
      const row: Record<string, unknown> = {
        organization_id: orgId,
        payment_id: input.paymentId,
        customer_id: input.customerId,
        status: input.status,
        due_date: input.dueDate,
        value_cents: input.valueCents,
        last_event_at: new Date().toISOString(),
      };
      if (input.holderKind) row.holder_kind = input.holderKind;
      if (input.holderId) row.holder_id = input.holderId;
      const { error } = await admin.from("asaas_charges").upsert(row, { onConflict: "organization_id,payment_id" });
      if (error) throw new Error(error.message);
    },

    async carregarCharge(organizationId, paymentId) {
      const { data, error } = await admin
        .from("asaas_charges")
        .select("enrollment_id, due_date")
        .eq("organization_id", organizationId)
        .eq("payment_id", paymentId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      return { enrollmentId: data.enrollment_id, dueDate: data.due_date };
    },

    async titularPorCustomer(organizationId, customerId) {
      return titularPorCustomer(admin, organizationId, customerId);
    },

    async nomeDaEmpresa(organizationId, companyId) {
      const { data } = await admin.from("crm_companies").select("name").eq("organization_id", organizationId).eq("id", companyId).maybeSingle();
      return data?.name ?? "empresa sem nome";
    },

    async nomeDoCustomer(customerId) {
      try {
        const c = await integ.cliente.customer(customerId);
        return c.name || null;
      } catch (err) {
        logger.warn("[asaas.consumidor] consulta do nome do customer falhou", { err: err instanceof Error ? err.message : String(err) });
        return null;
      }
    },

    async enrollmentViva(enrollmentId) {
      // I4: tenancy sob service role — `followup_enrollments` não isola por si só.
      const { data, error } = await admin
        .from("followup_enrollments")
        .select("status")
        .eq("organization_id", orgId)
        .eq("id", enrollmentId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return false;
      return (STATUS_VIVOS as readonly string[]).includes(data.status);
    },

    async enrollmentVivoDoCustomer(customerId) {
      const { data: charges, error: chargesErr } = await admin
        .from("asaas_charges")
        .select("payment_id, enrollment_id")
        .eq("organization_id", orgId)
        .eq("customer_id", customerId)
        .not("enrollment_id", "is", null);
      if (chargesErr) throw new Error(chargesErr.message);
      const enrollmentIds = [...new Set((charges ?? []).map((c) => c.enrollment_id as string))];
      if (enrollmentIds.length === 0) return null;

      const { data: vivos, error: vivosErr } = await admin
        .from("followup_enrollments")
        .select("id, contact_id")
        .eq("organization_id", orgId)
        .in("id", enrollmentIds)
        .in("status", STATUS_VIVOS);
      if (vivosErr) throw new Error(vivosErr.message);
      const vivo = (vivos ?? [])[0];
      if (!vivo) return null;
      const charge = (charges ?? []).find((c) => c.enrollment_id === vivo.id);
      return { paymentId: charge?.payment_id as string, enrollmentId: vivo.id as string, contactId: vivo.contact_id as string };
    },

    async enroll(pointerId, contactId) {
      return enrollFollowupFlow(admin, { organizationId: orgId, pointerId, contactId, actorUserId: null, requestId: `asaas-consumidor:${orgId}:${pointerId}:${contactId}` });
    },

    async cancelaEnrollment(id, reason, outcome) {
      // Mesmo guard de gatilho-caso.ts:400-419: o `.in("status", ...)` trava contra
      // a corrida com o motor — se já concluiu entre a leitura e aqui, não ressuscita.
      const { data, error } = await admin
        .from("followup_enrollments")
        .update({ status: "cancelled", outcome, cancel_reason: reason, next_eval_at: null, claimed_until: null, completed_at: new Date().toISOString() })
        .eq("organization_id", orgId)
        .eq("id", id)
        .in("status", ["active", "waiting_reply", "paused_handoff", "paused_manual"])
        .select("id");
      if (error) throw new Error(error.message);
      return (data ?? []).length > 0;
    },

    async gravaEnrollmentNaCharge(organizationId, paymentId, enrollmentId) {
      const { error } = await admin.from("asaas_charges").update({ enrollment_id: enrollmentId }).eq("organization_id", organizationId).eq("payment_id", paymentId);
      if (error) throw new Error(error.message);
    },

    async abrirAviso(kind, refKind, refId, title, body) {
      const { data: existente } = await admin
        .from("agent_inbox_items")
        .select("id")
        .eq("organization_id", orgId)
        .eq("kind", kind)
        .eq("ref_id", refId)
        .eq("status", "open")
        .maybeSingle();
      if (existente) return;
      const { error } = await admin.from("agent_inbox_items").insert({
        organization_id: orgId,
        kind,
        severity: "warn",
        title,
        body,
        ref_kind: refKind,
        ref_id: refId,
      });
      // 23505 = corrida perdida contra outra linha concorrente com o mesmo dedup — aceito.
      if (error && error.code !== "23505") throw new Error(error.message);
    },

    async atividade(contactId, type, reason, payload) {
      try {
        await emitAgentActivityForContact({
          pool: getRequestPool(),
          organizationId: orgId,
          contactId,
          type: type as ActivityType,
          sourceModule: "asaas",
          reason,
          payload,
        });
      } catch (err) {
        logger.warn("[asaas.consumidor] atividade não gravada", { err: err instanceof Error ? err.message : String(err) });
      }
    },

    async vencidasAoVivo(customerId) {
      try {
        const r = await integ.cliente.payments(customerId, "OVERDUE");
        return r.data.length;
      } catch (err) {
        logger.warn("[asaas.consumidor] consulta de vencidas ao vivo falhou", { err: err instanceof Error ? err.message : String(err) });
        return "falhou";
      }
    },

    async validarFluxo(pointerId) {
      return validarFluxoDeCobranca(admin, orgId, pointerId);
    },

    async followupPointerId() {
      return integ.config.followup_pointer_id;
    },

    async diaLocalDaOrg(organizationId) {
      const fuso = await fusoDaOrganizacao(getRequestPool(), organizationId);
      return diaLocalISO(new Date(), fuso);
    },

    async existeAcaoComVencimento(organizationId, paymentId, newDueDate) {
      const { data } = await admin
        .from("asaas_charge_actions")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("payment_id", paymentId)
        .eq("new_due_date", newDueDate)
        .limit(1)
        .maybeSingle();
      return !!data;
    },
  };
}
