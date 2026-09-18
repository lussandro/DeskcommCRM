import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
const BASE = "https://adega-crm.baccosistemas.com.br";
const CAMPANHA = "7f745157-0809-4d55-9829-b833abe698c4";
const ids = readFileSync(process.env.IDS, "utf8").trim().split(",").filter((s) => s.length === 36);
console.log("ids:", ids.length);

const b = await chromium.launch();
const ctx = await b.newContext();
const p = await ctx.newPage();
await p.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await p.waitForTimeout(5000);
await p.getByLabel(/e-?mail/i).fill("lussandro@gmail.com");
await p.locator('input[type="password"]').fill(process.env.SENHA);
await p.getByRole("button", { name: /^entrar$/i }).last().click();
await p.waitForURL(/\/app/, { timeout: 60000 });
const cookie = (await ctx.cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
await b.close();

const r = await fetch(`${BASE}/api/v1/campaigns/${CAMPANHA}/recipients`, {
  method: "POST",
  headers: { cookie, "content-type": "application/json" },
  body: JSON.stringify({ contact_ids: ids }),
});
console.log("audiência:", r.status, await r.text());
