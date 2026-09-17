import { describe, expect, it } from "vitest";

import { sanitizar, tipoInterno } from "./webhook";

describe("tipoInterno", () => {
  it("PAYMENT_RECEIVED, PAYMENT_CONFIRMED e PAYMENT_RECEIVED_IN_CASH → asaas.payment_received", () => {
    expect(tipoInterno("PAYMENT_RECEIVED")).toBe("asaas.payment_received");
    expect(tipoInterno("PAYMENT_CONFIRMED")).toBe("asaas.payment_received");
    expect(tipoInterno("PAYMENT_RECEIVED_IN_CASH")).toBe("asaas.payment_received");
  });

  it("PAYMENT_OVERDUE → asaas.payment_overdue", () => {
    expect(tipoInterno("PAYMENT_OVERDUE")).toBe("asaas.payment_overdue");
  });

  it("PAYMENT_DELETED e PAYMENT_REFUNDED → asaas.payment_deleted", () => {
    expect(tipoInterno("PAYMENT_DELETED")).toBe("asaas.payment_deleted");
    expect(tipoInterno("PAYMENT_REFUNDED")).toBe("asaas.payment_deleted");
  });

  it("PAYMENT_UPDATED → asaas.payment_updated", () => {
    expect(tipoInterno("PAYMENT_UPDATED")).toBe("asaas.payment_updated");
  });

  it("evento fora da lista de interesse (ex.: PAYMENT_CREATED) → null", () => {
    expect(tipoInterno("PAYMENT_CREATED")).toBeNull();
  });
});

describe("sanitizar", () => {
  it("remove cpfCnpj e creditCard* do parsed e do raw reconstruído, em qualquer profundidade", () => {
    const parsed = {
      event: "PAYMENT_RECEIVED",
      payment: {
        id: "pay_1",
        customer: {
          id: "cus_1",
          cpfCnpj: "12345678900",
        },
        creditCard: { number: "4111111111111111" },
        creditCardHolderInfo: { cpfCnpj: "12345678900" },
      },
    };
    const raw = JSON.stringify(parsed);
    const { rawBody, payloadParsed } = sanitizar(raw, parsed);

    expect(rawBody).not.toContain("12345678900");
    expect(rawBody).not.toContain("4111111111111111");
    expect((payloadParsed.payment as Record<string, unknown>)).toMatchObject({
      creditCard: "[redigido]",
      creditCardHolderInfo: "[redigido]",
    });
    const customer = (payloadParsed.payment as Record<string, unknown>).customer as Record<string, unknown>;
    expect(customer.cpfCnpj).toBe("[redigido]");
    expect(customer.id).toBe("cus_1");
  });

  it("preserva campos não sensíveis intactos", () => {
    const parsed = { event: "PAYMENT_RECEIVED", payment: { id: "pay_1", value: 100 } };
    const { payloadParsed } = sanitizar(JSON.stringify(parsed), parsed);
    expect(payloadParsed).toEqual(parsed);
  });
});
