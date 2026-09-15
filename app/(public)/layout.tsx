import { LogotipoDoProduto } from "@/components/branding/MarcaDoProduto";
import { marcaEhADoProduto } from "@/lib/branding";
import { marcaDaSaida } from "@/lib/branding/saida";
import { createClient } from "@/lib/supabase/server";
import { IdiomaProvider } from "@/lib/i18n/IdiomaProvider";
import { traduzir } from "@/lib/i18n/dicionario";
import { normalizarIdioma } from "@/lib/i18n/idiomas";

/**
 * A casca das telas de acesso — login, cadastro, recuperação, MFA.
 *
 * ── Por que o LOGO mora aqui, e não em `login/page.tsx` ───────────────────────
 *
 * São seis telas no grupo `(public)`, e todas são "antes de entrar": quem instala
 * o produto para clientes mostra a marca dele exatamente aí. Um `<img>` por
 * página seriam seis cópias que divergem na primeira vez que alguém mexer numa
 * só — e a que ficaria para trás é sempre a que ninguém abre (recuperação de
 * senha, cadastro de MFA), que é justamente onde o cliente do revendedor
 * aparece sozinho e sem contexto.
 *
 * ── Por que `marcaDaSaida(null)` ──────────────────────────────────────────────
 *
 * Aqui não existe organização resolvida: `null` é a declaração disso, e a pilha
 * resultante é a mesma do layout raiz (banco acima, `.env` embaixo). Montar a
 * pilha à mão nesta tela faria a fachada anunciar uma precedência que o resto do
 * produto não usa. E `marcaDaSaida` NUNCA lança (ver o cabeçalho dela): uma cor
 * ou um logo mal gravados não podem derrubar a única tela por onde se entra para
 * corrigi-los.
 *
 * Sem logo configurado E com o nome padrão, a fachada mostra o logotipo do
 * PRODUTO (`components/branding/MarcaDoProduto.tsx`) — inline, sem `<img>`,
 * para que `tests/e2e/marca-logo.spec.ts` continue medindo "a fachada está sem
 * `<img>`" como "sem logo do revendedor".
 *
 * O NOME continua saindo de `branding()` dentro de cada página — não é descuido,
 * está medido em `tests/e2e/icone-da-marca.spec.ts:64-77`: aquela spec cruza duas
 * resoluções independentes (o título da aba, que lê o banco, contra o texto sob
 * o "Entrar", que lê o `.env`). Trocar o texto para este mesmo resolvedor
 * deixaria a spec verde medindo nada.
 *
 * ── Fachada Bacco (Plano 5B) ──────────────────────────────────────────────────
 *
 * Fundo em `background-image` com `aria-hidden` (a fachada sem logo não pode ter
 * `<img>`); frases em texto traduzido com o nome da marca RESOLVIDA; card com
 * borda ouro. Laterais geradas por `docs/brand/bacco/limpar-laterais-login.py`.
 */
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const marca = await marcaDaSaida(null);
  // A maioria destas telas roda ANTES do login (não há usuário nenhum), mas
  // duas — `/login/mfa` e, em parte, `/login/recovery` — rodam com uma sessão
  // parcial já criada (primeiro fator verificado, segundo pendente). Onde há
  // sessão, o idioma salvo no perfil vale; sem ela, `IdiomaProvider` já cai no
  // padrão pt-BR sozinho (ver o cabeçalho do provider) — nunca lança.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const locale = (user?.user_metadata?.locale as string | undefined) ?? null;
  const t = (texto: string) => traduzir(texto, normalizarIdioma(locale));

  return (
    <IdiomaProvider locale={locale}>
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-bg p-6">
        {/* Fundo — decorativo, em CSS (nunca <img>: a fachada sem logo não tem imagem). */}
        <div
          data-fachada="fundo"
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 hidden w-[27vw] max-w-[390px] bg-[url('/fachada/lateral-esquerda.webp')] bg-cover bg-right lg:block"
        />
        <div
          data-fachada="fundo"
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 hidden w-[31vw] max-w-[448px] bg-[url('/fachada/lateral-direita.webp')] bg-cover bg-left lg:block"
        />
        {/* Véu: clareia as fotos no tema claro; no escuro some. O gradiente funde as bordas no fundo. */}
        <div
          data-fachada="fundo"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 hidden bg-bg/70 lg:block dark:bg-transparent"
        />
        <div
          data-fachada="fundo"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,var(--color-bg)_40%,transparent_78%)]"
        />

        {/* Frases — texto real, só em tela larga. */}
        <p className="pointer-events-none absolute right-[5vw] top-1/2 hidden max-w-[12rem] -translate-y-1/2 font-display text-sm uppercase leading-8 tracking-[0.35em] text-gold-text xl:block">
          {t("Mais que vinhos, grandes histórias")}
          <span aria-hidden="true" className="mt-4 block h-px w-14 bg-gold" />
        </p>
        <p className="pointer-events-none absolute bottom-10 left-10 hidden font-display text-xs uppercase tracking-[0.3em] text-gold-text xl:block">
          <span aria-hidden="true" className="mb-3 block h-px w-10 bg-gold" />
          {t("Vinhos · Pessoas · Resultados")}
        </p>
        <p className="pointer-events-none absolute bottom-10 right-10 hidden text-right font-display text-xs uppercase tracking-[0.3em] text-gold-text xl:block">
          <span aria-hidden="true" className="mb-3 ml-auto block h-px w-10 bg-gold" />
          {marca.nome}
          <span className="mt-1 block text-muted-foreground">{t("Gestão que brinda ao seu crescimento")}</span>
        </p>

        {/* Card */}
        {/* Títulos editoriais da fachada: borgonha-ação no claro, creme no escuro (spec §4.4). */}
        <div className="relative z-10 w-full max-w-md space-y-6 rounded-lg border border-gold bg-surface p-8 shadow-lg [&_.font-display]:text-accent-text dark:[&_.font-display]:text-text">
          {marca.logoUrl ? (
            <div className="flex justify-center">
              {/*
                <img> em vez de next/image pelo mesmo motivo da barra lateral: a URL
                é de quem hospeda e o `next/image` exige allowlist de domínios
                fechada em BUILD — a imagem pré-buildada do self-host recusaria o
                domínio do operador. Altura fixa e largura livre para não distorcer
                arte de proporção desconhecida.

                O `alt` é o nome DESTA resolução (`marca.nome`), e não o de
                `branding()`: é a legenda da imagem que está ali, e nomeá-la com a
                marca de outra fonte descreveria uma marca que não é a do logo.

                O `data-testid` é lido por `tests/e2e/marca-logo.spec.ts`, que prova
                que o logo da EMPRESA não vaza para cá. Sem ele a spec caía na
                "primeira <img> da página", e uma asserção de negação com seletor
                largo passa sozinha assim que outra imagem entra na tela.
              */}
              {/* O chip `dark:bg-white` é o mesmo da barra lateral
                (`components/shell/Sidebar.tsx`): esta tela também respeita
                `data-theme` (o `ThemeProvider` embrulha a raiz inteira, login
                incluso), então um logo escuro contra `--color-surface` escuro tem
                o mesmo problema de contraste aqui. */}
              <div className="rounded-md dark:bg-white dark:px-3 dark:py-2 dark:shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  data-testid="logo-da-fachada"
                  src={marca.logoUrl}
                  alt={marca.nome}
                  className="h-10 w-auto max-w-[12rem] object-contain"
                />
              </div>
            </div>
          ) : marcaEhADoProduto({ name: marca.nome, logoUrl: null }) ? (
            <div className="flex justify-center">
              <LogotipoDoProduto nome={marca.nome} className="h-12 w-auto" />
            </div>
          ) : null}
          <div aria-hidden="true" className="mx-auto h-px w-12 bg-gold" />
          {children}
        </div>
      </div>
    </IdiomaProvider>
  );
}
