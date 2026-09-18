/**
 * O motivo da falha ESCRITO PARA O OPERADOR — o outro lado de
 * `textoParaOModelo` (`lib/mcp/tools/erp.ts`).
 *
 * São públicos diferentes e por isso são dois textos: ao MODELO se diz o que
 * dizer ao cliente (sem status HTTP, sem jargão); a quem administra se diz o que
 * CONSERTAR (401 é chave, timeout é servidor lento, `url_recusada` é endereço).
 * Um texto só serviria mal aos dois.
 *
 * Este texto vai para `tenant_integrations.status_reason`, para a tela e para o
 * corpo do aviso da Central. Nunca carrega a URL completa, a chave, nem o corpo
 * da resposta.
 */
import type { FalhaExterna } from "./tipos";

export function motivoDaFalha(falha: FalhaExterna): string {
  switch (falha.tipo) {
    case "url_recusada":
      return "O endereço foi recusado por segurança (precisa ser https e apontar para fora da sua rede interna).";
    case "timeout":
      return "O servidor não respondeu dentro de 10 segundos.";
    case "rede":
      return "Não foi possível chegar ao servidor (endereço, DNS ou certificado).";
    case "http":
      return falha.status === 401 || falha.status === 403
        ? "O servidor recusou a chave (401/403). Confira a chave."
        : `O servidor respondeu com erro HTTP ${falha.status}.`;
    case "corpo_invalido":
      return "A resposta do servidor não é um MCP válido.";
    case "rpc":
      return `O servidor recusou a chamada (${falha.codigo}).`;
    case "tool_error":
      return "O servidor respondeu com erro ao listar as ferramentas.";
  }
}
