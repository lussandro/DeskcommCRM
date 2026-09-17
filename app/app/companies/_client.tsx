"use client";
import { useEffect, useMemo, useState } from "react";
import { useT } from "@/hooks/i18n/useT";
import { Plus, MagnifyingGlass, Buildings } from "@/lib/ui/icons";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty";
import { useCompanyList } from "@/hooks/companies/useCompanyList";
import { CompaniesTable } from "@/components/companies/CompaniesTable";
import { NewCompanyDialog } from "@/components/companies/NewCompanyDialog";

interface Props {
  asaasAtivo: boolean;
}

export function CompaniesListClient({ asaasAtivo }: Props) {
  const t = useT();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const filters = useMemo(() => ({ search, limit: 25 }), [search]);
  const q = useCompanyList(filters);

  const allCompanies = useMemo(() => q.data?.pages.flatMap((p) => p.data) ?? [], [q.data]);

  return (
    <div className="space-y-4 p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{t("Empresas")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("Clientes pessoa jurídica e os contatos de cada um.")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={16} weight="bold" aria-hidden />
            <span>{t("Nova empresa")}</span>
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-2">
        <div className="relative w-full sm:w-72">
          <MagnifyingGlass
            size={16}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            placeholder={t("Buscar por nome, fantasia ou CNPJ…")}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="h-9 w-full pl-8"
          />
        </div>
      </div>

      {q.isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : q.isError ? (
        <Card className="p-6 text-center">
          <p className="text-sm text-error-fg">{t("Erro ao carregar empresas.")}</p>
          <Button size="sm" variant="outline" className="mt-2" onClick={() => q.refetch()}>
            {t("Tentar novamente")}
          </Button>
        </Card>
      ) : allCompanies.length === 0 ? (
        <Card className="p-2">
          <EmptyState
            icon={Buildings}
            headline={t("Nenhuma empresa ainda.")}
            subcopy={t("Cadastre a primeira para agrupar os contatos de um mesmo cliente.")}
            primary={{ label: t("Nova empresa"), onClick: () => setCreateOpen(true) }}
          />
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden">
            <CompaniesTable companies={allCompanies} asaasAtivo={asaasAtivo} />
          </Card>
          <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {allCompanies.length} {allCompanies.length === 1 ? t("empresa") : t("empresas")}
              {q.hasNextPage ? ` ${t("carregadas — há mais resultados")}` : ""}
            </p>
            {q.hasNextPage && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => q.fetchNextPage()}
                disabled={q.isFetchingNextPage}
              >
                {q.isFetchingNextPage ? t("Carregando…") : t("Carregar mais")}
              </Button>
            )}
          </div>
        </>
      )}

      <NewCompanyDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
