import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * GET/POST /api/v1/companies — empresas do tenant (spec §5.2a).
 * Cookie session apenas. viewer lê; agent+ escreve.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api/wrappers";
import { ApiError } from "@/lib/api/types";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { companyCreateSchema, companyListQuerySchema, validateRequest, type CompanyCreate } from "@/lib/schemas";
import { createCompanyHandler, listCompaniesHandler } from "@/lib/companies/handler";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "companies" });
  if (!authz.ok) return authz.response;
  const sp = req.nextUrl.searchParams;
  const parsed = companyListQuerySchema.safeParse({
    search: sp.get("search") ?? undefined,
    limit: sp.get("limit") ?? undefined,
    cursor: sp.get("cursor") ?? undefined,
  });
  if (!parsed.success) {
    return fail("validation_failed", "Query inválida.", 422, {
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
      requestId,
    });
  }
  const supabase = await createClient();
  try {
    const r = await listCompaniesHandler(
      supabase,
      { organization_id: authz.org.orgId, actor: { type: "user", id: authz.user.id }, requestId, idioma: authz.user.idioma },
      parsed.data,
    );
    return ok(r.companies, { requestId, meta: { cursor: r.cursor, has_more: r.has_more } });
  } catch (err) {
    if (err instanceof ApiError) return fail(err.code, err.message, err.status, { details: err.details as Record<string, unknown> | undefined, requestId });
    throw err;
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "companies" });
  if (!authz.ok) return authz.response;
  let input: CompanyCreate;
  try {
    input = (await validateRequest(companyCreateSchema, req)) as CompanyCreate;
  } catch (err) {
    if (err instanceof ApiError) return fail(err.code, err.message, err.status, { details: err.details as Record<string, unknown> | undefined, requestId });
    throw err;
  }
  const supabase = await createClient();
  try {
    const empresa = await createCompanyHandler(
      supabase,
      { organization_id: authz.org.orgId, actor: { type: "user", id: authz.user.id }, requestId, idioma: authz.user.idioma },
      input,
    );
    return ok(empresa, { status: 201, requestId });
  } catch (err) {
    if (err instanceof ApiError) return fail(err.code, err.message, err.status, { details: err.details as Record<string, unknown> | undefined, requestId });
    throw err;
  }
}
