import { describe, expect, it } from "vitest";

import { aplicarFiltro, dddDoTelefone, filtroDeAudienciaSchema, quantosAlcanca, type ContatoParaFiltrar } from "./audiencia";

const c = (p: Partial<ContatoParaFiltrar> & { id: string }): ContatoParaFiltrar => ({
  phone_number: "+5515999990000",
  tags: [],
  is_blocked: false,
  is_anonymized: false,
  ...p,
});

describe("dddDoTelefone", () => {
  it("lê o DDD de um E.164 brasileiro", () => {
    expect(dddDoTelefone("+5515999990000")).toBe("15");
    expect(dddDoTelefone("+551533334444")).toBe("15");
  });

  it("número estrangeiro ou curto devolve null — e null nunca casa com filtro", () => {
    expect(dddDoTelefone("+5491133334444")).toBeNull();
    expect(dddDoTelefone("+5515999")).toBeNull();
    expect(dddDoTelefone(null)).toBeNull();
  });
});

describe("aplicarFiltro", () => {
  const base = [
    c({ id: "a", tags: ["prospeccao-uva"], phone_number: "+5515999990001" }),
    c({ id: "b", tags: ["prospeccao-uva", "email_contador"], phone_number: "+5515999990002" }),
    c({ id: "d", tags: ["prospeccao-uva"], phone_number: "+5519999990003" }),
    c({ id: "e", tags: ["prospeccao-uva"], phone_number: "+5515999990004", is_blocked: true }),
    c({ id: "f", tags: ["prospeccao-uva"], phone_number: "+5515999990005", is_anonymized: true }),
    c({ id: "g", tags: ["prospeccao-uva"], phone_number: null }),
  ];

  it("com_tags exige TODAS, sem_tags exclui qualquer uma", () => {
    const r = aplicarFiltro(base, { com_tags: ["prospeccao-uva"], sem_tags: ["email_contador"], limite: 100 });
    expect(r.map((x) => x.id)).toEqual(["a", "d"]);
  });

  it("filtra por DDD", () => {
    const r = aplicarFiltro(base, { com_tags: ["prospeccao-uva"], ddds: ["15"], limite: 100 });
    expect(r.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("bloqueado, anonimizado e sem telefone NUNCA entram — nem na contagem da prévia", () => {
    const r = aplicarFiltro(base, { com_tags: ["prospeccao-uva"], limite: 100 });
    expect(r.map((x) => x.id)).toEqual(["a", "b", "d"]);
  });

  it("o limite corta o lote, e `quantosAlcanca` diz o tamanho real do universo", () => {
    const filtro = { com_tags: ["prospeccao-uva"], limite: 2 } as const;
    expect(aplicarFiltro(base, filtro).map((x) => x.id)).toEqual(["a", "b"]);
    expect(quantosAlcanca(base, filtro)).toBe(3);
  });
});

describe("filtroDeAudienciaSchema", () => {
  it("recusa filtro sem critério nenhum — audiência sem recorte ninguém confere", () => {
    expect(filtroDeAudienciaSchema.safeParse({ limite: 50 }).success).toBe(false);
  });

  it("aceita com um critério só", () => {
    expect(filtroDeAudienciaSchema.safeParse({ ddds: ["15"], limite: 50 }).success).toBe(true);
  });

  it("o teto do lote é 500, igual ao do import", () => {
    expect(filtroDeAudienciaSchema.safeParse({ ddds: ["15"], limite: 501 }).success).toBe(false);
  });
});
