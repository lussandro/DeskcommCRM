import { chromium } from "@playwright/test";
const BASE = "https://adega-crm.baccosistemas.com.br";
const SHOT = process.env.SHOT_DIR ?? ".";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } });
const p = await ctx.newPage();
await p.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await p.waitForTimeout(5000);
await p.getByLabel(/e-?mail/i).fill("lussandro@gmail.com");
await p.locator('input[type="password"]').fill(process.env.SENHA);
await p.getByRole("button", { name: /^entrar$/i }).last().click();
await p.waitForURL(/\/app/, { timeout: 60000 });

await p.goto(`${BASE}/app/campanhas/7f745157-0809-4d55-9829-b833abe698c4`, { waitUntil: "domcontentloaded" });
await p.waitForTimeout(3000);
await p.screenshot({ path: `${SHOT}/camp-3-piloto.png`, fullPage: true });
console.log("LISTA:", (await p.locator("body").innerText()).slice(0, 400));

await p.goto(`${BASE}/app/campanhas/nova`, { waitUntil: "domcontentloaded" });
await p.waitForTimeout(3000);
await p.screenshot({ path: `${SHOT}/camp-2-nova.png`, fullPage: true });
const txt = await p.locator("body").innerText();
console.log("NOVA:", txt.slice(txt.indexOf("Nova campanha"), txt.indexOf("Nova campanha") + 700));
await b.close();
