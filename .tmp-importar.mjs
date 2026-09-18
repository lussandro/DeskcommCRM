import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const BASE = "https://adega-crm.baccosistemas.com.br";
const S = process.env.SHOT_DIR;
const b = await chromium.launch();
const ctx = await b.newContext();
const p = await ctx.newPage();
await p.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await p.waitForTimeout(5000);
await p.getByLabel(/e-?mail/i).fill("lussandro@gmail.com");
await p.locator('input[type="password"]').fill(process.env.SENHA);
await p.getByRole("button", { name: /^entrar$/i }).last().click();
await p.waitForURL(/\/app/, { timeout: 60000 });

for (const n of [1, 2]) {
  const conteudo = readFileSync(`${S}/contatos-lote-${n}.csv`);
  const r = await p.request.post(`${BASE}/api/v1/contacts/import`, {
    multipart: { file: { name: `lote-${n}.csv`, mimeType: "text/csv", buffer: conteudo } },
  });
  console.log(`lote ${n}:`, r.status(), (await r.text()).slice(0, 300));
}
await b.close();
