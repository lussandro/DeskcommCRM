/**
 * O fixture é a forma MEDIDA em produção
 * (`.superpowers/sdd/2026-09-18-mcp-cliente/formas-medidas.md`), com valores
 * sintéticos. Campo nenhum aqui foi inventado.
 *
 * O teste que vale por todos é `a LGPD da feature`: ele varre o JSON inteiro da
 * projeção atrás de e-mail, telefone, razão social, documento e id interno. É a
 * única garantia de que dado pessoal do ERP não entra no prompt, em
 * `ai_agent_runs` e no audit — de onde o cascade de anonimização não o tira.
 */
import { describe, expect, it } from "vitest";

import {
  centavosDeString,
  desembrulhar,
  projetarContrato,
  projetarFatura,
  projetarFaturas,
  projetarInstancia,
  projetarSituacaoDoCliente,
} from "./projecao";

/** Como o servidor entrega: JSON dentro de string, dentro de `content[].text`. */
function envelope(carga: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(carga) }] };
}

// ── os fixtures, verbatim de formas-medidas.md ────────────────────────────

const DOCUMENTO = "00000000000191";
const EMAIL = "financeiro@exemplo.com.br";
const TELEFONE = "11900000000";
const RAZAO_SOCIAL = "EMPRESA EXEMPLO LTDA";

const CUSTOMER_STATUS = {
  cliente: RAZAO_SOCIAL,
  documento: DOCUMENTO,
  email: EMAIL,
  emailCobranca: null,
  telefone: TELEFONE,
  emAtraso: false,
  faturasVencidas: [],
  totalVencido: "0,00",
  proximaFatura: { numero: "FAT-2026-00000", vencimento: "2026-10-10", valor: "99,00" },
  reguaPausadaAte: null,
  contratos: [{ numero: "CT-2026-0000", status: "ACTIVE", isento: false, suspensoDesde: null }],
  instancias: [
    {
      nome: `inst${DOCUMENTO}`,
      contrato: "CT-2026-0000",
      bloqueada: false,
      motivoBloqueio: null,
      ultimoUso: "2026-09-17T20:25:49.276Z",
      gate: { allowed: true, motivo: "liberado" },
    },
  ],
  emailsRecentes: [
    { tipo: "cobranca", para: EMAIL, status: "delivered", assunto: "Sua fatura", data: "2026-09-05T09:00:00.000Z" },
  ],
};

const INVOICE_LIST = [
  {
    numero: "FAT-2026-00000",
    status: "PENDING",
    competencia: "2026-09",
    vencimento: "2026-09-10",
    valor: "99,00",
    pago: "0,00",
    contrato: "CT-2026-0000",
    linkPagamento: null,
  },
];

const CONTRACT_GET = {
  numero: "CT-2026-0000",
  status: "ACTIVE",
  diaVencimento: 10,
  ciclo: "MONTHLY",
  isento: false,
  inicio: "2026-01-10",
  fim: "2027-01-10",
  renovaSozinho: true,
  suspensoDesde: null,
  observacoes: "",
  cliente: { documento: DOCUMENTO, nome: RAZAO_SOCIAL, email: EMAIL },
  itens: [{ produto: "Plano ChatCore" }],
};

const INSTANCE_GET = {
  nome: `inst${DOCUMENTO}`,
  contrato: "CT-2026-0000",
  bloqueada: true,
  motivoBloqueio: "fatura vencida há 12 dias",
  ultimoUso: "2026-09-17T20:25:49.276Z",
  gate: { allowed: false, motivo: "inadimplente" },
};

// ── O TESTE MAIS IMPORTANTE DO PLANO ──────────────────────────────────────

describe("a LGPD da feature: o que a projeção deixa sair", () => {
  const proibido: Array<[string, string]> = [
    ["e-mail", EMAIL],
    ["telefone", TELEFONE],
    ["razão social", RAZAO_SOCIAL],
    ["documento", DOCUMENTO],
  ];

  it("situação do cliente: nem e-mail, nem telefone, nem razão social, nem documento", () => {
    const r = projetarSituacaoDoCliente(envelope(CUSTOMER_STATUS));
    expect(r.ok).toBe(true);
    const texto = JSON.stringify(r.ok && r.dados);
    for (const [rotulo, valor] of proibido) {
      expect(texto, `vazou ${rotulo}`).not.toContain(valor);
    }
    // `emailsRecentes` inteiro, e a chave que o carregava.
    expect(texto).not.toContain("emailsRecentes");
    expect(texto).not.toContain("@");
  });

  it("contrato: o dado pessoal está ANINHADO em `cliente`, e não sai do mesmo jeito", () => {
    const r = projetarContrato(envelope(CONTRACT_GET));
    expect(r.ok).toBe(true);
    const texto = JSON.stringify(r.ok && r.dados);
    for (const [rotulo, valor] of proibido) {
      expect(texto, `vazou ${rotulo} de dentro de cliente`).not.toContain(valor);
    }
    expect(texto).not.toContain("cliente");
  });

  it("o nome da instância carrega o CNPJ no ERP, e chega ao modelo mascarado", () => {
    const r = projetarInstancia(envelope(INSTANCE_GET));
    expect(r).toEqual({ ok: true, dados: { nome: "inst…0191", bloqueada: true, motivo: "fatura vencida há 12 dias", liberada: false } });
    expect(JSON.stringify(r)).not.toContain(DOCUMENTO);
  });
});

// ── as projeções, campo a campo ───────────────────────────────────────────

describe("projeções", () => {
  it("situação: quantidade de vencidas, centavos e próxima fatura", () => {
    expect(projetarSituacaoDoCliente(envelope(CUSTOMER_STATUS))).toEqual({
      ok: true,
      dados: {
        em_atraso: false,
        faturas_vencidas: 0,
        total_vencido_centavos: 0,
        proxima_fatura: { numero: "FAT-2026-00000", vencimento: "2026-10-10", valor_centavos: 9900 },
        instancias: [{ nome: "inst…0191", bloqueada: false, motivo: null }],
      },
    });
  });

  it("situação sem próxima fatura devolve null, nunca uma data inventada", () => {
    const r = projetarSituacaoDoCliente(envelope({ ...CUSTOMER_STATUS, proximaFatura: null, faturasVencidas: [1, 2], totalVencido: "1.234,56" }));
    expect(r).toMatchObject({ ok: true, dados: { faturas_vencidas: 2, total_vencido_centavos: 123456, proxima_fatura: null } });
  });

  it("faturas: lista projetada, com linkPagamento null preservado como null", () => {
    expect(projetarFaturas(envelope(INVOICE_LIST))).toEqual({
      ok: true,
      dados: {
        faturas: [
          {
            numero: "FAT-2026-00000",
            status: "PENDING",
            competencia: "2026-09",
            vencimento: "2026-09-10",
            valor_centavos: 9900,
            pago_centavos: 0,
            contrato: "CT-2026-0000",
            link_pagamento: null,
          },
        ],
      },
    });
  });

  it("fatura única usa a mesma forma da lista", () => {
    expect(projetarFatura(envelope(INVOICE_LIST[0]))).toMatchObject({ ok: true, dados: { numero: "FAT-2026-00000", valor_centavos: 9900 } });
  });

  it("contrato: os campos do contrato e os itens, sem o objeto do cliente", () => {
    expect(projetarContrato(envelope(CONTRACT_GET))).toEqual({
      ok: true,
      dados: {
        numero: "CT-2026-0000",
        status: "ACTIVE",
        dia_vencimento: 10,
        ciclo: "MONTHLY",
        isento: false,
        inicio: "2026-01-10",
        fim: "2027-01-10",
        renova_sozinho: true,
        suspenso_desde: null,
        itens: [{ produto: "Plano ChatCore" }],
      },
    });
  });
});

// ── dinheiro e desembrulho ────────────────────────────────────────────────

describe("centavosDeString", () => {
  it("converte o formato medido (pt-BR, string)", () => {
    expect(centavosDeString("39,00")).toBe(3900);
    expect(centavosDeString("1.234,56")).toBe(123456);
    expect(centavosDeString("0,00")).toBe(0);
    expect(centavosDeString("99")).toBe(9900);
  });

  it("o que não parseia vira null, NUNCA zero", () => {
    // Zero diria ao cliente que ele não deve nada — o pior default possível.
    for (const v of ["", "  ", "grátis", null, undefined]) {
      expect(centavosDeString(v as string | null | undefined)).toBeNull();
    }
  });
});

describe("desembrulhar", () => {
  it("lê o JSON de dentro de content[].text", () => {
    expect(desembrulhar(envelope({ a: 1 }))).toEqual({ ok: true, dados: { a: 1 } });
  });

  it("conteúdo que não é JSON vira corpo_invalido, e o corpo NÃO vai no detalhe", () => {
    const r = desembrulhar({ content: [{ type: "text", text: "cliente NAO ENCONTRADO" }] });
    expect(r).toMatchObject({ ok: false, falha: { tipo: "corpo_invalido" } });
    expect(JSON.stringify(r)).not.toContain("NAO ENCONTRADO");
  });

  it("resposta sem conteúdo nenhum também é corpo_invalido", () => {
    expect(desembrulhar({})).toMatchObject({ ok: false, falha: { tipo: "corpo_invalido" } });
    expect(desembrulhar({ content: [] })).toMatchObject({ ok: false, falha: { tipo: "corpo_invalido" } });
  });

  it("forma que não bate com o schema vira corpo_invalido com os CAMINHOS, sem valores", () => {
    const r = projetarSituacaoDoCliente(envelope({ ...CUSTOMER_STATUS, emAtraso: "talvez" }));
    expect(r).toMatchObject({ ok: false, falha: { tipo: "corpo_invalido" } });
    expect(JSON.stringify(r)).toContain("emAtraso");
    expect(JSON.stringify(r)).not.toContain(EMAIL);
  });
});
