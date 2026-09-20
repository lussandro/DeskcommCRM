import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Sem os eventos de grupo no WHATSAPP_HOOK_EVENTS, o módulo inteiro é
 * decorativo: nada chega. Medido na VPS em 2026-09-20 — a instalação real
 * tinha só message.any, message.ack, message.edited, message.revoked,
 * session.status e state.change.
 */
describe("compose entrega os eventos de grupo", () => {
  const compose = readFileSync("docker-compose.prod.yml", "utf-8");
  const linha = compose.split("\n").find((l) => l.includes("WHATSAPP_HOOK_EVENTS")) ?? "";

  for (const ev of ["group.v2.join", "group.v2.leave", "group.v2.participants", "group.v2.update"]) {
    it(`inclui ${ev}`, () => {
      expect(linha).toContain(ev);
    });
  }

  it("mantém message.any, que é o superconjunto medido", () => {
    expect(linha).toContain("message.any");
  });
});
