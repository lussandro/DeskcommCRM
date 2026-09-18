import { chromium } from "@playwright/test";
const BASE = "https://adega-crm.baccosistemas.com.br";
const CAMPANHA = "7f745157-0809-4d55-9829-b833abe698c4";
const TEXTO = `{{saudacao}}! Aqui é a Bacco Sistemas, de Santa Catarina.

Achei o contato de vocês no cadastro público da Receita, como produtor de uva — e fiquei com uma dúvida antes de tomar seu tempo: vocês vinificam ou vendem a uva?

Se só vendem, me diz que eu não incomodo mais.`;

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
console.log(JSON.stringify({ campanha: CAMPANHA, texto: TEXTO }));
console.log("COOKIE_LEN", cookie.length);
