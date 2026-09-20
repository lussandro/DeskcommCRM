import { describe, expect, it } from "vitest";
import { interpretarRespostaDeParticipantes, motivoLegivel } from "./waha-resposta";

describe("interpretarRespostaDeParticipantes", () => {
  it("lê 451 como falha de jid inválido", () => {
    const corpo = [
      {
        status: "451",
        jid: "5548991286399@s.whatsapp.net",
        content: { tag: "participant", attrs: { jid: "5548991286399@s.whatsapp.net", error: "451" } },
      },
    ];
    expect(interpretarRespostaDeParticipantes(corpo)).toEqual([
      { jid: "5548991286399@s.whatsapp.net", status: "451", ok: false, motivo: "número inválido ou inexistente no WhatsApp" },
    ]);
  });

  it("lê 404 como não-é-membro", () => {
    const corpo = [{ status: "404", jid: "2538@lid", content: { tag: "participant", attrs: { error: "404" } } }];
    const r = interpretarRespostaDeParticipantes(corpo);
    expect(r[0]!.ok).toBe(false);
    expect(r[0]!.motivo).toBe("não é membro do grupo");
  });

  it("lê 200 como sucesso", () => {
    const corpo = [{ status: "200", jid: "2242@lid", content: { tag: "participant", attrs: {} } }];
    expect(interpretarRespostaDeParticipantes(corpo)[0]).toMatchObject({ ok: true, motivo: null });
  });

  it("sucesso PARCIAL: um ok e um falho no mesmo array", () => {
    const corpo = [
      { status: "200", jid: "a@lid" },
      { status: "451", jid: "b@lid" },
    ];
    const r = interpretarRespostaDeParticipantes(corpo);
    expect(r.map((x) => x.ok)).toEqual([true, false]);
  });

  it("corpo vazio devolve lista vazia, não lança", () => {
    expect(interpretarRespostaDeParticipantes([])).toEqual([]);
    expect(interpretarRespostaDeParticipantes(null)).toEqual([]);
    expect(interpretarRespostaDeParticipantes({ inesperado: true })).toEqual([]);
  });

  it("status desconhecido não é dado como sucesso", () => {
    const r = interpretarRespostaDeParticipantes([{ status: "999", jid: "x@lid" }]);
    expect(r[0]!.ok).toBe(false);
    expect(r[0]!.motivo).toContain("999");
  });
});

describe("motivoLegivel", () => {
  it("nunca devolve string vazia", () => {
    for (const s of ["200", "404", "451", "403", "", "abc"]) {
      expect(motivoLegivel(s).length).toBeGreaterThan(0);
    }
  });
});
