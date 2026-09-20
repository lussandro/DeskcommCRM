/**
 * O VOCABULÁRIO DA LOJA — os eventos que consumimos e o que cada um significa
 * no funil.
 *
 * ═══ Por que constante, e não string literal no emissor ═══
 *
 * `crm_lead_activities.type` é coluna de vocabulário ABERTO: não tem CHECK, de
 * propósito (a doutrina de migrations do `CLAUDE.md` explica — constraint ali
 * quebraria o `update.sh` de clone com linha legada). Sem o CHECK, o banco não
 * reprova um `type` escrito errado; quem reprova é o TypeScript, e só se o
 * emissor usar a constante. Uma string literal solta no handler seria um tipo
 * de atividade que ninguém consegue procurar depois.
 *
 * ═══ Por que o status do pedido não é o nome da etapa ═══
 *
 * `orders.status` é o estado do PEDIDO na loja (contrato da Nuvemshop, com
 * CHECK no banco). A etapa do funil é escolha de quem opera o CRM — uma loja
 * chama "Pago", outra "Aprovado", e uma terceira usa o mesmo funil para
 * orçamento. Este módulo traduz um no outro por configuração, nunca por
 * igualdade de nome.
 */

import type { ActivityType } from "@/lib/leads/activity-vocabulary";

/** Os eventos da Nuvemshop que viram trabalho no CRM (Sub-PRD 06 §3.4). */
export const EVENTO_PEDIDO_CRIADO = "nuvemshop.order_created";
export const EVENTO_PEDIDO_PAGO = "nuvemshop.order_paid";
export const EVENTO_PEDIDO_CANCELADO = "nuvemshop.order_cancelled";
export const EVENTO_PEDIDO_ENVIADO = "nuvemshop.order_fulfilled";
export const EVENTO_CARRINHO_ABANDONADO = "nuvemshop.cart_abandoned";

export const EVENTOS_DE_COMERCIO = [
  EVENTO_PEDIDO_CRIADO,
  EVENTO_PEDIDO_PAGO,
  EVENTO_PEDIDO_CANCELADO,
  EVENTO_PEDIDO_ENVIADO,
  EVENTO_CARRINHO_ABANDONADO,
] as const;

export type EventoDeComercio = (typeof EVENTOS_DE_COMERCIO)[number];

export function ehEventoDeComercio(valor: string): valor is EventoDeComercio {
  return (EVENTOS_DE_COMERCIO as readonly string[]).includes(valor);
}

/**
 * O tipo que vai para a timeline do lead.
 *
 * `ActivityType` é vocabulário FECHADO (`lib/leads/activity-vocabulary.ts`), e
 * o `Record` exaustivo de rótulos de lá é o gate: tipo novo sem rótulo não
 * compila. Por isso o nome é `order_paid` e não `nuvemshop.order_paid` — a
 * timeline nomeia o FATO, não o fornecedor; amanhã o mesmo card pode vir da
 * Shopify (`orders.external_provider` já aceita três).
 */
export const ATIVIDADE_DO_EVENTO: Record<EventoDeComercio, ActivityType> = {
  [EVENTO_PEDIDO_CRIADO]: "order_created",
  [EVENTO_PEDIDO_PAGO]: "order_paid",
  [EVENTO_PEDIDO_CANCELADO]: "order_cancelled",
  [EVENTO_PEDIDO_ENVIADO]: "order_fulfilled",
  [EVENTO_CARRINHO_ABANDONADO]: "order_abandoned",
};

/**
 * `orders.status` — o vocabulário é o do CHECK da tabela, não o da Nuvemshop.
 * Carrinho abandonado NÃO entra aqui: ele não é pedido e não gera linha em
 * `orders` (não tem total fechado nem `ordered_at` de compra).
 */
export const STATUS_DO_EVENTO: Record<string, string> = {
  [EVENTO_PEDIDO_CRIADO]: "pending",
  [EVENTO_PEDIDO_PAGO]: "paid",
  [EVENTO_PEDIDO_CANCELADO]: "cancelled",
  [EVENTO_PEDIDO_ENVIADO]: "fulfilled",
};

/**
 * O vínculo do pedido com o negócio, em `crm_lead_links`.
 *
 * `target_kind` já aceitava `'order'` no CHECK daquela tabela antes desta
 * feature existir — o schema foi desenhado prevendo o comércio. `link_kind`,
 * ao contrário, é coluna SEM CHECK (vocabulário aberto, fora do invariante que
 * só cobre coluna com CHECK): o que a prende é esta constante. Mesma regra de
 * `ALVO_DE_VINCULO_DO_AGENDAMENTO` em `lib/agenda/tipos.ts`.
 */
export const ALVO_DE_VINCULO_DO_PEDIDO = "order" as const;
export const VINCULO_DE_PEDIDO = "ordered" as const;

/** `source` do lead e `source_module` da atividade — de onde o card veio. */
export const ORIGEM_NUVEMSHOP = "nuvemshop" as const;

/**
 * O SYNC PEDIDO, não executado.
 *
 * O callback do OAuth emite isto e redireciona; quem puxa o histórico é o
 * worker. Fazer o sync dentro do callback faria a pessoa que acabou de
 * conectar a loja esperar centenas de chamadas à API da Nuvemshop olhando uma
 * tela em branco — e um timeout de proxy no meio deixaria a integração
 * conectada com histórico pela metade, sem ninguém saber onde parou.
 */
export const EVENTO_SYNC_PEDIDO = "nuvemshop.sync_requested";
