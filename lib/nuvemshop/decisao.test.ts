import { describe, expect, it } from "vitest";

import { decidir, fechaOCard } from "./decisao";
import {
  EVENTO_CARRINHO_ABANDONADO,
  EVENTO_PEDIDO_CANCELADO,
  EVENTO_PEDIDO_CRIADO,
  EVENTO_PEDIDO_ENVIADO,
  EVENTO_PEDIDO_PAGO,
  EVENTOS_DE_COMERCIO,
} from "./vocabulario";

describe("decidir", () => {
  it("pedido criado abre o card, não o fecha", () => {
    const d = decidir(EVENTO_PEDIDO_CRIADO);
    expect(d?.statusDoPedido).toBe("pending");
    expect(d?.atividade).toBe("order_created");
    expect(d?.fechamento).toBeNull();
  });

  it("pago fecha como GANHO, na etapa de ganho do próprio funil", () => {
    const d = decidir(EVENTO_PEDIDO_PAGO);
    expect(d?.statusDoPedido).toBe("paid");
    expect(d?.fechamento).toEqual({ etapa: "ganho", status: "won", lostReason: null });
  });

  it("cancelado fecha como PERDA e traz o motivo — o CHECK do banco o exige", () => {
    // `crm_leads_lost_reason_required`: status 'lost' sem `lost_reason` é
    // recusado pelo banco. Sem o motivo aqui, o UPDATE morreria na constraint e
    // o card ficaria aberto para sempre.
    const d = decidir(EVENTO_PEDIDO_CANCELADO);
    expect(d?.statusDoPedido).toBe("cancelled");
    expect(d?.fechamento?.status).toBe("lost");
    expect(d?.fechamento?.lostReason).toBe("cancelled_in_store");
  });

  it("ENVIADO não fecha o card — senão a venda contaria duas vezes", () => {
    // O ganho já foi contado no pagamento. Marcar 'enviado' como ganho de novo
    // somaria a mesma venda duas vezes na métrica do funil.
    const d = decidir(EVENTO_PEDIDO_ENVIADO);
    expect(d?.statusDoPedido).toBe("fulfilled");
    expect(d?.fechamento).toBeNull();
    expect(fechaOCard(EVENTO_PEDIDO_ENVIADO)).toBe(false);
  });

  it("carrinho abandonado não é pedido: não tem status em `orders`", () => {
    // `orders_status_check` não prevê 'abandoned', e carrinho não tem total
    // fechado. Ele vira oportunidade, nunca linha de pedido.
    expect(decidir(EVENTO_CARRINHO_ABANDONADO)).toBeNull();
  });

  it("todo evento do vocabulário tem atividade — nenhum cai em undefined", () => {
    // Sem esta varredura, um evento novo passaria com `type: undefined` e a
    // atividade morreria no insert, silenciosamente.
    for (const e of EVENTOS_DE_COMERCIO) {
      const d = decidir(e);
      if (e === EVENTO_CARRINHO_ABANDONADO) continue;
      expect(d, e).not.toBeNull();
      expect(typeof d!.atividade, e).toBe("string");
    }
  });
});
