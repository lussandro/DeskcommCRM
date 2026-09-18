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
 *     sozinho passa batido e o modelo insiste na mesma chamada quebrada. Vale
 *     também para "módulo desligado" e "falta documento": os dois são motivo
 *     para PARAR de chamar, e o arquivo dizia isso enquanto fazia o contrário.
 *  2. **O texto da falha que vai ao MODELO é nosso, em pt-BR.** A mensagem real
 *     do ERP (inclusive a de `isError`) vai só para o log: ela é texto remoto, e
 *     texto remoto no prompt é injeção.
 *  3. **4 consultas por turno.** A quinta não sai para a rede (D5) — o loop do
 *     agente não para por tempo de parede.
 *  4. **Identificador vindo do MODELO não é prova de nada.** `numero` e `nome`
 *     são sequenciais ou derivados do CNPJ; quem prova posse é sempre uma
 *     consulta pelo DOCUMENTO DO CADASTRO, e o pedido só é atendido se o
 *     identificador estiver na resposta dela (`provaDePosse` abaixo).
 */
import { z } from "zod";

import { registrarFalha, registrarSucesso } from "@/lib/erp-mcp/aviso";
import { CONSULTAS_DO_ERP, carregarIntegracaoErpMcp, type IntegracaoErpMcp } from "@/lib/erp-mcp/config";
import {
  mascararDocumento,
  projetarContrato,
  projetarFaturas,
  projetarTitular,
  textoParaOLog,
  type TitularDoErp,
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

/**
 * Para o log: motivo e status, nunca corpo, nunca URL, nunca a chave.
 *
 * `rpc` e `tool_error` carregam a mensagem que o ERP escreveu — é exatamente
 * onde vive o `{"erro":…}` de negócio, e um `-32602` ecoa o argumento que
 * mandamos. Texto remoto, portanto: passa por `textoParaOLog` (documento
 * mascarado, uma linha, 200 caracteres). O cabeçalho promete "nunca corpo" e
 * este era o caminho que entregava corpo.
 */
function motivoParaOLog(falha: FalhaExterna): Record<string, unknown> {
  switch (falha.tipo) {
    case "http":
      return { motivo: "http", http_status: falha.status };
    case "rpc":
      return { motivo: "rpc", codigo: falha.codigo, mensagem: textoParaOLog(falha.mensagem) };
    case "tool_error":
      return { motivo: "tool_error", mensagem: textoParaOLog(falha.mensagem) };
    case "url_recusada":
    case "rede":
    case "corpo_invalido":
      return { motivo: falha.tipo, detalhe: textoParaOLog(falha.detalhe) };
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

/** Um passo intermediário: ou o dado projetado, ou a resposta pronta ao modelo. */
type Passo<T> = { ok: true; dados: T } | { ok: false; resposta: Resposta };

/** A porta: sem integração ligada, nenhuma consulta acontece. */
async function comIntegracao(ctx: McpContext, seguir: (integ: IntegracaoErpMcp) => Promise<Resposta>): Promise<Resposta> {
  const integ = await carregarIntegracaoErpMcp(ctx.supabase, ctx.organizationId);
  if (!integ) return { ok: false, error: SEM_MODULO };
  return seguir(integ);
}

/** O documento do cadastro, ou a instrução de pedi-lo. Nenhuma das cinco passa sem ele. */
async function comDocumento(ctx: McpContext, contactId: string, seguir: (documento: string) => Promise<Resposta>): Promise<Resposta> {
  const documento = await documentoDoContato(ctx, contactId);
  if (!documento) return { ok: false, needs_document: true, error: SEM_DOCUMENTO };
  return seguir(documento);
}

/** O host da integração desta organização — é ele que autoriza um link de pagamento. */
function hostDaIntegracao(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/** limite → transporte → projeção. Todo caminho de falha passa por aqui. */
async function consultarCru<T>(
  ctx: McpContext,
  integ: IntegracaoErpMcp,
  ferramenta: string,
  metodoDoErp: string,
  argumentos: Record<string, unknown>,
  projetar: (result: unknown) => ResultadoExterno<T>,
): Promise<Passo<T>> {
  if (!gastarConsulta(ctx.requestId)) {
    return { ok: false, resposta: { ok: false, error: "limite de consultas ao sistema neste atendimento" } };
  }

  const bruto = await chamarRpc({ url: integ.url, chave: integ.chave }, "tools/call", {
    name: metodoDoErp,
    arguments: argumentos,
  });
  const resultado = bruto.ok ? projetar(bruto.dados) : bruto;
  if (!resultado.ok) {
    logger.error("[erp-mcp] consulta falhou", { ferramenta, ...motivoParaOLog(resultado.falha) });
    // D8: a terceira consecutiva abre o aviso na Central. Não bloqueia a
    // resposta ao cliente — o `await` é só para não perder o efeito quando o
    // processo do turno acabar antes da escrita.
    await registrarFalha(ctx.supabase, ctx.organizationId, integ.id, resultado.falha);
    return { ok: false, resposta: { ok: false, error: textoParaOModelo(resultado.falha) } };
  }
  await registrarSucesso(ctx.supabase, ctx.organizationId, integ.id);
  return { ok: true, dados: resultado.dados };
}

async function consultar<T>(
  ctx: McpContext,
  integ: IntegracaoErpMcp,
  ferramenta: string,
  metodoDoErp: string,
  argumentos: Record<string, unknown>,
  projetar: (result: unknown) => ResultadoExterno<T>,
): Promise<Resposta> {
  const passo = await consultarCru(ctx, integ, ferramenta, metodoDoErp, argumentos, projetar);
  return passo.ok ? (passo.dados as Resposta) : passo.resposta;
}

/**
 * A PROVA DE POSSE: `customer.status` pelo documento do CADASTRO.
 *
 * Tudo que volta daqui é, por construção, do titular da conversa — o documento
 * não passou pelo modelo. É contra estas listas que `crm_erp_contrato` e
 * `crm_erp_instancia` conferem o identificador que o modelo pediu.
 */
function titularDoContato(
  ctx: McpContext,
  integ: IntegracaoErpMcp,
  documento: string,
  ferramenta: string,
): Promise<Passo<TitularDoErp>> {
  return consultarCru(ctx, integ, ferramenta, METODO_DO_ERP.crm_erp_situacao_do_cliente, { documento }, projetarTitular);
}

const NAO_E_DESTE_CLIENTE = {
  fatura: "essa cobrança não é deste cliente. Use um número que veio da lista de faturas dele.",
  contrato: "esse contrato não é deste cliente. Use um número que veio da situação dele.",
  instancia: "essa instância não é deste cliente. Use um nome que veio da situação dele.",
};

/**
 * O pedido não está na lista do titular: recusa, e o operador fica sabendo.
 *
 * O log é o laço de retorno — uma enumeração de identificadores aparece aqui
 * como uma sequência destas linhas. O identificador pedido é texto vindo do
 * MODELO, então vai pelo mesmo caminho de todo texto remoto (`textoParaOLog`).
 */
function recusarPorPosse(ferramenta: string, pedido: string, error: string): Resposta {
  logger.warn("[erp-mcp] identificador recusado: não pertence ao titular da conversa", {
    ferramenta,
    pedido: textoParaOLog(pedido),
  });
  return { ok: false, error };
}

function mesmoIdentificador(a: string, b: string): boolean {
  return a.trim().toUpperCase() === b.trim().toUpperCase();
}

/** As quatro que partem do cadastro do cliente pedem só o contato do turno. */
const porContato = { contact_id: z.string().uuid().describe("O cliente da conversa.") };

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
    comIntegracao(ctx, (integ) =>
      comDocumento(ctx, input.contact_id, async (documento) => {
        const titular = await titularDoContato(ctx, integ, documento, "crm_erp_situacao_do_cliente");
        return titular.ok ? (titular.dados.situacao as unknown as Resposta) : titular.resposta;
      }),
    ),
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
    comIntegracao(ctx, (integ) =>
      comDocumento(ctx, input.contact_id, (documento) =>
        consultar(ctx, integ, "crm_erp_faturas_do_cliente", METODO_DO_ERP.crm_erp_faturas_do_cliente, { documento }, (r) =>
          projetarFaturas(r, hostDaIntegracao(integ.url)),
        ),
      ),
    ),
};

const porNumeroDeFatura = {
  contact_id: z.string().uuid().describe("O cliente da conversa."),
  numero: z.string().min(1).describe("O número da fatura, como apareceu na lista de faturas deste cliente."),
};

export const crmErpFatura: McpToolDefinition<typeof porNumeroDeFatura> = {
  name: "crm_erp_fatura",
  description:
    "Detalha UMA fatura deste cliente pelo número, com status, vencimento, valor, valor pago e link de pagamento quando existe. " +
    "Use o número que veio da lista de faturas — número de outro cliente é recusado.",
  inputSchema: porNumeroDeFatura,
  category: "read",
  requiresRole: "agent",
  requiresScope: "mcp:read",
  // A fatura sai da LISTA do titular (`invoice.list` pelo documento do
  // cadastro), não de um `invoice.get` pelo número que o modelo digitou: a
  // lista é a prova de posse E o dado pedido, numa ida à rede só.
  handler: (input, ctx) =>
    comIntegracao(ctx, (integ) =>
      comDocumento(ctx, input.contact_id, async (documento) => {
        const lista = await consultarCru(ctx, integ, "crm_erp_fatura", METODO_DO_ERP.crm_erp_fatura, { documento }, (r) =>
          projetarFaturas(r, hostDaIntegracao(integ.url)),
        );
        if (!lista.ok) return lista.resposta;
        const achada = lista.dados.faturas.find((f) => mesmoIdentificador(f.numero, input.numero));
        if (!achada) return recusarPorPosse("crm_erp_fatura", input.numero, NAO_E_DESTE_CLIENTE.fatura);
        return achada as unknown as Resposta;
      }),
    ),
};

const porNumeroDeContrato = {
  contact_id: z.string().uuid().describe("O cliente da conversa."),
  numero: z.string().min(1).describe("O número do contrato, como apareceu na situação do cliente."),
};

export const crmErpContrato: McpToolDefinition<typeof porNumeroDeContrato> = {
  name: "crm_erp_contrato",
  description:
    "Mostra o contrato do cliente pelo número: status, dia de vencimento, ciclo de cobrança, início, fim, se renova sozinho, se está suspenso e os itens contratados. " +
    "Use o número que veio da situação do cliente — número de outro cliente é recusado.",
  inputSchema: porNumeroDeContrato,
  category: "read",
  requiresRole: "agent",
  requiresScope: "mcp:read",
  // Esta é a única das cinco que gasta DUAS consultas: a prova de posse não
  // traz o detalhe do contrato (a situação do cliente só lista os números), e
  // devolver o detalhe sem a prova é o achado nº 1.
  handler: (input, ctx) =>
    comIntegracao(ctx, (integ) =>
      comDocumento(ctx, input.contact_id, async (documento) => {
        const titular = await titularDoContato(ctx, integ, documento, "crm_erp_contrato");
        if (!titular.ok) return titular.resposta;
        if (!titular.dados.contratos.some((n) => mesmoIdentificador(n, input.numero))) {
          return recusarPorPosse("crm_erp_contrato", input.numero, NAO_E_DESTE_CLIENTE.contrato);
        }
        return consultar(ctx, integ, "crm_erp_contrato", METODO_DO_ERP.crm_erp_contrato, { numero: input.numero.trim() }, projetarContrato);
      }),
    ),
};

const porNomeDeInstancia = {
  contact_id: z.string().uuid().describe("O cliente da conversa."),
  nome: z.string().min(1).describe("O nome da instância, como apareceu na situação do cliente."),
};

export const crmErpInstancia: McpToolDefinition<typeof porNomeDeInstancia> = {
  name: "crm_erp_instancia",
  description:
    "Diz se uma instância do cliente está bloqueada e o motivo do bloqueio. Use quando ele perguntar por que parou de funcionar. " +
    "Use o nome que veio da situação do cliente — instância de outro cliente é recusada.",
  inputSchema: porNomeDeInstancia,
  category: "read",
  requiresRole: "agent",
  requiresScope: "mcp:read",
  // A instância sai da situação do titular, que já a traz inteira (nome,
  // bloqueada, motivo, gate). O nome chega ao modelo MASCARADO (`inst…0191`,
  // porque o nome no ERP carrega o CNPJ), então é mascarado dos dois lados que
  // se comparam — senão a ferramenta recusaria o nome que ela mesma mostrou.
  handler: (input, ctx) =>
    comIntegracao(ctx, (integ) =>
      comDocumento(ctx, input.contact_id, async (documento) => {
        const titular = await titularDoContato(ctx, integ, documento, "crm_erp_instancia");
        if (!titular.ok) return titular.resposta;
        const pedido = mascararDocumento(input.nome);
        const achada = titular.dados.instancias.find((i) => mesmoIdentificador(i.nome, pedido));
        if (!achada) return recusarPorPosse("crm_erp_instancia", input.nome, NAO_E_DESTE_CLIENTE.instancia);
        return achada as unknown as Resposta;
      }),
    ),
};

/**
 * As cinco NÃO são servidas pelo servidor MCP do próprio CRM (`lib/mcp/server.ts`).
 *
 * Lá o `requestId` é um UUID por requisição HTTP, então o teto de 4 por turno
 * não existe — qualquer token com `mcp:read` consultaria o ERP do cliente sem
 * limite nenhum, usando a NOSSA chave, e cada chamada ainda custa duas idas à
 * rede (a prova de posse). O teto é do TURNO do agente e não tem tradução para
 * uma API sem turno; inventar uma seria infra nova (contador compartilhado) para
 * uma superfície que ninguém pediu. Quem precisar do dado do ERP fala com o ERP,
 * que tem MCP próprio — o CRM não é proxy dele.
 *
 * Elas continuam no `allTools` porque é de lá que o agente monta as capacidades
 * (`lib/ai/runtime/tools.ts`) e de lá que a tela de configuração do agente lista
 * o que dá para ligar.
 */
export const FERRAMENTAS_SO_DO_AGENTE: ReadonlySet<string> = new Set(CONSULTAS_DO_ERP.map((c) => c.ferramenta));
