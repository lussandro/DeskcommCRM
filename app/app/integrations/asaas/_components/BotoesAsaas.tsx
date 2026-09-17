"use client";

import { useState, useTransition } from "react";
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
import { ativarAsaas, desativarAsaas, esquecerChaveAsaas, girarTokenAsaas, testarConexaoAsaas } from "@/app/actions/integrations/asaas";
import { TokenUmaVez } from "./TokenUmaVez";

const ERROS: Record<string, string> = {
  auth_required: "Faça login para continuar.",
  no_active_org: "Nenhuma organização ativa.",
  forbidden: "Apenas administradores podem gerenciar esta integração.",
  db_error: "Falha de banco.",
  nao_configurado: "Configure a chave do Asaas primeiro.",
  cifra_indisponivel: "Não foi possível cifrar o segredo agora. Tente de novo em instantes.",
  conexao_falhou: "Não foi possível conectar ao Asaas.",
};

interface Props {
  estado: "sem_linha" | "configurada" | "ativa" | "erro";
  enrollmentsVivos: number;
  webhookUrl: string;
}

/** `{n}` é placeholder estático — o `t()` recebe sempre literal, nunca template. */
function textoDeConfirmacao(t: (texto: string) => string, n: number): string {
  if (n === 0) {
    return t("Nenhuma cobrança está em acompanhamento agora. A integração para de consultar e prorrogar boletos.");
  }
  if (n === 1) {
    return t(
      "Isso vai cancelar 1 cobrança em acompanhamento pelo assistente. A cobrança em si continua no Asaas — só o acompanhamento automático para.",
    );
  }
  return t(
    "Isso vai cancelar {n} cobranças em acompanhamento pelo assistente. A cobrança em si continua no Asaas — só o acompanhamento automático para.",
  ).replace("{n}", String(n));
}

export function BotoesAsaas({ estado, enrollmentsVivos, webhookUrl }: Props) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [tokenNovo, setTokenNovo] = useState<string | null>(null);

  function testar() {
    startTransition(async () => {
      const r = await testarConexaoAsaas();
      if (r.ok) toast.success(t(r.mensagem));
      else toast.error(r.mensagem);
    });
  }

  function ativar() {
    startTransition(async () => {
      const r = await ativarAsaas();
      if (r.ok) toast.success(t("Integração Asaas ativada."));
      else toast.error(r.mensagem ?? t(ERROS[r.error] ?? `Erro: ${r.error}`));
    });
  }

  function girarToken() {
    startTransition(async () => {
      const r = await girarTokenAsaas();
      if (r.ok) setTokenNovo(r.token);
      else toast.error(t(ERROS[r.error] ?? `Erro: ${r.error}`));
    });
  }

  function desativar() {
    startTransition(async () => {
      const r = await desativarAsaas();
      if (r.ok) toast.success(t("Integração Asaas desativada."));
      else toast.error(t(ERROS[r.error] ?? `Erro: ${r.error}`));
    });
  }

  function esquecerChave() {
    startTransition(async () => {
      const r = await esquecerChaveAsaas();
      if (r.ok) toast.success(t("Chave esquecida — a integração foi removida."));
      else toast.error(t(ERROS[r.error] ?? `Erro: ${r.error}`));
    });
  }

  if (tokenNovo) {
    return <TokenUmaVez webhookUrl={webhookUrl} token={tokenNovo} onFechar={() => setTokenNovo(null)} />;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {estado === "ativa" ? (
        <>
          <Button variant="secondary" onClick={girarToken} disabled={pending}>
            {t("Gerar novo token")}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={pending}>
                {t("Desativar")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("Desativar a integração Asaas?")}</AlertDialogTitle>
                <AlertDialogDescription>{textoDeConfirmacao(t, enrollmentsVivos)}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
                <AlertDialogAction onClick={desativar}>{t("Desativar")}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      ) : (
        <>
          <Button variant="secondary" onClick={testar} disabled={pending}>
            {t("Testar conexão")}
          </Button>
          <Button onClick={ativar} disabled={pending}>
            {t("Ativar")}
          </Button>
        </>
      )}
      <Button variant="ghost" onClick={esquecerChave} disabled={pending}>
        {t("Esquecer chave")}
      </Button>
    </div>
  );
}
