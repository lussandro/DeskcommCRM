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
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import { logger } from "@/lib/logger";
import {
  centavosDeString,
  desembrulhar,
  linkSeguro,
  mascararDocumento,
  motivoFechado,
  produtoSaneado,
  projetarContrato,
  projetarFaturas,
  projetarTitular,
  textoParaOLog,
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

/**
 * A string de injeção é a MESMA que a revisão adversarial de 18/09 provou
 * saindo verbatim para o modelo, em `instancias[].motivo`.
 */
const INJECAO = "JOAO DA SILVA, CPF 123.456.789-09, tel 11999998888";
const HOST_DO_ERP = "erp.exemplo.com";

beforeEach(() => vi.clearAllMocks());

// ── O TESTE MAIS IMPORTANTE DO PLANO ──────────────────────────────────────

describe("a LGPD da feature: o que a projeção deixa sair", () => {
  const proibido: Array<[string, string]> = [
    ["e-mail", EMAIL],
    ["telefone", TELEFONE],
    ["razão social", RAZAO_SOCIAL],
    ["documento", DOCUMENTO],
  ];

  it("situação do cliente: nem e-mail, nem telefone, nem razão social, nem documento", () => {
    const r = projetarTitular(envelope(CUSTOMER_STATUS));
    expect(r.ok).toBe(true);
    const texto = JSON.stringify(r.ok && r.dados.situacao);
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
    const r = projetarTitular(envelope(CUSTOMER_STATUS));
    expect(r.ok && r.dados.instancias).toEqual([
      { nome: "inst…0191", bloqueada: false, motivo: null, liberada: true },
    ]);
    expect(JSON.stringify(r)).not.toContain(DOCUMENTO);
  });

  /**
   * O ACHADO Nº 2, na string exata que o provou. Texto livre do ERP é PII e é
   * injeção ao mesmo tempo: ele entra no prompt e em `ai_agent_runs`, que o
   * cascade de anonimização da LGPD não alcança.
   */
  it("texto livre do ERP NÃO sai da projeção — nem o motivo, nem o produto, nem o link", () => {
    const hostil = {
      ...CUSTOMER_STATUS,
      instancias: [
        {
          ...CUSTOMER_STATUS.instancias[0],
          bloqueada: true,
          motivoBloqueio: `Inadimplência de ${INJECAO}`,
        },
      ],
    };
    const situacao = projetarTitular(envelope(hostil));
    expect(situacao.ok && situacao.dados.situacao.instancias[0]).toEqual({
      nome: "inst…0191",
      bloqueada: true,
      // Vocabulário NOSSO, decidido por palavra conhecida ("inadimplência").
      motivo: "falta_de_pagamento",
      liberada: true,
    });
    const textoDaSituacao = JSON.stringify(situacao.ok && situacao.dados);
    expect(textoDaSituacao).not.toContain("JOAO");
    expect(textoDaSituacao).not.toContain("123.456.789-09");
    expect(textoDaSituacao).not.toContain("11999998888");

    const contrato = projetarContrato(
      envelope({
        ...CONTRACT_GET,
        status: `ACTIVE — ${INJECAO}`,
        ciclo: `MONTHLY (${INJECAO})`,
        itens: [{ produto: `Plano de ${INJECAO}` }],
      }),
    );
    const textoDoContrato = JSON.stringify(contrato.ok && contrato.dados);
    expect(contrato.ok && contrato.dados.status).toBe("outro");
    expect(contrato.ok && contrato.dados.ciclo).toBe("outro");
    expect(contrato.ok && contrato.dados.itens).toEqual([{ produto: "(descrição indisponível)" }]);
    expect(textoDoContrato).not.toContain("JOAO");
    expect(textoDoContrato).not.toContain("123.456.789-09");
    expect(textoDoContrato).not.toContain("11999998888");

    const faturas = projetarFaturas(
      envelope([{ ...INVOICE_LIST[0], status: `PAGO ${INJECAO}`, linkPagamento: `https://phishing.example/${INJECAO}` }]),
      HOST_DO_ERP,
    );
    const textoDasFaturas = JSON.stringify(faturas.ok && faturas.dados);
    expect(faturas.ok && faturas.dados.faturas[0]!.status).toBe("outro");
    expect(faturas.ok && faturas.dados.faturas[0]!.link_pagamento).toBeNull();
    expect(textoDasFaturas).not.toContain("JOAO");
    expect(textoDasFaturas).not.toContain("123.456.789-09");
    expect(textoDasFaturas).not.toContain("11999998888");
  });
});

// ── o vocabulário fechado, campo a campo ──────────────────────────────────

describe("mascararDocumento", () => {
  it("pega CPF e CNPJ COM e SEM máscara, e o telefone junto", () => {
    expect(mascararDocumento(INJECAO)).toBe("JOAO DA SILVA, CPF …8909, tel …8888");
    expect(mascararDocumento("inst00000000000191")).toBe("inst…0191");
    expect(mascararDocumento("00.000.000/0001-91")).toBe("…0191");
    expect(mascararDocumento("123.456.789-09")).toBe("…8909");
    expect(mascararDocumento("12345678909")).toBe("…8909");
  });

  it("não come data nem número de contrato — o dado que o cliente pediu fica", () => {
    expect(mascararDocumento("vence em 2026-09-10")).toBe("vence em 2026-09-10");
    expect(mascararDocumento("CT-2026-0000")).toBe("CT-2026-0000");
    expect(mascararDocumento("R$ 1.234,56")).toBe("R$ 1.234,56");
  });
});

describe("motivoFechado", () => {
  it("mapeia por palavra conhecida, e o texto original nunca é a saída", () => {
    expect(motivoFechado("fatura vencida há 12 dias")).toBe("falta_de_pagamento");
    expect(motivoFechado("Inadimplência")).toBe("falta_de_pagamento");
    expect(motivoFechado("suspenso a pedido do cliente")).toBe("suspensao_manual");
    expect(motivoFechado(null)).toBeNull();
    expect(motivoFechado("   ")).toBeNull();
  });

  it("desconhecido vira `outro`, e o texto vai SÓ para o log", () => {
    expect(motivoFechado(INJECAO)).toBe("outro");
    expect(logger.warn).toHaveBeenCalledWith(
      "[erp-mcp] motivo de bloqueio fora do vocabulário",
      // No log também vai mascarado: log é onde CPF fica arquivado por meses.
      { motivo: "JOAO DA SILVA, CPF …8909, tel …8888" },
    );
  });
});

describe("produtoSaneado", () => {
  it("o nome do produto chega ao cliente — é o único texto do ERP que chega", () => {
    expect(produtoSaneado("Plano ChatCore")).toBe("Plano ChatCore");
  });

  it("uma linha só, 80 caracteres", () => {
    expect(produtoSaneado("Plano\nChatCore")).toBe("Plano ChatCore");
    expect(produtoSaneado("x".repeat(200))).toHaveLength(80);
  });

  it("com cara de dado pessoal, a descrição é recusada inteira", () => {
    expect(produtoSaneado(`Plano de ${INJECAO}`)).toBe("(descrição indisponível)");
    expect(produtoSaneado("contato: joao@exemplo.com")).toBe("(descrição indisponível)");
  });
});

describe("linkSeguro", () => {
  it("passa o link do próprio ERP e o de adquirente conhecido", () => {
    expect(linkSeguro("https://erp.exemplo.com/pagar/1", HOST_DO_ERP)).toBe("https://erp.exemplo.com/pagar/1");
    expect(linkSeguro("https://cobranca.erp.exemplo.com/1", HOST_DO_ERP)).toBe("https://cobranca.erp.exemplo.com/1");
    expect(linkSeguro("https://www.asaas.com/i/abc", HOST_DO_ERP)).toBe("https://www.asaas.com/i/abc");
  });

  it("recusa http, host desconhecido e lixo — o assistente manda o cliente ABRIR isto", () => {
    expect(linkSeguro("http://erp.exemplo.com/pagar/1", HOST_DO_ERP)).toBeNull();
    expect(linkSeguro("https://phishing.example/pagar", HOST_DO_ERP)).toBeNull();
    expect(linkSeguro("https://asaas.com.phishing.example/x", HOST_DO_ERP)).toBeNull();
    expect(linkSeguro("não é uma url", HOST_DO_ERP)).toBeNull();
    expect(linkSeguro(null, HOST_DO_ERP)).toBeNull();
  });
});

describe("textoParaOLog", () => {
  it("uma linha, sem documento, no máximo 200", () => {
    expect(textoParaOLog(` a\n b  ${INJECAO} `)).toBe("a b JOAO DA SILVA, CPF …8909, tel …8888");
    expect(textoParaOLog("y".repeat(500))).toHaveLength(200);
  });
});

// ── as projeções, campo a campo ───────────────────────────────────────────

describe("projeções", () => {
  it("situação: quantidade de vencidas, centavos, próxima fatura e a prova de posse", () => {
    expect(projetarTitular(envelope(CUSTOMER_STATUS))).toEqual({
      ok: true,
      dados: {
        situacao: {
          em_atraso: false,
          faturas_vencidas: 0,
          total_vencido_centavos: 0,
          proxima_fatura: { numero: "FAT-2026-00000", vencimento: "2026-10-10", valor_centavos: 9900 },
          instancias: [{ nome: "inst…0191", bloqueada: false, motivo: null, liberada: true }],
        },
        // As duas allowlists contra as quais o identificador do modelo é conferido.
        contratos: ["CT-2026-0000"],
        instancias: [{ nome: "inst…0191", bloqueada: false, motivo: null, liberada: true }],
      },
    });
  });

  it("situação sem próxima fatura devolve null, nunca uma data inventada", () => {
    const r = projetarTitular(envelope({ ...CUSTOMER_STATUS, proximaFatura: null, faturasVencidas: [1, 2], totalVencido: "1.234,56" }));
    expect(r).toMatchObject({ ok: true, dados: { situacao: { faturas_vencidas: 2, total_vencido_centavos: 123456, proxima_fatura: null } } });
  });

  it("faturas: lista projetada, com linkPagamento null preservado como null", () => {
    expect(projetarFaturas(envelope(INVOICE_LIST), HOST_DO_ERP)).toEqual({
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

  it("o primeiro que PARSEIA manda — um preâmbulo em prosa não apaga a carga", () => {
    expect(desembrulhar({ content: [{ text: "aqui vai:" }, { text: '{"a":1}' }] })).toEqual({ ok: true, dados: { a: 1 } });
  });

  it("resposta sem conteúdo nenhum também é corpo_invalido", () => {
    expect(desembrulhar({})).toMatchObject({ ok: false, falha: { tipo: "corpo_invalido" } });
    expect(desembrulhar({ content: [] })).toMatchObject({ ok: false, falha: { tipo: "corpo_invalido" } });
  });

  it("forma que não bate com o schema vira corpo_invalido com os CAMINHOS, sem valores", () => {
    const r = projetarTitular(envelope({ ...CUSTOMER_STATUS, emAtraso: "talvez" }));
    expect(r).toMatchObject({ ok: false, falha: { tipo: "corpo_invalido" } });
    expect(JSON.stringify(r)).toContain("emAtraso");
    expect(JSON.stringify(r)).not.toContain(EMAIL);
  });
});
