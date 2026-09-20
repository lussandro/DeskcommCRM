"use client";
import Link from "next/link";
import { ApiError } from "@/lib/api/types";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useT } from "@/hooks/i18n/useT";
import { ArrowBendUpLeft } from "@/lib/ui/icons";
import type { ModoDeGrupo } from "@/lib/grupos/tipos";
import { useGroupDetail, useUpdateGroupMode } from "@/hooks/groups/useGroups";
import { TabelaDeMembros } from "./_components/TabelaDeMembros";

interface Props {
  groupId: string;
  podeGerenciar: boolean;
}

const MODO_LABEL: Record<ModoDeGrupo, string> = {
  vigiado: "Vigiado — a IA não age sozinha",
  semi: "Semi-autônomo — a IA sugere, humano aprova",
  autonomo: "Autônomo — a IA age sozinha",
};

export function GroupDetailClient({ groupId, podeGerenciar }: Props) {
  const t = useT();
  const q = useGroupDetail(groupId);
  const trocarModo = useUpdateGroupMode(groupId);

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
        <p className="text-sm text-error-fg">
          {q.error instanceof ApiError ? q.error.message : t("Erro ao carregar o grupo.")}
        </p>
      </div>
    );
  }
  const grupo = q.data.data;

  return (
    <div className="space-y-4 p-6">
      <div>
        <Link
          href="/app/grupos"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-text"
        >
          <ArrowBendUpLeft size={14} aria-hidden />
          {t("Grupos")}
        </Link>
      </div>

      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{grupo.subject ?? grupo.wa_group_id}</h1>
          {grupo.description ? (
            <p className="mt-1 text-sm text-muted-foreground">{grupo.description}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="neutral">
              {grupo.size} {t("membros")}
            </Badge>
            {grupo.somos_admin ? (
              <Badge variant="success">{t("somos admin")}</Badge>
            ) : (
              <Badge variant="neutral">{t("não somos admin")}</Badge>
            )}
            {grupo.announce && <Badge variant="warning">{t("só admin envia mensagem")}</Badge>}
            {grupo.restrict_info && <Badge variant="neutral">{t("só admin edita o grupo")}</Badge>}
          </div>
        </div>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Select
                  value={grupo.modo}
                  disabled={!podeGerenciar || trocarModo.isPending}
                  onValueChange={(v) => trocarModo.mutate(v as ModoDeGrupo)}
                >
                  <SelectTrigger className="w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(MODO_LABEL) as ModoDeGrupo[]).map((m) => (
                      <SelectItem key={m} value={m}>
                        {t(MODO_LABEL[m])}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </span>
            </TooltipTrigger>
            {!podeGerenciar && (
              <TooltipContent>{t("Requer papel de gerente ou superior para trocar o modo.")}</TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      </header>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{t("Membros")}</h2>
        <TabelaDeMembros groupId={groupId} somosAdmin={grupo.somos_admin} />
      </Card>
    </div>
  );
}
