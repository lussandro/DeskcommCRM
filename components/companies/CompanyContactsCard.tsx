"use client";
import Link from "next/link";
import { useState } from "react";
import { useT } from "@/hooks/i18n/useT";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { phoneForDisplay } from "@/lib/channels/phone-variants";
import { useLinkCompanyContact } from "@/hooks/companies/useLinkCompanyContact";
import { useUpdateCompany } from "@/hooks/companies/useUpdateCompany";
import { LinkContactDialog } from "@/components/companies/LinkContactDialog";
import type { Company, CompanyContact } from "@/lib/types/companies";

interface Props {
  company: Company;
  contacts: CompanyContact[];
  canWrite: boolean;
}

export function CompanyContactsCard({ company, contacts, canWrite }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const { unlink } = useLinkCompanyContact(company.id);
  const update = useUpdateCompany(company.id);

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{t("Contatos da empresa")}</h2>
        {canWrite && <Button size="sm" onClick={() => setOpen(true)}>{t("Vincular contato")}</Button>}
      </div>
      {contacts.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("Nenhum contato vinculado. Vincule quem fala por esta empresa.")}</p>
      ) : (
        <ul className="divide-y">
          {contacts.map((c) => (
            <li key={c.id} className="flex items-center justify-between py-2 text-sm">
              <div>
                <Link href={`/app/contacts/${c.id}`} className="font-medium hover:underline">
                  {c.display_name ?? c.name ?? t("Sem nome")}
                </Link>
                <div className="text-muted-foreground">{c.phone_number ? phoneForDisplay(c.phone_number) : "—"}</div>
              </div>
              <div className="flex items-center gap-2">
                {c.is_billing_contact ? (
                  <Badge data-testid="principal">{t("Número principal para cobrança")}</Badge>
                ) : canWrite ? (
                  <Button variant="ghost" size="sm" onClick={() => update.mutate({ billing_contact_id: c.id })}>
                    {t("Tornar principal")}
                  </Button>
                ) : null}
                {canWrite && (
                  <Button variant="ghost" size="sm" onClick={() => unlink.mutate(c.id)}>{t("Desvincular")}</Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <LinkContactDialog companyId={company.id} open={open} onOpenChange={setOpen} />
    </Card>
  );
}
