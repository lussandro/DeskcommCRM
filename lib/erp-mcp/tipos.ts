/**
 * Os tipos do cliente MCP externo (spec 2026-09-18-mcp-cliente-design, D4).
 *
 * Falha é DADO, nunca exceção: quem chama decide o texto em pt-BR que vai ao
 * modelo, e o breaker do engine conta `ok:false`. Um `throw` aqui viraria
 * exceção no meio do turno do agente, que é o comportamento que a spec recusou.
 */

export type FalhaExterna =
  /** Um dos dois guards anti-SSRF recusou o destino. `detalhe` = `unsafe_url:*`. */
  | { tipo: "url_recusada"; detalhe: string }
  /** Estourou o orçamento de tempo da chamada (D5). */
  | { tipo: "timeout" }
  /**
   * A conexão não chegou a ter resposta (DNS, TLS, recusa de conexão).
   *
   * NÃO estava na lista da spec, e é o único acréscimo: o `fetch` rejeita por
   * rede sem status e sem corpo, e empurrar isso para `timeout` ou
   * `corpo_invalido` seria dizer ao operador uma coisa que não aconteceu
   * (Regra nº 1). `detalhe` é a mensagem real do runtime.
   */
  | { tipo: "rede"; detalhe: string }
  /** Resposta HTTP não-2xx. 3xx chega aqui porque `redirect:"manual"` não segue. */
  | { tipo: "http"; status: number }
  /** Corpo vazio, truncado, ou que não é JSON-RPC nenhum. */
  | { tipo: "corpo_invalido"; detalhe: string }
  /** Erro JSON-RPC do envelope (ex.: `-32602 … Required at documento`). */
  | { tipo: "rpc"; codigo: number; mensagem: string }
  /** `result.isError === true`: falha de negócio prevista, resposta ao modelo. */
  | { tipo: "tool_error"; mensagem: string };

export type ResultadoExterno<T> = { ok: true; dados: T } | { ok: false; falha: FalhaExterna };
