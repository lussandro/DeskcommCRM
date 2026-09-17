import type { Metadata } from "next";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { carregarCapacidadesDeIntegracao } from "@/lib/asaas/config";
import { CompaniesListClient } from "./_client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Empresas" };

export default async function CompaniesPage() {
  // Auth/org já garantidos pelo layout de /app; só falta a org para saber se
  // mostra a coluna Asaas (spec §5.2a) — org sem o módulo não vê diferença.
  const user = await loadAuthUser();
  const activeOrg = user ? await resolveActiveOrg(user) : null;
  const asaasAtivo = activeOrg
    ? (await carregarCapacidadesDeIntegracao(createAdminClient(), activeOrg.orgId)).has("asaas")
    : false;
  return <CompaniesListClient asaasAtivo={asaasAtivo} />;
}
