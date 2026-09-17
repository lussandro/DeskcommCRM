/**
 * Capacidades de COBRANÇA — só chegam ao agente com o Asaas ativo.
 *
 * As quatro entradas aqui declaram `requerIntegracao` (ver `tipos.ts`): mesmo
 * marcadas na tela, elas não são montadas no turno enquanto a organização não
 * tiver a integração Asaas ligada (`lib/asaas/config.ts` →
 * `carregarCapacidadesDeIntegracao`, aplicado em `lib/ai/runtime/tools.ts`).
 *
 * ESTE ARQUIVO FALA COM O HUMANO que configura o agente. O texto que vai ao
 * MODELO é a `description` do handler (`lib/mcp/tools/cobranca.ts`).
 */
import { declararTools } from "./tipos";

export const TOOLS_COBRANCA = declararTools([
  {
    name: "crm_list_contact_charges",
    category: "read",
    rotulo: "Ver as cobranças pendentes do cliente",
    explicacao:
      "Consulta no Asaas os boletos e Pix em aberto ou vencidos deste cliente (ou da empresa dele), com valor, vencimento e link, para o assistente responder com o dado real e não de memória.",
    oQueToca: "Cobranças no Asaas",
    risco: "seguro",
    pacotes: ["reter", "atender"],
    requerIntegracao: "asaas",
  },
  {
    name: "crm_get_charge_payment_info",
    category: "read",
    rotulo: "Enviar o boleto ou o Pix de uma cobrança",
    explicacao:
      "Busca no Asaas o link, a linha digitável e o Pix copia-e-cola de uma cobrança específica do cliente, para o assistente mandar na conversa.",
    oQueToca: "Cobranças no Asaas",
    risco: "seguro",
    pacotes: ["reter", "atender"],
    requerIntegracao: "asaas",
  },
  {
    name: "crm_link_contact_to_billing",
    category: "write",
    rotulo: "Reconhecer o cliente no Asaas pelo CPF",
    explicacao:
      "Quando o cliente informa o CPF na conversa, confere no Asaas se o telefone do cadastro é o mesmo deste atendimento e, se for, liga o contato ao cliente do Asaas. Empresa não passa por aqui: o vínculo dela é feito pela equipe na tela.",
    oQueToca: "Cadastro do cliente",
    risco: "atencao",
    pacotes: ["reter", "atender"],
    requerIntegracao: "asaas",
  },
  {
    name: "crm_reissue_overdue_charge",
    category: "write",
    rotulo: "Prorrogar o vencimento de um boleto vencido",
    explicacao:
      "Dá uma nova data de vencimento a um boleto já vencido, dentro do limite de dias e de vezes que o administrador definiu na integração Asaas, e devolve o boleto atualizado.",
    oQueToca: "Cobranças no Asaas",
    risco: "atencao",
    pacotes: ["reter"],
    requerIntegracao: "asaas:reemitir",
  },
]);
