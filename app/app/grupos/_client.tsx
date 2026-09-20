"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import type { Locale } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/empty";
import { useT } from "@/hooks/i18n/useT";
import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";
import { Plus, UsersThree } from "@/lib/ui/icons";
import { useGroupList, type GroupRow } from "@/hooks/groups/useGroups";
import { ConectarGrupoDialog } from "./_components/ConectarGrupoDialog";

const MODO_LABEL: Record<GroupRow["modo"], string> = {
  vigiado: "Vigiado",
  semi: "Semi-autônomo",
  autonomo: "Autônomo",
};

function ultimoSync(iso: string | null, locale: Locale, t: (s: string) => string): string {
  if (!iso) return t("nunca sincronizado");
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale });
  } catch {
    return iso;
  }
}

export function GroupsListClient() {
  const t = useT();
  const locale = useLocaleDeData();
  const router = useRouter();
  const [conectarAberto, setConectarAberto] = useState(false);

  const q = useGroupList();
  const grupos = q.data?.data ?? [];

  return (
    <div className="space-y-4 p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{t("Grupos")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("Grupos de WhatsApp: membros, papéis e moderação pela tela.")}
          </p>
        </div>
        {grupos.length > 0 && (
          <Button onClick={() => setConectarAberto(true)}>
            <Plus size={16} weight="bold" aria-hidden />
            <span>{t("Ligar grupo")}</span>
          </Button>
        )}
      </header>

      {q.isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : q.isError ? (
        <Card className="p-6 text-center">
          <p className="text-sm text-error-fg">{t("Erro ao carregar grupos.")}</p>
          <Button size="sm" variant="outline" className="mt-2" onClick={() => q.refetch()}>
            {t("Tentar novamente")}
          </Button>
        </Card>
      ) : grupos.length === 0 ? (
        <Card className="p-2">
          <EmptyState
            icon={UsersThree}
            headline={t("Nenhum grupo cadastrado ainda.")}
            subcopy={t(
              "Ligue um grupo que o WhatsApp conectado já enxerga para começar a acompanhar membros e moderar pela tela.",
            )}
            primary={{ label: t("Ligar grupo"), onClick: () => setConectarAberto(true) }}
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Grupo")}</TableHead>
                <TableHead>{t("Membros")}</TableHead>
                <TableHead>{t("Modo")}</TableHead>
                <TableHead>{t("Admin")}</TableHead>
                <TableHead>{t("Último sync")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grupos.map((g) => (
                <TableRow
                  key={g.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/app/grupos/${g.id}`)}
                >
                  <TableCell className="font-medium">{g.subject ?? g.wa_group_id}</TableCell>
                  <TableCell>{g.size}</TableCell>
                  <TableCell>
                    <Badge variant="neutral">{t(MODO_LABEL[g.modo])}</Badge>
                  </TableCell>
                  <TableCell>
                    {g.somos_admin ? (
                      <Badge variant="success">{t("somos admin")}</Badge>
                    ) : (
                      <Badge variant="neutral">{t("não somos admin")}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {ultimoSync(g.last_synced_at, locale, t)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <ConectarGrupoDialog open={conectarAberto} onOpenChange={setConectarAberto} />
    </div>
  );
}
