/**
 * Campanhas de prospecção ativa — a lista e a régua de cada uma.
 *
 * A régua É a tela: quem dispara para uma lista precisa ver quantos foram,
 * quantos pularam e POR QUÊ. Uma tela que mostrasse só nome e status deixaria
 * "pulei 40 pessoas" invisível, que é o número que decide se a lista presta.
 */
import Link from "next/link";
import { notFound } from "next/navigation";

import { Megaphone } from "@/lib/ui/icons";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizarIdioma } from "@/lib/i18n/idiomas";
import { traduzir } from "@/lib/i18n/dicionario";
import { listSelectableChannels } from "@/lib/channels/selectable";

export const dynamic = "force-dynamic";

const ROTULO_DE_STATUS: Record<string, string> = {
  draft: "Rascunho",
  running: "Enviando",
  paused: "Pausada",
  done: "Concluída",
  cancelled: "Cancelada",
};

interface CampanhaRow {
  id: string;
  name: string;
  status: string;
  channel_session_id: string;
  base_legal: string;
  started_at: string | null;
}

export default async function CampanhasPage() {
  const user = await loadAuthUser();
  const activeOrg = user ? await resolveActiveOrg(user) : null;
  if (!activeOrg) notFound();

  const idioma = normalizarIdioma(user?.locale ?? null);
  const t = (texto: string) => traduzir(texto, idioma);
  const admin = createAdminClient();

  const [{ data: campanhas }, canais] = await Promise.all([
    admin
      .from("campaigns")
      .select("id, name, status, channel_session_id, base_legal, started_at")
      .eq("organization_id", activeOrg.orgId)
      .order("created_at", { ascending: false }),
    listSelectableChannels(admin, activeOrg.orgId),
  ]);

  const lista = (campanhas ?? []) as CampanhaRow[];
  const telefone = new Map(canais.map((c) => [c.id, c.phone_number ?? c.display_name]));

  type Totais = { pending: number; sent: number; failed: number; skipped: number };
  const ZERO: Totais = { pending: 0, sent: 0, failed: 0, skipped: 0 };
  const totais = new Map<string, Totais>();
  if (lista.length > 0) {
    const { data: destinatarios } = await admin
      .from("campaign_recipients")
      .select("campaign_id, status")
      .eq("organization_id", activeOrg.orgId)
      .in("campaign_id", lista.map((c) => c.id));
    for (const d of destinatarios ?? []) {
      const chave = d.campaign_id as string;
      const atual = totais.get(chave) ?? { ...ZERO };
      const chaveStatus = d.status as keyof Totais;
      if (chaveStatus in atual) atual[chaveStatus] += 1;
      totais.set(chave, atual);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <header className="flex items-start gap-4">
        <div className="rounded-md border border-border bg-surface p-3">
          <Megaphone size={28} weight="duotone" className="text-muted-foreground" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">{t("Campanhas")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              "Prospecção ativa pelo WhatsApp, no ritmo que não queima o número: uma mensagem por vez, dentro da janela do canal.",
            )}
          </p>
        </div>
        <Link
          href="/app/campanhas/nova"
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
        >
          {t("Nova campanha")}
        </Link>
      </header>

      {lista.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("Nenhuma campanha ainda")}</CardTitle>
            <CardDescription>
              {t(
                "Uma campanha precisa de um número, um texto e a base legal do primeiro contato. Sem base legal declarada ela não começa — é o que separa prospecção de spam.",
              )}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {lista.map((c) => {
        const n = totais.get(c.id) ?? ZERO;
        const total = n.pending + n.sent + n.failed + n.skipped;
        return (
          <Card key={c.id}>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle className="text-base">{c.name}</CardTitle>
                <CardDescription>
                  {telefone.get(c.channel_session_id) ?? t("Número removido")} ·{" "}
                  {c.base_legal === "consent" ? t("Com consentimento") : t("Interesse legítimo")}
                </CardDescription>
              </div>
              <Badge variant={c.status === "running" ? "default" : "secondary"}>
                {t(ROTULO_DE_STATUS[c.status] ?? c.status)}
              </Badge>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
                <div>
                  <dt className="text-muted-foreground">{t("Na fila")}</dt>
                  <dd className="text-lg font-semibold">{n.pending}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("Enviadas")}</dt>
                  <dd className="text-lg font-semibold">{n.sent}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("Puladas")}</dt>
                  <dd className="text-lg font-semibold">{n.skipped}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("Falharam")}</dt>
                  <dd className="text-lg font-semibold">{n.failed}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("Total")}</dt>
                  <dd className="text-lg font-semibold">{total}</dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-muted-foreground">
                <Link href={`/app/campanhas/${c.id}`} className="underline">
                  {t("Ver quem recebeu e quem foi pulado")}
                </Link>
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
