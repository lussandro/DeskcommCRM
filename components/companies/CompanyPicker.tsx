"use client";
import { useEffect, useMemo, useState } from "react";
import { useT } from "@/hooks/i18n/useT";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useCompanyList } from "@/hooks/companies/useCompanyList";
import { NewCompanyDialog } from "@/components/companies/NewCompanyDialog";
import type { Company } from "@/lib/types/companies";

/** Sentinela: Radix `Select.Item` não aceita `value=""`. */
const NENHUMA = "__nenhuma__";
const NOVA = "__nova__";

export function useTemEmpresas(): boolean {
  const q = useCompanyList({ limit: 1 });
  return (q.data?.pages[0]?.data.length ?? 0) > 0;
}

interface Props {
  value: string | null;
  onChange: (companyId: string | null) => void;
}

export function CompanyPicker({ value, onChange }: Props) {
  const t = useT();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [newOpen, setNewOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const filters = useMemo(() => ({ search, limit: 50 }), [search]);
  const q = useCompanyList(filters);
  const companies = useMemo(() => q.data?.pages.flatMap((p) => p.data) ?? [], [q.data]);

  function handleCreated(company: Company) {
    setNewOpen(false);
    onChange(company.id);
  }

  return (
    <div className="space-y-2">
      <Select
        value={value ?? NENHUMA}
        onValueChange={(v) => {
          if (v === NOVA) {
            setNewOpen(true);
            return;
          }
          onChange(v === NENHUMA ? null : v);
        }}
      >
        <SelectTrigger id="ec-company">
          <SelectValue placeholder={t("Nenhuma")} />
        </SelectTrigger>
        <SelectContent>
          <div className="p-1">
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t("Buscar por nome, fantasia ou CNPJ…")}
              onKeyDown={(e) => e.stopPropagation()}
            />
          </div>
          <SelectItem value={NENHUMA}>{t("Nenhuma")}</SelectItem>
          {companies.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
          <SelectItem value={NOVA}>{t("Nova empresa…")}</SelectItem>
        </SelectContent>
      </Select>
      <NewCompanyDialog open={newOpen} onOpenChange={setNewOpen} onCreated={handleCreated} />
    </div>
  );
}
