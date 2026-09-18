/**
 * O que a API aceita de fora. Zod em todo input externo, como manda a doutrina —
 * e nada aqui aceita `organization_id`: a organização vem do `requireRole()`,
 * nunca do corpo.
 */
import { z } from "zod";

import { filtroDeAudienciaSchema } from "./audiencia";

/**
 * O ritmo próprio. Todos opcionais e anuláveis: `null` devolve a decisão ao
 * canal, que é o default de quem nunca abriu esta seção.
 *
 * As faixas são as do CHECK da migration 0264 — validação de entrada do
 * operador, não default de comportamento (os números de pacing são fonte única
 * em `lib/agent-engine/pacing/defaults.ts`).
 */
export const ritmoSchema = z.object({
  intervalo_segundos: z.number().int().min(1).max(86_400).nullable().optional(),
  janela_inicio_hora: z.number().int().min(0).max(23).nullable().optional(),
  janela_fim_hora: z.number().int().min(1).max(24).nullable().optional(),
  teto_diario: z.number().int().min(1).max(10_000).nullable().optional(),
  teto_horario: z.number().int().min(1).max(10_000).nullable().optional(),
});

const baseDaCampanha = {
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(4000).nullable().optional(),
  channel_session_id: z.string().uuid(),
  message_body: z.string().trim().max(4096).nullable().optional(),
  base_legal: z.enum(["consent", "legitimate_interest"]),
  lia_ref: z.string().trim().max(120).nullable().optional(),
  audience_filter: filtroDeAudienciaSchema.optional(),
};

export const criarCampanhaSchema = z
  .object({ ...baseDaCampanha })
  .merge(ritmoSchema)
  .refine(
    (c) => c.base_legal !== "legitimate_interest" || (c.lia_ref ?? "").trim() !== "",
    {
      message:
        "Interesse legítimo exige a referência da avaliação (LIA) — é ela que responde a quem " +
        "perguntar com base em quê recebeu a mensagem.",
      path: ["lia_ref"],
    },
  )
  .refine(
    (c) =>
      c.janela_inicio_hora == null ||
      c.janela_fim_hora == null ||
      c.janela_fim_hora > c.janela_inicio_hora,
    { message: "A janela precisa terminar depois de começar.", path: ["janela_fim_hora"] },
  );

/** Edição de rascunho: tudo opcional, e a mesma checagem de base legal na rota. */
export const editarCampanhaSchema = z
  .object({
    name: baseDaCampanha.name.optional(),
    description: baseDaCampanha.description,
    channel_session_id: baseDaCampanha.channel_session_id.optional(),
    message_body: baseDaCampanha.message_body,
    base_legal: baseDaCampanha.base_legal.optional(),
    lia_ref: baseDaCampanha.lia_ref,
    audience_filter: filtroDeAudienciaSchema.optional(),
  })
  .merge(ritmoSchema);

export const previaSchema = z.object({
  audience_filter: filtroDeAudienciaSchema,
  message_body: z.string().max(4096).default(""),
  campaign_id: z.string().uuid().optional(),
});

export const agendarSchema = z.object({ scheduled_at: z.string().datetime() });
export const testarSchema = z.object({ contact_id: z.string().uuid() });

export const listarCampanhasSchema = z.object({
  status: z.string().trim().max(20).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const listarDestinatariosSchema = z.object({
  status: z.string().trim().max(20).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/**
 * Cursor opaco `created_at|id`, o mesmo formato de `lib/schemas/lead-captures.ts`.
 * Sem HMAC, como os outros: ele só ordena, não autoriza — a organização vem do
 * papel conferido, e um cursor forjado não alcança linha de outro tenant.
 */
export function codificarCursor(c: { created_at: string; id: string }): string {
  return Buffer.from(`${c.created_at}|${c.id}`, "utf8").toString("base64url");
}

export function decodificarCursor(bruto: string): { created_at: string; id: string } | null {
  try {
    const [created_at, id] = Buffer.from(bruto, "base64url").toString("utf8").split("|");
    if (!created_at || !id) return null;
    return { created_at, id };
  } catch {
    return null;
  }
}
