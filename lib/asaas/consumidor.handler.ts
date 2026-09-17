/**
 * Adapter fino que pluga `processarEvento` (lib/asaas/consumidor.ts) no
 * dispatcher genérico do `event_log` — mesmo molde de `gatilho-caso.handler.ts`.
 */
import type { EventHandler, HandlerResult } from "@/lib/event-log/dispatcher";
import { createAdminClient } from "@/lib/supabase/admin";
import { carregarIntegracaoAsaas } from "./config";
import { createSupabaseConsumidorDb } from "./consumidor.db";
import { EVENTO_OVERDUE, EVENTO_RECEIVED, EVENTO_DELETED, EVENTO_UPDATED, processarEvento } from "./consumidor";

export const ASAAS_COBRANCA_HANDLER_KEY = "asaas-cobranca.v1";

export const asaasCobrancaHandler: EventHandler = {
  key: ASAAS_COBRANCA_HANDLER_KEY,
  events: [EVENTO_OVERDUE, EVENTO_RECEIVED, EVENTO_DELETED, EVENTO_UPDATED],
  async handle(row): Promise<HandlerResult> {
    try {
      const admin = createAdminClient();
      const integ = await carregarIntegracaoAsaas(admin, row.organization_id);
      if (!integ) {
        return { consumer_key: ASAAS_COBRANCA_HANDLER_KEY, status: "skipped", detail: "integracao_nao_healthy" };
      }
      const resultado = await processarEvento(
        { db: createSupabaseConsumidorDb(admin, row.organization_id, integ), agora: () => new Date() },
        row,
      );
      return { consumer_key: ASAAS_COBRANCA_HANDLER_KEY, status: resultado.status, detail: resultado.detail };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return { consumer_key: ASAAS_COBRANCA_HANDLER_KEY, status: "error", detail };
    }
  },
};
