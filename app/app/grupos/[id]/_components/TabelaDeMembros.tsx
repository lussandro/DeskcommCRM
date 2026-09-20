"use client";
import { Fragment, useState } from "react";
import { formatDistanceToNow } from "date-fns";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useT } from "@/hooks/i18n/useT";
import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";
import { Bell, BellSlash, CaretDown, CaretUp, Trash, WarningOctagon } from "@/lib/ui/icons";
import { useGroupAction, useGroupMembers, type GroupMemberRow } from "@/hooks/groups/useGroups";

interface Props {
  groupId: string;
  somosAdmin: boolean;
}

const PAPEL_LABEL: Record<GroupMemberRow["role"], string> = {
  participant: "Membro",
  admin: "Admin",
  superadmin: "Superadmin",
  left: "Saiu",
};

const DURACOES_DE_SILENCIO = [
  { label: "1 hora", ms: 60 * 60 * 1000 },
  { label: "24 horas", ms: 24 * 60 * 60 * 1000 },
  { label: "7 dias", ms: 7 * 24 * 60 * 60 * 1000 },
];

function estaSilenciado(iso: string | null): boolean {
  return !!iso && new Date(iso).getTime() > Date.now();
}

export function TabelaDeMembros({ groupId, somosAdmin }: Props) {
  const t = useT();
  const locale = useLocaleDeData();
  const q = useGroupMembers(groupId);
  const acao = useGroupAction(groupId);
  const [alvoRemover, setAlvoRemover] = useState<GroupMemberRow | null>(null);
  const [erros, setErros] = useState<Record<string, { texto: string | null; wahaStatus: number | null }>>({});

  const membros = q.data?.data ?? [];

  function executar(
    m: GroupMemberRow,
    acaoNome: "remover" | "promover" | "rebaixar" | "silenciar",
    silenciarAte?: string,
  ) {
    acao.mutate(
      { member_id: m.id, acao: acaoNome, silenciar_ate: silenciarAte },
      {
        onSuccess: (res) => {
          setErros((prev) => {
            const next = { ...prev };
            delete next[m.id];
            return next;
          });
          if (!res.data.pos_condicao_ok) {
            // Sucesso HTTP não é sucesso da ação — erro do WAHA cru (Regra Nº 1).
            setErros((prev) => ({
              ...prev,
              [m.id]: { texto: res.data.erro_texto, wahaStatus: res.data.waha_status_participante },
            }));
          }
        },
      },
    );
  }

  if (q.isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }
  if (q.isError) {
    return <p className="text-sm text-error-fg">{t("Erro ao carregar membros.")}</p>;
  }
  if (membros.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("Nenhum membro carregado ainda.")}</p>;
  }

  const motivoDesabilitado = t(
    "A sessão do WhatsApp não é administradora deste grupo — remover, promover e rebaixar não funcionam até isso mudar.",
  );

  return (
    <TooltipProvider>
      <div className="space-y-3">
        {!somosAdmin && (
          <div className="flex items-start gap-2 rounded-md border border-warning-bg bg-warning-bg/40 p-3 text-sm text-warning-fg">
            <WarningOctagon size={18} className="mt-0.5 shrink-0" aria-hidden />
            <p>{motivoDesabilitado}</p>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          {t(
            "Silenciar é um controle só do CRM: no WhatsApp a pessoa continua podendo escrever no grupo normalmente — o que muda é o agente de IA passar a ignorá-la.",
          )}
        </p>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Nome")}</TableHead>
              <TableHead>{t("Telefone")}</TableHead>
              <TableHead>{t("Papel")}</TableHead>
              <TableHead>{t("Strikes")}</TableHead>
              <TableHead>{t("Silêncio")}</TableHead>
              <TableHead className="text-right">{t("Ações")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {membros.map((m) => {
              const silenciado = estaSilenciado(m.silenciado_ate);
              const erro = erros[m.id];
              return (
                <Fragment key={m.id}>
                  <TableRow>
                    <TableCell className="font-medium">{m.push_name ?? t("(sem nome)")}</TableCell>
                    <TableCell className="text-muted-foreground">{m.wa_pn ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={m.role === "left" ? "neutral" : m.role === "participant" ? "neutral" : "info"}>
                        {t(PAPEL_LABEL[m.role])}
                      </Badge>
                    </TableCell>
                    <TableCell>{m.strikes}</TableCell>
                    <TableCell>
                      {silenciado ? (
                        <Badge variant="warning">
                          {t("até")} {formatDistanceToNow(new Date(m.silenciado_ate!), { addSuffix: true, locale })}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <Button
                                size="icon"
                                variant="ghost"
                                disabled={!somosAdmin || m.role === "left" || acao.isPending}
                                onClick={() => executar(m, "promover")}
                                aria-label={t("Promover a admin")}
                              >
                                <CaretUp size={16} aria-hidden />
                              </Button>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>{somosAdmin ? t("Promover a admin") : motivoDesabilitado}</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <Button
                                size="icon"
                                variant="ghost"
                                disabled={!somosAdmin || m.role === "left" || acao.isPending}
                                onClick={() => executar(m, "rebaixar")}
                                aria-label={t("Rebaixar a membro")}
                              >
                                <CaretDown size={16} aria-hidden />
                              </Button>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>{somosAdmin ? t("Rebaixar a membro") : motivoDesabilitado}</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <Button
                                size="icon"
                                variant="ghost"
                                disabled={!somosAdmin || m.role === "left" || acao.isPending}
                                onClick={() => setAlvoRemover(m)}
                                aria-label={t("Remover do grupo")}
                              >
                                <Trash size={16} aria-hidden />
                              </Button>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>{somosAdmin ? t("Remover do grupo") : motivoDesabilitado}</TooltipContent>
                        </Tooltip>

                        {silenciado ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                disabled={acao.isPending}
                                onClick={() => executar(m, "silenciar")}
                                aria-label={t("Remover silêncio")}
                              >
                                <Bell size={16} aria-hidden />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t("Remover silêncio")}</TooltipContent>
                          </Tooltip>
                        ) : (
                          <DropdownMenu>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    disabled={acao.isPending}
                                    aria-label={t("Silenciar")}
                                  >
                                    <BellSlash size={16} aria-hidden />
                                  </Button>
                                </DropdownMenuTrigger>
                              </TooltipTrigger>
                              <TooltipContent>{t("Silenciar (só para o agente de IA — não afeta o WhatsApp)")}</TooltipContent>
                            </Tooltip>
                            <DropdownMenuContent align="end">
                              {DURACOES_DE_SILENCIO.map((d) => (
                                <DropdownMenuItem
                                  key={d.label}
                                  onClick={() => executar(m, "silenciar", new Date(Date.now() + d.ms).toISOString())}
                                >
                                  {t(d.label)}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  {erro && (
                    <TableRow>
                      <TableCell colSpan={6} className="bg-error-bg/30 py-2 text-xs text-error-fg">
                        {/* Erro cru do WAHA, sem tradução — Regra Nº 1. */}
                        {erro.texto ?? t("A ação não teve efeito no WhatsApp.")}
                        {erro.wahaStatus !== null ? ` (waha_status_participante: ${erro.wahaStatus})` : ""}
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!alvoRemover} onOpenChange={(open) => !open && setAlvoRemover(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Remover do grupo?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {alvoRemover?.push_name ?? alvoRemover?.wa_pn ?? t("Este membro")}{" "}
              {t("sai do grupo no WhatsApp agora. Essa ação não tem desfazer automático.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (alvoRemover) executar(alvoRemover, "remover");
                setAlvoRemover(null);
              }}
            >
              {t("Remover")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}
