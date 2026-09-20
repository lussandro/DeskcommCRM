import { describe, expect, it } from "vitest";
import { extrairGrupoDeEvento, extrairMudancaDeParticipantes } from "./sincronizar";

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
