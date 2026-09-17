import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * POST   /api/v1/companies/[id]/contacts — vincula contato à empresa
 * DELETE /api/v1/companies/[id]/contacts — desvincula contato da empresa
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { ok, fail, noContent } from "@/lib/api/wrappers";
import { ApiError } from "@/lib/api/types";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { companyLinkContactSchema, validateRequest } from "@/lib/schemas";
import { linkContactHandler, unlinkContactHandler } from "@/lib/companies/handler";

export const dynamic = "force-dynamic";

async function parseBody(req: NextRequest) {
  return validateRequest(companyLinkContactSchema, req) as Promise<{ contact_id: string }>;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const { id } = await ctx.params;
  const authz = await requireRole("agent", { requestId, resource: "companies" });
  if (!authz.ok) return authz.response;
  let input: { contact_id: string };
  try {
    input = await parseBody(req);
  } catch (err) {
    if (err instanceof ApiError) return fail(err.code, err.message, err.status, { details: err.details as Record<string, unknown> | undefined, requestId });
    throw err;
  }
  const supabase = await createClient();
  try {
    await linkContactHandler(
      supabase,
      { organization_id: authz.org.orgId, actor: { type: "user", id: authz.user.id }, requestId, idioma: authz.user.idioma },
      { companyId: id, contactId: input.contact_id },
    );
    return ok({ linked: true }, { requestId });
  } catch (err) {
    if (err instanceof ApiError) return fail(err.code, err.message, err.status, { details: err.details as Record<string, unknown> | undefined, requestId });
    throw err;
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const { id } = await ctx.params;
  const authz = await requireRole("agent", { requestId, resource: "companies" });
  if (!authz.ok) return authz.response;
  let input: { contact_id: string };
  try {
    input = await parseBody(req);
  } catch (err) {
    if (err instanceof ApiError) return fail(err.code, err.message, err.status, { details: err.details as Record<string, unknown> | undefined, requestId });
    throw err;
  }
  const supabase = await createClient();
  try {
    await unlinkContactHandler(
      supabase,
      { organization_id: authz.org.orgId, actor: { type: "user", id: authz.user.id }, requestId, idioma: authz.user.idioma },
      { companyId: id, contactId: input.contact_id },
    );
    return noContent(requestId);
  } catch (err) {
    if (err instanceof ApiError) return fail(err.code, err.message, err.status, { details: err.details as Record<string, unknown> | undefined, requestId });
    throw err;
  }
}
