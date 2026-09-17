import { notFound, redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { carregarCapacidadesDeIntegracao } from "@/lib/asaas/config";
import { CompanyDetailClient } from "./_client";

export const dynamic = "force-dynamic";

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  const { id } = await params;
  const supabase = await createClient();
  // Filtra a org ATIVA, não só a RLS: ver app/app/contacts/[id]/page.tsx.
  const { data: company } = await supabase
    .from("crm_companies")
    .select("id, organization_id")
    .eq("organization_id", activeOrg.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!company) notFound();
  // Bloco Asaas só aparece com o módulo ativo (spec §5.2a) — org sem Asaas não vê diferença.
  const asaasAtivo = (await carregarCapacidadesDeIntegracao(createAdminClient(), activeOrg.orgId)).has("asaas");
  return <CompanyDetailClient companyId={id} asaasAtivo={asaasAtivo} />;
}
