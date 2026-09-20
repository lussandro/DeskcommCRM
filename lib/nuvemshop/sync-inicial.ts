/**
 * O HISTÓRICO DA LOJA, NA CONEXÃO — Sub-PRD 06 §3.7.
 *
 * ═══ Por que existe ═══
 *
 * Webhook só conta o que acontece DEPOIS de conectar. Uma loja com três anos de
 * pedidos conecta e o CRM fica vazio até alguém comprar de novo — a primeira
 * impressão de quem instalou é uma integração que "não funcionou".
 *
 * ═══ Por que reusa o consumidor, e não escreve direto ═══
 *
 * O pedido que vem do sync e o que vem do webhook são o MESMO pedido. Duas
 * rotas de escrita divergiriam no dia em que alguém mexesse numa só — e a
 * divergência apareceria como "o pedido antigo não tem card, o novo tem".
 * Aqui o sync monta um `EventRow` igual ao do webhook e chama o mesmo
 * `processarEvento`. A idempotência de `orders` faz o resto: pedido que o
 * webhook já trouxe não vira linha nova.
 *
 * ═══ O teto, e por que ele não é configurável ═══
 *
 * O sync anda até acabar a página ou bater o teto. O teto existe porque isto
 * roda numa VPS de cliente com 1 GB: uma loja grande traria dezenas de milhares
 * de pedidos e o processo morreria no meio, sem deixar claro o que entrou.
 * Parar cedo e dizer quanto entrou é melhor que morrer tentando tudo.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { EventRow } from "@/lib/event-log/dispatcher";
import { logger } from "@/lib/logger";

import type { NuvemshopApiClient } from "./api-client";
import { processarEvento } from "./consumidor";
import { EVENTO_PEDIDO_CRIADO } from "./vocabulario";

/** Quantos pedidos o sync inicial traz, no máximo. Ver o cabeçalho. */
export const TETO_DO_SYNC = 500;
const POR_PAGINA = 50;

export interface ResultadoDoSync {
  lidos: number;
  gravados: number;
  recusados: number;
  /** `true` quando parou pelo teto, e não por acabar. Quem chama avisa na tela. */
  truncado: boolean;
}

/**
 * O pedido histórico entra como `order_created` — e isso é decisão, não
 * simplificação. O estado ATUAL dele vem no próprio payload (`payment_status`),
 * e o consumidor grava esse estado em `orders`. Reemitir a cadeia inteira
 * (criado → pago → enviado) encheria a timeline de eventos que não aconteceram
 * naquele instante e mandaria follow-up de "pedido pago" para venda de 2023.
 */
function comoEvento(organizationId: string, pedido: unknown): EventRow {
  return {
    id: `sync-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    organization_id: organizationId,
    event_type: EVENTO_PEDIDO_CRIADO,
    entity_kind: "nuvemshop_order",
    entity_id: null,
    payload: { data: pedido },
    metadata: { origem: "sync_inicial" },
    consumed_by: [],
    attempts: 0,
  };
}

export async function sincronizarPedidos(
  db: SupabaseClient,
  api: Pick<NuvemshopApiClient, "listOrders">,
  organizationId: string,
  opcoes: { teto?: number; desde?: string } = {},
): Promise<ResultadoDoSync> {
  const teto = opcoes.teto ?? TETO_DO_SYNC;
  const r: ResultadoDoSync = { lidos: 0, gravados: 0, recusados: 0, truncado: false };

  for (let pagina = 1; r.lidos < teto; pagina++) {
    let lote: unknown[];
    try {
      lote = await api.listOrders({
        page: pagina,
        perPage: POR_PAGINA,
        createdAtMin: opcoes.desde,
      });
    } catch (err) {
      // Falha de rede no meio NÃO descarta o que já entrou: o que foi gravado
      // está gravado, e o resultado diz até onde chegou.
      logger.warn("nuvemshop: sync interrompido", {
        organizationId,
        pagina,
        erro: err instanceof Error ? err.message : String(err),
      });
      return r;
    }

    if (lote.length === 0) return r;

    for (const pedido of lote) {
      if (r.lidos >= teto) {
        r.truncado = true;
        return r;
      }
      r.lidos++;
      const desfecho = await processarEvento(db, comoEvento(organizationId, pedido));
      if (desfecho.status === "ok") r.gravados++;
      else r.recusados++;
    }

    // Página menor que o pedido = última página.
    if (lote.length < POR_PAGINA) return r;
  }

  r.truncado = true;
  return r;
}
