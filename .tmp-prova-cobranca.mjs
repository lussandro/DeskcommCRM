import { chromium } from "@playwright/test";

const BASE = "https://adega-crm.baccosistemas.com.br";
const SHOT = process.env.SHOT_DIR ?? ".";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await ctx.newPage();

await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.waitForTimeout(5000);
await page.getByLabel(/e-?mail/i).fill("lussandro@gmail.com");
await page.locator('input[type="password"]').fill(process.env.SENHA);
await page.getByRole("button", { name: /^entrar$/i }).last().click();
await page.waitForURL(/\/app/, { timeout: 60000 });

await page.goto(`${BASE}/app/integrations/asaas`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);
await page.screenshot({ path: `${SHOT}/cobranca-1-tela.png`, fullPage: true });

const texto = await page.locator("body").innerText();
console.log("=== TELA ===");
console.log(texto.slice(texto.indexOf("Fluxos de retorno"), texto.indexOf("Fluxos de retorno") + 700));

const caixas = page.locator('input[type="checkbox"]');
console.log("checkboxes:", await caixas.count());
for (let i = 0; i < (await caixas.count()); i++) {
  const c = caixas.nth(i);
  console.log(i, "marcado:", await c.isChecked(), "desabilitado:", await c.isDisabled());
}

await browser.close();
