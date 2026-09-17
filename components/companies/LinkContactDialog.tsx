"use client";
import { useMemo, useState } from "react";
import { useT } from "@/hooks/i18n/useT";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { phoneForDisplay } from "@/lib/channels/phone-variants";
import { useContactList } from "@/hooks/contacts/useContactList";
import { useLinkCompanyContact } from "@/hooks/companies/useLinkCompanyContact";

interface Props {
  companyId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function LinkContactDialog({ companyId, open, onOpenChange }: Props) {
  const t = useT();
  const [search, setSearch] = useState("");
  const filters = useMemo(() => ({ search: search.trim() || undefined, limit: 10 }), [search]);
  const q = useContactList(filters);
  const { link } = useLinkCompanyContact(companyId);

  const contacts = useMemo(() => q.data?.pages.flatMap((p) => p.data) ?? [], [q.data]);

  async function vincular(contactId: string) {
    try {
      await link.mutateAsync(contactId);
    } catch {
      // hook handles toast
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Vincular contato")}</DialogTitle>
          <DialogDescription>{t("Busque um contato para vinculá-lo a esta empresa.")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            type="search"
            placeholder={t("Buscar por nome, email ou telefone…")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <ul className="max-h-72 divide-y overflow-y-auto">
            {contacts.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium">{c.display_name ?? c.name ?? t("Sem nome")}</div>
                  <div className="text-muted-foreground">{c.phone_number ? phoneForDisplay(c.phone_number) : "—"}</div>
                  {c.company_id && c.company_id !== companyId && (
                    <Badge variant="warning" className="mt-1">{t("já está em outra empresa")}</Badge>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={link.isPending}
                  onClick={() => void vincular(c.id)}
                >
                  {t("Vincular")}
                </Button>
              </li>
            ))}
            {!q.isLoading && contacts.length === 0 && (
              <li className="py-4 text-center text-sm text-muted-foreground">
                {t("Nenhum contato encontrado.")}
              </li>
            )}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
