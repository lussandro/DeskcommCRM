import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { tagDeIdioma } from "@/lib/i18n/datas";
import { traduzir } from "@/lib/i18n/dicionario";
import { CHAVES_DE_JORNADA, type ChaveDeJornada } from "@/lib/vertical/vinicola";
import { estadoDaJornada, lerLedger } from "@/lib/vertical/vinicola/aplicar";

import { JornadasClient, type EstadoNaTela } from "./_client";

export const dynamic = "force-dynamic";

/**
 * ⚠️ A PÁGINA É manager+, A AÇÃO CONTINUA admin.
 *
 * Mesmo desenho de `settings/tenant/pipelines`: quem é gerente VÊ o que cada
 * jornada cria e em que estado ela está — informação que ajuda a operação —, e
 * o botão só é desenhado para quem a ação aceitaria. Esconder o que a ação
 * recusaria é honestidade, não permissão nova: `aplicarJornadaDeVinicola`
 * recusa de novo no servidor, independentemente do que a tela desenhou.
 */
export default async function JornadasPage() {
  const user = await requireAuth();
  // `t` local em vez do hook: esta página é componente de SERVIDOR, e lá o
  // idioma vem resolvido em `user.idioma`.
  const t = (texto: string) => traduzir(texto, user.idioma);
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (!(user.is_platform_admin && !user.support) && ROLE_RANK[activeOrg.role] < ROLE_RANK.manager) {
    redirect("/403");
  }
  const podeAplicar =
    (user.is_platform_admin && !user.support) || ROLE_RANK[activeOrg.role] >= ROLE_RANK.admin;

  // O ledger é lido UMA vez para a data; o estado de cada jornada vem de
  // `estadoDaJornada`, que confere contra o banco se as peças ainda existem —
  // o ledger sozinho diria "aplicada" sobre um funil que alguém apagou ontem.
  const ledger = await lerLedger(activeOrg.orgId);
  const etiqueta = tagDeIdioma(user.idioma);
  const estados = Object.fromEntries(
    await Promise.all(
      CHAVES_DE_JORNADA.map(async (chave) => {
        const aplicadaEm = ledger[chave]?.aplicada_em;
        return [
          chave,
          {
            estado: await estadoDaJornada(activeOrg.orgId, chave),
            aplicadaEm: aplicadaEm ? new Date(aplicadaEm).toLocaleDateString(etiqueta) : null,
          },
        ] as const;
      }),
    ),
  ) as Record<ChaveDeJornada, EstadoNaTela>;

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("Jornadas")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("Funis, mensagens e lembretes prontos para cada jeito de vender vinho.")}
        </p>
      </header>
      <JornadasClient estados={estados} podeAplicar={podeAplicar} />
    </div>
  );
}
