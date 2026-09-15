// Mede, com o globals.css alterado EM MEMÓRIA, os pisos de contraste da rampa borgonha
// para cada grau candidato do accent escuro. Plano 1 v2, Task 1 Step 0. Rodar da raiz:
//   pnpm exec tsx docs/superpowers/plans/anexos/medir-grau-escuro.ts
import fs from "node:fs";
import { extrairRegua, medirPares, derivarMarca, deltaESimulado, PISO_DE_SEPARACAO_SIMULADA } from "../../../../lib/branding/contraste";
import { rampaDeSemente } from "../../../../lib/branding/rampa";
const css0 = fs.readFileSync("app/globals.css", "utf8");
const r = rampaDeSemente("#4a0e1f");
console.log("rampa", r.join(" "));
const G = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
let base = css0;
G.forEach((g, i) => { base = base.replace(new RegExp(`(--color-accent-${g}:\\s*)#[0-9a-f]{6}`, "g"), `$1${r[i]}`); });
base = base.replaceAll("--color-accent-hover: var(--color-accent-700)", "--color-accent-hover: var(--color-accent-500)");
base = base.replaceAll("rgba(130, 160, 119, 0.16)", "rgba(152, 84, 97, 0.16)");
for (const [ga, gh] of [[400, 300], [300, 200], [200, 100], [100, 50], [50, 50]] as const) {
  const css = base
    .replace("--color-accent: var(--color-accent-400)", `--color-accent: var(--color-accent-${ga})`)
    .replace("--color-accent-hover: var(--color-accent-300)", `--color-accent-hover: var(--color-accent-${gh})`)
    .replace("--ring: var(--color-accent-400)", `--ring: var(--color-accent-${ga})`)
    .replace("outline-color: var(--color-accent-400)", `outline-color: var(--color-accent-${ga})`);
  const R = extrairRegua(css);
  const out: string[] = [];
  for (const t of [R.claro, R.escuro]) {
    const rep = medirPares(t, R.rampaDoProduto, 0).filter((p) => !p.passa);
    const acc = R.rampaDoProduto[t.indices.accent]!;
    const err = t.semanticas.find((s) => s.nome === "error")!.hex;
    const sep = deltaESimulado(err, acc);
    out.push(`${t.nome}: accent=${acc} reprovas=${rep.length}${rep.length ? " [" + rep.map((p) => `${p.papel}×${p.superficie}=${p.razao.toFixed(2)}<${p.piso}`).join(", ") + "]" : ""} accent×error=${sep.toFixed(4)} (piso ${PISO_DE_SEPARACAO_SIMULADA})`);
  }
  const m = derivarMarca("#4a0e1f", R);
  out.push(`derivarMarca(#4a0e1f): desloc claro=${m.claro.deslocamento} escuro=${m.escuro.deslocamento} motivos=${m.motivos.map((x) => x.codigo + "/" + (x as {tema?: string}).tema + "/" + (x as {alvo?: string}).alvo).join(",") || "nenhum"}`);
  console.log(`\n== escuro accent ${ga} hover ${gh}\n  ` + out.join("\n  "));
}
