/**
 * O AVISO DE QUE A CHAVE DE IA NÃO RESPONDEU SOBREVIVE À JORNADA MARCADA.
 *
 * ═══ O defeito que este arquivo existe para impedir ═══
 *
 * O bloco âmbar é o ÚNICO lugar do wizard onde a pessoa descobre que a chave de
 * IA que ela acabou de colar não funcionou. Na primeira versão da seleção
 * múltipla ele ficou inteiro sob `jornadas.length > 0 ? null : …` — e como
 * `jornadasSugeridas` chega MARCADO para qualquer texto de vinícola
 * (`sugerirJornadas`, e é o público inteiro deste produto), o diagnóstico sumia
 * para praticamente todo mundo. A chave quebrada só apareceria no primeiro
 * cliente real, que é tarde demais.
 *
 * O que PODE sumir com jornada marcada é a metade que fala do quadro pronto:
 * nenhum pacote vai ser gravado nesse caminho, então ali a frase seria falsa.
 *
 * `renderToStaticMarkup` não roda efeito nenhum e não toca DOM — é a primeira
 * renderização, que é o que a pessoa vê ao chegar no passo. É a mesma receita
 * de `app/app/settings/notifications/_client.test.tsx`.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// `useT` vira identidade: o que se mede aqui é QUAL frase aparece, não a
// tradução dela — o espanhol tem a cerca própria.
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (chave: string) => chave }));
// A action arrasta admin client, IA e `next/navigation`. Nada disso é o assunto.
vi.mock("@/app/actions/onboarding/montarQuadro", () => ({
  aplicarQuadro: vi.fn(),
  pularQuadro: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { PACOTE_PADRAO } from "@/lib/onboarding/pacotes-de-funil";
import type { Sugestao } from "@/lib/onboarding/sugerir-funil";
import type { ChaveDeJornada } from "@/lib/vertical/vinicola";

import { QuadroClient } from "./_client";

const AVISO = "Não consegui pedir uma sugestão para o seu funcionário agora";
const QUADRO_PRONTO = "Comecei por um quadro pronto de";

/** O desfecho mais provável de todos: a chave colada não gerou um token. */
const SEM_IA: Sugestao = {
  origem: "pacote",
  pacote: PACOTE_PADRAO,
  porque: "insufficient_quota",
};

function telaCom(jornadas: ChaveDeJornada[], sugestao: Sugestao = SEM_IA): string {
  return renderToStaticMarkup(
    <QuadroClient atual={null} sugestao={sugestao} jornadasSugeridas={jornadas} />,
  );
}

describe("o aviso da chave de IA no passo do funil", () => {
  it("aparece COM jornada marcada — é o público-alvo inteiro", () => {
    const html = telaCom(["enoturismo"]);
    expect(html, "a vinícola perderia o único diagnóstico da chave").toContain(AVISO);
    // O motivo real viaja junto, sem máscara.
    expect(html).toContain("insufficient_quota");
  });

  it("com jornada marcada, NÃO promete o quadro pronto", () => {
    // Nenhum pacote é gravado neste caminho: quem cria funil é o aplicador.
    const html = telaCom(["enoturismo"]);
    expect(html).not.toContain(QUADRO_PRONTO);
  });

  it("sem jornada marcada, o aviso continua inteiro", () => {
    // O controle: é o fluxo de quem não é vinícola, e ele não mudou.
    const html = telaCom([]);
    expect(html).toContain(AVISO);
    expect(html).toContain(QUADRO_PRONTO);
    expect(html).toContain(PACOTE_PADRAO.comoSeApresenta);
  });

  it("quando a IA respondeu, o aviso âmbar não existe em nenhum dos dois casos", () => {
    const daIa: Sugestao = { origem: "ia", proposta: PACOTE_PADRAO.proposta };
    expect(telaCom([], daIa)).not.toContain(AVISO);
    expect(telaCom(["clube"], daIa)).not.toContain(AVISO);
  });
});
