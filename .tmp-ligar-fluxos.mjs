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
await page.waitForTimeout(4000);

const caixas = page.locator('input[type="checkbox"]');
const n = await caixas.count();
console.log("checkboxes:", n);
for (let i = 0; i < n; i++) {
  const linha = caixas.nth(i);
  const texto = await linha.locator("xpath=..").innerText();
  if (!(await linha.isChecked()) && !(await linha.isDisabled())) {
    await linha.check();
    console.log("marquei:", texto.replace(/\n/g, " | ").slice(0, 80));
  } else {
    console.log("já marcado:", texto.replace(/\n/g, " | ").slice(0, 80));
  }
}

await page.getByRole("button", { name: /^salvar$/i }).first().click();
await page.waitForTimeout(5000);
await page.screenshot({ path: `${SHOT}/cobranca-2-dois-fluxos.png`, fullPage: true });

const toasts = await page.locator("[data-sonner-toast]").allInnerTexts().catch(() => []);
console.log("toast:", toasts);

await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(4000);
const corpo = await page.locator("body").innerText();
const i = corpo.indexOf("Fluxos de retorno");
console.log("=== depois de salvar ===");
console.log(corpo.slice(i, i + 500));
await page.screenshot({ path: `${SHOT}/cobranca-3-salvo.png`, fullPage: true });
await browser.close();
