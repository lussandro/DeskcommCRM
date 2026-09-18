/**
 * Integração com o sistema de gestão (ERP) do cliente por MCP — endereço,
 * chave, teste de conexão e O QUE SE GANHOU COM ELE.
 *
 * Só admin, e com `notFound()` na própria página (D7) — não basta esconder o
 * botão. Estados: `sem_linha`, `configurada`, `ativa` (`healthy`), `erro`.
 *
 * O cartão das consultas é o LAÇO DE RETORNO desta feature: depois do teste, o
 * admin vê quantas ferramentas o servidor expõe e quais das cinco consultas
 * ficaram realmente disponíveis. Sem ele, ligar a integração seria um ato de fé
 * — e "disponível" viraria uma palavra que ninguém mediu.
 */
import { notFound } from "next/navigation";

import { PlugsConnected } from "@/lib/ui/icons";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CONSULTAS_DO_ERP, metadataErpMcpSchema } from "@/lib/erp-mcp/config";
import { normalizarIdioma } from "@/lib/i18n/idiomas";
import { tagDeIdioma } from "@/lib/i18n/datas";
import { traduzir } from "@/lib/i18n/dicionario";
import { FormularioMcp } from "./_components/FormularioMcp";
import { BotoesMcp } from "./_components/BotoesMcp";

interface IntegrationRow {
  id: string;
  status: string;
  status_reason: string | null;
  store_metadata: unknown;
  last_health_check_at: string | null;
}

export default async function McpIntegrationPage() {
  const user = await loadAuthUser();
  const activeOrg = user ? await resolveActiveOrg(user) : null;
  if (!activeOrg) notFound();
  if (activeOrg.role !== "admin" && !user?.is_platform_admin) notFound();

  const idioma = normalizarIdioma(user?.locale ?? null);
  const admin = createAdminClient();

  const { data } = await admin
    .from("tenant_integrations")
    .select("id, status, status_reason, store_metadata, last_health_check_at")
    .eq("organization_id", activeOrg.orgId)
    .eq("provider", "mcp")
    .maybeSingle();
  const integration = (data as IntegrationRow | null) ?? null;

  const parsed = integration ? metadataErpMcpSchema.safeParse(integration.store_metadata ?? {}) : null;
  const metadata = parsed?.success ? parsed.data : null;

  const estado: "sem_linha" | "configurada" | "ativa" | "erro" = !integration
    ? "sem_linha"
    : integration.status === "healthy"
      ? "ativa"
      : integration.status === "error"
        ? "erro"
        : "configurada";

  const catalogo = metadata?.catalogo ?? [];
  const disponiveis = CONSULTAS_DO_ERP.filter((c) => catalogo.includes(c.metodo));

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <header className="flex items-start gap-4">
        <div className="rounded-md border border-border bg-surface p-3">
          <PlugsConnected size={28} weight="duotone" className="text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">{traduzir("Sistema de gestão (MCP)", idioma)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {traduzir(
              "Deixe o assistente consultar contrato, fatura e situação do cliente direto no seu sistema de gestão. Só consulta — nada é alterado lá.",
              idioma,
            )}
          </p>
        </div>
        {estado === "ativa" ? (
          <Badge variant="secondary" className="ml-auto">
            {traduzir("Ativa", idioma)}
          </Badge>
        ) : null}
      </header>

      {estado === "erro" ? (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">{traduzir("A conexão com o sistema de gestão está com erro", idioma)}</CardTitle>
            <CardDescription>{integration?.status_reason ?? traduzir("Motivo não registrado.", idioma)}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{traduzir("Configuração", idioma)}</CardTitle>
          <CardDescription>
            {estado === "sem_linha"
              ? traduzir("Informe o endereço do servidor MCP e a chave de acesso para começar.", idioma)
              : traduzir("Troque o endereço ou a chave. A chave em branco mantém a atual.", idioma)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormularioMcp precisaDeChave={estado === "sem_linha"} urlAtual={metadata?.url ?? ""} />
        </CardContent>
      </Card>

      {integration ? (
        <Card>
          <CardHeader>
            <CardTitle>{traduzir("O que o assistente ganhou", idioma)}</CardTitle>
            <CardDescription>
              {catalogo.length === 0
                ? traduzir("Ainda não testamos a conexão — teste para ver o que este servidor oferece.", idioma)
                : `${traduzir("O servidor expõe {n} ferramentas.", idioma).replace("{n}", String(catalogo.length))} ${
                    integration.last_health_check_at
                      ? `${traduzir("Último teste:", idioma)} ${new Date(integration.last_health_check_at).toLocaleString(tagDeIdioma(idioma))}`
                      : ""
                  }`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <ul className="space-y-1 text-sm">
              {CONSULTAS_DO_ERP.map((c) => {
                const temNoServidor = catalogo.includes(c.metodo);
                return (
                  <li key={c.ferramenta} className="flex items-center justify-between gap-3">
                    <span>{traduzir(c.rotulo, idioma)}</span>
                    <Badge variant={temNoServidor ? "secondary" : "outline"}>
                      {temNoServidor ? traduzir("Disponível", idioma) : traduzir("Não encontrada no servidor", idioma)}
                    </Badge>
                  </li>
                );
              })}
            </ul>
            {catalogo.length > 0 && disponiveis.length === 0 ? (
              <p className="text-xs text-destructive">
                {traduzir(
                  "O servidor respondeu, mas nenhuma das cinco consultas foi encontrada nele. Confira se é o servidor certo.",
                  idioma,
                )}
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {traduzir(
                "As consultas partem do CPF ou CNPJ do cadastro do cliente. Sem documento na ficha, o assistente pede o documento e abre um atendimento para alguém completar o cadastro.",
                idioma,
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {traduzir("Marque as consultas nas ferramentas do agente para ele poder usá-las.", idioma)}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {integration ? (
        <Card>
          <CardHeader>
            <CardTitle>{traduzir("Ações", idioma)}</CardTitle>
          </CardHeader>
          <CardContent>
            <BotoesMcp estado={estado} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
