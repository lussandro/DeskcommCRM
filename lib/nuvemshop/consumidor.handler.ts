/**
 * Adapter fino que pluga `processarEvento` (lib/nuvemshop/consumidor.ts) no
 * dispatcher genérico do `event_log` — mesmo molde de `asaas/consumidor.handler.ts`.
 */
import type { EventHandler, HandlerResult } from "@/lib/event-log/dispatcher";
import { createAdminClient } from "@/lib/supabase/admin";

import { processarEvento } from "./consumidor";
import { EVENTOS_DE_COMERCIO } from "./vocabulario";

export const NUVEMSHOP_PEDIDO_HANDLER_KEY = "nuvemshop-pedido.v1";

export const nuvemshopPedidoHandler: EventHandler = {
  key: NUVEMSHOP_PEDIDO_HANDLER_KEY,
  events: [...EVENTOS_DE_COMERCIO],
  async handle(row): Promise<HandlerResult> {
    try {
      const resultado = await processarEvento(createAdminClient(), row);
      return {
        consumer_key: NUVEMSHOP_PEDIDO_HANDLER_KEY,
        status: resultado.status,
        detail: resultado.detail,
      };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return { consumer_key: NUVEMSHOP_PEDIDO_HANDLER_KEY, status: "error", detail };
    }
  },
};
