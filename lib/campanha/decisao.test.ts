import { describe, expect, it } from "vitest";

import { baseLegalValida, corpoParaODestinatario, motivoParaPular, saudacaoDaHora } from "./decisao";

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

describe("saudacaoDaHora", () => {
  const fuso = "America/Sao_Paulo";
  it("os cortes são os do português falado: tarde ao meio-dia, noite às 18h", () => {
    expect(saudacaoDaHora(new Date("2026-09-18T14:59:00Z"), fuso)).toBe("Bom dia"); // 11h59
    expect(saudacaoDaHora(new Date("2026-09-18T15:00:00Z"), fuso)).toBe("Boa tarde"); // 12h00
    expect(saudacaoDaHora(new Date("2026-09-18T20:59:00Z"), fuso)).toBe("Boa tarde"); // 17h59
    expect(saudacaoDaHora(new Date("2026-09-18T21:00:00Z"), fuso)).toBe("Boa noite"); // 18h00
  });

  it("é o fuso do canal que manda, não o do servidor", () => {
    const instante = new Date("2026-09-18T23:00:00Z"); // 20h em SP, 00h em Lisboa
    expect(saudacaoDaHora(instante, "America/Sao_Paulo")).toBe("Boa noite");
    expect(saudacaoDaHora(instante, "Europe/Lisbon")).toBe("Bom dia");
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

  it("{{saudacao}} vira a saudação DA HORA DO ENVIO, no fuso do canal", () => {
    const manha = new Date("2026-09-18T12:00:00Z"); // 09h em São Paulo
    const tarde = new Date("2026-09-18T19:00:00Z"); // 16h
    const noite = new Date("2026-09-18T23:30:00Z"); // 20h30
    const fuso = "America/Sao_Paulo";
    const t = "{{saudacao}}! Aqui é a Bacco.";
    expect(corpoParaODestinatario(t, { nome: null }, { agora: manha, fuso })).toBe("Bom dia! Aqui é a Bacco.");
    expect(corpoParaODestinatario(t, { nome: null }, { agora: tarde, fuso })).toBe("Boa tarde! Aqui é a Bacco.");
    expect(corpoParaODestinatario(t, { nome: null }, { agora: noite, fuso })).toBe("Boa noite! Aqui é a Bacco.");
  });

  it("sem saber a hora, a saudação vira 'Olá' — nunca um 'bom dia' chutado", () => {
    expect(corpoParaODestinatario("{{saudacao}}!", { nome: null })).toBe("Olá!");
  });

  it("template sem variável vai para quem não tem nome", () => {
    expect(corpoParaODestinatario("Bom dia! Vocês vinificam a uva?", { nome: null })).toBe(
      "Bom dia! Vocês vinificam a uva?",
    );
  });
});
