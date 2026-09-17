import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * GET    /api/v1/companies/[id] — fetch single (handler em @/lib/companies/handler)
 * PATCH  /api/v1/companies/[id] — update
 * DELETE /api/v1/companies/[id] — remove
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { ok, fail, noContent } from "@/lib/api/wrappers";
import { ApiError } from "@/lib/api/types";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { companyPatchSchema, validateRequest, type CompanyPatch } from "@/lib/schemas";
import { deleteCompanyHandler, getCompanyHandler, patchCompanyHandler } from "@/lib/companies/handler";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const { id } = await ctx.params;
  const authz = await requireRole("viewer", { requestId, resource: "companies" });
  if (!authz.ok) return authz.response;
  const supabase = await createClient();
  try {
    const empresa = await getCompanyHandler(
      supabase,
      { organization_id: authz.org.orgId, actor: { type: "user", id: authz.user.id }, requestId, idioma: authz.user.idioma },
      { companyId: id },
    );
    return ok(empresa, { requestId });
  } catch (err) {
    if (err instanceof ApiError) return fail(err.code, err.message, err.status, { details: err.details as Record<string, unknown> | undefined, requestId });
    throw err;
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const { id } = await ctx.params;
  const authz = await requireRole("agent", { requestId, resource: "companies" });
  if (!authz.ok) return authz.response;
  let input: CompanyPatch;
  try {
    input = (await validateRequest(companyPatchSchema, req)) as CompanyPatch;
  } catch (err) {
    if (err instanceof ApiError) return fail(err.code, err.message, err.status, { details: err.details as Record<string, unknown> | undefined, requestId });
    throw err;
  }
  const supabase = await createClient();
  try {
    const empresa = await patchCompanyHandler(
      supabase,
      { organization_id: authz.org.orgId, actor: { type: "user", id: authz.user.id }, requestId, idioma: authz.user.idioma },
      { companyId: id, patch: input },
    );
    return ok(empresa, { requestId });
  } catch (err) {
    if (err instanceof ApiError) return fail(err.code, err.message, err.status, { details: err.details as Record<string, unknown> | undefined, requestId });
    throw err;
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const { id } = await ctx.params;
  const authz = await requireRole("manager", { requestId, resource: "companies" });
  if (!authz.ok) return authz.response;
  const supabase = await createClient();
  try {
    await deleteCompanyHandler(
      supabase,
      { organization_id: authz.org.orgId, actor: { type: "user", id: authz.user.id }, requestId, idioma: authz.user.idioma },
      { companyId: id },
    );
    return noContent(requestId);
  } catch (err) {
    if (err instanceof ApiError) return fail(err.code, err.message, err.status, { details: err.details as Record<string, unknown> | undefined, requestId });
    throw err;
  }
}
