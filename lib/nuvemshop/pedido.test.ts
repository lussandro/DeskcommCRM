import { describe, expect, it } from "vitest";

import { centavosDeDecimal, lerCarrinho, lerPedido } from "./pedido";

describe("centavosDeDecimal", () => {
  it("não perde centavo em float — o caso que trunca errado", () => {
    // `Math.trunc(19.99 * 100)` é 1998 em ponto flutuante: R$ 19,98 em todo
    // pedido terminado em 9. É o defeito que esta função existe para não ter.
    expect(centavosDeDecimal("19.99")).toBe(1999);
    expect(centavosDeDecimal("0.07")).toBe(7);
    expect(centavosDeDecimal("1234.56")).toBe(123456);
    expect(centavosDeDecimal("100")).toBe(10000);
  });

  it("recusa o que não é número, em vez de virar zero", () => {
    // Zero default seria um pedido de R$ 0,00 no funil de alguém.
    for (const v of [null, undefined, "", "grátis", "1,99", "-5", {}, NaN]) {
      expect(centavosDeDecimal(v), String(v)).toBeNull();
    }
  });
});

describe("lerPedido", () => {
  const base = {
    id: 7788,
    total: "249.90",
    currency: "brl",
    created_at: "2026-09-19T12:00:00Z",
    customer: { id: 55, name: "Ana Souza", email: "ana@exemplo.com", phone: "5511999998888" },
  };

  it("lê o pedido inteiro, com total em centavos e moeda ISO", () => {
    const r = lerPedido(base);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pedido.externalId).toBe("7788");
    expect(r.pedido.totalCents).toBe(24990);
    expect(r.pedido.currency).toBe("BRL");
    expect(r.pedido.customerExternalId).toBe("55");
    expect(r.pedido.clienteNome).toBe("Ana Souza");
  });

  it("RECUSA em vez de completar buraco — cada campo que falta tem motivo próprio", () => {
    expect(lerPedido({ ...base, id: null })).toEqual({ ok: false, motivo: "sem_id_do_pedido" });
    expect(lerPedido({ ...base, total: null })).toEqual({ ok: false, motivo: "sem_total_valido" });
    expect(lerPedido({ ...base, created_at: null })).toEqual({ ok: false, motivo: "sem_data_do_pedido" });
    expect(lerPedido({ ...base, currency: "reais" })).toEqual({ ok: false, motivo: "moeda_invalida" });
    expect(lerPedido(null)).toEqual({ ok: false, motivo: "payload_nao_e_objeto" });
  });

  it("pedido sem cliente identificado ainda é pedido — só não tem a quem vincular", () => {
    const r = lerPedido({ ...base, customer: undefined });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pedido.customerExternalId).toBeNull();
    expect(r.pedido.clienteTelefone).toBeNull();
  });
});

describe("lerCarrinho", () => {
  const base = {
    id: 991,
    currency: "BRL",
    customer: { id: 7, name: "Beto", email: "beto@exemplo.com", phone: "5511988887777" },
    abandoned_checkout_url: "https://loja.exemplo/retomar/991",
  };

  it("carrinho SEM total ainda é carrinho — exigir total descartaria o caso normal", () => {
    // Carrinho abandonado quase nunca tem total fechado. Se `lerCarrinho`
    // exigisse total, o evento mais valioso da recuperação seria descartado.
    const r = lerCarrinho(base);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.carrinho.totalCents).toBeNull();
    expect(r.carrinho.urlDeRetomada).toBe("https://loja.exemplo/retomar/991");
  });

  it("recusa carrinho sem NENHUMA forma de contato — card que ninguém consegue puxar", () => {
    const r = lerCarrinho({ id: 5, currency: "BRL", customer: { id: 1, name: "X" } });
    expect(r).toEqual({ ok: false, motivo: "sem_forma_de_contato" });
  });

  it("aceita contato no nível do carrinho, não só dentro de customer", () => {
    const r = lerCarrinho({ id: 5, contact_email: "x@y.com" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.carrinho.clienteEmail).toBe("x@y.com");
  });
});

describe("o payload REAL da Nuvemshop", () => {
  /**
   * Copiado da documentação oficial (tiendanube.github.io, recurso Order), não
   * inventado aqui. É a diferença entre "o parser aceita o que eu imaginei" e
   * "o parser aceita o que a loja manda" — um teste escrito contra a própria
   * suposição fica verde mesmo quando o campo real tem outro nome.
   */
  const OFICIAL = {
    id: 871254203,
    total: "5400.00",
    currency: "ARS",
    created_at: "2022-11-15T19:36:59+0000",
    customer: {
      id: 105799009,
      name: "Maria Silva",
      email: "buyer@tiendanube.com",
      phone: "+551533276436",
    },
    payment_details: { method: "custom", credit_card_company: null, installments: 1 },
  };

  it("lê o pedido documentado sem perder nenhum campo", () => {
    const r = lerPedido(OFICIAL);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pedido).toEqual({
      externalId: "871254203",
      customerExternalId: "105799009",
      totalCents: 540000,
      currency: "ARS",
      paymentMethod: "custom",
      orderedAt: "2022-11-15T19:36:59+0000",
      updatedAtRemote: null,
      clienteNome: "Maria Silva",
      clienteEmail: "buyer@tiendanube.com",
      clienteTelefone: "+551533276436",
    });
  });

  it("a moeda NÃO é assumida como BRL — a Nuvemshop opera em vários países", () => {
    // O exemplo oficial é ARS. Cravar BRL faria o valor de toda loja argentina
    // ou mexicana ser lido como real na hora de somar.
    const r = lerPedido(OFICIAL);
    expect(r.ok && r.pedido.currency).toBe("ARS");
  });
});
