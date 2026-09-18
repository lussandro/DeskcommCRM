/**
 * Criar campanha. Só admin — disparar para uma lista de gente é gesto de quem
 * responde pela organização, e a policy da tabela cobra a mesma coisa no banco.
 */
import { notFound } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { listSelectableChannels } from "@/lib/channels/selectable";
import { traduzir } from "@/lib/i18n/dicionario";
import { normalizarIdioma } from "@/lib/i18n/idiomas";
import { createAdminClient } from "@/lib/supabase/admin";
import { FormularioDeCampanha } from "./_components/FormularioDeCampanha";

export const dynamic = "force-dynamic";

export default async function NovaCampanhaPage() {
  const user = await loadAuthUser();
  const activeOrg = user ? await resolveActiveOrg(user) : null;
  if (!activeOrg) notFound();
  if (activeOrg.role !== "admin" && !user?.is_platform_admin) notFound();

  const idioma = normalizarIdioma(user?.locale ?? null);
  const t = (texto: string) => traduzir(texto, idioma);
  const admin = createAdminClient();
  const [canais, { data: linhasDeTag }] = await Promise.all([
    listSelectableChannels(admin, activeOrg.orgId),
    // As etiquetas que EXISTEM nos contatos desta organização. Sem isto a tela
    // pediria que o operador digitasse a etiqueta de cabeça, e errar uma letra
    // devolveria "0 pessoas" sem dizer por quê.
    admin.from("contacts").select("tags").eq("organization_id", activeOrg.orgId).not("tags", "is", null).limit(5000),
  ]);
  const frequencia = new Map<string, number>();
  for (const linha of (linhasDeTag ?? []) as Array<{ tags: string[] | null }>) {
    for (const tag of linha.tags ?? []) frequencia.set(tag, (frequencia.get(tag) ?? 0) + 1);
  }
  const tags = [...frequencia.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24).map(([tag]) => tag);
  const fuso = "America/Sao_Paulo";

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <header>
        <h1 className="text-xl font-semibold">{t("Nova campanha")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("A campanha nasce parada. Nada é enviado até você conferir a lista e mandar começar.")}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("Configuração")}</CardTitle>
          <CardDescription>
            {t("O envio respeita o limite diário e a janela de horário do número — é o que evita o bloqueio da conta.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormularioDeCampanha
            canais={canais.map((c) => ({ id: c.id, rotulo: c.phone_number ?? c.display_name }))}
            tags={tags}
            fuso={fuso}
          />
        </CardContent>
      </Card>
    </div>
  );
}
