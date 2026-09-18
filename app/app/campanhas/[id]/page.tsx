/**
 * Uma campanha: o texto, a régua e, principalmente, QUEM foi pulado e por quê.
 *
 * O motivo do pulo é o dado mais útil da tela — "40 pulados" sem motivo não
 * ensina nada; "40 pediram para não receber" muda a lista, e "40 sem telefone"
 * muda o cadastro.
 */
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizarIdioma } from "@/lib/i18n/idiomas";
import { traduzir } from "@/lib/i18n/dicionario";
import { rotuloDoContato } from "@/lib/contacts/rotulo-do-contato";
import { enviosPorDia, funilDaCampanha, motivosDePulo, taxa } from "@/lib/campanha/desempenho";
import { GraficosDaCampanha } from "./_components/GraficosDaCampanha";

export const dynamic = "force-dynamic";

const ROTULO_DE_STATUS: Record<string, string> = {
  pending: "Na fila",
  sent: "Enviada",
  failed: "Falhou",
  skipped: "Pulado",
};

export default async function CampanhaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await loadAuthUser();
  const activeOrg = user ? await resolveActiveOrg(user) : null;
  if (!activeOrg) notFound();

  const idioma = normalizarIdioma(user?.locale ?? null);
  const t = (texto: string) => traduzir(texto, idioma);
  const admin = createAdminClient();

  const { data: campanha } = await admin
    .from("campaigns")
    .select("id, name, status, template_body, base_legal, lia_ref, started_at, finished_at")
    .eq("organization_id", activeOrg.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!campanha) notFound();

  // `messages` traz entregue/lido (ACK do WAHA) e `conversations.last_inbound_at`
  // responde "a pessoa voltou a falar depois que a mensagem saiu?" — que é a
  // única definição de RESPOSTA que não depende de o modelo interpretar texto.
  const { data: destinatarios } = await admin
    .from("campaign_recipients")
    .select(
      "id, status, skip_reason, sent_at, contacts(name, display_name, phone_number), messages(delivered_at, read_at, conversation_id, conversations(last_inbound_at))",
    )
    .eq("organization_id", activeOrg.orgId)
    .eq("campaign_id", id)
    .order("created_at", { ascending: true })
    .limit(500);

  const linhas = (destinatarios ?? []) as unknown as Array<{
    id: string;
    status: string;
    skip_reason: string | null;
    sent_at: string | null;
    contacts: { name: string | null; display_name: string | null; phone_number: string | null } | null;
    messages: { delivered_at: string | null; read_at: string | null; conversations: { last_inbound_at: string | null } | null } | null;
  }>;

  const paraODesempenho = linhas.map((d) => {
    const ultimaEntrada = d.messages?.conversations?.last_inbound_at ?? null;
    return {
      status: d.status,
      skip_reason: d.skip_reason,
      sent_at: d.sent_at,
      delivered_at: d.messages?.delivered_at ?? null,
      read_at: d.messages?.read_at ?? null,
      // Respondeu = falou DEPOIS de a nossa mensagem sair. Sem a comparação, uma
      // conversa antiga contaria como resposta à campanha.
      responded_at: ultimaEntrada && d.sent_at && ultimaEntrada > d.sent_at ? ultimaEntrada : null,
    };
  });
  const funil = funilDaCampanha(paraODesempenho);
  const porDia = enviosPorDia(paraODesempenho);
  const pulos = motivosDePulo(paraODesempenho);
  const pct = (parte: number) => {
    const v = taxa(parte, funil.enviadas);
    return v === null ? "—" : `${v}%`;
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <header>
        <h1 className="text-xl font-semibold">{campanha.name as string}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {campanha.base_legal === "consent"
            ? t("Com consentimento")
            : `${t("Interesse legítimo")} · ${(campanha.lia_ref as string | null) ?? t("sem referência")}`}
        </p>
      </header>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { rotulo: t("Enviadas"), valor: String(funil.enviadas), nota: t("de toda a lista") },
          { rotulo: t("Entregues"), valor: String(funil.entregues), nota: pct(funil.entregues) },
          { rotulo: t("Lidas"), valor: String(funil.lidas), nota: pct(funil.lidas) },
          { rotulo: t("Responderam"), valor: String(funil.responderam), nota: pct(funil.responderam) },
        ].map((k) => (
          <div key={k.rotulo} className="rounded-lg border border-border bg-card p-3">
            <dt className="text-xs text-muted-foreground">{k.rotulo}</dt>
            <dd className="text-2xl font-semibold">{k.valor}</dd>
            <dd className="text-xs text-muted-foreground">{k.nota}</dd>
          </div>
        ))}
      </dl>

      <GraficosDaCampanha funil={funil} porDia={porDia} pulos={pulos} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("A mensagem")}</CardTitle>
          <CardDescription>{t("É o que cada pessoa da lista recebe, com o nome dela no lugar da variável.")}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap rounded-md border border-border bg-surface p-3 text-sm">
            {campanha.template_body as string}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("Quem está na lista")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {linhas.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("Nenhum destinatário ainda.")}</p>
          ) : null}
          {linhas.map((d) => (
            <div key={d.id} className="flex items-start justify-between gap-3 border-b border-border pb-2 text-sm last:border-0">
              <div>
                <p>{rotuloDoContato({ name: d.contacts?.name ?? null, display_name: d.contacts?.display_name ?? null, phone_number: d.contacts?.phone_number ?? null })}</p>
                {d.skip_reason ? <p className="text-xs text-muted-foreground">{d.skip_reason}</p> : null}
              </div>
              <Badge variant={d.status === "sent" ? "default" : "secondary"}>
                {t(ROTULO_DE_STATUS[d.status] ?? d.status)}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
