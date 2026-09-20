import { describe, expect, it, vi } from "vitest";
import { executarAcaoDeGrupo } from "./executar-acao";

const ALVO = "2242@lid";

function deps(opts: {
  resposta?: { httpStatus: number; corpo: unknown };
  membrosDepois: { id: string; pn: string | null; role: string }[];
}) {
  return {
    chamarAcao: vi.fn().mockResolvedValue(opts.resposta ?? { httpStatus: 200, corpo: [{ status: "200", jid: ALVO }] }),
    lerParticipantes: vi.fn().mockResolvedValue(opts.membrosDepois),
  } as never;
}

describe("executarAcaoDeGrupo — pós-condição manda", () => {
  it("remover: só é ok quando o membro SUMIU da lista", async () => {
    const r = await executarAcaoDeGrupo(deps({ membrosDepois: [] }), {
      acao: "remover", waGroupId: "g@g.us", sessao: "s", alvoLid: ALVO, alvoJid: "554@c.us", papelAtual: "participant",
    });
    expect(r.posCondicaoOk).toBe(true);
    expect(r.erroTexto).toBeNull();
  });

  it("remover: HTTP 200 + status 200, mas membro AINDA na lista => NÃO ok", async () => {
    // este é o caso medido em produção: a resposta mente
    const r = await executarAcaoDeGrupo(
      deps({ membrosDepois: [{ id: ALVO, pn: "554@c.us", role: "participant" }] }),
      { acao: "remover", waGroupId: "g@g.us", sessao: "s", alvoLid: ALVO, alvoJid: "554@c.us", papelAtual: "participant" },
    );
    expect(r.posCondicaoOk).toBe(false);
    expect(r.erroTexto).toContain("continua no grupo");
  });

  it("451 no array: falha, com o motivo legível", async () => {
    const r = await executarAcaoDeGrupo(
      deps({
        resposta: { httpStatus: 200, corpo: [{ status: "451", jid: "554@s.whatsapp.net" }] },
        membrosDepois: [{ id: ALVO, pn: "554@c.us", role: "participant" }],
      }),
      { acao: "remover", waGroupId: "g@g.us", sessao: "s", alvoLid: ALVO, alvoJid: "554@c.us", papelAtual: "participant" },
    );
    expect(r.posCondicaoOk).toBe(false);
    expect(r.statusParticipante).toBe("451");
    expect(r.erroTexto).toContain("número inválido");
  });

  it("promover: ok só quando o papel virou admin", async () => {
    const ok = await executarAcaoDeGrupo(
      deps({ membrosDepois: [{ id: ALVO, pn: null, role: "admin" }] }),
      { acao: "promover", waGroupId: "g", sessao: "s", alvoLid: ALVO, alvoJid: "x@c.us", papelAtual: "participant" },
    );
    expect(ok.posCondicaoOk).toBe(true);

    const nao = await executarAcaoDeGrupo(
      deps({ membrosDepois: [{ id: ALVO, pn: null, role: "participant" }] }),
      { acao: "promover", waGroupId: "g", sessao: "s", alvoLid: ALVO, alvoJid: "x@c.us", papelAtual: "participant" },
    );
    expect(nao.posCondicaoOk).toBe(false);
  });

  it("rebaixar: ok quando deixou de ser admin", async () => {
    const r = await executarAcaoDeGrupo(
      deps({ membrosDepois: [{ id: ALVO, pn: null, role: "participant" }] }),
      { acao: "rebaixar", waGroupId: "g", sessao: "s", alvoLid: ALVO, alvoJid: "x@c.us", papelAtual: "admin" },
    );
    expect(r.posCondicaoOk).toBe(true);
  });

  it("silenciar NÃO chama o WAHA (é estado só do CRM)", async () => {
    const d = deps({ membrosDepois: [] });
    const r = await executarAcaoDeGrupo(d, {
      acao: "silenciar", waGroupId: "g", sessao: "s", alvoLid: ALVO, alvoJid: "x@c.us", papelAtual: "participant",
    });
    expect((d as unknown as { chamarAcao: ReturnType<typeof vi.fn> }).chamarAcao).not.toHaveBeenCalled();
    expect(r.posCondicaoOk).toBe(true);
  });

  it("a resposta crua é sempre preservada para a tela mostrar", async () => {
    const corpo = [{ status: "403", jid: "x" }];
    const r = await executarAcaoDeGrupo(
      deps({ resposta: { httpStatus: 200, corpo }, membrosDepois: [{ id: ALVO, pn: null, role: "participant" }] }),
      { acao: "remover", waGroupId: "g", sessao: "s", alvoLid: ALVO, alvoJid: "x@c.us", papelAtual: "participant" },
    );
    expect(r.respostaCrua).toEqual(corpo);
    expect(r.erroTexto).toContain("admin");
  });
});
