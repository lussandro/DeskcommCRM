import { z } from "zod";

/** Só dígitos; a máscara é da tela. Validação de dígito verificador fica para quando alguém pedir. */
export const cnpjSchema = z
  .string()
  .transform((s) => s.replace(/\D/g, ""))
  .refine((s) => s.length === 14, "CNPJ precisa ter 14 dígitos");

export const companyCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  trade_name: z.string().trim().min(1).max(200).nullable().optional(),
  cnpj: cnpjSchema.nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
});
export type CompanyCreate = z.infer<typeof companyCreateSchema>;

export const companyPatchSchema = companyCreateSchema.partial().extend({
  billing_contact_id: z.string().uuid().nullable().optional(),
});
export type CompanyPatch = z.infer<typeof companyPatchSchema>;

export const companyListQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
});
export type CompanyListQuery = z.infer<typeof companyListQuerySchema>;

export const companyLinkContactSchema = z.object({
  contact_id: z.string().uuid(),
});
