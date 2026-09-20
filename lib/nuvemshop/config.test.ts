import { describe, expect, it } from "vitest";

import { SUBSCRIBED_EVENTS, eventToSlug, slugToEvent } from "./config";
import { EVENTOS_DE_COMERCIO } from "./vocabulario";

/**
 * ASSINAR E CONSUMIR PRECISAM CONCORDAR.
 *
 * Este arquivo existe por um defeito medido: `SUBSCRIBED_EVENTS` tinha
 * `product/*` e `app/uninstalled` (nenhum consumidor), e NÃO tinha
 * `order/fulfilled` nem `cart/abandoned` (dois consumidores esperando). As duas
 * pontas estavam erradas ao mesmo tempo e nada reprovava.
 */
describe("os webhooks assinados e os eventos consumidos", () => {
  it("todo evento assinado tem consumidor — senão é ruído no event_log", () => {
    const consumidos = new Set<string>(EVENTOS_DE_COMERCIO);
    const semConsumidor = SUBSCRIBED_EVENTS.filter(
      (e) => !consumidos.has(`nuvemshop.${e.replace("/", "_")}`),
    );
    expect(semConsumidor, "assinado e não consumido").toEqual([]);
  });

  it("todo evento consumido é assinado — senão o código nunca roda", () => {
    const assinados = new Set(SUBSCRIBED_EVENTS.map((e) => `nuvemshop.${e.replace("/", "_")}`));
    const semAssinatura = EVENTOS_DE_COMERCIO.filter((e) => !assinados.has(e));
    expect(semAssinatura, "consumido e não assinado").toEqual([]);
  });

  it("o slug da rota volta ao evento — ida e volta, sem perder ninguém", () => {
    for (const e of SUBSCRIBED_EVENTS) {
      expect(slugToEvent(eventToSlug(e)), e).toBe(e);
    }
  });
});
