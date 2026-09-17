/**
 * Cron `asaas-reconcile` (diário) — spec §9.
 *
 * Cobre o que o webhook perde: cobrança OVERDUE cujo evento nunca chegou (ou
 * chegou e ficou pendurada em `409 conflict`, §8), cobrança RECEIVED cujo
 * evento também sumiu, e a fila de webhooks que o Asaas pausa depois de
 * falhas seguidas. Emite via `emit_event` — o CRON NUNCA escreve em
 * `asaas_charges` nem cancela `followup_enrollments` diretamente; quem faz
 * isso é sempre o consumidor (`lib/asaas/consumidor.ts`), do mesmo jeito que
 * processa o evento vindo do webhook. Reaproveitar o caminho existente é o
 * que garante que reconciliação e webhook nunca divirjam de comportamento.
 *
 * `reconciliarOrg` é lógica pura sobre `ReconcileDb` + um cliente Asaas
 * mínimo (`ClienteReconcile`) — testável sem rede nem Postgres, no mesmo
 * molde de `consumidor.ts`/`consumidor.db.ts`. `reconciliarTudo` é o adapter
 * que varre as orgs e trata os dois erros que só fazem sentido no nível da
 * conta: `401` (chave recusada) e qualquer outra exceção (nunca aborta a
 * passada inteira por uma org quebrada).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { diaLocalISO } from "@/lib/agenda/fuso";
import { fusoDaOrganizacao } from "@/lib/agent-engine/agent/fuso-da-org";
import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { chaveDeAviso } from "./avisos";
import { AsaasErro, type AsaasCliente } from "./cliente";
import { carregarIntegracaoAsaas } from "./config";
import type { AsaasPayment } from "./tipos";
import { STATUS_PAGO } from "./tipos";
import { sanitizar } from "./webhook";

const ENTIDADE = "asaas_reconcile";
/** Teto de páginas por status — 100×100 = 10.000 cobranças por status, por org, por rodada. */
const PAGINAS_MAX = 100;

export interface ReconcileTotals {
  overdue_emitidos: number;
  received_emitidos: number;
  webhooks_religados: number;
  avisos: number;
}

function totaisVazios(): ReconcileTotals {
  return { overdue_emitidos: 0, received_emitidos: 0, webhooks_religados: 0, avisos: 0 };
}

function somar(a: ReconcileTotals, b: ReconcileTotals): ReconcileTotals {
  return {
    overdue_emitidos: a.overdue_emitidos + b.overdue_emitidos,
    received_emitidos: a.received_emitidos + b.received_emitidos,
    webhooks_religados: a.webhooks_religados + b.webhooks_religados,
    avisos: a.avisos + b.avisos,
  };
}

/** Só o que a reconciliação usa do `AsaasCliente` — `Pick` preserva a assinatura sem exigir os campos privados da classe, então um stub de teste satisfaz o tipo. */
export type ClienteReconcile = Pick<AsaasCliente, "paymentsPorStatus" | "webhooks" | "religarWebhook">;

export interface ReconcileDb {
  /** `asaas_charges` ausente, ou com `enrollment_id` nulo, ou com enrollment que não está mais viva. */
  precisaOverdue(paymentId: string): Promise<boolean>;
  /** `asaas_charges.status` ainda `OVERDUE`/`PENDING` para este `paymentId` — o evento de pagamento se perdeu. */
  aindaVencidaLocalmente(paymentId: string): Promise<boolean>;
  emitir(tipo: "asaas.payment_overdue" | "asaas.payment_received", payment: AsaasPayment): Promise<void>;
  /** Dedup por `(kind, refId)` aberto — mesmo contrato de `consumidor.db.ts`. */
  abrirAviso(kind: string, refId: string, title: string, body: string): Promise<void>;
  diaLocalDaOrg(): Promise<string>;
}

export interface OrgAsaas {
  organizationId: string;
  webhookPathToken: string;
  cliente: ClienteReconcile;
}

async function reconciliarOverdue(org: OrgAsaas, db: ReconcileDb, totais: ReconcileTotals): Promise<void> {
  let offset = 0;
  for (let pagina = 0; pagina < PAGINAS_MAX; pagina++) {
    const resp = await org.cliente.paymentsPorStatus("OVERDUE", offset);
    for (const p of resp.data) {
      if (await db.precisaOverdue(p.id)) {
        await db.emitir("asaas.payment_overdue", p);
        totais.overdue_emitidos++;
      }
    }
    if (!resp.hasMore) return;
    offset += 100;
  }
}

async function reconciliarPagas(org: OrgAsaas, db: ReconcileDb, diaLocal: string, totais: ReconcileTotals): Promise<void> {
  const ontem = diaAnteriorDe(diaLocal);
  for (const status of STATUS_PAGO) {
    let offset = 0;
    for (let pagina = 0; pagina < PAGINAS_MAX; pagina++) {
      const resp = await org.cliente.paymentsPorStatus(status, offset, { "paymentDate[ge]": ontem });
      for (const p of resp.data) {
        if (await db.aindaVencidaLocalmente(p.id)) {
          await db.emitir("asaas.payment_received", p);
          totais.received_emitidos++;
        }
      }
      if (!resp.hasMore) break;
      offset += 100;
    }
  }
}

/** Subtrai um dia de `YYYY-MM-DD` sem depender de fuso — os dois lados já vêm no fuso da org. */
function diaAnteriorDe(diaISO: string): string {
  const [ano, mes, dia] = diaISO.split("-").map(Number) as [number, number, number];
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function reconciliarWebhook(org: OrgAsaas, db: ReconcileDb, diaLocal: string, totais: ReconcileTotals): Promise<void> {
  const sufixo = `/api/v1/webhooks/asaas/${org.webhookPathToken}`;
  const resp = await org.cliente.webhooks();
  const nosso = resp.data.find((w) => w.url.endsWith(sufixo));
  const url = `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}${sufixo}`;
  // Semente sempre `${orgId}:${diaLocal}` — mesma forma de `marcarChaveRecusada`,
  // para o dedup por (kind, refId) nunca depender de duas convenções.
  const semente = `${org.organizationId}:${diaLocal}`;

  if (!nosso) {
    await db.abrirAviso(
      "charge_webhook_paused",
      chaveDeAviso("charge_webhook_paused", semente),
      "O Asaas não tem o endereço de aviso desta instalação",
      `O webhook não está cadastrado no Asaas. Cadastre esta URL: ${url}`,
    );
    totais.avisos++;
    return;
  }

  if (nosso.interrupted) {
    await org.cliente.religarWebhook(nosso.id);
    await db.abrirAviso(
      "charge_webhook_paused",
      chaveDeAviso("charge_webhook_paused", semente),
      "O Asaas pausou os avisos de cobrança",
      `O Asaas pausou os avisos após falhas seguidas; religado em ${diaLocal}.`,
    );
    totais.webhooks_religados++;
    totais.avisos++;
  }
}

/** Uma org, do início ao fim. Erros de rede/API sobem para quem chama — `reconciliarTudo` decide o que fazer com eles. */
export async function reconciliarOrg(org: OrgAsaas, db: ReconcileDb): Promise<ReconcileTotals> {
  const totais = totaisVazios();
  const diaLocal = await db.diaLocalDaOrg();
  await reconciliarOverdue(org, db, totais);
  await reconciliarPagas(org, db, diaLocal, totais);
  await reconciliarWebhook(org, db, diaLocal, totais);
  return totais;
}

// ────────────────────────────────────────────────────────────────────────────
// Adapter de produção
// ────────────────────────────────────────────────────────────────────────────

function envelope(evento: string, payment: AsaasPayment): { event: string; payment: Record<string, unknown> } {
  const { payloadParsed } = sanitizar("", { event: evento, payment });
  return payloadParsed as unknown as { event: string; payment: Record<string, unknown> };
}

const EVENTO_ASAAS: Record<"asaas.payment_overdue" | "asaas.payment_received", string> = {
  "asaas.payment_overdue": "PAYMENT_OVERDUE",
  "asaas.payment_received": "PAYMENT_RECEIVED",
};

function createSupabaseReconcileDb(admin: SupabaseClient, orgId: string): ReconcileDb {
  return {
    async precisaOverdue(paymentId) {
      const { data: charge } = await admin
        .from("asaas_charges")
        .select("enrollment_id")
        .eq("organization_id", orgId)
        .eq("payment_id", paymentId)
        .maybeSingle();
      if (!charge?.enrollment_id) return true;
      const { data: enrollment } = await admin
        .from("followup_enrollments")
        .select("status")
        .eq("organization_id", orgId)
        .eq("id", charge.enrollment_id)
        .maybeSingle();
      if (!enrollment) return true;
      return !["active", "waiting_reply", "paused_handoff", "paused_manual"].includes(enrollment.status);
    },

    async aindaVencidaLocalmente(paymentId) {
      const { data } = await admin
        .from("asaas_charges")
        .select("status")
        .eq("organization_id", orgId)
        .eq("payment_id", paymentId)
        .maybeSingle();
      return data?.status === "OVERDUE" || data?.status === "PENDING";
    },

    async emitir(tipo, payment) {
      const payload = envelope(EVENTO_ASAAS[tipo], payment);
      const { error } = await admin.rpc("emit_event" as never, {
        p_event_type: tipo,
        p_entity_kind: ENTIDADE,
        p_entity_id: null,
        p_payload: payload,
        p_metadata: { source: "cron.asaas_reconcile" },
        p_organization_id: orgId,
      } as never);
      if (error) throw new Error(error.message);
    },

    async abrirAviso(kind, refId, title, body) {
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
        ref_kind: null,
        ref_id: refId,
      });
      // 23505 = corrida perdida contra outra linha concorrente com o mesmo dedup — aceito.
      if (error && error.code !== "23505") throw new Error(error.message);
    },

    async diaLocalDaOrg() {
      const fuso = await fusoDaOrganizacao(getRequestPool(), orgId);
      return diaLocalISO(new Date(), fuso);
    },
  };
}

async function marcarChaveRecusada(admin: SupabaseClient, orgId: string, integrationId: string, db: ReconcileDb, motivo: string): Promise<void> {
  const { error } = await admin
    .from("tenant_integrations")
    .update({ status: "error", status_reason: motivo })
    .eq("organization_id", orgId)
    .eq("id", integrationId);
  if (error) throw new Error(error.message);
  const diaLocal = await db.diaLocalDaOrg();
  await db.abrirAviso("other", chaveDeAviso("asaas_key_rejected", `${orgId}:${diaLocal}`), "A chave do Asaas foi recusada", motivo);
}

/**
 * Varre toda org `provider='asaas'` `status='healthy'` e reconcilia. Nunca
 * lança: uma org quebrada vira log e a passada segue para as demais — é o
 * mesmo contrato de `risk-watcher`/`channel-health`.
 */
export async function reconciliarTudo(admin: SupabaseClient): Promise<ReconcileTotals> {
  const { data: rows } = await admin
    .from("tenant_integrations")
    .select("organization_id")
    .eq("provider", "asaas")
    .eq("status", "healthy");

  let totais = totaisVazios();

  for (const row of rows ?? []) {
    const orgId = row.organization_id as string;
    try {
      const integ = await carregarIntegracaoAsaas(admin, orgId);
      if (!integ) continue; // apodreceu entre a listagem e agora (desligada, config inválida) — nada a reconciliar
      const db = createSupabaseReconcileDb(admin, orgId);
      const parcial = await reconciliarOrg({ organizationId: orgId, webhookPathToken: integ.webhookPathToken, cliente: integ.cliente }, db);
      totais = somar(totais, parcial);
    } catch (err) {
      if (err instanceof AsaasErro && err.status === 401) {
        try {
          const integAgora = await carregarIntegracaoAsaas(admin, orgId, { exigirHealthy: false });
          if (integAgora) {
            await marcarChaveRecusada(admin, orgId, integAgora.id, createSupabaseReconcileDb(admin, orgId), err.descricao);
            totais.avisos++;
          }
        } catch (err2) {
          logger.error("[asaas.reconcile] falha ao marcar chave recusada", { org: orgId, err: err2 instanceof Error ? err2.message : String(err2) });
        }
        continue;
      }
      logger.error("[asaas.reconcile] org falhou", { org: orgId, err: err instanceof Error ? err.message : String(err) });
      continue;
    }
  }

  return totais;
}
