import { describe, expect, it } from "vitest";

import { baseLegalValida, corpoParaODestinatario, motivoParaPular } from "./decisao";

const ok = {
  contactId: "c1",
  telefone: "+5548991286399",
  bloqueado: false,
  anonimizado: false,
  recusouMarketing: false,
};

describe("motivoParaPular", () => {
  it("contato em ordem passa", () => {
    expect(motivoParaPular(ok)).toBeNull();
  });

  it("quem pediu para parar é pulado, e o motivo diz isso — não 'sem telefone'", () => {
    expect(motivoParaPular({ ...ok, bloqueado: true, telefone: null })).toBe("opt_out");
  });

  it("anonimizado nunca recebe", () => {
    expect(motivoParaPular({ ...ok, anonimizado: true })).toBe("anonimizado");
  });

  it("recusa registrada de marketing veta", () => {
    expect(motivoParaPular({ ...ok, recusouMarketing: true })).toBe("recusou_marketing");
  });

  it("telefone vazio (não só nulo) veta", () => {
    expect(motivoParaPular({ ...ok, telefone: "   " })).toBe("sem_telefone");
  });
});

describe("baseLegalValida", () => {
  it("consentimento basta", () => {
    expect(baseLegalValida({ baseLegal: "consent", liaRef: null })).toBe(true);
  });

  it("interesse legítimo SEM referência da LIA não basta", () => {
    expect(baseLegalValida({ baseLegal: "legitimate_interest", liaRef: null })).toBe(false);
    expect(baseLegalValida({ baseLegal: "legitimate_interest", liaRef: "  " })).toBe(false);
  });

  it("interesse legítimo com referência basta", () => {
    expect(baseLegalValida({ baseLegal: "legitimate_interest", liaRef: "LIA-2026-01" })).toBe(true);
  });

  it("base desconhecida nunca passa", () => {
    expect(baseLegalValida({ baseLegal: "porque_sim", liaRef: "x" })).toBe(false);
  });
});

describe("corpoParaODestinatario", () => {
  it("interpola nome e primeiro nome", () => {
    expect(corpoParaODestinatario("Oi {{primeiro_nome}}, tudo bem?", { nome: "Maria da Glória" })).toBe(
      "Oi Maria, tudo bem?",
    );
  });

  it("template que PEDE nome e contato sem nome → não manda (frase com buraco denuncia disparo)", () => {
    expect(corpoParaODestinatario("Oi {{nome}}, tudo bem?", { nome: null })).toBeNull();
    expect(corpoParaODestinatario("Oi {{nome}}, tudo bem?", { nome: "   " })).toBeNull();
  });

  it("template sem variável vai para quem não tem nome", () => {
    expect(corpoParaODestinatario("Bom dia! Vocês vinificam a uva?", { nome: null })).toBe(
      "Bom dia! Vocês vinificam a uva?",
    );
  });
});
