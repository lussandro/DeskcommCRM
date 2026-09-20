import { afterEach, describe, expect, it, vi } from "vitest";
import { chamarAcaoDeParticipante, lerParticipantes, listarGrupos } from "./client-grupos";

const cfg = { baseUrl: "http://waha:3000", apiKey: "k" };

afterEach(() => vi.unstubAllGlobals());

function respostaFalsa(corpo: unknown, status = 200) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } }),
  );
}

describe("listarGrupos", () => {
  it("aceita o formato OBJETO-mapa que o WAHA devolve", async () => {
    // medido: GET /groups devolve {"1203@g.us": {...}}, não um array
    const f = respostaFalsa({
      "1203@g.us": {
        id: "1203@g.us", subject: "CAPTURA CRM", creation: 1789928560,
        owner: "3564@lid", ownerPn: "554891972220@s.whatsapp.net", size: 2,
        announce: false, restrict: false, memberAddMode: false, joinApprovalMode: false,
        participants: [{ id: "3564@lid", phoneNumber: "554891972220@s.whatsapp.net", admin: "superadmin" }],
      },
    });
    vi.stubGlobal("fetch", f);

    const gs = await listarGrupos(cfg, "sessao1");
    expect(gs).toHaveLength(1);
    expect(gs[0]!.subject).toBe("CAPTURA CRM");
    expect(gs[0]!.participants[0]!.role).toBe("superadmin");
    expect(gs[0]!.participants[0]!.pn).toBe("554891972220@c.us");
  });

  it("aceita também o formato array", async () => {
    vi.stubGlobal("fetch", respostaFalsa([{ id: "1@g.us", participants: [] }]));
    expect(await listarGrupos(cfg, "s")).toHaveLength(1);
  });

  it("manda a api key no header, nunca na query", async () => {
    const f = respostaFalsa({});
    vi.stubGlobal("fetch", f);
    await listarGrupos(cfg, "s");
    const [url, init] = f.mock.calls[0]!;
    expect(String(url)).not.toContain("k");
    expect((init.headers as Record<string, string>)["X-Api-Key"]).toBe("k");
  });
});

describe("lerParticipantes", () => {
  it("normaliza o pn de participants/v2", async () => {
    vi.stubGlobal("fetch", respostaFalsa([{ id: "2242@lid", pn: "554891286399@c.us", role: "participant" }]));
    const ps = await lerParticipantes(cfg, "s", "1203@g.us");
    expect(ps).toEqual([{ id: "2242@lid", pn: "554891286399@c.us", role: "participant" }]);
  });

  it("papel desconhecido vira 'participant' em vez de lançar", async () => {
    vi.stubGlobal("fetch", respostaFalsa([{ id: "x@lid", role: "chefe" }]));
    expect((await lerParticipantes(cfg, "s", "g"))[0]!.role).toBe("participant");
  });
});

describe("chamarAcaoDeParticipante", () => {
  it("devolve status e corpo CRUS, sem julgar", async () => {
    const corpo = [{ status: "451", jid: "x@s.whatsapp.net" }];
    vi.stubGlobal("fetch", respostaFalsa(corpo));
    const r = await chamarAcaoDeParticipante(cfg, "s", "1203@g.us", "participants/remove", ["x@c.us"]);
    expect(r.httpStatus).toBe(200);
    expect(r.corpo).toEqual(corpo);
  });

  it("monta o payload no formato participants:[{id}]", async () => {
    const f = respostaFalsa([]);
    vi.stubGlobal("fetch", f);
    await chamarAcaoDeParticipante(cfg, "s", "g@g.us", "admin/promote", ["a@c.us", "b@c.us"]);
    const body = JSON.parse(f.mock.calls[0]![1].body as string);
    expect(body).toEqual({ participants: [{ id: "a@c.us" }, { id: "b@c.us" }] });
  });
});
