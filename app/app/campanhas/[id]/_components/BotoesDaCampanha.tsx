"use client";

/**
 * Começar e pausar — o gesto que faz mensagem sair para gente de verdade.
 *
 * Começar pede confirmação, e a confirmação DIZ O NÚMERO: "30 pessoas vão
 * receber pelo 554891972220". Um "tem certeza?" genérico é o tipo de aviso que
 * todo mundo aceita no automático; o número e a linha são o que fazem alguém
 * conferir antes de apertar.
 *
 * Pausar não pede confirmação: parar é sempre reversível e nunca é o gesto
 * perigoso.
 */
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

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
import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";

interface Props {
  campanhaId: string;
  status: string;
  pendentes: number;
  numero: string;
}

export function BotoesDaCampanha({ campanhaId, status, pendentes, numero }: Props) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function chamar(pausar: boolean) {
    startTransition(async () => {
      const r = await fetch(`/api/v1/campaigns/${campanhaId}/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(pausar ? { pause: true } : {}),
      });
      const corpo = await r.json().catch(() => null);
      if (!r.ok) {
        toast.error(corpo?.error?.message ?? t("Não foi possível mudar o estado da campanha."));
        return;
      }
      toast.success(pausar ? t("Campanha pausada.") : t("Campanha começou. A primeira mensagem sai no próximo minuto."));
      router.refresh();
    });
  }

  if (status === "done" || status === "cancelled") return null;

  if (status === "running") {
    return (
      <Button variant="secondary" onClick={() => chamar(true)} disabled={pending}>
        {t("Pausar")}
      </Button>
    );
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button disabled={pending || pendentes === 0}>
          {status === "paused" ? t("Retomar") : t("Começar a enviar")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("Começar a enviar?")}</AlertDialogTitle>
          <AlertDialogDescription>
            {`${pendentes} ${t("pessoa(s) vão receber esta mensagem pelo número")} ${numero}. ${t(
              "O envio sai um por vez, dentro do limite diário e da janela de horário do número. Você pode pausar a qualquer momento.",
            )}`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
          <AlertDialogAction onClick={() => chamar(false)}>{t("Começar a enviar")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
