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
 * Proteção depois do fato não protege: o que não está aqui não chega ao modelo.
 */
import { z } from "zod";

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
 * CPF/CNPJ embutido em texto livre vira os 4 últimos dígitos.
 *
 * Existe por um achado da medição: o nome da instância no ERP é
 * `inst<cnpj>` — o identificador que o cliente usa carrega o documento dele
 * dentro. Devolver o nome cru levaria o documento ao prompt pela porta dos
 * fundos, com a projeção "correta" em todo o resto. Apagar o nome inteiro
 * deixaria quem tem várias instâncias sem saber de qual se fala; os 4 últimos
 * dígitos distinguem e não identificam.
 */
export function mascararDocumento(texto: string): string {
  return texto.replace(/\d{11,14}/g, (d) => `…${d.slice(-4)}`);
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
  for (const item of conteudo) {
    const texto = (item as { text?: unknown })?.text;
    if (typeof texto !== "string" || !texto.trim()) continue;
    try {
      return { ok: true, dados: JSON.parse(texto) as unknown };
    } catch {
      // Plano B do plano: texto que não é JSON não vira adivinhação.
      return corpoInvalido(`conteúdo não é JSON (${texto.length} bytes)`);
    }
  }
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

// ─── customer.status ───────────────────────────────────────────────────────

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
  instancias: z.array(instanciaZ).default([]),
});

export interface SituacaoDoCliente {
  em_atraso: boolean;
  faturas_vencidas: number;
  total_vencido_centavos: number | null;
  proxima_fatura: { numero: string | null; vencimento: string | null; valor_centavos: number | null } | null;
  instancias: Array<{ nome: string; bloqueada: boolean; motivo: string | null }>;
}

export function projetarSituacaoDoCliente(result: unknown): ResultadoExterno<SituacaoDoCliente> {
  return projetarDe(result, situacaoZ, "situação do cliente", (v) => ({
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
    instancias: v.instancias.map((i) => ({
      nome: mascararDocumento(i.nome),
      bloqueada: i.bloqueada,
      motivo: i.motivoBloqueio ?? null,
    })),
  }));
}

// ─── invoice.list / invoice.get ────────────────────────────────────────────

const faturaZ = z.object({
  numero: z.string(),
  status: z.string(),
  competencia: textoOpcional,
  vencimento: textoOpcional,
  valor: textoOpcional,
  pago: textoOpcional,
  contrato: textoOpcional,
  linkPagamento: textoOpcional,
});

export interface Fatura {
  numero: string;
  status: string;
  competencia: string | null;
  vencimento: string | null;
  valor_centavos: number | null;
  pago_centavos: number | null;
  contrato: string | null;
  /** Medido: pode vir null. A projeção não promete link que não existe. */
  link_pagamento: string | null;
}

function montarFatura(v: z.infer<typeof faturaZ>): Fatura {
  return {
    numero: v.numero,
    status: v.status,
    competencia: v.competencia ?? null,
    vencimento: v.vencimento ?? null,
    valor_centavos: centavosDeString(v.valor),
    pago_centavos: centavosDeString(v.pago),
    contrato: v.contrato ?? null,
    link_pagamento: v.linkPagamento ?? null,
  };
}

export function projetarFaturas(result: unknown): ResultadoExterno<{ faturas: Fatura[] }> {
  return projetarDe(result, z.array(faturaZ), "faturas do cliente", (v) => ({ faturas: v.map(montarFatura) }));
}

export function projetarFatura(result: unknown): ResultadoExterno<Fatura> {
  return projetarDe(result, faturaZ, "fatura", montarFatura);
}

// ─── contract.get ──────────────────────────────────────────────────────────

/**
 * `cliente` (documento, nome, email) NÃO está no schema e não está na montagem:
 * é o objeto aninhado que a medição flagrou. Zod estranho descarta chave
 * desconhecida, mas quem garante é a montagem campo a campo abaixo.
 */
const contratoZ = z.object({
  numero: z.string(),
  status: z.string(),
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
  status: string;
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
    status: v.status,
    dia_vencimento: v.diaVencimento ?? null,
    ciclo: v.ciclo ?? null,
    isento: v.isento ?? null,
    inicio: v.inicio ?? null,
    fim: v.fim ?? null,
    renova_sozinho: v.renovaSozinho ?? null,
    suspenso_desde: v.suspensoDesde ?? null,
    itens: v.itens.map((i) => ({ produto: i.produto ?? null })),
  }));
}

// ─── chatcore.instance.get ─────────────────────────────────────────────────

export interface Instancia {
  nome: string;
  bloqueada: boolean;
  motivo: string | null;
  liberada: boolean | null;
}

export function projetarInstancia(result: unknown): ResultadoExterno<Instancia> {
  return projetarDe(result, instanciaZ, "instância", (v) => ({
    nome: mascararDocumento(v.nome),
    bloqueada: v.bloqueada,
    motivo: v.motivoBloqueio ?? null,
    liberada: v.gate?.allowed ?? null,
  }));
}
