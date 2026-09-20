import { notFound, redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { GroupDetailClient } from "./_client";

export const dynamic = "force-dynamic";

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  const { id } = await params;
  const supabase = await createClient();
  const { data: grupo } = await supabase
    .from("whatsapp_groups")
    .select("id, organization_id")
    .eq("organization_id", activeOrg.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!grupo) notFound();

  const podeGerenciar = ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager;
  return <GroupDetailClient groupId={id} podeGerenciar={podeGerenciar} />;
}
