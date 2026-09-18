"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/hooks/i18n/useT";
import { salvarConfigMcp } from "@/app/actions/integrations/mcp";

const ERROS: Record<string, string> = {
  auth_required: "Faça login para salvar.",
  no_active_org: "Nenhuma organização ativa.",
  forbidden: "Apenas administradores podem configurar esta integração.",
  db_error: "Falha de banco ao salvar.",
  chave_obrigatoria: "Informe a chave de acesso do servidor.",
  url_invalida: "Endereço inválido — informe a URL completa do servidor MCP.",
  cifra_indisponivel: "Não foi possível cifrar a chave agora. Tente de novo em instantes.",
};

interface Props {
  precisaDeChave: boolean;
  urlAtual: string;
}

export function FormularioMcp({ precisaDeChave, urlAtual }: Props) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [url, setUrl] = useState(urlAtual);
  const [chave, setChave] = useState("");

  function salvar() {
    startTransition(async () => {
      const r = await salvarConfigMcp({ url, chave: chave.trim() || undefined });
      if (!r.ok) {
        toast.error(t(ERROS[r.error] ?? "Não foi possível salvar."));
        return;
      }
      setChave("");
      toast.success(t("Configuração salva. Teste a conexão para ver o que o servidor oferece."));
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="mcp-url">{t("Endereço do servidor MCP")}</Label>
        <Input
          id="mcp-url"
          type="url"
          autoComplete="off"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://erp.suaempresa.com/mcp"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="mcp-chave">
          {t("Chave de acesso")}
          {precisaDeChave ? " *" : ""}
        </Label>
        <Input
          id="mcp-chave"
          type="password"
          autoComplete="off"
          value={chave}
          onChange={(e) => setChave(e.target.value)}
          placeholder={precisaDeChave ? undefined : t("Deixe em branco para manter a chave atual")}
        />
      </div>

      <Button onClick={salvar} disabled={pending}>
        {pending ? t("Salvando…") : t("Salvar")}
      </Button>
    </div>
  );
}
