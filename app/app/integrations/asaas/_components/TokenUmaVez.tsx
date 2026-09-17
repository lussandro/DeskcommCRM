"use client";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import { copyToClipboard } from "@/lib/clipboard";

interface Props {
  webhookUrl: string;
  token: string;
  onFechar: () => void;
}

/** Mostra URL + segredo do aviso em CLARO — a única vez que isso acontece. */
export function TokenUmaVez({ webhookUrl, token, onFechar }: Props) {
  const t = useT();

  function copiar(valor: string, mensagemOk: string) {
    void copyToClipboard(valor).then((ok) => {
      if (ok) toast.success(mensagemOk);
      else toast.error(t("Não foi possível copiar — selecione o texto acima."));
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
        {t("Copie e guarde agora — o segredo não será mostrado de novo.")}
      </div>

      <div className="space-y-1.5">
        <p className="text-sm font-medium">{t("Endereço do aviso (Webhook no painel do Asaas)")}</p>
        <code className="block break-all rounded-md border bg-muted p-3 text-sm">{webhookUrl}</code>
        <Button type="button" variant="secondary" size="sm" onClick={() => copiar(webhookUrl, t("Endereço copiado."))}>
          {t("Copiar endereço")}
        </Button>
      </div>

      <div className="space-y-1.5">
        <p className="text-sm font-medium">{t("Segredo do aviso")}</p>
        <code className="block break-all rounded-md border bg-muted p-3 text-sm">{token}</code>
        <Button type="button" variant="secondary" size="sm" onClick={() => copiar(token, t("Segredo copiado."))}>
          {t("Copiar segredo")}
        </Button>
      </div>

      <Button onClick={onFechar}>{t("Já copiei")}</Button>
    </div>
  );
}
