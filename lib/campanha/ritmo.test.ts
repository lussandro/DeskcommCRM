import { describe, expect, it } from "vitest";

import { horaLocal, podeMandarAgora, type RitmoDaCampanha } from "./ritmo";

const SEM_RITMO: RitmoDaCampanha = {
  intervaloSegundos: null,
  janelaInicioHora: null,
  janelaFimHora: null,
  tetoDiario: null,
};
const FUSO = "America/Sao_Paulo";
const AGORA = new Date("2026-09-18T17:00:00Z"); // 14h em SP

describe("podeMandarAgora", () => {
  it("campanha sem ritmo próprio não veta nada — herda o do canal", () => {
    expect(podeMandarAgora(SEM_RITMO, { ultimoEnvio: AGORA, enviadasHoje: 999 }, AGORA, FUSO)).toEqual({ pode: true });
  });

  it("intervalo: veta antes da hora e libera depois", () => {
    const ritmo = { ...SEM_RITMO, intervaloSegundos: 300 };
    const haUmMinuto = new Date(AGORA.getTime() - 60_000);
    const r = podeMandarAgora(ritmo, { ultimoEnvio: haUmMinuto, enviadasHoje: 0 }, AGORA, FUSO);
    expect(r).toMatchObject({ pode: false, motivo: "intervalo" });
    if (!r.pode) expect(r.detalhe).toContain("240s");

    const haSeisMinutos = new Date(AGORA.getTime() - 360_000);
    expect(podeMandarAgora(ritmo, { ultimoEnvio: haSeisMinutos, enviadasHoje: 0 }, AGORA, FUSO)).toEqual({ pode: true });
  });

  it("primeiro envio nunca espera intervalo", () => {
    const ritmo = { ...SEM_RITMO, intervaloSegundos: 3600 };
    expect(podeMandarAgora(ritmo, { ultimoEnvio: null, enviadasHoje: 0 }, AGORA, FUSO)).toEqual({ pode: true });
  });

  it("janela da campanha é mais estreita que a do canal e vale no fuso certo", () => {
    const ritmo = { ...SEM_RITMO, janelaInicioHora: 9, janelaFimHora: 12 };
    const r = podeMandarAgora(ritmo, { ultimoEnvio: null, enviadasHoje: 0 }, AGORA, FUSO); // 14h
    expect(r).toMatchObject({ pode: false, motivo: "fora_da_janela" });
    const dezDaManha = new Date("2026-09-18T13:00:00Z");
    expect(podeMandarAgora(ritmo, { ultimoEnvio: null, enviadasHoje: 0 }, dezDaManha, FUSO)).toEqual({ pode: true });
  });

  it("a hora do FIM é exclusiva: 12h já está fora de uma janela 9-12", () => {
    const ritmo = { ...SEM_RITMO, janelaInicioHora: 9, janelaFimHora: 12 };
    const meioDia = new Date("2026-09-18T15:00:00Z");
    expect(podeMandarAgora(ritmo, { ultimoEnvio: null, enviadasHoje: 0 }, meioDia, FUSO)).toMatchObject({
      pode: false,
      motivo: "fora_da_janela",
    });
  });

  it("teto diário da campanha corta antes do teto do número", () => {
    const ritmo = { ...SEM_RITMO, tetoDiario: 10 };
    expect(podeMandarAgora(ritmo, { ultimoEnvio: null, enviadasHoje: 10 }, AGORA, FUSO)).toMatchObject({
      pode: false,
      motivo: "teto_diario",
    });
    expect(podeMandarAgora(ritmo, { ultimoEnvio: null, enviadasHoje: 9 }, AGORA, FUSO)).toEqual({ pode: true });
  });

  it("o teto vem antes do intervalo: 'hoje acabou' é mais útil que 'faltam 4 min'", () => {
    const ritmo = { intervaloSegundos: 300, janelaInicioHora: null, janelaFimHora: null, tetoDiario: 5 };
    const r = podeMandarAgora(ritmo, { ultimoEnvio: AGORA, enviadasHoje: 5 }, AGORA, FUSO);
    expect(r).toMatchObject({ pode: false, motivo: "teto_diario" });
  });
});

describe("horaLocal", () => {
  it("lê a hora no fuso pedido, não no do servidor", () => {
    expect(horaLocal(new Date("2026-09-18T23:00:00Z"), "America/Sao_Paulo")).toBe(20);
    expect(horaLocal(new Date("2026-09-18T23:00:00Z"), "Europe/Lisbon")).toBe(0);
  });
});
