/**
 * O worker do sync inicial — consome `nuvemshop.sync_requested` e puxa o
 * histórico de pedidos da loja recém-conectada.
 *
 * Separado do handler de pedido porque o gatilho é outro: aquele reage a
 * webhook da loja, este a uma conexão nova. Um handler só, com dois motivos
 * para rodar, esconderia qual dos dois falhou.
 */
import type { EventHandler, HandlerResult } from "@/lib/event-log/dispatcher";
import { createAdminClient } from "@/lib/supabase/admin";

import { NuvemshopApiClient } from "./api-client";
import { sincronizarPedidos } from "./sync-inicial";
import { EVENTO_SYNC_PEDIDO } from "./vocabulario";

export const NUVEMSHOP_SYNC_HANDLER_KEY = "nuvemshop-sync.v1";

export const nuvemshopSyncHandler: EventHandler = {
  key: NUVEMSHOP_SYNC_HANDLER_KEY,
  events: [EVENTO_SYNC_PEDIDO],
  async handle(row): Promise<HandlerResult> {
    try {
      const admin = createAdminClient();

      // O token vem do banco, decifrado na hora — nunca do payload do evento.
      // `event_log` é lido por várias telas e vai para o export; um access token
      // ali seria segredo em texto claro num lugar que ninguém trata como cofre.
      const { data: integracao } = await admin
        .from("tenant_integrations")
        .select("store_metadata, oauth_access_token_encrypted")
        .eq("organization_id", row.organization_id)
        .eq("provider", "nuvemshop")
        .eq("status", "connected")
        .maybeSingle();

      const storeId = (integracao?.store_metadata as { store_id?: unknown } | null)?.store_id;
      if (!storeId) {
        return {
          consumer_key: NUVEMSHOP_SYNC_HANDLER_KEY,
          status: "skipped",
          detail: "integracao_nao_conectada",
        };
      }

      const { data: token, error: erroToken } = await admin.rpc("fn_decrypt_oauth", {
        ciphertext: integracao!.oauth_access_token_encrypted,
      });
      if (erroToken || !token) {
        return {
          consumer_key: NUVEMSHOP_SYNC_HANDLER_KEY,
          status: "error",
          detail: `token: ${erroToken?.message ?? "sem retorno"}`,
        };
      }

      const api = new NuvemshopApiClient({
        storeId: String(storeId),
        accessToken: String(token),
      });

      const r = await sincronizarPedidos(admin, api, row.organization_id);

      await admin
        .from("tenant_integrations")
        .update({ last_sync_at: new Date().toISOString() })
        .eq("organization_id", row.organization_id)
        .eq("provider", "nuvemshop");

      return {
        consumer_key: NUVEMSHOP_SYNC_HANDLER_KEY,
        status: "ok",
        detail: `lidos=${r.lidos} gravados=${r.gravados} recusados=${r.recusados}${r.truncado ? " (truncado)" : ""}`,
      };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return { consumer_key: NUVEMSHOP_SYNC_HANDLER_KEY, status: "error", detail };
    }
  },
};
