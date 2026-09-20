import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { GroupsListClient } from "./_client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Grupos" };

export default async function GroupsPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  return <GroupsListClient />;
}
