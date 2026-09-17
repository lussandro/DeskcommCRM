import { describe, it, expect } from "vitest";
import { configSchema } from "./config";

describe("configSchema", () => {
  it("sem dias E max_por_cobranca a reemissão é null (nada de default)", () => {
    expect(configSchema.parse({ ambiente: "sandbox" }).reemissao).toBeNull();
    expect(configSchema.parse({ ambiente: "sandbox", reemissao: { dias: 5 } }).reemissao).toBeNull();
    expect(configSchema.parse({ ambiente: "sandbox", reemissao: { dias: 5, max_por_cobranca: 1 } }).reemissao).toEqual({ dias: 5, max_por_cobranca: 1 });
  });
  it("faixas: dias 1..90, max 1..10", () => {
    expect(() => configSchema.parse({ ambiente: "producao", reemissao: { dias: 0, max_por_cobranca: 1 } })).toThrow();
    expect(() => configSchema.parse({ ambiente: "producao", reemissao: { dias: 5, max_por_cobranca: 11 } })).toThrow();
  });
});
