import { chromium } from "@playwright/test";
const BASE = "https://adega-crm.baccosistemas.com.br";
const EU = "06f533c6-0426-42f3-a1e9-fe51e6fbf3fb"; // Lussa +5548991286399
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

const api = async (path, init = {}) => {
  const r = await fetch(`${BASE}${path}`, { ...init, headers: { cookie, "content-type": "application/json", ...(init.headers ?? {}) } });
  return { status: r.status, body: await r.json().catch(() => null) };
};

const canais = await api("/api/v1/channel-sessions");
const bacco = (canais.body?.data ?? []).find((c) => (c.phone_number ?? "").includes("91972220"));

const nova = await api("/api/v1/campaigns", {
  method: "POST",
  body: JSON.stringify({
    name: "Teste do motor — só o número do dono",
    channel_session_id: bacco.id,
    template_body: TEXTO,
    base_legal: "legitimate_interest",
    lia_ref: "LIA-2026-01",
  }),
});
const id = nova.body?.data?.id;
console.log("campanha:", nova.status, id);

const aud = await api(`/api/v1/campaigns/${id}/recipients`, {
  method: "POST",
  body: JSON.stringify({ contact_ids: [EU] }),
});
console.log("audiência:", aud.status, JSON.stringify(aud.body));

const start = await api(`/api/v1/campaigns/${id}/start`, { method: "POST", body: JSON.stringify({}) });
console.log("começar:", start.status, JSON.stringify(start.body));
console.log("ID=" + id);
