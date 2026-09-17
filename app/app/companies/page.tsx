import type { Metadata } from "next";
import { CompaniesListClient } from "./_client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Empresas" };

export default function CompaniesPage() {
  return <CompaniesListClient />;
}
