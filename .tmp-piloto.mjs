import { chromium } from "@playwright/test";
const BASE = "https://adega-crm.baccosistemas.com.br";
const TEXTO = `Bom dia! Aqui é a Bacco Sistemas, de Santa Catarina. Seu telefone veio do cadastro público da Receita, no registro de produtor de uva.

Antes de tomar seu tempo: vocês vinificam? Pergunto porque quem vinifica carrega um problema que quem só vende uva não tem — saber quanto entrou de uva e quanto saiu de vinho, tanque por tanque, sem depender do caderno.

Se vocês só vendem a uva, é só falar que eu não incomodo mais.`;

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

const api = async (path, init = {}) => {
  const r = await fetch(`${BASE}${path}`, { ...init, headers: { cookie, "content-type": "application/json", ...(init.headers ?? {}) } });
  return { status: r.status, body: await r.json().catch(() => null) };
};

const canais = await api("/api/v1/channel-sessions");
const lista = canais.body?.data ?? [];
const bacco = lista.find((c) => (c.phone_number ?? "").includes("91972220"));
console.log("canal Bacco:", bacco?.id, bacco?.phone_number);

const nova = await api("/api/v1/campaigns", {
  method: "POST",
  body: JSON.stringify({
    name: "Piloto — produtores de uva (DDD 15)",
    channel_session_id: bacco.id,
    template_body: TEXTO,
    base_legal: "legitimate_interest",
    lia_ref: "LIA-2026-01",
  }),
});
console.log("campanha:", nova.status, nova.body?.data?.id);
console.log("CAMPANHA_ID=" + (nova.body?.data?.id ?? ""));
