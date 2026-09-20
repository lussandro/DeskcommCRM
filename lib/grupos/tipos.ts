/**
 * Vocabulário compartilhado do módulo de grupos.
 *
 * Constante, nunca string literal no emissor: é o que permite ao
 * invariante de vocabulário conferir banco × TypeScript nas colunas que
 * TÊM check (papel e ação têm; `infractions.regra` NÃO tem, de propósito).
 */

export const PAPEIS_DE_MEMBRO = ["participant", "admin", "superadmin", "left"] as const;
export type PapelDeMembro = (typeof PAPEIS_DE_MEMBRO)[number];

export const ACOES_DE_GRUPO = ["remover", "promover", "rebaixar", "silenciar", "avisar", "advertir"] as const;
export type AcaoDeGrupo = (typeof ACOES_DE_GRUPO)[number];

export const STATUS_DE_ACAO = [
  "pendente", "executando", "concluida", "falhou", "revertida", "cancelada",
] as const;
export type StatusDeAcao = (typeof STATUS_DE_ACAO)[number];

export const MODOS_DE_GRUPO = ["vigiado", "semi", "autonomo"] as const;
export type ModoDeGrupo = (typeof MODOS_DE_GRUPO)[number];

/**
 * O WAHA chama de `restrict` o "só admin edita as informações". A coluna
 * não pode ter esse nome (palavra reservada em SQL), então o mapeamento
 * mora aqui, num lugar só.
 */
export const CAMPO_WAHA_PARA_COLUNA = {
  announce: "announce",
  restrict: "restrict_info",
  memberAddMode: "member_add_mode",
  joinApprovalMode: "join_approval_mode",
} as const;

/**
 * SOMOS admin deste grupo? — não "existe algum admin", que é sempre verdade
 * (todo grupo tem um dono `superadmin`).
 *
 * A comparação é por DÍGITOS do telefone da nossa conexão contra o `pn` do
 * participante: os dois lados chegam em formatos diferentes do WAHA
 * (`554891972220@c.us`, `554891972220@s.whatsapp.net`, com ou sem `+`), e o
 * `lid` não serve de chave porque ele é por-grupo.
 *
 * `phoneNumber` desconhecido devolve `null`, NUNCA `false`: "não sei" e "não
 * somos" levam a decisões diferentes — quem chama decide, e `sincronizarGrupo`
 * preserva o valor gravado em vez de inventar um (Regra Nº 1).
 */
export function somosAdminDoGrupo(
  participantes: readonly { pn: string | null; role: string }[],
  phoneNumber: string | null | undefined,
): boolean | null {
  const alvo = (phoneNumber ?? "").replace(/\D/g, "");
  if (!alvo) return null;
  return participantes.some(
    (p) => (p.role === "admin" || p.role === "superadmin") && (p.pn ?? "").replace(/\D/g, "") === alvo,
  );
}
