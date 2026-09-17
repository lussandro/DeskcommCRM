/**
 * Handlers puros de Empresas — reusados pela rota REST e (no módulo Asaas) pelo
 * consumidor de webhook. Recebem `HandlerCtx`, lançam `ApiError`, auditam.
 * `organization_id` vem SEMPRE do ctx; o input nunca o carrega.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/api/types";
import type { HandlerCtx } from "@/lib/api/handlers/types";
import { audit } from "@/lib/audit";
import { traduzir } from "@/lib/i18n/dicionario";
import type { Company, CompanyContact } from "@/lib/types/companies";
import type { CompanyCreate, CompanyPatch, CompanyListQuery } from "@/lib/schemas/companies";

type SB = SupabaseClient;

const COLS =
  "id, organization_id, name, trade_name, cnpj, asaas_customer_id, billing_contact_id, notes, created_at, updated_at";
const CONTACT_COLS = "id, name, display_name, phone_number, email";

function atorAudit(ctx: HandlerCtx) {
  return ctx.actor.type === "user"
    ? { actorUserId: ctx.actor.id, metadataActor: {} }
    : { actorUserId: null, metadataActor: { actor_type: ctx.actor.type, actor_id: ctx.actor.id } };
}

function erroBanco(ctx: HandlerCtx, error: { code?: string; message: string }): never {
  if (error.code === "23505" && error.message.includes("uq_crm_companies_org_cnpj")) {
    throw new ApiError(409, "cnpj_em_uso", undefined, ctx.requestId,
      traduzir("Já existe uma empresa com este CNPJ nesta organização.", ctx.idioma ?? "pt-BR"));
  }
  if (error.code === "23503") {
    throw new ApiError(422, "validation_failed", undefined, ctx.requestId,
      traduzir("Contato ou empresa inválidos para este vínculo.", ctx.idioma ?? "pt-BR"));
  }
  throw new ApiError(500, "internal_error", undefined, ctx.requestId, error.message);
}

export async function listCompaniesHandler(
  supabase: SB,
  ctx: HandlerCtx,
  query: CompanyListQuery,
): Promise<{ companies: Company[]; cursor: string | null; has_more: boolean }> {
  let q = supabase
    .from("crm_companies")
    // Hint da FK obrigatório: há DUAS FKs entre contacts e crm_companies
    // (contacts_company_org_fk e crm_companies_billing_contact_org_fk) — sem o
    // nome, o PostgREST responde PGRST201 (relacionamento ambíguo), não dado.
    .select(`${COLS}, contacts:contacts!contacts_company_org_fk(count)`)
    .eq("organization_id", ctx.organization_id)
    .order("name", { ascending: true })
    .order("id", { ascending: true })
    .limit(query.limit + 1);
  if (query.search) {
    // `%`/`_` são curingas do LIKE; `,()` são delimitadores do DSL do `.or()` — mesmo
    // escape de contacts/_handler.ts:125-131 ("Silva, Maria" injetaria condição).
    const s = query.search.trim().replace(/[%_]/g, (m) => `\\${m}`).replace(/,/g, " ").replace(/[()]/g, "");
    const digitos = query.search.replace(/\D/g, "");
    q = digitos.length >= 4
      ? q.or(`name.ilike.%${s}%,trade_name.ilike.%${s}%,cnpj.ilike.%${digitos}%`)
      : q.or(`name.ilike.%${s}%,trade_name.ilike.%${s}%`);
  }
  const cursor = query.cursor ? decodeCursor(query.cursor) : null;
  if (cursor) {
    // Paginação por (name, id). O nome entra no DSL entre aspas e sem `,()"` — o
    // mesmo cuidado da busca; o id é uuid e não precisa de escape.
    const nome = cursor.name.replace(/[,()"]/g, " ");
    q = q.or(`name.gt."${nome}",and(name.eq."${nome}",id.gt.${cursor.id})`);
  }
  const { data, error } = await q;
  if (error) erroBanco(ctx, error);
  const rows = (data ?? []) as Array<Company & { contacts: Array<{ count: number }> }>;
  const has_more = rows.length > query.limit;
  const page = rows.slice(0, query.limit).map(({ contacts, ...c }) => ({ ...c, contacts_count: contacts?.[0]?.count ?? 0 }));
  const last = page.at(-1);
  const proximo = has_more && last ? encodeCursor({ name: last.name, id: last.id }) : null;
  return { companies: page, cursor: proximo, has_more };
}

interface CursorPayload { name: string; id: string }
function encodeCursor(p: CursorPayload): string {
  return Buffer.from(JSON.stringify(p), "utf8").toString("base64url");
}
function decodeCursor(raw: string): CursorPayload | null {
  try {
    const p = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<CursorPayload>;
    return typeof p.name === "string" && typeof p.id === "string" ? { name: p.name, id: p.id } : null;
  } catch {
    return null;
  }
}

export async function getCompanyHandler(
  supabase: SB,
  ctx: HandlerCtx,
  input: { companyId: string },
): Promise<Company & { contacts: CompanyContact[] }> {
  const { data, error } = await supabase
    .from("crm_companies")
    .select(COLS)
    .eq("organization_id", ctx.organization_id)
    .eq("id", input.companyId)
    .maybeSingle();
  if (error) erroBanco(ctx, error);
  if (!data) {
    throw new ApiError(404, "not_found", undefined, ctx.requestId,
      traduzir("Empresa não encontrada.", ctx.idioma ?? "pt-BR"));
  }
  const empresa = data as Company;
  const { data: cts, error: e2 } = await supabase
    .from("contacts")
    .select(CONTACT_COLS)
    .eq("organization_id", ctx.organization_id)
    .eq("company_id", empresa.id)
    .eq("is_anonymized", false)
    .is("is_merged_into", null)
    .order("name", { ascending: true });
  if (e2) erroBanco(ctx, e2);
  const contacts = ((cts ?? []) as Array<Omit<CompanyContact, "is_billing_contact">>).map((c) => ({
    ...c,
    is_billing_contact: c.id === empresa.billing_contact_id,
  }));
  return { ...empresa, contacts_count: contacts.length, contacts };
}

export async function createCompanyHandler(supabase: SB, ctx: HandlerCtx, input: CompanyCreate): Promise<Company> {
  const { data, error } = await supabase
    .from("crm_companies")
    .insert({
      organization_id: ctx.organization_id,
      name: input.name,
      trade_name: input.trade_name ?? null,
      cnpj: input.cnpj ?? null,
      notes: input.notes ?? null,
      created_by_user_id: ctx.actor.type === "user" ? ctx.actor.id : null,
    })
    .select(COLS)
    .single();
  if (error || !data) erroBanco(ctx, error ?? { message: "insert sem linha" });
  const empresa = data as Company;
  const a = atorAudit(ctx);
  await audit({
    action: "company.created",
    actorUserId: a.actorUserId,
    organizationId: ctx.organization_id,
    resourceType: "company",
    resourceId: empresa.id,
    requestId: ctx.requestId,
    metadata: { ...a.metadataActor, has_cnpj: !!empresa.cnpj },
  });
  return empresa;
}

export async function patchCompanyHandler(
  supabase: SB,
  ctx: HandlerCtx,
  input: { companyId: string; patch: CompanyPatch },
): Promise<Company> {
  if (input.patch.billing_contact_id) {
    const { data: ct, error } = await supabase
      .from("contacts")
      .select("id, company_id")
      .eq("organization_id", ctx.organization_id)
      .eq("id", input.patch.billing_contact_id)
      .maybeSingle();
    if (error) erroBanco(ctx, error);
    if (!ct || (ct as { company_id: string | null }).company_id !== input.companyId) {
      throw new ApiError(422, "principal_fora_da_empresa", undefined, ctx.requestId,
        traduzir("O número principal precisa ser um contato desta empresa.", ctx.idioma ?? "pt-BR"));
    }
  }
  const { data, error } = await supabase
    .from("crm_companies")
    .update(input.patch)
    .eq("organization_id", ctx.organization_id)
    .eq("id", input.companyId)
    .select(COLS)
    .maybeSingle();
  if (error) erroBanco(ctx, error);
  if (!data) {
    throw new ApiError(404, "not_found", undefined, ctx.requestId,
      traduzir("Empresa não encontrada.", ctx.idioma ?? "pt-BR"));
  }
  const a = atorAudit(ctx);
  await audit({
    action: "company.updated",
    actorUserId: a.actorUserId,
    organizationId: ctx.organization_id,
    resourceType: "company",
    resourceId: input.companyId,
    requestId: ctx.requestId,
    metadata: { ...a.metadataActor, fields: Object.keys(input.patch) },
  });
  return data as Company;
}

export async function deleteCompanyHandler(supabase: SB, ctx: HandlerCtx, input: { companyId: string }): Promise<void> {
  const { data, error } = await supabase
    .from("crm_companies")
    .delete()
    .eq("organization_id", ctx.organization_id)
    .eq("id", input.companyId)
    .select("id")
    .maybeSingle();
  if (error) erroBanco(ctx, error);
  if (!data) {
    throw new ApiError(404, "not_found", undefined, ctx.requestId,
      traduzir("Empresa não encontrada.", ctx.idioma ?? "pt-BR"));
  }
  const a = atorAudit(ctx);
  await audit({
    action: "company.deleted",
    actorUserId: a.actorUserId,
    organizationId: ctx.organization_id,
    resourceType: "company",
    resourceId: input.companyId,
    requestId: ctx.requestId,
    metadata: a.metadataActor,
  });
}

async function mudarVinculo(
  supabase: SB,
  ctx: HandlerCtx,
  input: { companyId: string; contactId: string },
  novo: string | null,
  action: "company.contact_linked" | "company.contact_unlinked",
): Promise<void> {
  let q = supabase
    .from("contacts")
    .update({ company_id: novo })
    .eq("organization_id", ctx.organization_id)
    .eq("id", input.contactId);
  // Desvincular exige que o contato ESTEJA nesta empresa (senão desvincula um
  // contato de outra empresa sem avisar). Vincular troca de empresa é permitido
  // — não cerca.
  if (novo === null) q = q.eq("company_id", input.companyId);
  const { data, error } = await q.select("id, company_id").maybeSingle();
  if (error) erroBanco(ctx, error);
  if (!data) {
    throw new ApiError(404, "not_found", undefined, ctx.requestId,
      novo === null
        ? traduzir("Contato não pertence a esta empresa.", ctx.idioma ?? "pt-BR")
        : traduzir("Contato não encontrado.", ctx.idioma ?? "pt-BR"));
  }
  const a = atorAudit(ctx);
  await audit({
    action,
    actorUserId: a.actorUserId,
    organizationId: ctx.organization_id,
    resourceType: "company",
    resourceId: input.companyId,
    requestId: ctx.requestId,
    metadata: { ...a.metadataActor, contact_id: input.contactId },
  });
}

export function linkContactHandler(supabase: SB, ctx: HandlerCtx, input: { companyId: string; contactId: string }) {
  return mudarVinculo(supabase, ctx, input, input.companyId, "company.contact_linked");
}

/** Desvincular o principal também zera `billing_contact_id` — o trigger do banco não cobre este caminho (só anonimização). */
export async function unlinkContactHandler(supabase: SB, ctx: HandlerCtx, input: { companyId: string; contactId: string }) {
  await mudarVinculo(supabase, ctx, input, null, "company.contact_unlinked");
  const { error } = await supabase
    .from("crm_companies")
    .update({ billing_contact_id: null })
    .eq("organization_id", ctx.organization_id)
    .eq("id", input.companyId)
    .eq("billing_contact_id", input.contactId);
  if (error) erroBanco(ctx, error);
}
