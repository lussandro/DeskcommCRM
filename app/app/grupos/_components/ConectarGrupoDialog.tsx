"use client";
import { ApiError } from "@/lib/api/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/hooks/i18n/useT";
import { useAvailableGroups, useRegisterGroup, type AvailableGroupRow } from "@/hooks/groups/useGroups";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConectarGrupoDialog({ open, onOpenChange }: Props) {
  const t = useT();
  const q = useAvailableGroups(open);
  const cadastrar = useRegisterGroup();
  const linhas = q.data?.data ?? [];

  function conectar(g: AvailableGroupRow) {
    cadastrar.mutate(
      { wa_group_id: g.wa_group_id, channel_session_id: g.channel_session_id },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("Ligar um grupo")}</DialogTitle>
          <DialogDescription>
            {t("Grupos que o WhatsApp conectado enxerga e ainda não estão cadastrados aqui.")}
          </DialogDescription>
        </DialogHeader>

        {q.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : q.isError ? (
          <p className="text-sm text-error-fg">
            {/* Erro cru do WAHA — nunca "falha na operação" (Regra Nº 1). */}
            {q.error instanceof ApiError ? q.error.message : t("Erro ao consultar grupos.")}
          </p>
        ) : linhas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("Nenhum grupo disponível — o WhatsApp conectado não vê grupo nenhum ainda.")}
          </p>
        ) : (
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {linhas.map((g) => (
              <li
                key={g.wa_group_id}
                className="flex items-center justify-between gap-2 rounded-md border border-border p-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{g.subject ?? g.wa_group_id}</p>
                  <p className="text-xs text-muted-foreground">
                    {g.size} {t("membros")}
                    {!g.somos_admin ? ` · ${t("não somos admin")}` : ""}
                  </p>
                </div>
                {g.ja_cadastrado ? (
                  <Badge variant="neutral">{t("já cadastrado")}</Badge>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => conectar(g)}
                    disabled={cadastrar.isPending}
                  >
                    {t("Cadastrar")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
