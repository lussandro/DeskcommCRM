import { describe, expect, it } from "vitest";

import { enviosPorDia, funilDaCampanha, motivosDePulo, taxa, type LinhaDeDestinatario } from "./desempenho";

const linha = (p: Partial<LinhaDeDestinatario>): LinhaDeDestinatario => ({
  status: "sent",
  skip_reason: null,
  sent_at: "2026-09-18T12:00:00Z",
  delivered_at: null,
  read_at: null,
  responded_at: null,
  ...p,
});

describe("funilDaCampanha", () => {
  it("conta cada degrau, e pulado NÃO entra no funil", () => {
    const f = funilDaCampanha([
      linha({ delivered_at: "x", read_at: "x", responded_at: "x" }),
      linha({ delivered_at: "x", read_at: "x" }),
      linha({ delivered_at: "x" }),
      linha({ status: "skipped", skip_reason: "Pediu para não receber mensagens", sent_at: null }),
      linha({ status: "failed", sent_at: null }),
      linha({ status: "pending", sent_at: null }),
    ]);
    expect(f).toEqual({
      enviadas: 3,
      entregues: 3,
      lidas: 2,
      responderam: 1,
      pulados: 1,
      falharam: 1,
      naFila: 1,
    });
  });

  it("resposta sem ACK de leitura ainda conta — cascata esconderia resposta real", () => {
    const f = funilDaCampanha([linha({ responded_at: "x" })]);
    expect(f.responderam).toBe(1);
    expect(f.lidas).toBe(0);
  });
});

describe("taxa", () => {
  it("percentual com uma casa", () => {
    expect(taxa(1, 3)).toBe(33.3);
  });

  it("sem envio nenhum devolve null, nunca 0% — 0% seria mentira", () => {
    expect(taxa(0, 0)).toBeNull();
  });
});

describe("motivosDePulo", () => {
  it("agrupa e ordena do mais frequente", () => {
    const r = motivosDePulo([
      linha({ status: "skipped", skip_reason: "Sem telefone no cadastro" }),
      linha({ status: "skipped", skip_reason: "Pediu para não receber mensagens" }),
      linha({ status: "skipped", skip_reason: "Pediu para não receber mensagens" }),
      linha({}),
    ]);
    expect(r).toEqual([
      { motivo: "Pediu para não receber mensagens", quantos: 2 },
      { motivo: "Sem telefone no cadastro", quantos: 1 },
    ]);
  });

  it("pulo sem motivo registrado não some do relatório", () => {
    expect(motivosDePulo([linha({ status: "skipped", skip_reason: "  " })])).toEqual([
      { motivo: "Sem motivo registrado", quantos: 1 },
    ]);
  });
});

describe("enviosPorDia", () => {
  it("agrupa por dia em ordem cronológica e ignora quem não saiu", () => {
    expect(
      enviosPorDia([
        linha({ sent_at: "2026-09-18T12:00:00Z", responded_at: "x" }),
        linha({ sent_at: "2026-09-18T18:00:00Z" }),
        linha({ sent_at: "2026-09-17T09:00:00Z" }),
        linha({ status: "pending", sent_at: null }),
      ]),
    ).toEqual([
      { dia: "2026-09-17", enviadas: 1, responderam: 0 },
      { dia: "2026-09-18", enviadas: 2, responderam: 1 },
    ]);
  });
});
