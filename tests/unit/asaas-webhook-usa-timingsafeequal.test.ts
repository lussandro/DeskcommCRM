import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * T6 — a comparação do token do webhook do Asaas TEM de ser em tempo
 * constante (`crypto.timingSafeEqual`), nunca `===`/`.equals()` direto: um
 * atacante medindo latência descobre o segredo byte a byte. Teste estático:
 * lê o código-fonte da rota e reprova se ela deixar de usar `timingSafeEqual`
 * ou se voltar a comparar o token recebido com o esperado por igualdade.
 */
const ROTA = join(__dirname, "..", "..", "app", "api", "v1", "webhooks", "asaas", "[token]", "route.ts");

describe("webhook do Asaas — comparação do token em tempo constante", () => {
  it("usa timingSafeEqual(", () => {
    const src = readFileSync(ROTA, "utf8");
    expect(src).toContain("timingSafeEqual(");
  });

  it("não compara o token recebido com o esperado por igualdade direta", () => {
    const src = readFileSync(ROTA, "utf8");
    // Trocar o timingSafeEqual por `===`/`.equals()` na comparação do token
    // tem de deixar este teste vermelho.
    expect(src).not.toMatch(/recebido\s*===\s*esperado/);
    expect(src).not.toMatch(/esperado\s*===\s*recebido/);
    expect(src).not.toMatch(/recebido\.equals\(/);
  });
});
