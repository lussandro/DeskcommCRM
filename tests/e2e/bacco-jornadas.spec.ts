/**
 * Prova em tela das jornadas de vinícola — roda NA VPS, contra a candidata
 * (Plano "Jornadas de vinícola", Task 6). Não faz parte do CI (`FORA_DO_CI` em
 * `.github/workflows/e2e.yml`).
 *
 * Autocontida de propósito: só importa `@playwright/test` e `node:fs`, sem
 * helpers do repo e sem `playwright.config.ts`, porque roda num contêiner
 * `mcr.microsoft.com/playwright:v1.63.0-noble` com `/work` montado. O molde é
 * `tests/e2e/bacco-evidencia.spec.ts`.
 *
 * O que ela mede, pela tela, como um leigo mediria — nunca pela API:
 *
 *   1. Configurações › Jornadas é alcançável PELA NAVEGAÇÃO (rodapé da barra →
 *      hub → card), não digitando a URL.
 *   2. O aviso de rascunho está na tela, visível, antes de qualquer clique.
 *   3. As quatro ativam pelo botão e o estado vira "Esta jornada está ativada".
 *   4. O relatório da aplicação: `falhou` em destaque, `nao_verificada` NEUTRA —
 *      medido por `getComputedStyle`, não a olho.
 *   5. Idempotência PELA TELA: aplicar de novo não duplica o funil — a contagem
 *      de funis com aquele nome na lista continua 1.
 *   6. O funil aparece no quadro com as colunas NA ORDEM.
 *   7. A resposta rápida aparece no atendimento, pelo atalho, no composer.
 *   8. O tipo de compromisso está na Agenda.
 *   9. A cadência está listada com o selo "Rascunho".
 *
 * ⚠️ A TABELA `JORNADAS` ABAIXO É CÓPIA, e a cópia é a decisão: a spec não pode
 * importar `lib/vertical/vinicola` (o contêiner roda sem o repo). Uma cópia que
 * diverge da fonte é uma prova que mede a si mesma — por isso ela traz só o que
 * um humano confere de relance, e cada campo cita de onde saiu. Mudou o pacote,
 * muda aqui.
 *
 * ⚠️ UMA EXPECTATIVA NASCE VERMELHA E É ACHADO, NÃO FOLGA: o complemento do
 * local ("No estabelecimento do cliente", `detalhesDoLocal` da Visita do
 * representante) é gravado em `calendar_event_types.location_details`, e a tela
 * de Agenda NÃO O RENDERIZA em lugar nenhum — nem na lista, nem no formulário
 * de edição (medido em `app/app/settings/tenant/agenda/_client.tsx`: a coluna só
 * aparece na interface de tipos, nunca no JSX). Quem marcar a visita não sabe
 * para onde ir. A medida fica aqui, `soft` e nomeada, para o defeito aparecer na
 * rodada em vez de ser combinado no silêncio.
 *
 * Tema por `localStorage` `deskcomm-theme` + reload. Medidas em
 * `/work/out/jornadas-medidas.jsonl`, capturas em `/work/out/jornadas-*.png`.
 */
import fs from "node:fs";

import { expect, test, type Page } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "";
const QA_EMAIL = process.env.QA_EMAIL ?? "";
const QA_SENHA = process.env.QA_SENHA ?? "";
const OUT = "/work/out";
const TEMAS = ["light", "dark"] as const;
type Tema = (typeof TEMAS)[number];

/** O aviso que a tela mostra sempre, antes de qualquer clique (`_client.tsx`). */
const AVISO_DE_RASCUNHO = "As cadências entram como rascunho.";

/** Os dois estados que contam como ativada (`_client.tsx`). */
const ATIVADA = /Esta jornada está ativada|Ativada, com peças removidas/;

/** Rótulos de desfecho que a tela escreve, e que dizem qual peça é qual. */
const ROTULO_FALHOU = "não deu para criar";
const ROTULO_NAO_VERIFICADA = "o pacote não mexeu nela";

interface JornadaEsperada {
  chave: string;
  /** `nomeDoFunil` — é o `<h2>` da seção e o nome do funil na lista. */
  funil: string;
  /** `etapas[].nome`, NA ORDEM: é o que o quadro tem de mostrar. */
  etapas: string[];
  /** A primeira resposta rápida: atalho digitado e título que o menu mostra. */
  atalho: string;
  tituloDaResposta: string;
  /** O tipo de compromisso que a Agenda tem de listar. */
  compromisso: string;
  /** O complemento do local, quando a jornada declara um. */
  detalhesDoLocal?: string;
  /** A primeira cadência: nome na lista de fluxos, com selo de rascunho. */
  cadencia: string;
}

/** Fonte: `lib/vertical/vinicola/{canal,enoturismo,clube,consumidor}.ts`. Ordem: `CHAVES_DE_JORNADA`. */
const JORNADAS: JornadaEsperada[] = [
  {
    chave: "canal",
    funil: "Canal e revenda",
    etapas: [
      "Novo contato",
      "Entendendo o canal",
      "Cadastro conferido",
      "Tabela enviada",
      "Amostra ou degustação",
      "Negociando pedido",
      "Pedido fechado",
      "Não fechou",
    ],
    atalho: "/canal-ola",
    tituloDaResposta: "Boas-vindas do canal",
    compromisso: "Visita do representante",
    detalhesDoLocal: "No estabelecimento do cliente",
    cadencia: "Canal · tabela enviada sem retorno",
  },
  {
    chave: "enoturismo",
    funil: "Visitas e degustações",
    etapas: [
      "Novo interessado",
      "Tirando dúvidas",
      "Escolhendo data",
      "Aguardando confirmação",
      "Reserva confirmada",
      "Visita realizada",
      "Não veio",
    ],
    atalho: "/eno-ola",
    tituloDaResposta: "Boas-vindas da visita",
    compromisso: "Visita guiada",
    cadencia: "Enoturismo · antes da visita",
  },
  {
    chave: "clube",
    funil: "Clube de assinatura",
    etapas: [
      "Interesse no clube",
      "Explicando o clube",
      "Escolhendo o plano",
      "Plano escolhido",
      "Aguardando adesão",
      "Assinante ativo",
      "Não assinou",
    ],
    atalho: "/clube-explicar",
    tituloDaResposta: "Explicar o clube",
    compromisso: "Degustação exclusiva de assinante",
    cadencia: "Clube · interesse sem adesão",
  },
  {
    chave: "consumidor",
    funil: "Vendas ao consumidor",
    etapas: [
      "Novo contato",
      "Entendendo o gosto",
      "Indiquei rótulos",
      "Pedido montado",
      "Aguardando pagamento",
      "Pedido pago",
      "Não comprou",
    ],
    atalho: "/loja-ola",
    tituloDaResposta: "Boas-vindas",
    compromisso: "Retirada na vinícola",
    cadencia: "Loja · pedido parado",
  },
];

/** A jornada medida a fundo — é a primeira da lista, e a que a reaplicação exercita. */
const PRIMEIRA = JORNADAS[0]!;

test.use({ baseURL: BASE_URL });

function registrar(linha: Record<string, unknown>): void {
  fs.appendFileSync(`${OUT}/jornadas-medidas.jsonl`, `${JSON.stringify(linha)}\n`);
}

async function aplicarTema(page: Page, tema: Tema): Promise<void> {
  await page.evaluate((t) => window.localStorage.setItem("deskcomm-theme", t), tema);
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(page.locator("html")).toHaveAttribute("data-theme", tema);
}

async function abrir(page: Page, rota: string): Promise<void> {
  await page.goto(rota);
  await page.waitForLoadState("networkidle");
}

async function foto(page: Page, tela: string, tema: Tema): Promise<void> {
  await page.screenshot({ path: `${OUT}/jornadas-${tela}-${tema}.png`, fullPage: true });
}

/**
 * Captura a tela nos dois temas. O reload do tema DESCARTA o relatório da
 * aplicação (é estado de React, não do servidor) — por isso quem precisa do
 * relatório na imagem tira a foto antes, com `foto()` direto.
 */
async function nosDoisTemas(page: Page, tela: string): Promise<void> {
  for (const tema of TEMAS) {
    await aplicarTema(page, tema);
    await foto(page, tela, tema);
  }
  await aplicarTema(page, "light");
}

/** A seção de uma jornada na tela de Jornadas — achada pelo título, como um leigo acha. */
function secaoDaJornada(page: Page, funil: string) {
  return page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: funil, exact: true }) });
}

/**
 * Clica em "Ativar jornada" e espera a ação do servidor responder.
 *
 * A espera é pelo POST da server action, e não pelo texto de estado: na
 * REAPLICAÇÃO o texto já diz "ativada" antes do clique, e esperar por ele
 * devolveria na hora — medindo nada.
 */
async function ativar(page: Page, funil: string): Promise<number> {
  const secao = secaoDaJornada(page, funil);
  const botao = secao.getByRole("button", { name: /^Ativar jornada$/ });
  await expect(botao, `"${funil}": a tela oferece o botão de ativar`).toBeVisible();
  const resposta = page.waitForResponse((r) => r.request().method() === "POST", {
    timeout: 180_000,
  });
  const comecou = Date.now();
  await botao.click();
  const status = (await resposta).status();
  await expect(botao, `"${funil}": o botão volta a aceitar clique`).toBeEnabled({
    timeout: 180_000,
  });
  registrar({ etapa: "ativar", funil, status, ms: Date.now() - comecou });
  return status;
}

/** As linhas do relatório da última aplicação, com a COR de cada uma. */
async function lerRelatorio(page: Page, funil: string) {
  return secaoDaJornada(page, funil)
    .locator("ul li")
    .evaluateAll((els) =>
      els.map((el) => {
        const spans = [...el.querySelectorAll("span")];
        const desfecho = spans[spans.length - 1] ?? el;
        return {
          texto: (el.textContent ?? "").trim(),
          cor: getComputedStyle(desfecho).color,
        };
      }),
    );
}

test("as quatro jornadas de vinícola, da tela ao efeito", async ({ page }) => {
  test.setTimeout(30 * 60_000);
  expect(BASE_URL, "BASE_URL").not.toBe("");
  expect(QA_EMAIL, "QA_EMAIL").not.toBe("");
  expect(QA_SENHA, "QA_SENHA").not.toBe("");
  fs.mkdirSync(OUT, { recursive: true });
  await page.setViewportSize({ width: 1366, height: 900 });

  // ── 1. Entrar com a conta QA ───────────────────────────────────────────────
  await abrir(page, "/login");
  await page.locator("#email").fill(QA_EMAIL);
  await page.locator("#password").fill(QA_SENHA);
  await page.getByRole("button", { name: /^entrar/i }).click();
  await page.waitForURL(/\/(app|onboarding)\//, { timeout: 60_000 });
  expect(page.url(), "a conta QA já passou do onboarding — esta prova mede o CRM, não o wizard").toMatch(
    /\/app\//,
  );

  // ── 2. Chegar em Jornadas PELA NAVEGAÇÃO ───────────────────────────────────
  // Nada de digitar a URL: ter tela e ser alcançável são coisas diferentes.
  const configuracoes = page.getByRole("link", { name: "Configurações", exact: true }).first();
  await expect(configuracoes, "o rodapé da barra oferece Configurações").toBeVisible();
  await configuracoes.click();
  await page.waitForURL(/\/app\/settings$/, { timeout: 60_000 });
  await page.waitForLoadState("networkidle");

  const cardJornadas = page.getByRole("link", { name: /^Jornadas/ }).first();
  await expect(cardJornadas, "o hub de Configurações tem o card Jornadas").toBeVisible();
  const hrefDoCard = await cardJornadas.getAttribute("href");
  expect.soft(hrefDoCard, "o card leva para a tela de Jornadas").toBe(
    "/app/settings/tenant/jornadas",
  );
  await cardJornadas.click();
  await page.waitForURL(/\/app\/settings\/tenant\/jornadas$/, { timeout: 60_000 });
  await page.waitForLoadState("networkidle");
  registrar({ etapa: "navegacao", href: hrefDoCard, url: page.url() });

  await aplicarTema(page, "light");

  // ── 3. O aviso de rascunho, antes de qualquer clique ───────────────────────
  const aviso = page.getByText(AVISO_DE_RASCUNHO, { exact: false });
  await expect(aviso, "o aviso de que as cadências entram como rascunho está na tela").toBeVisible();
  const medidaDoAviso = await aviso.evaluate((el) => ({
    texto: (el.textContent ?? "").trim(),
    altura: el.getBoundingClientRect().height,
    cor: getComputedStyle(el).color,
  }));
  registrar({ etapa: "aviso_de_rascunho", ...medidaDoAviso });
  expect.soft(medidaDoAviso.altura, "o aviso ocupa espaço na tela, não é texto colapsado").toBeGreaterThan(
    0,
  );
  expect
    .soft(medidaDoAviso.texto, "o aviso diz o que falta para a cadência mandar mensagem")
    .toContain("agente de IA publicado");

  // ── 4. Ativar as quatro, pelo botão ────────────────────────────────────────
  for (const j of JORNADAS) {
    const status = await ativar(page, j.funil);
    expect.soft(status, `"${j.funil}": a ação de ativar respondeu sem erro de servidor`).toBeLessThan(
      400,
    );
    const estado = secaoDaJornada(page, j.funil).getByText(ATIVADA);
    await expect(estado, `"${j.funil}": a tela passa a dizer que a jornada está ativada`).toBeVisible({
      timeout: 60_000,
    });
    registrar({ etapa: "estado_na_tela", funil: j.funil, texto: (await estado.textContent())?.trim() });
  }

  // ── 5. O relatório: `falhou` em destaque, `nao_verificada` neutra ──────────
  // Estado de React: medido AGORA, antes de qualquer reload.
  const relatorio = await lerRelatorio(page, PRIMEIRA.funil);
  registrar({ etapa: "relatorio", funil: PRIMEIRA.funil, linhas: relatorio });
  const falhas = relatorio.filter((l) => l.texto.includes(ROTULO_FALHOU));
  const naoVerificadas = relatorio.filter((l) => l.texto.includes(ROTULO_NAO_VERIFICADA));
  expect.soft(falhas, `"${PRIMEIRA.funil}": nenhuma peça falhou`).toEqual([]);
  if (falhas.length > 0 && naoVerificadas.length > 0) {
    expect
      .soft(falhas[0]!.cor, "o erro tem cor própria; a peça não verificada fica neutra")
      .not.toBe(naoVerificadas[0]!.cor);
  }
  await foto(page, "relatorio", "light");

  // ── 6. Idempotência, provada pela tela ─────────────────────────────────────
  await ativar(page, PRIMEIRA.funil);
  await expect(
    secaoDaJornada(page, PRIMEIRA.funil).getByText(ATIVADA),
    `"${PRIMEIRA.funil}": segue ativada depois da segunda aplicação`,
  ).toBeVisible();
  registrar({
    etapa: "relatorio_da_reaplicacao",
    funil: PRIMEIRA.funil,
    linhas: await lerRelatorio(page, PRIMEIRA.funil),
  });
  await foto(page, "reaplicacao", "light");
  await nosDoisTemas(page, "jornadas");

  // ── 7. Os funis na lista: um de cada, mesmo depois de aplicar duas vezes ───
  await abrir(page, "/app/kanban");
  const nomesDosFunis = await page
    .locator('a[data-testid^="abrir-"]')
    .evaluateAll((els) => els.map((el) => (el.querySelector("span > span")?.textContent ?? "").trim()));
  const padrao = await page
    .locator('a[data-testid^="abrir-"]')
    .evaluateAll((els) =>
      els
        .filter((el) => (el.textContent ?? "").includes("Padrão"))
        .map((el) => (el.querySelector("span > span")?.textContent ?? "").trim()),
    );
  registrar({ etapa: "funis_na_lista", nomes: nomesDosFunis, padrao });
  for (const j of JORNADAS) {
    expect
      .soft(
        nomesDosFunis.filter((n) => n === j.funil).length,
        `"${j.funil}": existe UM funil com esse nome — aplicar de novo não duplicou`,
      )
      .toBe(1);
  }

  // ── 8. O quadro, com as colunas na ordem ──────────────────────────────────
  for (const j of JORNADAS) {
    await abrir(page, "/app/kanban");
    await page.getByRole("link", { name: new RegExp(`^${j.funil}`) }).first().click();
    await page.waitForURL(/\/app\/pipelines\//, { timeout: 60_000 });
    await page.waitForLoadState("networkidle");
    /*
     * ⚠️ NÃO É `main h2`, E A PRIMEIRA VERSÃO DESTA SPEC ERROU AQUI: o app NÃO
     * TEM elemento `<main>` — nem na casca (`components/shell/`), nem no layout
     * de `/app`. `main h2` casava ZERO e a spec media `colunas: []` nos quatro
     * quadros, com as colunas visíveis na captura. Lista vazia comparada com a
     * ordem esperada falha, mas falha dizendo a coisa errada: parecia funil sem
     * etapa, e era seletor sem alvo.
     *
     * `h2` sozinho também não serve: o `Sidebar.tsx:230` usa `h2` nos títulos de
     * grupo, e eles entrariam na lista antes das colunas.
     *
     * A âncora é ESTRUTURAL: cada coluna (`StageColumn.tsx`) é um `div` que
     * contém o `h2` do nome dentro do cabeçalho e, ao lado, o `Droppable` do
     * @hello-pangea/dnd — que marca o DOM com `data-rfd-droppable-id`. Então
     * título de coluna é o `h2` cujo avô contém um droppable. Não depende de
     * classe utilitária, que muda com o CSS.
     *
     * As colunas NÃO são virtualizadas (`KanbanBoard.tsx` mapeia `data.stages`
     * inteiro dentro de um `overflow-x-auto`): todas estão no DOM mesmo fora da
     * viewport, e a ordem do DOM é a ordem do funil. `x` vai junto para a medida
     * registrar a ordem visual também — é o que provaria uma coluna renderizada
     * fora de lugar.
     */
    const colunas = await page.evaluate(() =>
      [...document.querySelectorAll("h2")]
        .filter((h) =>
          h.parentElement?.parentElement?.querySelector(
            "[data-rfd-droppable-id], [data-rbd-droppable-id]",
          ),
        )
        .map((el) => ({
          nome: (el.textContent ?? "").trim(),
          x: Math.round(el.getBoundingClientRect().left),
        })),
    );
    registrar({ etapa: "quadro", funil: j.funil, url: page.url(), colunas });
    expect
      .soft(
        colunas.map((c) => c.nome),
        `"${j.funil}": as colunas do quadro, na ordem da jornada`,
      )
      .toEqual(j.etapas);
    if (j.chave === PRIMEIRA.chave) await nosDoisTemas(page, "quadro");
  }

  // ── 9. A resposta rápida no atendimento ───────────────────────────────────
  await abrir(page, "/app/inbox");
  /*
   * ⚠️ A RECARGA NÃO É SUPERSTIÇÃO — É O CACHE DAS RESPOSTAS RÁPIDAS.
   *
   * `hooks/inbox/useMessageTemplates.ts` guarda a lista com
   * `staleTime: 60_000`: dentro de um minuto, o React Query devolve o que já
   * tem sem ir ao servidor. Esta spec ACABOU de criar as respostas rápidas
   * clicando em "Ativar jornada", na MESMA sessão de browser — se a lista já
   * tiver sido buscada antes disso, o menu abre com o conteúdo velho e nenhum
   * dos atalhos novos aparece. Foi o que aconteceu na primeira rodada na VPS:
   * `titulos: []` nos quatro atalhos, com os 67 modelos existindo no banco.
   *
   * O reload derruba o `QueryClient` inteiro e a busca sai de novo. É o mesmo
   * gesto que um humano faria — e é honesto que a spec precise dele: quem
   * ativar a jornada com a inbox aberta noutra aba também vai ter de recarregar
   * para ver as respostas novas.
   */
  await page.reload();
  await page.waitForLoadState("networkidle");
  const conversas = page.locator("button[data-conversation-id]");
  const quantasConversas = await conversas.count();
  registrar({ etapa: "inbox", conversas: quantasConversas });
  expect
    .soft(quantasConversas, "o inbox tem ao menos uma conversa para provar a resposta rápida")
    .toBeGreaterThan(0);
  if (quantasConversas > 0) {
    await conversas.first().click();
    const campo = page.getByRole("textbox", { name: "Mensagem" });
    await expect(campo, "a conversa aberta tem o campo de escrever").toBeVisible({ timeout: 60_000 });
    for (const j of JORNADAS) {
      await campo.fill(j.atalho);
      const menu = page.getByRole("listbox");
      await expect(menu, `"${j.atalho}": o menu de respostas rápidas abre`).toBeVisible({
        timeout: 30_000,
      });
      const titulos = await menu
        .locator("button span")
        .evaluateAll((els) => els.map((el) => (el.textContent ?? "").trim()));
      registrar({ etapa: "resposta_rapida", atalho: j.atalho, titulos });
      expect
        .soft(titulos, `"${j.atalho}": o menu oferece "${j.tituloDaResposta}"`)
        .toContain(j.tituloDaResposta);
      if (j.chave === PRIMEIRA.chave) {
        for (const tema of TEMAS) {
          await page.evaluate((t) => window.localStorage.setItem("deskcomm-theme", t), tema);
          // Sem reload: o menu é estado do composer e o reload o fecharia. O
          // tema entra pela mesma chave, e o `<html>` responde na hora.
          await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), tema);
          await foto(page, "resposta-rapida", tema);
        }
      }
    }
    await campo.fill("");
  }

  // ── 10. O tipo de compromisso na Agenda ───────────────────────────────────
  await abrir(page, "/app/settings/tenant/agenda");
  for (const j of JORNADAS) {
    const linha = page.locator('[data-testid="lista-de-tipos"] li').filter({ hasText: j.compromisso });
    await expect(linha.first(), `a Agenda lista "${j.compromisso}"`).toBeVisible({ timeout: 30_000 });
    const texto = (await linha.first().textContent())?.trim() ?? "";
    registrar({ etapa: "agenda", funil: j.funil, compromisso: j.compromisso, texto });
    if (j.detalhesDoLocal) {
      // ⚠️ VERMELHO ESPERADO ATÉ A TELA MOSTRAR O COMPLEMENTO — ver o cabeçalho.
      expect
        .soft(
          texto,
          `"${j.compromisso}": a tela diz ONDE a visita acontece ("${j.detalhesDoLocal}")`,
        )
        .toContain(j.detalhesDoLocal);
    }
  }
  await nosDoisTemas(page, "agenda");

  // ── 11. A cadência listada como rascunho ──────────────────────────────────
  await abrir(page, "/app/ai/followups");
  for (const j of JORNADAS) {
    const cartao = page.locator("li").filter({ hasText: j.cadencia }).first();
    await expect(cartao, `a lista de fluxos mostra "${j.cadencia}"`).toBeVisible({ timeout: 30_000 });
    const texto = (await cartao.textContent())?.trim() ?? "";
    registrar({ etapa: "cadencia", funil: j.funil, cadencia: j.cadencia, texto });
    expect.soft(texto, `"${j.cadencia}": entra como RASCUNHO, não publicada`).toContain("Rascunho");
  }
  await nosDoisTemas(page, "cadencias");
});
