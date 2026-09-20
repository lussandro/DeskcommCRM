import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Este invariante existe porque a resposta do WAHA MENTE (medido: 201
 * listando membro que participants/v2 não mostrou). Se alguém um dia
 * marcar `concluida` sem olhar `pos_condicao_ok`, o CRM volta a afirmar
 * remoção que não aconteceu.
 */
describe("ação de grupo nunca conclui sem pós-condição", () => {
  const src = readFileSync("app/api/v1/groups/[id]/actions/route.ts", "utf-8");

  it("passa pelo executarAcaoDeGrupo, não chama o WAHA direto", () => {
    expect(src).toMatch(/executarAcaoDeGrupo/);
    expect(src).not.toMatch(/participants\/remove|admin\/promote/);
  });

  it("o status 'concluida' é condicionado a pos_condicao_ok", () => {
    const trecho = src.replace(/\s+/g, " ");
    expect(trecho).toMatch(/posCondicaoOk\s*\?\s*"concluida"|pos_condicao_ok.*concluida/);
  });

  it("guarda a resposta crua e o texto do erro", () => {
    expect(src).toMatch(/waha_resposta/);
    expect(src).toMatch(/erro_texto/);
  });
});
