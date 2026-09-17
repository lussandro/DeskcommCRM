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
import type { ResultadoValidacaoFluxo } from "@/lib/asaas/validacao-do-fluxo";
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

const MENSAGEM_MOTIVO: Record<string, string> = {
  inexistente: "Este fluxo não existe mais.",
  inativo: "Este fluxo está desativado.",
  gatilho_errado: "Este fluxo não é do tipo certo para a cobrança.",
  sem_agente: "Nenhum agente publicado arma este fluxo.",
  agente_sem_capacidades: "O agente deste fluxo não tem as capacidades de cobrança.",
};

interface Props {
  precisaDeChave: boolean;
  configAtual: AsaasConfig | null;
  pointers: Array<{ id: string; name: string }>;
  validacaoFluxo: ResultadoValidacaoFluxo | null;
  webhookUrl: string | null;
}

export function FormularioAsaas({ precisaDeChave, configAtual, pointers, validacaoFluxo, webhookUrl }: Props) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [apiKey, setApiKey] = useState("");
  const [ambiente, setAmbiente] = useState<"sandbox" | "producao">(configAtual?.ambiente ?? "sandbox");
  const [pointerId, setPointerId] = useState<string>(configAtual?.followup_pointer_id ?? "");
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
        followup_pointer_id: pointerId || null,
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
        <Label htmlFor="asaas-pointer">{t("Fluxo de retorno para cobrança vencida")}</Label>
        <Select value={pointerId || "__none__"} onValueChange={(v) => setPointerId(v === "__none__" ? "" : v)}>
          <SelectTrigger id="asaas-pointer">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">{t("Nenhum")}</SelectItem>
            {pointers.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {validacaoFluxo ? (
          <p className={`text-xs ${validacaoFluxo.ok ? "text-muted-foreground" : "text-destructive"}`}>
            {validacaoFluxo.ok
              ? validacaoFluxo.avisoTextoFixo
                ? t("Este fluxo tem mensagem fixa; recomendamos mensagem do assistente.")
                : t("O agente que arma este fluxo tem as capacidades de cobrança.")
              : t(MENSAGEM_MOTIVO[validacaoFluxo.motivo] ?? validacaoFluxo.detalhe)}
          </p>
        ) : null}
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
