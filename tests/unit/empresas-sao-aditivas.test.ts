/**
 * Empresas é aditivo: o CRM não é só do Bacco, e quem não cadastra empresa não
 * pode ver diferença nenhuma. Este teste reprova qualquer ramificação por
 * empresa fora do módulo — importar `@/lib/companies` ou consultar
 * `crm_companies` de leads, conversas, retorno, roteamento ou motor do agente.
 * Passar a coluna `company_id` como qualquer outra (SELECT/PATCH de contatos) é
 * permitido: coluna não é ramificação.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(__dirname, "../..");
const VIGIADOS = [
  "app/api/v1/contacts", "app/api/v1/leads", "app/api/v1/conversations", "app/api/v1/messages",
  "lib/followup", "lib/routing", "lib/agent-engine", "lib/ai", "lib/leads", "lib/channels",
];
const PERMITIDOS = /^(lib\/companies|lib\/asaas|app\/api\/v1\/companies|app\/app\/companies|components\/companies|hooks\/companies)\//;
/** Só o CRUD de contatos passa a coluna como coluna (SELECT/PATCH); ninguém mais a lê. */
const PASSA_A_COLUNA = /^app\/api\/v1\/contacts\//;

function arquivos(dir: string): string[] {
  const abs = path.join(RAIZ, dir);
  if (!fs.existsSync(abs)) return [];
  const out: string[] = [];
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...arquivos(p));
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

describe("empresas são aditivas", () => {
  const todos = VIGIADOS.flatMap(arquivos).filter((f) => !PERMITIDOS.test(f));
  it("varreu arquivos", () => expect(todos.length).toBeGreaterThan(50));
  for (const f of todos) {
    it(`${f} não ramifica por empresa`, () => {
      const src = fs.readFileSync(path.join(RAIZ, f), "utf8");
      expect(src).not.toMatch(/@\/lib\/companies/);
      if (!PASSA_A_COLUNA.test(f)) {
        expect(src).not.toMatch(/crm_companies/);
        expect(src).not.toMatch(/company_id/);
      }
    });
  }
});
