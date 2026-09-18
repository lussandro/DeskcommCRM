"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useT } from "@/hooks/i18n/useT";
import { ativarMcp, desativarMcp, esquecerChaveMcp, testarConexaoMcp } from "@/app/actions/integrations/mcp";

const ERROS: Record<string, string> = {
  auth_required: "Faça login para continuar.",
  no_active_org: "Nenhuma organização ativa.",
  forbidden: "Apenas administradores podem gerenciar esta integração.",
  db_error: "Falha de banco.",
  nao_configurado: "Informe o endereço e a chave do servidor primeiro.",
  conexao_falhou: "Não foi possível falar com o servidor.",
  integracao_ativa: "Desative a integração antes de esquecer a chave.",
};

interface Props {
  estado: "sem_linha" | "configurada" | "ativa" | "erro";
}

export function BotoesMcp({ estado }: Props) {
  const t = useT();
  const [pending, startTransition] = useTransition();

  function testar() {
    startTransition(async () => {
      const r = await testarConexaoMcp();
      if (!r.ok) {
        toast.error(r.mensagem);
        return;
      }
      toast.success(t("O servidor respondeu com {n} ferramentas.").replace("{n}", String(r.ferramentas)));
    });
  }

  function ativar() {
    startTransition(async () => {
      const r = await ativarMcp();
      if (r.ok) toast.success(t("Consulta ao sistema de gestão ativada."));
      else toast.error(r.mensagem ?? t(ERROS[r.error] ?? "Não foi possível ativar."));
    });
  }

  function desativar() {
    startTransition(async () => {
      const r = await desativarMcp();
      if (r.ok) toast.success(t("Consulta ao sistema de gestão desativada."));
      else toast.error(t(ERROS[r.error] ?? "Não foi possível desativar."));
    });
  }

  function esquecerChave() {
    startTransition(async () => {
      const r = await esquecerChaveMcp();
      if (r.ok) toast.success(t("Chave esquecida — a integração foi removida."));
      else toast.error(t(ERROS[r.error] ?? "Não foi possível remover."));
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" onClick={testar} disabled={pending}>
        {t("Testar conexão")}
      </Button>
      {estado === "ativa" ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" disabled={pending}>
              {t("Desativar")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("Desativar a consulta ao sistema de gestão?")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t(
                  "O assistente perde as cinco consultas na hora: pergunta sobre fatura, contrato ou bloqueio volta a virar atendimento humano.",
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
              <AlertDialogAction onClick={desativar}>{t("Desativar")}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : (
        <>
          <Button onClick={ativar} disabled={pending}>
            {t("Ativar")}
          </Button>
          <Button variant="ghost" onClick={esquecerChave} disabled={pending}>
            {t("Esquecer chave")}
          </Button>
        </>
      )}
    </div>
  );
}
