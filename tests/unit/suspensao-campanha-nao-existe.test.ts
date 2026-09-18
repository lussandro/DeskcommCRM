/**
 * A linha "campanhas" da matriz de suspensão (§6a) não virou código porque a
 * superfície NÃO EXISTE — e este teste é o que garante que essa afirmação não
 * apodreça em silêncio.
 *
 * No dia em que alguém criar disparo em massa, este teste fica vermelho e
 * obriga a decidir o que a suspensão faz com ele. Sem isto, a linha seguiria
 * "coberta" num documento enquanto o produto ganhava exatamente o canal que
 * uma organização suspensa não pode ter.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// TETO DESTA HEURÍSTICA, declarado para ninguém confiar demais nela: o
// congelamento procura os radicais `campaign` e `campanha`. Uma superfície
// nascida como `broadcasts`, `disparos` ou `envio_em_massa` passa VERDE por
// aqui. O teste avisa o caso provável, não todos — quem criar disparo em
// massa com outro nome tem de lembrar da matriz de suspensão por conta.
describe("superfície de campanha", () => {
  it("não existe no schema — se passar a existir, a suspensão precisa decidir sobre ela", () => {
    const baseline = readFileSync(join(process.cwd(), "supabase", "baseline.sql"), "utf8");
    // O prefixo `public.` é OPCIONAL no regex de propósito. O dump do Supabase
    // emite `CREATE TABLE "public"."x"`, mas o APÊNDICE idempotente — que é
    // onde o fork Bacco cria tabela — emite `create table if not exists x (`,
    // sem schema. Exigir o literal `public` alcança 83 das 137 `create table`
    // do baseline e deixa o apêndice inteiro invisível: uma tabela `campanhas`
    // nascida ali passaria batida, com o teste verde.
    const tabelas = [
      ...baseline.matchAll(/create table\s+(?:if not exists\s+)?(?:"?public"?\.)?"?([a-z_]+)"?/gi),
    ].map((m) => m[1]!.toLowerCase());
    // Controle da RÉGUA: se a contagem cair, o regex parou de enxergar parte do
    // arquivo e o `toEqual([])` abaixo vira falso verde.
    //
    // 136 é o que este regex casa hoje (131 nomes únicos — o baseline recria
    // algumas tabelas no apêndice). NÃO recontar de cabeça; o número sai de:
    //   node -e 'const s=require("fs").readFileSync("supabase/baseline.sql","utf8");
    //     const m=[...s.matchAll(/create table\s+(?:if not exists\s+)?(?:"?public"?\.)?"?([a-z_]+)"?/gi)]
    //       .map(x=>x[1].toLowerCase());
    //     console.log("matches:", m.length, "unicas:", new Set(m).size)'
    expect(tabelas.length).toBeGreaterThanOrEqual(136);
    const suspeitas = tabelas.filter((t) => t.includes("campaign") || t.includes("campanha"));
    expect(suspeitas).toEqual([]);
  });
});
