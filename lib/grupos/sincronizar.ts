/**
 * Sincronização de grupo e membros a partir dos eventos `group.v2.*`.
 *
 * ⚠️ NUNCA por polling. A doc do WAHA avisa `rate-overlimit` em
 * `GET /groups` e `/groups/refresh` no NOWEB, e uma instalação pode ter
 * centenas de grupos. A carga inicial é UMA leitura ao ligar o módulo;
 * daí em diante, só evento.
 *
 * Medido: `group.v2.update` traz a lista COMPLETA de participantes com
 * `pn` e papel resolvidos — é a fonte de verdade. O
 * `group.v2.participants` é pobre (só id e role) e serve para marcar
 * entrada/saída.
 */
import type { createAdminClient } from "@/lib/supabase/admin";
import type { GrupoWaha } from "@/lib/waha/client-grupos";
import { PAPEIS_DE_MEMBRO, type PapelDeMembro } from "@/lib/grupos/tipos";

type Admin = ReturnType<typeof createAdminClient>;

function normalizarPn(bruto: unknown): string | null {
  if (typeof bruto !== "string" || !bruto) return null;
  return bruto.replace("@s.whatsapp.net", "@c.us");
}

function normalizarPapel(bruto: unknown): PapelDeMembro {
  const v = typeof bruto === "string" ? bruto : "";
  return (PAPEIS_DE_MEMBRO as readonly string[]).includes(v) ? (v as PapelDeMembro) : "participant";
}

export function extrairGrupoDeEvento(payload: unknown): GrupoWaha | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const grupo = (p.group ?? null) as Record<string, unknown> | null;
  const dados = (p._data ?? {}) as Record<string, unknown>;
  if (!grupo || typeof grupo.id !== "string") return null;

  // `_data` traz o metadado rico (creation, owner, flags); `group` traz a
  // lista normalizada com `pn`. Os dois juntos formam o retrato.
  const participantesNormalizados = Array.isArray(grupo.participants) ? grupo.participants : [];
  const participantesCrus = Array.isArray(dados.participants) ? dados.participants : [];
  const fonte = participantesNormalizados.length > 0 ? participantesNormalizados : participantesCrus;

  return {
    id: grupo.id,
    subject: (grupo.subject as string) ?? (dados.subject as string) ?? null,
    description: (dados.desc as string) ?? null,
    owner: (dados.owner as string) ?? null,
    ownerPn: normalizarPn(dados.ownerPn),
    creation: typeof dados.creation === "number" ? dados.creation : null,
    size: typeof dados.size === "number" ? dados.size : null,
    announce: Boolean(dados.announce ?? grupo.membersCanSendMessages === false),
    restrict: Boolean(dados.restrict),
    memberAddMode: Boolean(dados.memberAddMode ?? grupo.membersCanAddNewMember),
    joinApprovalMode: Boolean(dados.joinApprovalMode ?? grupo.newMembersApprovalRequired),
    participants: fonte
      .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
      .map((x) => ({
        id: String(x.id ?? ""),
        pn: normalizarPn(x.pn ?? x.phoneNumber),
        role: normalizarPapel(x.role ?? x.admin),
      })),
  };
}

export function extrairMudancaDeParticipantes(
  payload: unknown,
): { waGroupId: string; tipo: string; participantes: { id: string; role: PapelDeMembro }[] } | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const grupo = (p.group ?? null) as Record<string, unknown> | null;
  if (!grupo || typeof grupo.id !== "string" || typeof p.type !== "string") return null;
  const lista = Array.isArray(p.participants) ? p.participants : [];
  return {
    waGroupId: grupo.id,
    tipo: p.type,
    participantes: lista
      .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
      .map((x) => ({ id: String(x.id ?? ""), role: normalizarPapel(x.role ?? x.admin) })),
  };
}

/**
 * Grava o retrato do grupo e seus membros.
 *
 * Só atualiza grupo JÁ CADASTRADO (o módulo é ligado por org, por grupo).
 * Evento de grupo não cadastrado é descartado — é o comportamento de hoje
 * e continua sendo o default.
 */
export async function sincronizarGrupo(
  admin: Admin,
  organizationId: string,
  channelSessionId: string,
  grupo: GrupoWaha,
): Promise<string | null> {
  const { data: existente } = await admin
    .from("whatsapp_groups")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("channel_session_id", channelSessionId)
    .eq("wa_group_id", grupo.id)
    .maybeSingle();

  if (!existente) return null;

  const meuLid = grupo.participants.find((p) => p.role === "superadmin" || p.role === "admin");

  await admin
    .from("whatsapp_groups")
    .update({
      subject: grupo.subject,
      description: grupo.description,
      owner_lid: grupo.owner,
      owner_pn: grupo.ownerPn,
      created_at_wa: grupo.creation ? new Date(grupo.creation * 1000).toISOString() : null,
      size: grupo.size,
      announce: grupo.announce,
      restrict_info: grupo.restrict,
      member_add_mode: grupo.memberAddMode,
      join_approval_mode: grupo.joinApprovalMode,
      somos_admin: Boolean(meuLid),
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", existente.id)
    .eq("organization_id", organizationId);

  for (const p of grupo.participants) {
    if (!p.id) continue;
    await admin.from("whatsapp_group_members").upsert(
      {
        organization_id: organizationId,
        group_id: existente.id,
        wa_lid: p.id,
        wa_pn: p.pn,
        role: p.role,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,group_id,wa_lid" },
    );
  }

  return existente.id;
}
