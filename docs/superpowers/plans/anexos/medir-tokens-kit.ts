// Plano 5A — gera e mede, a partir do kit Bacco (docs/brand/bacco/kit-v2/ui/tokens/), a rampa, as
// escalas neutras e os graus de papel, aplicando ao globals.css EM MEMÓRIA a exceção §5.3 e o papel
// `-text`. Rodar da raiz: pnpm exec tsx docs/superpowers/plans/anexos/medir-tokens-kit.ts
import { readFileSync } from "node:fs";
import { extrairRegua, medirPares, superficiesDoTema, razaoDeContraste, separacaoDoNeutro, PISO_DE_SEPARACAO_DO_NEUTRO } from "../../../../lib/branding/contraste";
import { rampaDeSemente, hexParaOklch, oklchParaHex } from "../../../../lib/branding/rampa";

const G = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
const R = rampaDeSemente("#6a1730");
/** 50 = `de` … 900 = `ate`, em passos iguais de OKLCH; 950 um passo além do 900. */
function escala(de: string, ate: string): string[] {
  const A = hexParaOklch(de), B = hexParaOklch(ate);
  const dh = ((B.h - A.h + 540) % 360) - 180;
  return G.map((_, i) => {
    const t = i / 9;
    return oklchParaHex({ L: Math.max(0, A.L + (B.L - A.L) * t), C: Math.max(0, A.C + (B.C - A.C) * t), h: A.h + dh * t });
  });
}
const NC = escala("#fbf8f2", "#2e2a27");
const NE = escala("#f5f0e6", "#13110f");
console.log("rampa           ", R.map((h, i) => `${G[i]}=${h}`).join(" "));
console.log("neutros claro   ", NC.map((h, i) => `${G[i]}=${h}`).join(" "));
console.log("neutros escuro  ", NE.map((h, i) => `${G[i]}=${h}`).join(" "));
const bases = { claro: ["#fbf8f2", "#fffdf8", "#f5f0e6", "#faf6f0", R[1]!], escuro: ["#13110f", "#1a1715", "#211d1a", "#1d0f12", R[9]!] };
for (const [tema, N] of [["claro", NC], ["escuro", NE]] as const) {
  console.log(`\n== ${tema}: grau neutro → pior contraste (fundo, superfície, suave, barra lateral, seleção)`);
  N.forEach((h, i) => console.log(`  ${G[i]} ${h} ${Math.min(...bases[tema].map((b) => razaoDeContraste(h, b))).toFixed(2)}`));
}

let css = readFileSync("app/globals.css", "utf8");
function bloco(sel: string, f: (b: string) => string) {
  const i = css.indexOf(sel), a = css.indexOf("{", i);
  let d = 0, j = a;
  for (; j < css.length; j++) { if (css[j] === "{") d++; else if (css[j] === "}" && --d === 0) break; }
  css = css.slice(0, a + 1) + f(css.slice(a + 1, j)) + css.slice(j);
}
const set = (b: string, k: string, v: string) => b.replace(new RegExp(`(${k}:\\s*)[^;]+;`), `$1${v};`);
for (const [sel, N, escuro] of [[":root {", NC, false], ['[data-theme="light"] {', NC, false], ['[data-theme="dark"] {', NE, true]] as const) {
  bloco(sel, (b) => {
    G.forEach((g, i) => { b = set(b, `--color-accent-${g}`, R[i]!); b = set(b, `--color-neutral-${g}`, N[i]!); });
    if (escuro) {
      b = set(b, "--color-bg", "#13110f"); b = set(b, "--color-surface", "#1a1715"); b = set(b, "--color-surface-elevated", "#211d1a");
      b = set(b, "--color-accent", "var(--color-accent-600)"); b = set(b, "--color-accent-hover", "var(--color-accent-500)");
      b = set(b, "--color-accent-soft", "var(--color-accent-900)"); b = set(b, "--color-accent-fg", "#ffffff");
      b = set(b, "--ring", "var(--color-accent-400)");
      b = b.replace("--color-accent-hover:", "--color-accent-text: var(--color-accent-300);\n  --color-accent-hover:");
    } else {
      b = set(b, "--color-bg", "#fbf8f2"); b = set(b, "--color-surface", "#fffdf8"); b = set(b, "--color-surface-elevated", "#f5f0e6");
      b = set(b, "--color-accent-hover", "var(--color-accent-700)");
      b = b.replace("--color-accent-hover:", "--color-accent-text: var(--color-accent-600);\n  --color-accent-hover:");
    }
    return b;
  });
}
css = css.replace(/(\[data-theme="dark"\] :focus-visible \{\s*outline-color:\s*)var\(--color-accent-\d+\)/, "$1var(--color-accent-400)");
const REG = extrairRegua(css);
// Simulação do código novo de montarTema: `-text` vira papel de texto; fill do accent sai no escuro.
const aplicar = (t: typeof REG.claro) => {
  const papeis = t.papeis.flatMap((p) => {
    if (t.nome === "escuro" && (p.token === "--color-accent" || p.token === "--color-accent-hover")) return [];
    if (p.token.endsWith("-text")) return [{ ...p, tipo: "texto" as const }];
    return [p];
  });
  return { ...t, papeis };
};
for (const t of [aplicar(REG.claro), aplicar(REG.escuro)]) {
  const pares = medirPares(t, REG.rampaDoProduto, 0);
  const rep = pares.filter((p) => !p.passa);
  console.log(`\n== régua ${t.nome}: papéis ${t.papeis.length} [${t.papeis.map((p) => `${p.token}:${p.tipo}`).sort().join(", ")}]`);
  console.log(`   superfícies ${superficiesDoTema(t, REG.rampaDoProduto, 0).length} | pares ${pares.length} | reprovas ${rep.length}${rep.length ? " " + rep.map((p) => `${p.papel}×${p.superficie}=${p.razao.toFixed(2)}`).join(", ") : ""}`);
  console.log(`   índices ${JSON.stringify(t.indices)} alfaDoSoft ${t.alfaDoSoft} neutros[9] ${t.neutros[9]}`);
  const acc = REG.rampaDoProduto[t.indices.accent]!;
  console.log(`   separação accent×neutro do mesmo grau ${separacaoDoNeutro(t, 600, acc).toFixed(3)} (piso ${PISO_DE_SEPARACAO_DO_NEUTRO})`);
}
