/**
 * Interpretação da resposta das rotas de participante do WAHA.
 *
 * ⚠️ MEDIDO EM PRODUÇÃO (2026-09-20): estas rotas devolvem **HTTP 200
 * sempre**, e o veredito real vem num array, um item por participante.
 * Um `POST /groups` chegou a devolver 201 listando um membro que o
 * `participants/v2` seguinte não mostrou. Por isso:
 *
 *   `response.ok` NÃO É PROVA DE NADA. Quem decide é este array — e,
 *   depois dele, a pós-condição (reler participants/v2).
 *
 * Evidência crua: .superpowers-capturas-grupo.jsonl
 */

export interface ResultadoPorParticipante {
  jid: string;
  status: string;
  ok: boolean;
  motivo: string | null;
}

export function motivoLegivel(status: string): string {
  switch (status) {
    case "200":
      return "ok";
    case "404":
      return "não é membro do grupo";
    case "451":
      return "número inválido ou inexistente no WhatsApp";
    case "403":
      return "sem permissão — a sessão precisa ser admin do grupo";
    default:
      return `o WhatsApp recusou com o código ${status || "(vazio)"}`;
  }
}

export function interpretarRespostaDeParticipantes(corpo: unknown): ResultadoPorParticipante[] {
  if (!Array.isArray(corpo)) return [];

  return corpo.flatMap((item): ResultadoPorParticipante[] => {
    if (!item || typeof item !== "object") return [];
    const linha = item as Record<string, unknown>;
    const status = String(linha.status ?? "");
    const jid = String(linha.jid ?? "");
    const ok = status === "200";
    return [{ jid, status, ok, motivo: ok ? null : motivoLegivel(status) }];
  });
}
