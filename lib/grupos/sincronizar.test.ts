import { describe, expect, it } from "vitest";
import {
  aplicarMudancaDeParticipantes,
  extrairGrupoDeEvento,
  extrairMudancaDeParticipantes,
} from "./sincronizar";
import { somosAdminDoGrupo } from "./tipos";

const EVENTO_UPDATE = {
  timestamp: 1789928563597,
  group: {
    id: "120363414984201825@g.us",
    subject: "CAPTURA CRM",
    participants: [{ id: "35644520837319@lid", pn: "554891972220@c.us", role: "superadmin" }],
    membersCanAddNewMember: false,
    membersCanSendMessages: false,
    newMembersApprovalRequired: false,
  },
  _data: {
    id: "120363414984201825@g.us",
    subject: "CAPTURA CRM",
    creation: 1789928560,
    owner: "35644520837319@lid",
    ownerPn: "554891972220@s.whatsapp.net",
    size: 1,
    restrict: false,
    announce: false,
    joinApprovalMode: false,
    memberAddMode: false,
    participants: [{ id: "35644520837319@lid", phoneNumber: "554891972220@s.whatsapp.net", admin: "superadmin" }],
  },
};

const EVENTO_PARTICIPANTS = {
  group: { id: "120363414984201825@g.us" },
  type: "join",
  timestamp: 1789928608579,
  participants: [{ id: "224253161005092@lid", role: "participant" }],
  _data: {
    id: "120363414984201825@g.us",
    author: null,
    participants: [{ id: "224253161005092@lid", phoneNumber: "554891286399@s.whatsapp.net", admin: null }],
    action: "add",
  },
};

describe("extrairGrupoDeEvento", () => {
  it("lê metadados de um group.v2.update real", () => {
    const g = extrairGrupoDeEvento(EVENTO_UPDATE);
    expect(g).not.toBeNull();
    expect(g!.id).toBe("120363414984201825@g.us");
    expect(g!.subject).toBe("CAPTURA CRM");
    expect(g!.creation).toBe(1789928560);
    expect(g!.ownerPn).toBe("554891972220@c.us");
    expect(g!.participants).toEqual([
      { id: "35644520837319@lid", pn: "554891972220@c.us", role: "superadmin" },
    ]);
  });

  it("devolve null para payload que não é de grupo", () => {
    expect(extrairGrupoDeEvento({ foo: 1 })).toBeNull();
    expect(extrairGrupoDeEvento(null)).toBeNull();
  });
});

describe("extrairMudancaDeParticipantes", () => {
  it("lê um group.v2.participants real", () => {
    const m = extrairMudancaDeParticipantes(EVENTO_PARTICIPANTS);
    expect(m).toEqual({
      waGroupId: "120363414984201825@g.us",
      tipo: "join",
      participantes: [{ id: "224253161005092@lid", role: "participant" }],
    });
  });

  it("tipo leave é preservado", () => {
    const m = extrairMudancaDeParticipantes({ ...EVENTO_PARTICIPANTS, type: "leave" });
    expect(m!.tipo).toBe("leave");
  });
});

/**
 * O defeito que estes casos vigiam: todo `group.v2.*` ia pelo mesmo caminho, e
 * o payload pobre de `participants` fazia `sincronizarGrupo` gravar
 * `subject=null`/`size=null`/`owner=null` por cima do retrato — toda entrada ou
 * saída de membro apagava os metadados. `aplicarMudancaDeParticipantes` toca só
 * o membro, e nunca a linha do grupo.
 */
type Escrita = { tabela: string; op: string; dados: Record<string, unknown> };

// ponytail: dublê mínimo do admin client — só o encadeamento que esta função
// usa (select→eq→maybeSingle e upsert awaitado). Trocar por um fake genérico
// quando um segundo arquivo precisar dele.
function adminFalso(): { admin: never; escritas: Escrita[] } {
  const escritas: Escrita[] = [];
  const elo = (tabela: string, op: string, dados: Record<string, unknown>) => {
    const alvo = {
      eq: () => alvo,
      maybeSingle: async () => ({ data: { id: "grp-1" }, error: null }),
      then: (r: (v: unknown) => unknown) => {
        escritas.push({ tabela, op, dados });
        return Promise.resolve({ data: null, error: null }).then(r);
      },
    };
    return alvo;
  };
  const admin = {
    from: (tabela: string) => ({
      select: () => elo(tabela, "select", {}),
      update: (d: Record<string, unknown>) => elo(tabela, "update", d),
      upsert: (d: Record<string, unknown>) => elo(tabela, "upsert", d),
    }),
  };
  return { admin: admin as never, escritas };
}

describe("aplicarMudancaDeParticipantes — o payload pobre não toca o grupo", () => {
  it("join: mexe só em membro, grava entrou_em e limpa saiu_em", async () => {
    const { admin, escritas } = adminFalso();
    const id = await aplicarMudancaDeParticipantes(admin, "org-1", "sess-1", {
      waGroupId: "120363414984201825@g.us",
      tipo: "join",
      participantes: [{ id: "224253161005092@lid", role: "participant" }],
    });
    expect(id).toBe("grp-1");

    expect(
      escritas.filter((e) => e.tabela === "whatsapp_groups" && e.op !== "select"),
      "nenhuma escrita em whatsapp_groups",
    ).toEqual([]);

    const membros = escritas.filter((e) => e.tabela === "whatsapp_group_members");
    expect(membros).toHaveLength(1);
    expect(membros[0]!.dados.role).toBe("participant");
    expect(membros[0]!.dados.entrou_em).toEqual(expect.any(String));
    expect(membros[0]!.dados.saiu_em).toBeNull();
  });

  it("leave: o membro vira 'left' com saiu_em, e NÃO volta como participant", async () => {
    const { admin, escritas } = adminFalso();
    await aplicarMudancaDeParticipantes(admin, "org-1", "sess-1", {
      waGroupId: "120363414984201825@g.us",
      tipo: "leave",
      participantes: [{ id: "224253161005092@lid", role: "participant" }],
    });

    expect(escritas.filter((e) => e.tabela === "whatsapp_groups" && e.op !== "select")).toEqual([]);
    const membros = escritas.filter((e) => e.tabela === "whatsapp_group_members");
    expect(membros).toHaveLength(1);
    expect(membros[0]!.dados.role).toBe("left");
    expect(membros[0]!.dados.saiu_em).toEqual(expect.any(String));
  });
});

/**
 * C2: `somos_admin` media se ALGUÉM é admin, não se NÓS somos — e todo grupo
 * tem um dono `superadmin`, então gravava `true` sempre. O gate de
 * `ACOES_QUE_EXIGEM_ADMIN` nunca disparava o 409 e a tela prometia botão que o
 * WhatsApp recusa.
 */
describe("somosAdminDoGrupo", () => {
  const DONO = { pn: "554891972220@c.us", role: "superadmin" };
  const NOS_PARTICIPANTE = { pn: "554891286399@c.us", role: "participant" };

  it("dono alheio no grupo NÃO nos faz admin", () => {
    expect(somosAdminDoGrupo([DONO, NOS_PARTICIPANTE], "554891286399@c.us")).toBe(false);
  });

  it("somos admin quando o papel é nosso", () => {
    expect(somosAdminDoGrupo([DONO, { ...NOS_PARTICIPANTE, role: "admin" }], "+55 48 9128-6399")).toBe(true);
  });

  it("formatos diferentes do WAHA casam pelos dígitos", () => {
    expect(somosAdminDoGrupo([{ pn: "554891972220@s.whatsapp.net", role: "superadmin" }], "554891972220@c.us")).toBe(true);
  });

  it("telefone desconhecido devolve null — não 'false' inventado", () => {
    expect(somosAdminDoGrupo([DONO], null)).toBeNull();
    expect(somosAdminDoGrupo([DONO], "")).toBeNull();
  });
});
