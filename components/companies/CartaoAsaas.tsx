"use client";
import { useState } from "react";
import { format } from "date-fns";
import { useT } from "@/hooks/i18n/useT";
import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/types";
import { formatCents } from "@/lib/money";
import { useCompanyAsaas, useLinkCompanyAsaas } from "@/hooks/companies/useCompanyAsaas";

interface Props {
  companyId: string;
  canWrite: boolean;
}

/** Bloco Asaas da tela da empresa — só renderiza quando o módulo está ativo (spec §5.2a). */
export function CartaoAsaas({ companyId, canWrite }: Props) {
  const t = useT();
  const localeDaData = useLocaleDeData();
  const q = useCompanyAsaas(companyId);
  const link = useLinkCompanyAsaas(companyId);
  const [cnpj, setCnpj] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);

  async function vincular() {
    setServerError(null);
    try {
      await link.mutateAsync(cnpj);
      setCnpj("");
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : t("Não foi possível vincular. Tente novamente."));
    }
  }

  return (
    <Card className="space-y-3 p-4">
      <h2 className="text-sm font-semibold">Asaas</h2>

      {q.isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : q.isError ? (
        <p className="text-sm text-error-fg">
          {q.error instanceof ApiError ? q.error.message : t("Não foi possível carregar a integração Asaas.")}
        </p>
      ) : !q.data?.linked ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{t("Esta empresa ainda não está vinculada a um cliente do Asaas.")}</p>
          {canWrite && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1">
                <Label htmlFor="asaas-cnpj">CNPJ</Label>
                <Input
                  id="asaas-cnpj"
                  placeholder="00000000000000"
                  value={cnpj}
                  onChange={(e) => setCnpj(e.target.value)}
                />
              </div>
              <Button onClick={vincular} disabled={link.isPending || !cnpj.trim()}>
                {link.isPending ? t("Vinculando…") : t("Vincular pelo CNPJ")}
              </Button>
            </div>
          )}
          {serverError && <p className="text-sm text-error-fg">{serverError}</p>}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{t("Cliente do Asaas vinculado")}</p>
          {q.data.charges.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("Nenhuma pendência agora.")}</p>
          ) : (
            <ul className="divide-y">
              {q.data.charges.map((c) => (
                <li key={c.payment_id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <div>
                    <p className="font-medium">{formatCents(c.value_cents, "BRL")}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("Vencimento")}: {format(new Date(`${c.due_date}T00:00:00`), "dd/MM/yyyy", { locale: localeDaData })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={c.status === "OVERDUE" ? "error" : "info"}>{c.status}</Badge>
                    {c.invoice_url && (
                      <Button asChild size="sm" variant="link" className="h-auto px-0">
                        <a href={c.invoice_url} target="_blank" rel="noreferrer">
                          {t("Abrir boleto/fatura")}
                        </a>
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
