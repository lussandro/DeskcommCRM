/**
 * GET /api/v1/cron/asaas-reconcile — reconciliação diária com o Asaas (spec §9).
 *
 * Cobre o webhook perdido: cobrança vencida sem matrícula viva, cobrança paga
 * cujo evento sumiu, e o webhook que o Asaas pausa depois de falhas seguidas.
 * A lógica inteira mora em `lib/asaas/reconcile.ts` — esta rota só autentica,
 * chama e audita quando houve efeito.
 *
 * Mesmo contrato de auth dos demais crons (Bearer INTERNAL_CRON_SECRET|
 * INTERNAL_SECRET, fail-closed). Também é chamada fire-and-forget por
 * `app/actions/integrations/asaas.ts` ao ativar a integração.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";
import { reconciliarTudo } from "@/lib/asaas/reconcile";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  const authHeader = req.headers.get("authorization") ?? "";
  const provided = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
  const accepted = [env.INTERNAL_CRON_SECRET, env.INTERNAL_SECRET].filter(Boolean);
  if (accepted.length === 0 || !provided || !accepted.includes(provided)) {
    return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });
  }

  const admin = createAdminClient();
  const totais = await reconciliarTudo(admin);

  const total = totais.overdue_emitidos + totais.received_emitidos + totais.webhooks_religados + totais.avisos;
  // Rodada que não achou nada para consertar não é mutação e não ocupa linha
  // de auditoria (mesmo critério de `attendant-heartbeat`/`snooze-watcher`) —
  // a que achou, audita sempre.
  if (total > 0) {
    void audit({
      action: "cron.asaas_reconcile",
      requestId,
      bypassedRls: true,
      metadata: { ...totais },
    });
  }

  return ok(totais, { requestId });
}
