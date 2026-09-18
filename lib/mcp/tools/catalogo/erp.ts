/**
 * Capacidades de CONSULTA ao sistema de gestão do cliente (o ERP externo).
 *
 * As cinco declaram `requerIntegracao: "mcp"`: mesmo marcadas na tela, não são
 * montadas no turno enquanto a organização não tiver a integração ligada e
 * saudável (`lib/asaas/config.ts` → `carregarCapacidadesDeIntegracao`, aplicado
 * em `lib/ai/runtime/tools.ts`). Quando o sistema de gestão cai, elas somem —
 * em vez de o assistente tentar, falhar e inventar.
 *
 * ESTE ARQUIVO FALA COM O HUMANO que configura o agente. O texto que vai ao
 * MODELO é a `description` do handler (`lib/mcp/tools/erp.ts`).
 */
import { declararTools } from "./tipos";

export const TOOLS_ERP = declararTools([
  {
    name: "crm_erp_situacao_do_cliente",
    category: "read",
    rotulo: "Ver a situação do cliente no sistema de gestão",
    explicacao:
      "Consulta no sistema de gestão da empresa se este cliente está em atraso, quantas faturas venceram, quanto está vencido, qual é a próxima fatura e se alguma instância dele está bloqueada, para o assistente responder com o dado real e não de memória.",
    oQueToca: "Sistema de gestão da empresa",
    risco: "seguro",
    pacotes: ["atender", "reter"],
    requerIntegracao: "mcp",
  },
  {
    name: "crm_erp_faturas_do_cliente",
    category: "read",
    rotulo: "Ver as faturas do cliente no sistema de gestão",
    explicacao:
      "Busca no sistema de gestão da empresa a lista de faturas deste cliente, com número, situação, vencimento, valor e o link de pagamento quando existe, para o assistente mandar na conversa.",
    oQueToca: "Sistema de gestão da empresa",
    risco: "seguro",
    pacotes: ["atender", "reter"],
    requerIntegracao: "mcp",
  },
  {
    name: "crm_erp_fatura",
    category: "read",
    rotulo: "Detalhar uma fatura do cliente",
    explicacao:
      "Abre no sistema de gestão da empresa os detalhes de uma fatura específica deste cliente — situação, vencimento, valor, valor já pago e link de pagamento quando existe.",
    oQueToca: "Sistema de gestão da empresa",
    risco: "seguro",
    pacotes: ["atender", "reter"],
    requerIntegracao: "mcp",
  },
  {
    name: "crm_erp_contrato",
    category: "read",
    rotulo: "Ver o contrato do cliente",
    explicacao:
      "Mostra o contrato do cliente no sistema de gestão da empresa: situação, dia de vencimento, ciclo de cobrança, início, fim, se renova sozinho e o que está contratado.",
    oQueToca: "Sistema de gestão da empresa",
    risco: "seguro",
    pacotes: ["atender", "reter"],
    requerIntegracao: "mcp",
  },
  {
    name: "crm_erp_instancia",
    category: "read",
    rotulo: "Ver se a instância do cliente está bloqueada",
    explicacao:
      "Consulta no sistema de gestão da empresa se uma instância deste cliente está bloqueada e qual é o motivo do bloqueio, para o assistente explicar por que parou de funcionar.",
    oQueToca: "Sistema de gestão da empresa",
    risco: "seguro",
    pacotes: ["atender", "reter"],
    requerIntegracao: "mcp",
  },
]);
