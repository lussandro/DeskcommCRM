import { chromium } from "@playwright/test";

const BASE = "https://adega-crm.baccosistemas.com.br";
const FINANCEIRO = "fe61b36a-a8a7-4c20-b69c-94fc9ec2bfcc"; // ChatCore · Financeiro
const FLUXO_BACCO = "f1e5ae4b-35ca-454e-bb22-5c4f5c7947ce";

const GRAFO = {
  nodes: [
    { id: "trigger-1", type: "trigger", label: "Cobrança venceu (Asaas)", config: {}, position: { x: 0, y: 0 } },
    {
      id: "action-2",
      type: "action",
      label: "Aviso de vencimento",
      config: {
        mode: "ai_message",
        prompt_hint:
          "Uma cobrança deste cliente da ChatCore venceu no Asaas. Antes de escrever, consulte as pendências dele (ferramenta de listar cobranças) e cite valor e data de vencimento reais — nunca invente. Se não houver vencida, não cobre: diga que está tudo em dia. Avise com cordialidade que não identificamos o pagamento e ofereça duas saídas: a segunda via (boleto ou Pix, pela ferramenta de dados de pagamento) ou uma nova data dentro do limite permitido. Sem ameaça, sem falar em bloqueio ou corte de acesso. Duas ou três frases.",
      },
      position: { x: 240, y: 0 },
    },
    { id: "end-1", type: "end", label: "Encerra", config: { outcome: "exhausted" }, position: { x: 480, y: 0 } },
  ],
  edges: [
    { id: "e-1", source: "trigger-1", target: "action-2", priority: 0, condition: { type: "always" } },
    { id: "e-2", source: "action-2", target: "end-1", priority: 0, condition: { type: "always" } },
  ],
};

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.waitForTimeout(5000);
await page.getByLabel(/e-?mail/i).fill("lussandro@gmail.com");
await page.locator('input[type="password"]').fill(process.env.SENHA);
await page.getByRole("button", { name: /^entrar$/i }).last().click();
await page.waitForURL(/\/app/, { timeout: 60000 });
const cookie = (await ctx.cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
await browser.close();

const api = async (path, init = {}) => {
  const r = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { cookie, "content-type": "application/json", ...(init.headers ?? {}) },
  });
  return { status: r.status, body: await r.json().catch(() => null) };
};

// 1. cria o fluxo (nasce draft, gatilho manual)
const criado = await api("/api/v1/ai/followup-flows", {
  method: "POST",
  body: JSON.stringify({ name: "Cobrança ChatCore — vencida no Asaas" }),
});
console.log("criar", criado.status, JSON.stringify(criado.body).slice(0, 200));
const fluxoId = criado.body?.data?.id;
if (!fluxoId) process.exit(1);

// 2. grafo + gatilho de sistema externo
const patch = await api(`/api/v1/ai/followup-flows/${fluxoId}`, {
  method: "PATCH",
  body: JSON.stringify({ draft_graph: GRAFO, trigger_config: { kind: "webhook" }, handoff_policy: "pause" }),
});
console.log("patch", patch.status, JSON.stringify(patch.body).slice(0, 200));

// 3. publica
const pub = await api(`/api/v1/ai/followup-flows/${fluxoId}/publish`, { method: "POST" });
console.log("publish", pub.status, JSON.stringify(pub.body).slice(0, 200));

// 4. arma no ChatCore · Financeiro (nova versão publicada com followup apontando o fluxo)
const versoes = await api(`/api/v1/ai/agents/${FINANCEIRO}/versions`);
const atual = (versoes.body?.data ?? []).find((v) => v.status === "published");
const followup = { ...(atual.followup ?? {}), enabled: true, flow_pointer_ids: [fluxoId] };
const corpo = {
  system_prompt: atual.system_prompt,
  provider: atual.provider,
  model: atual.model,
  credential_id: atual.credential_id,
  tool_ids: atual.tool_ids,
  trigger_config: atual.trigger_config,
  channel_session_id: atual.channel_session_id,
  max_steps: atual.max_steps,
  token_budget: atual.token_budget,
  cost_budget_cents: atual.cost_budget_cents,
  history_message_window: atual.history_message_window,
  history_token_window: atual.history_token_window,
  handoff_keywords: atual.handoff_keywords,
  handoff_tool_enabled: atual.handoff_tool_enabled,
  cases_enabled: atual.cases_enabled,
  split_messages: atual.split_messages,
  split_max_chars: atual.split_max_chars,
  followup,
  operator_enabled: atual.operator_enabled,
  operator_model: atual.operator_model,
  operator_tool_ids: atual.operator_tool_ids,
  pipeline_ids: atual.pipeline_ids,
  knowledge_source_ids: atual.knowledge_source_ids,
};
const nova = await api(`/api/v1/ai/agents/${FINANCEIRO}/versions`, { method: "POST", body: JSON.stringify(corpo) });
console.log("versao", nova.status, nova.body?.data?.id);
const pubAgente = await api(`/api/v1/ai/agents/${FINANCEIRO}/publish`, {
  method: "POST",
  body: JSON.stringify({ version_id: nova.body?.data?.id }),
});
console.log("publicar agente", pubAgente.status, JSON.stringify(pubAgente.body).slice(0, 200));

// 5. liga os DOIS fluxos na integração Asaas
const salvo = await fetch(`${BASE}/app/integrations/asaas`, { headers: { cookie } });
console.log("tela asaas", salvo.status);
console.log("FLUXO_CHATCORE=" + fluxoId);
console.log("Agora ligar na tela:", [FLUXO_BACCO, fluxoId].join(" + "));
