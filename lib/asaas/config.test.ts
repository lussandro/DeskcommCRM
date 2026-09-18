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
  it("linha ANTIGA (só followup_pointer_id) vira lista — clone que atualiza não perde o fluxo", () => {
    const UM = "11111111-1111-4111-8111-111111111111";
    const c = configSchema.parse({ ambiente: "producao", followup_pointer_id: UM });
    expect(c.followup_pointer_ids).toEqual([UM]);
  });

  it("linha NOVA (lista) manda, e o espelho singular não a sobrescreve", () => {
    const A = "11111111-1111-4111-8111-111111111111";
    const B = "22222222-2222-4222-8222-222222222222";
    const c = configSchema.parse({ ambiente: "producao", followup_pointer_id: A, followup_pointer_ids: [A, B] });
    expect(c.followup_pointer_ids).toEqual([A, B]);
  });

  it("sem fluxo nenhum → lista vazia, nunca undefined", () => {
    expect(configSchema.parse({ ambiente: "sandbox" }).followup_pointer_ids).toEqual([]);
  });

  it("faixas: dias 1..90, max 1..10", () => {
    expect(() => configSchema.parse({ ambiente: "producao", reemissao: { dias: 0, max_por_cobranca: 1 } })).toThrow();
    expect(() => configSchema.parse({ ambiente: "producao", reemissao: { dias: 5, max_por_cobranca: 11 } })).toThrow();
  });
});
