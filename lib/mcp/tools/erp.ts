/**
 * As cinco CONSULTAS ao ERP externo (spec 2026-09-18-mcp-cliente-design §3).
 *
 * São ferramentas NOSSAS: nome, descrição e schema escritos aqui, resposta
 * montada pela projeção (`lib/erp-mcp/projecao.ts`). Nada do servidor externo
 * chega ao modelo sem passar por ela — nem campo, nem texto livre de erro (D10).
 * As 24 ferramentas do servidor, inclusive as destrutivas, são inalcançáveis por
 * construção: o que não está nesta lista não existe para o agente (D2).
 *
 * Três regras que este arquivo carrega e que não são decoração:
 *
 *  1. **Erro é `{ ok:false, error }`.** `ok:false` é o que o breaker do engine
 *     conta como falha (`lib/agent-engine/agent/tool-breaker.ts`); `{ error }`
 *     sozinho passa batido e o modelo insiste na mesma chamada quebrada.
 *  2. **O texto da falha que vai ao MODELO é nosso, em pt-BR.** A mensagem real
 *     do ERP (inclusive a de `isError`) vai só para o log: ela é texto remoto, e
 *     texto remoto no prompt é injeção.
 *  3. **4 consultas por turno.** A quinta não sai para a rede (D5) — o loop do
 *     agente não para por tempo de parede.
 */
import { z } from "zod";

import { CONSULTAS_DO_ERP, carregarIntegracaoErpMcp, type IntegracaoErpMcp } from "@/lib/erp-mcp/config";
import {
  projetarContrato,
  projetarFatura,
  projetarFaturas,
  projetarInstancia,
  projetarSituacaoDoCliente,
} from "@/lib/erp-mcp/projecao";
import type { FalhaExterna, ResultadoExterno } from "@/lib/erp-mcp/tipos";
import { chamarRpc } from "@/lib/erp-mcp/transporte";
import { logger } from "@/lib/logger";

import type { McpContext, McpToolDefinition } from "../types";

const SEM_MODULO = "A consulta ao sistema de gestão não está ativa nesta organização.";
/**
 * O laço do documento que falta, fechado pelo caminho mais barato que existe.
 *
 * Sem CPF/CNPJ no cadastro nenhuma das cinco consultas sai, e não há tela do
 * agente que grave documento: quem grava é uma PESSOA, na ficha do contato (que
 * já aceita CNPJ na empresa e CPF cifrado no contato). Então o texto manda o
 * modelo fazer as duas coisas que ele PODE fazer: pedir o documento ao cliente e
 * abrir caso humano (`open_human_case`, tool nativa do engine) para alguém
 * completar o cadastro. Sem o caso, o documento dito na conversa morre ali e a
 * próxima consulta volta a falhar pelo mesmo motivo — o modo de morte que o
 * Sistema Vivo proíbe.
 *
 * NÃO é o handler que abre o caso: `McpContext` não carrega `conversation_id`
 * (só `turnContactId`), e abrir caso exige a conversa. Fazer o handler abrir
 * caso exigiria mudar o contexto do MCP inteiro — caro, e para um efeito que a
 * instrução já alcança.
 */
const SEM_DOCUMENTO =
  "Este cliente ainda não tem CPF nem CNPJ no cadastro, e sem documento o sistema de gestão não responde. " +
  "Peça o CPF ou CNPJ ao cliente e ABRA UM CASO HUMANO (open_human_case) pedindo que alguém complete o cadastro dele com esse documento.";
const LIMITE_POR_TURNO = 4;

/**
 * O método do ERP de cada ferramenta vem de `CONSULTAS_DO_ERP` — a MESMA lista
 * que a tela da integração usa para dizer quais consultas o servidor expõe.
 * Repetir o nome do método aqui faria a tela prometer o que o handler não
 * chama.
 */
type FerramentaErp = (typeof CONSULTAS_DO_ERP)[number]["ferramenta"];
const METODO_DO_ERP = Object.fromEntries(CONSULTAS_DO_ERP.map((c) => [c.ferramenta, c.metodo])) as Record<FerramentaErp, string>;

/** Os SETE tipos de falha do transporte, cada um com o que o cliente pode ouvir. */
function textoParaOModelo(falha: FalhaExterna): string {
  switch (falha.tipo) {
    case "url_recusada":
      return "O endereço do sistema de gestão foi recusado por segurança. Avise que a equipe precisa conferir a configuração.";
    case "timeout":
      return "O sistema de gestão demorou demais para responder. Tente de novo em instantes ou ofereça falar com uma pessoa.";
    case "rede":
      return "Não consegui falar com o sistema de gestão agora. Ofereça falar com uma pessoa.";
    case "http":
      return falha.status === 401 || falha.status === 403
        ? "O sistema de gestão recusou o acesso. Avise que a equipe precisa conferir a configuração."
        : "O sistema de gestão respondeu com erro. Ofereça falar com uma pessoa.";
    case "corpo_invalido":
      return "A resposta do sistema de gestão veio incompleta. Não invente o dado: ofereça falar com uma pessoa.";
    case "rpc":
      return "O sistema de gestão recusou os dados desta consulta. Não insista com os mesmos dados.";
    case "tool_error":
      return "O sistema de gestão não conseguiu responder esta consulta agora.";
  }
}

/** Para o log: motivo e status, nunca corpo, nunca URL, nunca a chave. */
function motivoParaOLog(falha: FalhaExterna): Record<string, unknown> {
  switch (falha.tipo) {
    case "http":
      return { motivo: "http", http_status: falha.status };
    case "rpc":
      return { motivo: "rpc", codigo: falha.codigo, mensagem: falha.mensagem };
    case "tool_error":
      return { motivo: "tool_error", mensagem: falha.mensagem };
    case "url_recusada":
    case "rede":
    case "corpo_invalido":
      return { motivo: falha.tipo, detalhe: falha.detalhe };
    case "timeout":
      return { motivo: "timeout" };
  }
}

/**
 * Consultas já gastas no turno, por `requestId` (o id do run/job — é o turno).
 *
 * ponytail: contador em memória do processo, com teto de entradas. Um turno
 * vive num processo só, e o que este contador protege é o orçamento de tempo
 * DESTE turno; contador compartilhado (Redis) seria infra nova para um limite
 * que não precisa ser exato entre processos.
 */
const TETO_DE_TURNOS_LEMBRADOS = 500;
const consultasDoTurno = new Map<string, number>();

function gastarConsulta(requestId: string): boolean {
  const gastas = consultasDoTurno.get(requestId) ?? 0;
  if (gastas >= LIMITE_POR_TURNO) return false;
  if (!consultasDoTurno.has(requestId) && consultasDoTurno.size >= TETO_DE_TURNOS_LEMBRADOS) {
    // Map preserva ordem de inserção: o mais antigo sai primeiro.
    const maisAntigo = consultasDoTurno.keys().next().value;
    if (maisAntigo !== undefined) consultasDoTurno.delete(maisAntigo);
  }
  consultasDoTurno.set(requestId, gastas + 1);
  return true;
}

/** Só para teste: o contador é de processo e não deve vazar entre casos. */
export function __zerarConsultasDoTurno(): void {
  consultasDoTurno.clear();
}

/**
 * O documento do cliente vem do CADASTRO, nunca do modelo.
 *
 * Aceitar o documento que o modelo manda abriria a porta para consultar a
 * situação financeira de QUALQUER cliente do ERP a partir de qualquer conversa
 * — basta o número ser dito no chat. A empresa do contato guarda o CNPJ em
 * claro; o CPF do contato é cifrado e só a RPC `decrypt_cpf` o abre (e ela pode
 * não estar provisionada no clone — nesse caso o retorno é null, e null vira
 * "peça o documento", nunca um documento adivinhado).
 */
async function documentoDoContato(ctx: McpContext, contactId: string): Promise<string | null> {
  const { data: contato } = await ctx.supabase
    .from("contacts")
    .select("id, company_id, cpf_encrypted")
    .eq("organization_id", ctx.organizationId)
    .eq("id", contactId)
    .maybeSingle();
  if (!contato) return null;

  if (contato.company_id) {
    const { data: empresa } = await ctx.supabase
      .from("crm_companies")
      .select("cnpj")
      .eq("organization_id", ctx.organizationId)
      .eq("id", contato.company_id)
      .maybeSingle();
    const digitos = (empresa?.cnpj ?? "").replace(/\D/g, "");
    if (digitos) return digitos;
  }

  if (!contato.cpf_encrypted) return null;
  const { data, error } = await ctx.supabase.rpc("decrypt_cpf", { p_contact_id: contactId });
  if (error || typeof data !== "string") return null;
  const digitos = data.replace(/\D/g, "");
  return digitos || null;
}

type Resposta = Record<string, unknown>;

/** A porta: sem integração ligada, nenhuma consulta acontece. */
async function comIntegracao(ctx: McpContext, seguir: (integ: IntegracaoErpMcp) => Promise<Resposta>): Promise<Resposta> {
  const integ = await carregarIntegracaoErpMcp(ctx.supabase, ctx.organizationId);
  if (!integ) return { error: SEM_MODULO };
  return seguir(integ);
}

/** limite → transporte → projeção. Todo caminho de falha passa por aqui. */
async function consultar<T>(
  ctx: McpContext,
  integ: IntegracaoErpMcp,
  ferramenta: string,
  metodoDoErp: string,
  argumentos: Record<string, unknown>,
  projetar: (result: unknown) => ResultadoExterno<T>,
): Promise<Resposta> {
  if (!gastarConsulta(ctx.requestId)) {
    return { ok: false, error: "limite de consultas ao sistema neste atendimento" };
  }

  const bruto = await chamarRpc({ url: integ.url, chave: integ.chave }, "tools/call", {
    name: metodoDoErp,
    arguments: argumentos,
  });
  const resultado = bruto.ok ? projetar(bruto.dados) : bruto;
  if (!resultado.ok) {
    logger.error("[erp-mcp] consulta falhou", { ferramenta, ...motivoParaOLog(resultado.falha) });
    return { ok: false, error: textoParaOModelo(resultado.falha) };
  }
  return resultado.dados as Resposta;
}

/** As quatro que partem do cadastro do cliente pedem só o contato do turno. */
const porContato = { contact_id: z.string().uuid().describe("O cliente da conversa.") };

function consultarPorDocumento<T>(
  ctx: McpContext,
  contactId: string,
  ferramenta: string,
  metodoDoErp: string,
  projetar: (result: unknown) => ResultadoExterno<T>,
): Promise<Resposta> {
  return comIntegracao(ctx, async (integ) => {
    const documento = await documentoDoContato(ctx, contactId);
    if (!documento) return { needs_document: true, message: SEM_DOCUMENTO };
    return consultar(ctx, integ, ferramenta, metodoDoErp, { documento }, projetar);
  });
}

export const crmErpSituacaoDoCliente: McpToolDefinition<typeof porContato> = {
  name: "crm_erp_situacao_do_cliente",
  description:
    "Situação do cliente no sistema de gestão: se está em atraso, quantas faturas venceram, o total vencido, a próxima fatura e as instâncias dele (bloqueada ou não, e por quê). " +
    "Use antes de prometer qualquer coisa sobre pagamento ou bloqueio. Se voltar needs_document, peça o documento ao cliente e avise que a equipe completa o cadastro.",
  inputSchema: porContato,
  category: "read",
  requiresRole: "agent",
  requiresScope: "mcp:read",
  handler: (input, ctx) =>
    consultarPorDocumento(ctx, input.contact_id, "crm_erp_situacao_do_cliente", METODO_DO_ERP.crm_erp_situacao_do_cliente, projetarSituacaoDoCliente),
};

export const crmErpFaturasDoCliente: McpToolDefinition<typeof porContato> = {
  name: "crm_erp_faturas_do_cliente",
  description:
    "Lista as faturas deste cliente no sistema de gestão, com número, status, competência, vencimento, valor e link de pagamento quando existe. " +
    "link_pagamento null significa que NÃO há link: não invente um, ofereça falar com uma pessoa.",
  inputSchema: porContato,
  category: "read",
  requiresRole: "agent",
  requiresScope: "mcp:read",
  handler: (input, ctx) =>
    consultarPorDocumento(ctx, input.contact_id, "crm_erp_faturas_do_cliente", METODO_DO_ERP.crm_erp_faturas_do_cliente, projetarFaturas),
};

const porNumeroDeFatura = {
  contact_id: z.string().uuid().describe("O cliente da conversa."),
  numero: z.string().min(1).describe("O número da fatura, como apareceu na lista de faturas deste cliente."),
};

export const crmErpFatura: McpToolDefinition<typeof porNumeroDeFatura> = {
  name: "crm_erp_fatura",
  description:
    "Detalha UMA fatura deste cliente pelo número, com status, vencimento, valor, valor pago e link de pagamento quando existe. " +
    "Use o número que veio da lista de faturas — não invente número.",
  inputSchema: porNumeroDeFatura,
  category: "read",
  requiresRole: "agent",
  requiresScope: "mcp:read",
  handler: (input, ctx) => comIntegracao(ctx, (integ) => consultar(ctx, integ, "crm_erp_fatura", METODO_DO_ERP.crm_erp_fatura, { numero: input.numero }, projetarFatura)),
};

const porNumeroDeContrato = {
  contact_id: z.string().uuid().describe("O cliente da conversa."),
  numero: z.string().min(1).describe("O número do contrato, como apareceu na situação do cliente."),
};

export const crmErpContrato: McpToolDefinition<typeof porNumeroDeContrato> = {
  name: "crm_erp_contrato",
  description:
    "Mostra o contrato do cliente pelo número: status, dia de vencimento, ciclo de cobrança, início, fim, se renova sozinho, se está suspenso e os itens contratados.",
  inputSchema: porNumeroDeContrato,
  category: "read",
  requiresRole: "agent",
  requiresScope: "mcp:read",
  handler: (input, ctx) => comIntegracao(ctx, (integ) => consultar(ctx, integ, "crm_erp_contrato", METODO_DO_ERP.crm_erp_contrato, { numero: input.numero }, projetarContrato)),
};

const porNomeDeInstancia = {
  contact_id: z.string().uuid().describe("O cliente da conversa."),
  nome: z.string().min(1).describe("O nome da instância, como apareceu na situação do cliente."),
};

export const crmErpInstancia: McpToolDefinition<typeof porNomeDeInstancia> = {
  name: "crm_erp_instancia",
  description:
    "Diz se uma instância do cliente está bloqueada e o motivo do bloqueio. Use quando ele perguntar por que parou de funcionar.",
  inputSchema: porNomeDeInstancia,
  category: "read",
  requiresRole: "agent",
  requiresScope: "mcp:read",
  // NÃO MEDIDO: o nome do parâmetro de `invoice.get` e de
  // `chatcore.instance.get` não foi capturado numa chamada real (a medição só
  // cobriu `customer.status`/`invoice.list` com `documento` e `contract.get`
  // com `numero`), e os nomes VARIAM entre ferramentas do mesmo servidor. Se o
  // servidor recusar com -32602, o log traz a mensagem literal e o ajuste é
  // uma linha aqui — o modelo recebe "recusou os dados desta consulta" e não
  // insiste.
  handler: (input, ctx) => comIntegracao(ctx, (integ) => consultar(ctx, integ, "crm_erp_instancia", METODO_DO_ERP.crm_erp_instancia, { nome: input.nome }, projetarInstancia)),
};
