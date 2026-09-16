/**
 * O registro das jornadas de vinícola. É por aqui que onboarding, tela e
 * aplicador chegam ao conteúdo — nunca importando os arquivos de dados direto.
 */
import { CANAL } from "./canal";
import { CLUBE } from "./clube";
import { CONSUMIDOR } from "./consumidor";
import { ENOTURISMO } from "./enoturismo";
import type { JornadaDeVinicola } from "./tipos";

export * from "./tipos";

export type ChaveDeJornada = "canal" | "enoturismo" | "clube" | "consumidor";

/**
 * A versão do PACOTE, gravada no ledger junto de cada aplicação.
 *
 * Existe para responder "de que versão saiu o que está no banco desta
 * organização" depois que o conteúdo mudar. Sobe quando o TEXTO de uma jornada
 * muda de forma que importe para quem já aplicou — não a cada correção de vírgula.
 */
export const VERSAO_DO_PACOTE = 1;

export const JORNADAS: Readonly<Record<ChaveDeJornada, JornadaDeVinicola>> = {
  canal: CANAL,
  enoturismo: ENOTURISMO,
  clube: CLUBE,
  consumidor: CONSUMIDOR,
};

/** Ordem estável: é a que a tela e o onboarding mostram. */
export const CHAVES_DE_JORNADA = ["canal", "enoturismo", "clube", "consumidor"] as const;

export function ehChaveDeJornada(v: unknown): v is ChaveDeJornada {
  return typeof v === "string" && (CHAVES_DE_JORNADA as readonly string[]).includes(v);
}
