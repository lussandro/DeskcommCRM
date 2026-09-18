/**
 * O que o ERP devolveu vira o que o MODELO vê — campo a campo, montado por nós.
 *
 * Spec: `docs/superpowers/specs/2026-09-18-mcp-cliente-design.md` (D3, D10).
 * Formas MEDIDAS do servidor real (é o fixture, e é o contrato):
 * `.superpowers/sdd/2026-09-18-mcp-cliente/formas-medidas.md`.
 *
 * Três coisas que a medição ensinou e que a documentação do servidor não diz:
 *
 *  1. **A carga vem como STRING de JSON** dentro de `result.content[].text` —
 *     desembrulhar é aqui, com plano B quando não for JSON.
 *  2. **Dinheiro vem como string pt-BR** (`"39,00"`), nunca número. Converter
 *     para centavos é nosso; string que não parseia vira `null`, NUNCA `0` —
 *     zero seria dizer ao cliente que ele não deve nada (Regra nº 1).
 *  3. **`contract.get` traz `cliente.email` e `cliente.nome` ANINHADOS.** Podar
 *     só a superfície deixaria o dado pessoal entrar no prompt, em
 *     `ai_agent_runs`, fora do cascade de anonimização da LGPD. Por isso a
 *     projeção é positiva — nomeia o que SAI — e nunca uma lista do que remove.
 *
 *  4. **Campo TIPADO não é campo FECHADO.** Podar a chave certa não basta se o
 *     valor que sobra é texto que o ERP escolheu: `motivoBloqueio` chegava ao
 *     modelo verbatim, com CPF e telefone dentro. Todo texto livre passa pelo
 *     vocabulário fechado abaixo, e só `itens[].produto` sobrevive — saneado.
 *
 * Proteção depois do fato não protege: o que não está aqui não chega ao modelo.
 */
import { z } from "zod";

import { logger } from "@/lib/logger";
import type { ResultadoExterno } from "./tipos";

// ─── primitivos ────────────────────────────────────────────────────────────

/**
 * `"1.234,56"` → `123456`. Formato medido é pt-BR (vírgula decimal); o ponto,
 * quando existe, é separador de milhar. O que não parseia vira `null`.
 */
export function centavosDeString(valor: string | null | undefined): number | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim().replace(/\s/g, "");
  if (!limpo) return null;
  const normalizado = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
  const n = Number(normalizado);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/**
 * Sequência de dígitos com pontuação de documento/telefone no meio.
 *
 * Casar só `\d{11,14}` deixava `123.456.789-09` passar INTACTO — provado na
 * revisão adversarial de 18/09: a máscara do `inst<cnpj>` funcionava por sorte,
 * porque o ERP medido não pontua. Aqui o trecho é normalizado antes de julgar,
 * então documento com e sem máscara caem no mesmo caminho.
 */
const SEQUENCIA_DE_DIGITOS = /\d[\d.\-/\s]{8,24}\d/g;

/**
 * CPF/CNPJ (e telefone) embutido em texto livre vira os 4 últimos dígitos.
 *
 * Existe por um achado da medição: o nome da instância no ERP é
 * `inst<cnpj>` — o identificador que o cliente usa carrega o documento dele
 * dentro. Devolver o nome cru levaria o documento ao prompt pela porta dos
 * fundos, com a projeção "correta" em todo o resto. Apagar o nome inteiro
 * deixaria quem tem várias instâncias sem saber de qual se fala; os 4 últimos
 * dígitos distinguem e não identificam.
 */
export function mascararDocumento(texto: string): string {
  return texto.replace(SEQUENCIA_DE_DIGITOS, (trecho) => {
    const digitos = trecho.replace(/\D/g, "");
    // 11 = CPF/celular, 14 = CNPJ. Data (`2026-09-10`, 8) e número de contrato
    // (`CT-2026-0000`) ficam de fora: mascará-los apagaria o dado que o cliente
    // pediu.
    if (digitos.length < 11 || digitos.length > 14) return trecho;
    return `…${digitos.slice(-4)}`;
  });
}

/**
 * Texto REMOTO que vai para o LOG do servidor — nunca para o modelo.
 *
 * Uma linha só, sem documento, no máximo 200 caracteres. O log é onde o
 * operador descobre POR QUE a consulta falhou; não é onde o ERP escreve um
 * romance nem onde o CPF de um cliente acaba arquivado por meses.
 */
export function textoParaOLog(texto: string): string {
  return mascararDocumento(texto.replace(/\s+/g, " ").trim()).slice(0, 200);
}

// ─── vocabulário fechado (D10) ─────────────────────────────────────────────

/**
 * **Nenhum texto escolhido pelo ERP sai daqui como veio.**
 *
 * Campo TIPADO não é campo FECHADO: `status`, `ciclo` e `motivoBloqueio` são
 * `string` no servidor, e a revisão adversarial provou rodando que
 * `motivoBloqueio` chegava ao modelo verbatim — com `"JOAO DA SILVA, CPF
 * 123.456.789-09, tel 11999998888"` dentro. Dois estragos num campo só: dado
 * pessoal no prompt (e em `ai_agent_runs`, fora do cascade da LGPD) e uma
 * superfície de injeção que o operador do ERP controla e nós não.
 *
 * Por isso cada campo de texto tem UMA das três saídas: valor do nosso
 * vocabulário, `"outro"`, ou `null`. O que não reconhecemos vai ao log e morre
 * ali. A exceção é `itens[].produto` — o cliente precisa ler o nome do produto
 * que ele contratou —, e ela é SANEADA, não liberada.
 */
export type MotivoDeBloqueio = "falta_de_pagamento" | "suspensao_manual" | "outro";

const MOTIVOS: ReadonlyArray<readonly [MotivoDeBloqueio, RegExp]> = [
  ["falta_de_pagamento", /inadimpl|pagament|fatura|vencid|atras|cobran|d[eé]bito/i],
  ["suspensao_manual", /suspens|manual|administrativ|solicita|cancela|encerrad|rescis/i],
];

/** `null` = não há motivo (instância liberada). Texto desconhecido = `"outro"`. */
export function motivoFechado(texto: string | null | undefined): MotivoDeBloqueio | null {
  if (typeof texto !== "string" || !texto.trim()) return null;
  for (const [chave, padrao] of MOTIVOS) {
    if (padrao.test(texto)) return chave;
  }
  logger.warn("[erp-mcp] motivo de bloqueio fora do vocabulário", { motivo: textoParaOLog(texto) });
  return "outro";
}

/**
 * Os valores MEDIDOS são `ACTIVE` (contrato), `PENDING` (fatura) e `MONTHLY`
 * (ciclo); os demais são a família convencional do mesmo vocabulário. Valor
 * fora da lista NÃO passa: vira `"outro"` e vai ao log — acrescentar um nome
 * aqui é barato, deixar texto do ERP entrar no prompt não é.
 */
const STATUS_DE_CONTRATO = new Set(["ACTIVE", "INACTIVE", "SUSPENDED", "CANCELLED", "CANCELED", "EXPIRED", "PENDING"]);
const STATUS_DE_FATURA = new Set(["PENDING", "PAID", "RECEIVED", "CONFIRMED", "OVERDUE", "CANCELLED", "CANCELED", "REFUNDED"]);
const CICLOS = new Set(["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY", "BIMONTHLY", "QUARTERLY", "SEMIANNUAL", "SEMIANNUALLY", "YEARLY", "ANNUAL"]);

function fechado(valor: string | null | undefined, conhecidos: ReadonlySet<string>, campo: string): string | null {
  if (typeof valor !== "string" || !valor.trim()) return null;
  const normalizado = valor.trim().toUpperCase();
  if (conhecidos.has(normalizado)) return normalizado;
  logger.warn("[erp-mcp] valor fora do vocabulário conhecido", { campo, valor: textoParaOLog(valor) });
  return "outro";
}

const EMAIL_EM_TEXTO = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
const NAO_DISPONIVEL = "(descrição indisponível)";
const TAMANHO_DE_PRODUTO = 80;

/** Documento, telefone ou e-mail dentro de um texto que o ERP escolheu. */
function temDadoPessoal(texto: string): boolean {
  if (EMAIL_EM_TEXTO.test(texto)) return true;
  for (const trecho of texto.match(SEQUENCIA_DE_DIGITOS) ?? []) {
    const digitos = trecho.replace(/\D/g, "");
    if (digitos.length >= 10 && digitos.length <= 14) return true;
  }
  return false;
}

/**
 * Nome de produto: o ÚNICO texto do ERP que chega ao cliente, e mesmo assim
 * saneado — uma linha, 80 caracteres, e recusado inteiro se carregar dado
 * pessoal (nesse caso o cliente vê que falta a descrição, nunca o CPF de
 * alguém).
 */
export function produtoSaneado(texto: string | null | undefined): string | null {
  if (typeof texto !== "string" || !texto.trim()) return null;
  const uma_linha = texto.replace(/\s+/g, " ").trim();
  if (temDadoPessoal(uma_linha)) {
    logger.warn("[erp-mcp] item de contrato com cara de dado pessoal; descrição recusada", {
      produto: textoParaOLog(uma_linha),
    });
    return NAO_DISPONIVEL;
  }
  return uma_linha.slice(0, TAMANHO_DE_PRODUTO);
}

/**
 * Hosts de pagamento aceitos além do próprio ERP.
 *
 * ponytail: lista curta dos adquirentes que aparecem no ERP medido e dos mais
 * comuns no Brasil. Cliente com outro adquirente acrescenta uma linha aqui — o
 * default é recusar, porque um link escolhido pelo ERP é um link que o
 * assistente manda o cliente ABRIR.
 */
const HOSTS_DE_PAGAMENTO = [
  "asaas.com",
  "mercadopago.com",
  "mercadopago.com.br",
  "pagseguro.uol.com.br",
  "pagbank.com.br",
  "pagar.me",
  "stripe.com",
  "cielo.com.br",
  "efipay.com.br",
  "gerencianet.com.br",
];

function ehDoHost(host: string, permitido: string): boolean {
  return host === permitido || host.endsWith(`.${permitido}`);
}

/** `https` de host permitido, ou `null`. Nunca o link cru do ERP. */
export function linkSeguro(link: string | null | undefined, hostDoErp: string): string | null {
  if (typeof link !== "string" || !link.trim()) return null;
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    logger.warn("[erp-mcp] link de pagamento não é uma URL; descartado", {});
    return null;
  }
  const host = url.hostname.toLowerCase();
  const permitido =
    (hostDoErp !== "" && ehDoHost(host, hostDoErp)) || HOSTS_DE_PAGAMENTO.some((h) => ehDoHost(host, h));
  if (url.protocol !== "https:" || !permitido) {
    logger.warn("[erp-mcp] link de pagamento recusado", { host, esquema: url.protocol });
    return null;
  }
  return url.toString();
}

type Falha = { ok: false; falha: { tipo: "corpo_invalido"; detalhe: string } };

function corpoInvalido(detalhe: string): Falha {
  return { ok: false, falha: { tipo: "corpo_invalido", detalhe } };
}

/**
 * `result.content[].text` → objeto. O primeiro item de texto que parseia manda.
 * Nada de conteúdo em erro nenhum: a carga é dado do cliente.
 */
export function desembrulhar(result: unknown): ResultadoExterno<unknown> {
  const conteudo = (result as { content?: unknown })?.content;
  if (!Array.isArray(conteudo) || conteudo.length === 0) return corpoInvalido("resposta sem conteúdo");
  let tentados = 0;
  for (const item of conteudo) {
    const texto = (item as { text?: unknown })?.text;
    if (typeof texto !== "string" || !texto.trim()) continue;
    tentados += 1;
    try {
      return { ok: true, dados: JSON.parse(texto) as unknown };
    } catch {
      // `continue`, não `return`: o comentário acima promete "o primeiro que
      // PARSEIA manda", e abortar no primeiro item não-JSON descartaria um
      // segundo item válido (um preâmbulo em prosa antes da carga é forma
      // legítima de `content[]`). Texto que não é JSON nunca vira adivinhação
      // — só não cala o resto da lista.
      continue;
    }
  }
  if (tentados > 0) return corpoInvalido(`nenhum dos ${tentados} itens de texto é JSON`);
  return corpoInvalido("resposta sem texto");
}

/** Valida o desembrulhado. O erro leva CAMINHOS de campo, nunca valores. */
function validar<T>(schema: z.ZodType<T>, dados: unknown, oQue: string): ResultadoExterno<T> {
  const parsed = schema.safeParse(dados);
  if (!parsed.success) {
    return corpoInvalido(`${oQue}: campos inválidos em ${parsed.error.issues.map((i) => i.path.join(".") || "(raiz)").join(", ")}`);
  }
  return { ok: true, dados: parsed.data };
}

function projetarDe<E, S>(result: unknown, schema: z.ZodType<E>, oQue: string, montar: (v: E) => S): ResultadoExterno<S> {
  const cru = desembrulhar(result);
  if (!cru.ok) return cru;
  const valido = validar(schema, cru.dados, oQue);
  if (!valido.ok) return valido;
  return { ok: true, dados: montar(valido.dados) };
}

const textoOpcional = z.string().nullable().optional();

// ─── customer.status: a SITUAÇÃO e a PROVA DE POSSE ────────────────────────

/**
 * `customer.status` é consultado pelo DOCUMENTO DO CADASTRO, então tudo que ele
 * devolve é, por construção, do titular da conversa. Por isso ele é a fonte
 * dupla desta feature: o que o modelo vê (`situacao`) e a allowlist contra a
 * qual todo identificador vindo do MODELO é conferido (`contratos`,
 * `instancias`).
 *
 * Sem essa conferência, `crm_erp_contrato("CT-2026-0001")` respondia sobre o
 * contrato de OUTRO cliente — os números são sequenciais, e nada no caminho
 * ligava o identificador ao titular (achado nº 1 da revisão de 18/09).
 */
const instanciaZ = z.object({
  nome: z.string(),
  bloqueada: z.boolean(),
  motivoBloqueio: textoOpcional,
  gate: z.object({ allowed: z.boolean().nullable().optional() }).nullable().optional(),
});

const situacaoZ = z.object({
  emAtraso: z.boolean(),
  // Só a QUANTIDADE sai; o conteúdo de cada vencida vem por `invoice.list`.
  faturasVencidas: z.array(z.unknown()).default([]),
  totalVencido: textoOpcional,
  proximaFatura: z
    .object({ numero: textoOpcional, vencimento: textoOpcional, valor: textoOpcional })
    .nullable()
    .optional(),
  // Só o NÚMERO: é o que serve de prova de posse. Status, ciclo e itens vêm de
  // `contract.get`, depois da prova.
  contratos: z.array(z.object({ numero: textoOpcional })).default([]),
  instancias: z.array(instanciaZ).default([]),
});

export interface Instancia {
  nome: string;
  bloqueada: boolean;
  motivo: MotivoDeBloqueio | null;
  liberada: boolean | null;
}

export interface SituacaoDoCliente {
  em_atraso: boolean;
  faturas_vencidas: number;
  total_vencido_centavos: number | null;
  proxima_fatura: { numero: string | null; vencimento: string | null; valor_centavos: number | null } | null;
  instancias: Instancia[];
}

export interface TitularDoErp {
  /** O que o modelo pode ver. */
  situacao: SituacaoDoCliente;
  /** Números de contrato DO TITULAR — a allowlist de `crm_erp_contrato`. */
  contratos: string[];
  /** As instâncias já projetadas (nome mascarado) — a allowlist de `crm_erp_instancia`. */
  instancias: Instancia[];
}

function montarInstancia(v: z.infer<typeof instanciaZ>): Instancia {
  return {
    nome: mascararDocumento(v.nome),
    bloqueada: v.bloqueada,
    motivo: motivoFechado(v.motivoBloqueio),
    liberada: v.gate?.allowed ?? null,
  };
}

export function projetarTitular(result: unknown): ResultadoExterno<TitularDoErp> {
  return projetarDe(result, situacaoZ, "situação do cliente", (v) => {
    const instancias = v.instancias.map(montarInstancia);
    return {
      situacao: {
        em_atraso: v.emAtraso,
        faturas_vencidas: v.faturasVencidas.length,
        total_vencido_centavos: centavosDeString(v.totalVencido),
        proxima_fatura: v.proximaFatura
          ? {
              numero: v.proximaFatura.numero ?? null,
              vencimento: v.proximaFatura.vencimento ?? null,
              valor_centavos: centavosDeString(v.proximaFatura.valor),
            }
          : null,
        instancias,
      },
      contratos: v.contratos.map((c) => c.numero).filter((n): n is string => typeof n === "string" && n.trim() !== ""),
      instancias,
    };
  });
}

// ─── invoice.list ──────────────────────────────────────────────────────────

const faturaZ = z.object({
  numero: z.string(),
  status: textoOpcional,
  competencia: textoOpcional,
  vencimento: textoOpcional,
  valor: textoOpcional,
  pago: textoOpcional,
  contrato: textoOpcional,
  linkPagamento: textoOpcional,
});

export interface Fatura {
  numero: string;
  /** Vocabulário fechado; o que o ERP escrever fora dele vira `"outro"`. */
  status: string | null;
  competencia: string | null;
  vencimento: string | null;
  valor_centavos: number | null;
  pago_centavos: number | null;
  contrato: string | null;
  /** Medido: pode vir null — e link fora dos hosts permitidos TAMBÉM vira null. */
  link_pagamento: string | null;
}

/**
 * `hostDoErp` é o hostname da integração da organização: o link do próprio ERP
 * é legítimo, e os demais só passam se forem de um adquirente conhecido. Um
 * `link_pagamento` é uma URL que a `description` manda o assistente enviar ao
 * cliente — quem escolhe o destino não pode ser o texto que voltou da rede.
 */
export function projetarFaturas(result: unknown, hostDoErp: string): ResultadoExterno<{ faturas: Fatura[] }> {
  return projetarDe(result, z.array(faturaZ), "faturas do cliente", (v) => ({
    faturas: v.map((f) => ({
      numero: f.numero,
      status: fechado(f.status, STATUS_DE_FATURA, "fatura.status"),
      competencia: f.competencia ?? null,
      vencimento: f.vencimento ?? null,
      valor_centavos: centavosDeString(f.valor),
      pago_centavos: centavosDeString(f.pago),
      contrato: f.contrato ?? null,
      link_pagamento: linkSeguro(f.linkPagamento, hostDoErp),
    })),
  }));
}

// ─── contract.get ──────────────────────────────────────────────────────────

/**
 * `cliente` (documento, nome, email) NÃO está no schema e não está na montagem:
 * é o objeto aninhado que a medição flagrou. Zod estranho descarta chave
 * desconhecida, mas quem garante é a montagem campo a campo abaixo.
 */
const contratoZ = z.object({
  numero: z.string(),
  status: textoOpcional,
  diaVencimento: z.number().nullable().optional(),
  ciclo: textoOpcional,
  isento: z.boolean().nullable().optional(),
  inicio: textoOpcional,
  fim: textoOpcional,
  renovaSozinho: z.boolean().nullable().optional(),
  suspensoDesde: textoOpcional,
  itens: z.array(z.object({ produto: textoOpcional })).default([]),
});

export interface Contrato {
  numero: string;
  status: string | null;
  dia_vencimento: number | null;
  ciclo: string | null;
  isento: boolean | null;
  inicio: string | null;
  fim: string | null;
  renova_sozinho: boolean | null;
  suspenso_desde: string | null;
  itens: Array<{ produto: string | null }>;
}

export function projetarContrato(result: unknown): ResultadoExterno<Contrato> {
  return projetarDe(result, contratoZ, "contrato", (v) => ({
    numero: v.numero,
    status: fechado(v.status, STATUS_DE_CONTRATO, "contrato.status"),
    dia_vencimento: v.diaVencimento ?? null,
    ciclo: fechado(v.ciclo, CICLOS, "contrato.ciclo"),
    isento: v.isento ?? null,
    inicio: v.inicio ?? null,
    fim: v.fim ?? null,
    renova_sozinho: v.renovaSozinho ?? null,
    suspenso_desde: v.suspensoDesde ?? null,
    itens: v.itens.map((i) => ({ produto: produtoSaneado(i.produto) })),
  }));
}
