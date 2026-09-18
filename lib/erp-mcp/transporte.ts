/**
 * O ÚNICO lugar que fala HTTP com o servidor MCP externo (o ERP do cliente).
 *
 * Spec: docs/superpowers/specs/2026-09-18-mcp-cliente-design.md (D4, D5, D6).
 * Contrato MEDIDO do servidor real:
 * `.superpowers/sdd/2026-09-18-mcp-cliente/mcp-externo-medido.md`.
 *
 * Três coisas aqui vêm de medição, não de documentação, e são a razão deste
 * arquivo existir separado:
 *
 *  1. **A resposta pode vir como SSE.** O servidor da ChatCore devolve
 *     `text/event-stream` com a carga em linhas `data: {…}` — um cliente que
 *     chame `res.json()` direto simplesmente não parseia. Mas `Accept` pede as
 *     duas formas, e um servidor MCP pode responder JSON puro; aceitar só uma
 *     quebraria com o outro. Por isso as duas são lidas, e em SSE vale a ÚLTIMA
 *     linha `data:` que parseia (as anteriores podem ser notificações de
 *     progresso; a última é a resposta).
 *  2. **Erro é resposta, não exceção.** `-32602` no envelope e `isError:true`
 *     no resultado são as duas formas que o servidor usa, e as duas viram
 *     `ok:false` — que é o que o breaker do engine conta como falha.
 *  3. **Os DOIS guards anti-SSRF, a cada chamada.** Molde de
 *     `lib/automation/actions/call-webhook.ts:70-121`: o textual recusa de
 *     graça o que dá (esquema, http em produção, literal IPv6, host privado); o
 *     que resolve paga o DNS e julga o IP — inclusive faixas que o textual não
 *     cobre (CGNAT, TEST-NET, multicast). Um só não basta, e a janela residual
 *     de rebinding está declarada em `outbound-ip.ts` e na D6.
 *
 * Segredo nunca sai daqui: a chave vai no cabeçalho e não é registrada, e
 * nenhuma falha carrega corpo, cabeçalho ou URL completa.
 */
import { assertDestinoResolvidoSeguro } from "@/lib/automation/outbound-ip";
import { assertSafeOutboundUrl } from "@/lib/automation/outbound-url";

import type { ResultadoExterno } from "./tipos";

/** D5: orçamento de tempo por chamada. O loop do agente não para por tempo de parede. */
const TIMEOUT_PADRAO_MS = 10_000;

/** Envelope JSON-RPC 2.0, só o que este transporte olha. */
interface EnvelopeRpc {
  error?: { code?: unknown; message?: unknown };
  result?: unknown;
}

/**
 * Extrai o envelope de um corpo que pode ser SSE ou JSON puro.
 *
 * Devolve `null` quando nada parseia — corpo vazio, truncado no meio de um
 * `data:`, ou HTML de um proxy no caminho.
 */
function lerEnvelope(corpo: string): EnvelopeRpc | null {
  const linhasData = corpo
    .split(/\r?\n/)
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice("data:".length).trim());

  if (linhasData.length > 0) {
    // De trás para frente: a última que parseia é a resposta. Uma linha truncada
    // no fim do stream não pode apagar a resposta que já veio inteira antes.
    for (let i = linhasData.length - 1; i >= 0; i--) {
      const parsed = tentarJson(linhasData[i] as string);
      if (parsed) return parsed;
    }
    return null;
  }

  return tentarJson(corpo.trim());
}

function tentarJson(texto: string): EnvelopeRpc | null {
  if (!texto) return null;
  try {
    const v: unknown = JSON.parse(texto);
    return typeof v === "object" && v !== null ? (v as EnvelopeRpc) : null;
  } catch {
    return null;
  }
}

/** O texto de `result.content[0].text`, quando existe. */
function textoDoConteudo(result: unknown): string {
  const conteudo = (result as { content?: unknown })?.content;
  if (!Array.isArray(conteudo)) return "";
  const primeiro = conteudo[0] as { text?: unknown } | undefined;
  return typeof primeiro?.text === "string" ? primeiro.text : "";
}

export async function chamarRpc(
  cfg: { url: string; chave: string },
  metodo: "tools/list" | "tools/call",
  params: Record<string, unknown>,
  deps: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<ResultadoExterno<unknown>> {
  try {
    assertSafeOutboundUrl(cfg.url);
    await assertDestinoResolvidoSeguro(new URL(cfg.url).hostname);
  } catch (err) {
    return { ok: false, falha: { tipo: "url_recusada", detalhe: (err as Error).message } };
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await fetchImpl(cfg.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.chave}`,
        "Content-Type": "application/json",
        // As duas formas, porque o servidor escolhe qual devolve.
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: metodo, params }),
      // Nunca seguir 3xx: a URL passou nos guards, o destino do redirect não.
      redirect: "manual",
      signal: AbortSignal.timeout(deps.timeoutMs ?? TIMEOUT_PADRAO_MS),
    });
  } catch (err) {
    const nome = (err as Error)?.name;
    if (nome === "TimeoutError" || nome === "AbortError") return { ok: false, falha: { tipo: "timeout" } };
    return { ok: false, falha: { tipo: "rede", detalhe: (err as Error)?.message ?? String(err) } };
  }

  if (!res.ok) return { ok: false, falha: { tipo: "http", status: res.status } };

  let corpo: string;
  try {
    corpo = await res.text();
  } catch (err) {
    return { ok: false, falha: { tipo: "corpo_invalido", detalhe: (err as Error)?.message ?? "corpo ilegível" } };
  }

  const envelope = lerEnvelope(corpo);
  if (!envelope) {
    return {
      ok: false,
      // O tamanho, nunca o conteúdo: o corpo carrega dado do cliente.
      falha: { tipo: "corpo_invalido", detalhe: `resposta não é JSON-RPC (${corpo.length} bytes)` },
    };
  }

  if (envelope.error) {
    const codigo = typeof envelope.error.code === "number" ? envelope.error.code : 0;
    const mensagem = typeof envelope.error.message === "string" ? envelope.error.message : "erro sem mensagem";
    return { ok: false, falha: { tipo: "rpc", codigo, mensagem } };
  }

  if (envelope.result === undefined) {
    return { ok: false, falha: { tipo: "corpo_invalido", detalhe: "envelope sem result nem error" } };
  }

  if ((envelope.result as { isError?: unknown }).isError === true) {
    return {
      ok: false,
      falha: { tipo: "tool_error", mensagem: textoDoConteudo(envelope.result) || "o sistema recusou a consulta" },
    };
  }

  return { ok: true, dados: envelope.result };
}
