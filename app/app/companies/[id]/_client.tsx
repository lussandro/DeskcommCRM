"use client";

import { useState } from "react";
import { useT } from "@/hooks/i18n/useT";
import { PencilSimple } from "@/lib/ui/icons";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompany } from "@/hooks/companies/useCompany";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { ROLE_RANK } from "@/lib/auth/types";
import { EditCompanyDialog } from "@/components/companies/EditCompanyDialog";
import { CompanyContactsCard } from "@/components/companies/CompanyContactsCard";
import { CartaoAsaas } from "@/components/companies/CartaoAsaas";
import { formatarCnpj } from "@/lib/companies/cnpj";

interface Props {
  companyId: string;
  asaasAtivo: boolean;
}

export function CompanyDetailClient({ companyId, asaasAtivo }: Props) {
  const t = useT();
  const q = useCompany(companyId);
  const { activeOrg } = useAuth();
  const [editOpen, setEditOpen] = useState(false);

  // Mesmo corte da rota (`requireRole("agent")` em POST/PATCH): viewer lê, agent+ escreve.
  const canWrite = Boolean(activeOrg && ROLE_RANK[activeOrg.role] >= ROLE_RANK.agent);

  if (q.isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (q.isError || !q.data) {
    return (
      <div className="p-6">
        <Card className="p-6 text-center text-sm text-error-fg">{t("Erro ao carregar empresa.")}</Card>
      </div>
    );
  }

  const company = q.data.data;
  const contacts = company.contacts ?? [];

  return (
    <div className="space-y-4 p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-semibold tracking-tight">{company.name}</h1>
          {company.trade_name && (
            <p className="mt-1 text-sm text-muted-foreground">{company.trade_name}</p>
          )}
        </div>
        {canWrite && (
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" onClick={() => setEditOpen(true)} className="shrink-0">
              <PencilSimple size={16} weight="bold" aria-hidden />
              <span>{t("Editar")}</span>
            </Button>
          </div>
        )}
      </header>

      <Card className="space-y-3 p-4">
        <h2 className="text-sm font-semibold">{t("Dados")}</h2>
        <dl className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
          <div>
            <dt className="text-xs uppercase text-muted-foreground">{t("Nome")}</dt>
            <dd className="mt-1">{company.name}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted-foreground">{t("Nome fantasia")}</dt>
            <dd className="mt-1">{company.trade_name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted-foreground">CNPJ</dt>
            <dd className="mt-1">{company.cnpj ? formatarCnpj(company.cnpj) : "—"}</dd>
          </div>
          <div className="md:col-span-2">
            <dt className="text-xs uppercase text-muted-foreground">{t("Observações")}</dt>
            <dd className="mt-1 whitespace-pre-wrap">{company.notes ?? "—"}</dd>
          </div>
        </dl>
      </Card>

      <CompanyContactsCard company={company} contacts={contacts} canWrite={canWrite} />

      {asaasAtivo && <CartaoAsaas companyId={company.id} canWrite={canWrite} />}

      <EditCompanyDialog company={company} open={editOpen} onOpenChange={setEditOpen} />
    </div>
  );
}
