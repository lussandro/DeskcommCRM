/**
 * Integração Asaas — chave, ambiente, cerca de prorrogação, fluxo de retorno
 * para cobrança vencida e o endereço do aviso (webhook) que o Asaas chama.
 *
 * Só admin: a spec exige que a página inteira recuse quem não é admin (não só
 * esconder botão, como o Nuvemshop faz) — `notFound()`, não um card cinza.
 *
 * Estados: `sem_linha` (nunca configurado), `configurada` (linha existe, não
 * saudável), `ativa` (`status='healthy'`), `erro` (`status='error'`).
 */
import { notFound } from "next/navigation";

import { Receipt } from "@/lib/ui/icons";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { configSchema, type AsaasConfig } from "@/lib/asaas/config";
import { validarFluxoDeCobranca } from "@/lib/asaas/validacao-do-fluxo";
import { listSelectableChannels } from "@/lib/channels/selectable";
import { env } from "@/lib/env";
import { normalizarIdioma } from "@/lib/i18n/idiomas";
import { traduzir } from "@/lib/i18n/dicionario";
import { FormularioAsaas } from "./_components/FormularioAsaas";
import { BotoesAsaas } from "./_components/BotoesAsaas";

interface IntegrationRow {
  id: string;
  status: string;
  status_reason: string | null;
  store_metadata: unknown;
  webhook_path_token: string;
}

interface PointerOpcao {
  id: string;
  name: string;
  /** O número em que este fluxo fala — quem cobra é o agente publicado nele. */
  numero?: string | null;
  /** Por que este fluxo não serve, quando não serve. */
  problema?: string | null;
}

const STATUS_VIVOS = ["active", "waiting_reply", "paused_handoff", "paused_manual"] as const;

async function carregarIntegracao(admin: ReturnType<typeof createAdminClient>, orgId: string): Promise<IntegrationRow | null> {
  const { data } = await admin
    .from("tenant_integrations")
    .select("id, status, status_reason, store_metadata, webhook_path_token")
    .eq("organization_id", orgId)
    .eq("provider", "asaas")
    .maybeSingle();
  return (data as IntegrationRow | null) ?? null;
}

async function carregarPointers(admin: ReturnType<typeof createAdminClient>, orgId: string): Promise<PointerOpcao[]> {
  const { data } = await admin
    .from("followup_flow_pointers")
    .select("id, name")
    .eq("organization_id", orgId)
    .eq("status", "active")
    .eq("trigger_config->>kind", "webhook")
    .order("name");
  const pointers = (data as PointerOpcao[] | null) ?? [];

  // O número de cada fluxo, ao lado do nome: é o que torna "o financeiro errado
  // vai cobrar" visível ANTES de acontecer, em vez de depois, na conversa.
  const canais = await listSelectableChannels(admin, orgId);
  const telefone = new Map(canais.map((c) => [c.id, c.phone_number]));

  return Promise.all(
    pointers.map(async (p) => {
      const v = await validarFluxoDeCobranca(admin, orgId, p.id);
      return v.ok
        ? { ...p, numero: telefone.get(v.channelSessionId) ?? null, problema: null }
        : { ...p, numero: null, problema: v.detalhe };
    }),
  );
}

async function contarMatriculasVivas(admin: ReturnType<typeof createAdminClient>, orgId: string): Promise<number> {
  const { data: charges } = await admin
    .from("asaas_charges")
    .select("enrollment_id")
    .eq("organization_id", orgId)
    .not("enrollment_id", "is", null);
  const ids = [...new Set((charges ?? []).map((c) => c.enrollment_id as string))];
  if (ids.length === 0) return 0;
  const { count } = await admin
    .from("followup_enrollments")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .in("id", ids)
    .in("status", STATUS_VIVOS);
  return count ?? 0;
}

export default async function AsaasIntegrationPage() {
  const user = await loadAuthUser();
  const activeOrg = user ? await resolveActiveOrg(user) : null;
  if (!activeOrg) notFound();
  if (activeOrg.role !== "admin" && !user?.is_platform_admin) notFound();

  const idioma = normalizarIdioma(user?.locale ?? null);
  const admin = createAdminClient();

  const [integration, pointers] = await Promise.all([
    carregarIntegracao(admin, activeOrg.orgId),
    carregarPointers(admin, activeOrg.orgId),
  ]);

  const config: AsaasConfig | null = integration
    ? (configSchema.safeParse(integration.store_metadata ?? {}).success
        ? configSchema.parse(integration.store_metadata ?? {})
        : null)
    : null;

  const enrollmentsVivos = integration ? await contarMatriculasVivas(admin, activeOrg.orgId) : 0;

  const estado: "sem_linha" | "configurada" | "ativa" | "erro" = !integration
    ? "sem_linha"
    : integration.status === "healthy"
      ? "ativa"
      : integration.status === "error"
        ? "erro"
        : "configurada";

  const webhookUrl = integration
    ? `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/api/v1/webhooks/asaas/${integration.webhook_path_token}`
    : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <header className="flex items-start gap-4">
        <div className="rounded-md border border-border bg-surface p-3">
          <Receipt size={28} weight="duotone" className="text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">{traduzir("Asaas", idioma)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {traduzir(
              "Consulte cobranças, envie boleto e Pix, e deixe o assistente prorrogar vencido dentro do limite que você definir.",
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
            <CardTitle className="text-destructive">{traduzir("A conexão com o Asaas está com erro", idioma)}</CardTitle>
            <CardDescription>{integration?.status_reason ?? traduzir("Motivo não registrado.", idioma)}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {webhookUrl ? (
        <Card>
          <CardHeader>
            <CardTitle>{traduzir("Endereço do aviso do Asaas", idioma)}</CardTitle>
            <CardDescription>
              {traduzir("Cole este endereço em Configurações → Webhooks no painel do Asaas (Webhook no painel do Asaas).", idioma)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <code className="block break-all rounded-md border bg-muted p-3 text-sm">{webhookUrl}</code>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{traduzir("Configuração", idioma)}</CardTitle>
          <CardDescription>
            {estado === "sem_linha"
              ? traduzir("Informe a chave de API do Asaas para começar.", idioma)
              : traduzir("Troque a chave, o ambiente ou o fluxo de retorno.", idioma)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormularioAsaas
            precisaDeChave={estado === "sem_linha"}
            configAtual={config}
            pointers={pointers}
            webhookUrl={webhookUrl}
          />
        </CardContent>
      </Card>

      {integration ? (
        <Card>
          <CardHeader>
            <CardTitle>{traduzir("Ações", idioma)}</CardTitle>
          </CardHeader>
          <CardContent>
            <BotoesAsaas estado={estado} enrollmentsVivos={enrollmentsVivos} webhookUrl={webhookUrl ?? ""} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
