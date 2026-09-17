import { notFound, redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { carregarCapacidadesDeIntegracao } from "@/lib/asaas/config";
import { ContactDetailClient } from "./_client";

export const dynamic = "force-dynamic";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  const { id } = await params;
  const supabase = await createClient();
  // Filtra a org ATIVA, não só a RLS: para quem é membro de duas organizações a
  // policy deixa passar as duas, e a tela abriria o contato da org que não está
  // selecionada — com o dossiê do cliente carregando vazio por baixo.
  const { data: contact } = await supabase
    .from("contacts")
    .select("id, organization_id")
    .eq("organization_id", activeOrg.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!contact) notFound();
  // Com o módulo Asaas ativo, o campo "Empresa" aparece mesmo sem empresa
  // cadastrada ainda (spec §5.2a) — é o caminho para vincular a primeira.
  const asaasAtivo = (await carregarCapacidadesDeIntegracao(createAdminClient(), activeOrg.orgId)).has("asaas");
  return <ContactDetailClient contactId={id} asaasAtivo={asaasAtivo} />;
}
