import { describe, it, expect } from "vitest";
import { configSchema } from "./config";

describe("configSchema", () => {
  it("sem dias E max_por_cobranca a reemissão é null (nada de default)", () => {
    expect(configSchema.parse({ ambiente: "sandbox" }).reemissao).toBeNull();
    expect(configSchema.parse({ ambiente: "sandbox", reemissao: { dias: 5, max_por_cobranca: 1 } }).reemissao).toEqual({ dias: 5, max_por_cobranca: 1 });
  });
  it("cerca pela metade é RECUSADA, nunca apagada em silêncio", () => {
    expect(() => configSchema.parse({ ambiente: "sandbox", reemissao: { dias: 5 } })).toThrow(
      /máximo de prorrogações por cobrança/,
    );
    expect(() => configSchema.parse({ ambiente: "sandbox", reemissao: { max_por_cobranca: 1 } })).toThrow(
      /dias de prorrogação/,
    );
  });
  it("faixas: dias 1..90, max 1..10", () => {
    expect(() => configSchema.parse({ ambiente: "producao", reemissao: { dias: 0, max_por_cobranca: 1 } })).toThrow();
    expect(() => configSchema.parse({ ambiente: "producao", reemissao: { dias: 5, max_por_cobranca: 11 } })).toThrow();
  });
});
