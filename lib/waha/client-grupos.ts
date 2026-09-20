/**
 * Rotas de grupo do WAHA. Engine NOWEB, tag 2026.7.2 (medida).
 *
 * Este módulo NÃO julga sucesso: `chamarAcaoDeParticipante` devolve status
 * e corpo crus. Quem interpreta é lib/grupos/waha-resposta.ts, e quem
 * CONFIRMA é a pós-condição em lib/grupos/executar-acao.ts. A separação é
 * deliberada: o WAHA responde 200 para operação que não aconteceu.
 */
import { TETO_PADRAO_MS } from "@/lib/waha/client";
import { PAPEIS_DE_MEMBRO, type PapelDeMembro } from "@/lib/grupos/tipos";

export interface ConfigWaha {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
}

export interface ParticipanteWaha {
  id: string;
  pn: string | null;
  role: PapelDeMembro;
}

export interface GrupoWaha {
  id: string;
  subject: string | null;
  description: string | null;
  owner: string | null;
  ownerPn: string | null;
  creation: number | null;
  size: number | null;
  announce: boolean;
  restrict: boolean;
  memberAddMode: boolean;
  joinApprovalMode: boolean;
  participants: ParticipanteWaha[];
}

export type RotaDeParticipante =
  | "participants/remove"
  | "participants/add"
  | "admin/promote"
  | "admin/demote";

async function pedir(cfg: ConfigWaha, caminho: string, metodo = "GET", corpo?: unknown) {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), cfg.timeoutMs ?? TETO_PADRAO_MS);
  try {
    const r = await fetch(`${cfg.baseUrl}${caminho}`, {
      method: metodo,
      headers: { "X-Api-Key": cfg.apiKey, "Content-Type": "application/json" },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: controle.signal,
    });
    const texto = await r.text();
    let json: unknown = null;
    try {
      json = texto ? JSON.parse(texto) : null;
    } catch {
      json = texto;
    }
    return { httpStatus: r.status, corpo: json };
  } finally {
    clearTimeout(relogio);
  }
}

/** `5548…@s.whatsapp.net` e `5548…@c.us` são o mesmo endereço em roupas diferentes. */
function normalizarPn(bruto: unknown): string | null {
  if (typeof bruto !== "string" || !bruto) return null;
  return bruto.replace("@s.whatsapp.net", "@c.us");
}

function normalizarPapel(bruto: unknown): PapelDeMembro {
  const v = typeof bruto === "string" ? bruto : "";
  return (PAPEIS_DE_MEMBRO as readonly string[]).includes(v) ? (v as PapelDeMembro) : "participant";
}

function normalizarGrupo(bruto: Record<string, unknown>): GrupoWaha {
  const participantes = Array.isArray(bruto.participants) ? bruto.participants : [];
  return {
    id: String(bruto.id ?? ""),
    subject: (bruto.subject as string) ?? null,
    description: (bruto.description as string) ?? null,
    owner: (bruto.owner as string) ?? null,
    ownerPn: normalizarPn(bruto.ownerPn),
    creation: typeof bruto.creation === "number" ? bruto.creation : null,
    size: typeof bruto.size === "number" ? bruto.size : null,
    announce: Boolean(bruto.announce),
    restrict: Boolean(bruto.restrict),
    memberAddMode: Boolean(bruto.memberAddMode),
    joinApprovalMode: Boolean(bruto.joinApprovalMode),
    participants: participantes.map((p) => {
      const item = (p ?? {}) as Record<string, unknown>;
      return {
        id: String(item.id ?? ""),
        // `GET /groups` usa `phoneNumber`; `participants/v2` usa `pn`. Medido.
        pn: normalizarPn(item.pn ?? item.phoneNumber),
        role: normalizarPapel(item.role ?? item.admin ?? "participant"),
      };
    }),
  };
}

export async function listarGrupos(cfg: ConfigWaha, sessao: string): Promise<GrupoWaha[]> {
  const { corpo } = await pedir(cfg, `/api/${sessao}/groups?limit=200`);
  if (!corpo || typeof corpo !== "object") return [];
  // Medido: o WAHA devolve um OBJETO-mapa {chatId: grupo}, não um array.
  const lista = Array.isArray(corpo) ? corpo : Object.values(corpo as Record<string, unknown>);
  return lista
    .filter((g): g is Record<string, unknown> => Boolean(g) && typeof g === "object")
    .map(normalizarGrupo);
}

export async function lerParticipantes(
  cfg: ConfigWaha,
  sessao: string,
  waGroupId: string,
): Promise<ParticipanteWaha[]> {
  const { corpo } = await pedir(cfg, `/api/${sessao}/groups/${waGroupId}/participants/v2`);
  if (!Array.isArray(corpo)) return [];
  return corpo
    .filter((p): p is Record<string, unknown> => Boolean(p) && typeof p === "object")
    .map((p) => ({
      id: String(p.id ?? ""),
      pn: normalizarPn(p.pn ?? p.phoneNumber),
      role: normalizarPapel(p.role ?? p.admin),
    }));
}

export async function chamarAcaoDeParticipante(
  cfg: ConfigWaha,
  sessao: string,
  waGroupId: string,
  rota: RotaDeParticipante,
  jids: string[],
): Promise<{ httpStatus: number; corpo: unknown }> {
  return pedir(cfg, `/api/${sessao}/groups/${waGroupId}/${rota}`, "POST", {
    participants: jids.map((id) => ({ id })),
  });
}
