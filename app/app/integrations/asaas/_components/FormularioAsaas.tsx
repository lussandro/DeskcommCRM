"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useT } from "@/hooks/i18n/useT";
import { salvarConfigAsaas } from "@/app/actions/integrations/asaas";
import type { AsaasConfig } from "@/lib/asaas/config";
import { TokenUmaVez } from "./TokenUmaVez";

const ERROS: Record<string, string> = {
  auth_required: "Faça login para salvar.",
  no_active_org: "Nenhuma organização ativa.",
  forbidden: "Apenas administradores podem configurar esta integração.",
  db_error: "Falha de banco ao salvar.",
  chave_obrigatoria: "Informe a chave de API do Asaas.",
  config_invalida: "Configuração inválida — confira os campos.",
  cifra_indisponivel: "Não foi possível cifrar o segredo agora. Tente de novo em instantes.",
};


interface Props {
  precisaDeChave: boolean;
  configAtual: AsaasConfig | null;
  pointers: Array<{ id: string; name: string; numero?: string | null; problema?: string | null }>;
  webhookUrl: string | null;
}

export function FormularioAsaas({ precisaDeChave, configAtual, pointers, webhookUrl }: Props) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [apiKey, setApiKey] = useState("");
  const [ambiente, setAmbiente] = useState<"sandbox" | "producao">(configAtual?.ambiente ?? "sandbox");
  const [pointerIds, setPointerIds] = useState<string[]>(configAtual?.followup_pointer_ids ?? []);
  const [dias, setDias] = useState<string>(configAtual?.reemissao?.dias ? String(configAtual.reemissao.dias) : "");
  const [maxPorCobranca, setMaxPorCobranca] = useState<string>(
    configAtual?.reemissao?.max_por_cobranca ? String(configAtual.reemissao.max_por_cobranca) : "",
  );
  const [tokenNovo, setTokenNovo] = useState<{ token: string; webhookUrl: string } | null>(null);
  const [erroReemissao, setErroReemissao] = useState<string | null>(null);

  function salvar() {
    setErroReemissao(null);
    startTransition(async () => {
      const diasNum = dias.trim() ? Number(dias) : undefined;
      const maxNum = maxPorCobranca.trim() ? Number(maxPorCobranca) : undefined;
      const r = await salvarConfigAsaas({
        apiKey: apiKey.trim() || undefined,
        ambiente,
        followup_pointer_ids: pointerIds,
        reemissao: diasNum !== undefined || maxNum !== undefined ? { dias: diasNum, max_por_cobranca: maxNum } : null,
      });
      if (!r.ok) {
        if (r.error === "config_invalida" && r.detalhe) {
          setErroReemissao(r.detalhe);
          toast.error(r.detalhe);
          return;
        }
        const msg = r.error === "fluxo_invalido" ? r.detalhe : ERROS[r.error];
        toast.error(t(msg ?? `Erro: ${r.error}`));
        return;
      }
      setApiKey("");
      // `r.webhookUrl` só vem na PRIMEIRA gravação (linha ainda não existia
      // quando a página renderizou — o prop `webhookUrl` do servidor está
      // desatualizado até o próximo carregamento).
      if (r.token && (r.webhookUrl ?? webhookUrl)) {
        setTokenNovo({ token: r.token, webhookUrl: r.webhookUrl ?? webhookUrl! });
      } else {
        toast.success(t("Configuração da Asaas salva."));
      }
    });
  }

  if (tokenNovo) {
    return <TokenUmaVez webhookUrl={tokenNovo.webhookUrl} token={tokenNovo.token} onFechar={() => setTokenNovo(null)} />;
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="asaas-api-key">
          {t("Chave de API do Asaas")}
          {precisaDeChave ? " *" : ""}
        </Label>
        <Input
          id="asaas-api-key"
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={precisaDeChave ? "$aact_..." : t("Deixe em branco para manter a chave atual")}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="asaas-ambiente">{t("Ambiente")}</Label>
        <Select value={ambiente} onValueChange={(v) => setAmbiente(v as "sandbox" | "producao")}>
          <SelectTrigger id="asaas-ambiente">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sandbox">{t("Sandbox (teste)")}</SelectItem>
            <SelectItem value="producao">{t("Produção")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>{t("Fluxos de retorno para cobrança vencida")}</Label>
        <p className="text-xs text-muted-foreground">
          {t("Um por número. Quem cobra é o agente publicado naquele número — a cobrança de um negócio não sai pela linha do outro.")}
        </p>
        <div className="space-y-2 rounded-md border border-border p-3">
          {/* Fluxo salvo que SUMIU da lista (foi desativado, ou trocou de
              gatilho) continuaria no estado sem checkbox nenhum para desmarcar —
              e a action recusa o save inteiro por causa dele. Sem esta linha, o
              admin não consegue nem trocar a chave de API. */}
          {pointerIds
            .filter((id) => !pointers.some((p) => p.id === id))
            .map((id) => (
              <label key={id} className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked onChange={() => setPointerIds((atual) => atual.filter((x) => x !== id))} />
                <span>
                  {t("Fluxo removido ou desativado")}
                  <span className="block text-xs text-destructive">{t("Desmarque para poder salvar.")}</span>
                </span>
              </label>
            ))}
          {pointers.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("Nenhum fluxo com gatilho de sistema externo. Crie um em Follow-ups.")}</p>
          ) : null}
          {pointers.map((p) => (
            <label key={p.id} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={pointerIds.includes(p.id)}
                disabled={!!p.problema && !pointerIds.includes(p.id)}
                onChange={(e) =>
                  setPointerIds((atual) => (e.target.checked ? [...atual, p.id] : atual.filter((id) => id !== p.id)))
                }
              />
              <span>
                {p.name}
                {p.numero ? <span className="ml-2 text-xs text-muted-foreground">{p.numero}</span> : null}
                {p.problema ? <span className="block text-xs text-destructive">{t(p.problema)}</span> : null}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="asaas-dias">{t("Prorrogar por até (dias)")}</Label>
          <Input id="asaas-dias" type="number" min={1} max={90} value={dias} onChange={(e) => setDias(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="asaas-max">{t("Vezes por cobrança")}</Label>
          <Input
            id="asaas-max"
            type="number"
            min={1}
            max={10}
            value={maxPorCobranca}
            onChange={(e) => setMaxPorCobranca(e.target.value)}
          />
        </div>
      </div>
      {erroReemissao ? <p className="text-xs text-destructive">{erroReemissao}</p> : null}

      <Button onClick={salvar} disabled={pending}>
        {pending ? t("Salvando…") : t("Salvar")}
      </Button>
    </div>
  );
}
