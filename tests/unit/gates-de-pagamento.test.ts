import { describe, expect, it } from "vitest";

import {
  acaoDePagamentoGate,
  alegacaoDePagamentoExigeHumanoGate,
  comprovanteSemAnexoGate,
  pagamentoSoPelaFerramentaGate,
  type GateContext,
} from "@/lib/agent-engine/guardrails/before-send";
import {
  clienteAlegaPagamento,
  resultadoMostraCobrancaPaga,
} from "@/lib/agent-engine/agent/sinais-de-pagamento";
import { PACING_DEFAULTS } from "@/lib/agent-engine/pacing/defaults";
import { SPINNING_DEFAULTS } from "@/lib/agent-engine/spinning/defaults";
import { decidirFallbackHumano } from "@/lib/agent-engine/agent/fallback-humano";

/**
 * Os dois gates MEDIDOS em 17/09/2026 (org do dono, agente financeiro "Paulo", `gpt-5.4`):
 *
 *  1. o cliente escreveu "mandei a foto do comprovante, recebeu?" SEM mandar imagem, e o
 *     agente respondeu "Recebi sim, querida. Deixo o comprovante registrado para o
 *     financeiro acompanhar". Numa segunda conversa, com o prompt já proibindo isso, ele
 *     abriu com "Recebi sim por aqui." — prompt é ensino, nunca garantia;
 *  2. o agente afirmava ações que não executa ("deixo registrado", "já liberei seu
 *     acesso"): a baixa e a liberação são do sistema de pagamentos, não dele.
 *
 * `baseCtx` é próprio deste arquivo — mesma decisão de `gate-agenda-stall.test.ts` (sem
 * fixture compartilhada de `GateContext`, para um gate não herdar contexto calibrado para
 * outro).
 */
function baseCtx(overrides: Partial<GateContext> = {}): GateContext {
  return {
    now: new Date("2026-09-17T13:00:00Z"),
    body: "",
    optedOut: false,
    provider: "waha",
    pacing: {
      knobs: PACING_DEFAULTS,
      state: { lastSentAt: null, sentToday: 0, numberActivatedAt: null },
      crmDailyLimit: null,
    },
    spinning: { knobs: SPINNING_DEFAULTS, window: [] },
    promise: { table: null },
    semanticPromise: null,
    disclosure: { template: null, isFirstOutbound: false, mode: "inject" },
    lgpd: null,
    casesEnabled: false,
    hasOpenCase: false,
    openedCaseThisTurn: false,
    ...overrides,
  };
}

const SEM_MIDIA = {
  inboundComMidiaDesdeUltimoOutbound: false,
  ultimaInboundMencionaAnexo: false,
} as const;
const SEM_MIDIA_MAS_CLIENTE_FALOU_DE_ANEXO = {
  inboundComMidiaDesdeUltimoOutbound: false,
  ultimaInboundMencionaAnexo: true,
} as const;

describe("comprovanteSemAnexoGate", () => {
  const VETAM: readonly [string, GateContext["anexos"]][] = [
    // Contexto REAL do incidente: o cliente acabou de dizer "mandei a foto do comprovante".
    ["Recebi sim, querida. Deixo o comprovante registrado", SEM_MIDIA_MAS_CLIENTE_FALOU_DE_ANEXO],
    ["recebi o comprovante, obrigada!", SEM_MIDIA],
    ["A foto chegou aqui certinho", SEM_MIDIA],
    ["consegui ver o print, tudo certo", SEM_MIDIA],
    // Achado 5 da revisão: as formas mais naturais de WhatsApp passavam inteiras.
    ["Tá aqui comigo o comprovante", SEM_MIDIA],
    ["Vi o comprovante, está tudo certo", SEM_MIDIA],
    ["Já tenho o comprovante aqui", SEM_MIDIA],
    ["Localizei o comprovante no sistema", SEM_MIDIA],
    ["comprovante recebido", SEM_MIDIA],
    ["O comprovante está em mãos", SEM_MIDIA],
    // A metade sem substantivo: só veta porque o CLIENTE acabou de falar de anexo.
    ["Recebi sim por aqui.", SEM_MIDIA_MAS_CLIENTE_FALOU_DE_ANEXO],
  ];
  for (const [frase, anexos] of VETAM) {
    it(`veta: ${frase}`, () => {
      const v = comprovanteSemAnexoGate.evaluate(baseCtx({ body: frase, anexos }));
      expect(v.pass).toBe(false);
      if (!v.pass) expect(v.code).toBe("comprovante_sem_anexo");
    });
  }

  const PASSAM: readonly [string, GateContext["anexos"]][] = [
    // A frase CERTA — vetá-la fecharia a única saída que o próprio veto manda usar.
    ["Não chegou nenhuma imagem aqui", SEM_MIDIA],
    ["não precisa do comprovante", SEM_MIDIA],
    ["a confirmação é automática", SEM_MIDIA],
    // Sem substantivo de anexo E sem o cliente ter falado de anexo: frase legítima.
    ["recebi seu pedido", SEM_MIDIA],
    ["Recebi sim por aqui.", SEM_MIDIA],
    // Achado 2: a negação vale para a ORAÇÃO, não só colada ao verbo — e estas são as
    // redações da frase que o próprio veto manda o modelo usar.
    ["Nenhuma imagem chegou aqui até agora.", SEM_MIDIA_MAS_CLIENTE_FALOU_DE_ANEXO],
    ["Nenhum comprovante chegou por aqui.", SEM_MIDIA_MAS_CLIENTE_FALOU_DE_ANEXO],
    ["Nada chegou aqui, pode mandar a foto de novo?", SEM_MIDIA_MAS_CLIENTE_FALOU_DE_ANEXO],
    ["Até agora não me chegou o comprovante.", SEM_MIDIA_MAS_CLIENTE_FALOU_DE_ANEXO],
    // Achado 1: tenants que não têm o problema. O cliente pediu foto do rótulo, e a
    // conversa segue sobre vinho.
    ["Chegou essa semana o Malbec novo", SEM_MIDIA_MAS_CLIENTE_FALOU_DE_ANEXO],
    ["Recebemos sua solicitação e vamos verificar.", SEM_MIDIA_MAS_CLIENTE_FALOU_DE_ANEXO],
    ["Seu pedido chegou ontem na transportadora.", SEM_MIDIA_MAS_CLIENTE_FALOU_DE_ANEXO],
    ["Recebi seu pedido, obrigado!", SEM_MIDIA_MAS_CLIENTE_FALOU_DE_ANEXO],
    ["tenho uma foto do produto para te mandar", SEM_MIDIA],
    ["Quando a foto chegar eu confiro", SEM_MIDIA_MAS_CLIENTE_FALOU_DE_ANEXO],
  ];
  for (const [frase, anexos] of PASSAM) {
    it(`passa: ${frase}`, () => {
      expect(comprovanteSemAnexoGate.evaluate(baseCtx({ body: frase, anexos })).pass).toBe(true);
    });
  }

  it("passa quando mídia inbound de fato chegou desde o último outbound", () => {
    const v = comprovanteSemAnexoGate.evaluate(
      baseCtx({
        body: "Recebi sim, querida. Deixo o comprovante registrado",
        anexos: { inboundComMidiaDesdeUltimoOutbound: true, ultimaInboundMencionaAnexo: true },
      }),
    );
    expect(v.pass).toBe(true);
  });

  it("no-op sem contexto de anexos — caller que não conhece o campo não arma nada", () => {
    expect(
      comprovanteSemAnexoGate.evaluate(baseCtx({ body: "recebi o comprovante" })).pass,
    ).toBe(true);
  });
});

/** Armado e sem nenhum sinal — o estado de um turno comum. */
const PAGAMENTOS_ARMADO = {
  active: true,
  cobrancaPagaPelaFerramentaNesteTurno: false,
  casoHumanoAbertoNesteTurno: false,
  clienteAlegouPagamento: false,
} as const;

describe("acaoDePagamentoGate", () => {
  const VETAM = [
    "Deixo o comprovante registrado para o financeiro acompanhar",
    "deixo anotado aqui para o financeiro",
    "pode me mandar o comprovante para eu registrar",
    "já liberei seu acesso",
    "vou liberar o acesso",
    "confirmei o pagamento",
    "pagamento confirmado por aqui",
    "dei baixa",
    // Achado 4: o anúncio consumado em particípio, que passava inteiro.
    "Já está liberado.",
    "Seu acesso foi reativado.",
    "Pronto, liberado!",
    "está desbloqueado",
  ];
  for (const frase of VETAM) {
    it(`veta: ${frase}`, () => {
      const v = acaoDePagamentoGate.evaluate(
        baseCtx({ body: frase, pagamentos: PAGAMENTOS_ARMADO }),
      );
      expect(v.pass).toBe(false);
      if (!v.pass) expect(v.code).toBe("acao_de_pagamento_nao_e_do_agente");
    });
  }

  const PASSAM = [
    "A liberação é automática assim que o Pix confirmar",
    "eu não consigo liberar manualmente por aqui",
    "a confirmação é automática",
    "não precisa do comprovante",
    "assim que o pagamento for confirmado o acesso abre sozinho",
    // Objeto NÃO financeiro: a frase legítima de um agente de clínica não pode cair aqui.
    "deixo anotado seu horário de segunda",
    // Achado 6: recado ao financeiro é ação real e legítima; e a negação vale na oração.
    "Deixo anotado seu recado para o financeiro te chamar.",
    "Eu não vou liberar o acesso por aqui, é automático.",
    // Achados 3 e 4: negação, futuro/condicional e agente automático.
    "Seu pagamento ainda não foi confirmado.",
    "Após o pagamento ser confirmado, o acesso volta.",
    "Assim que o pagamento é confirmado, o sistema libera sozinho.",
    "O pagamento foi confirmado pelo sistema, não por mim.",
    "O acesso é liberado automaticamente.",
    "seu horário das 14h foi liberado na agenda",
  ];
  for (const frase of PASSAM) {
    it(`passa: ${frase}`, () => {
      expect(
        acaoDePagamentoGate.evaluate(baseCtx({ body: frase, pagamentos: PAGAMENTOS_ARMADO })).pass,
      ).toBe(true);
    });
  }

  it("no-op sem o campo — caller que não conhece o gate segue idêntico", () => {
    expect(acaoDePagamentoGate.evaluate(baseCtx({ body: "já liberei seu acesso" })).pass).toBe(
      true,
    );
  });
});

/**
 * A REGRA do fallback humano. O encanamento (abrir caso + avisar o lead) vive no
 * `inbound-turn.ts` e NÃO é medido aqui — ver o report desta sessão.
 */
describe("decidirFallbackHumano", () => {
  it("chama uma pessoa quando um gate de ensino vetou e nada saiu", () => {
    const d = decidirFallbackHumano({
      vetos: [{ gate: "acao_de_pagamento", code: "acao_de_pagamento_nao_e_do_agente" }],
      mensagensEnviadas: 0,
    });
    expect(d).toEqual({ fallback: true, code: "acao_de_pagamento_nao_e_do_agente" });
  });

  it("não chama ninguém se alguma mensagem saiu", () => {
    expect(
      decidirFallbackHumano({
        vetos: [{ gate: "agenda_stall", code: "agenda_stall_sem_ferramenta" }],
        mensagensEnviadas: 1,
      }).fallback,
    ).toBe(false);
  });

  it("stop/lgpd/pacing/messaging_window não são veto de ensino — abrir caso ali é ruído", () => {
    for (const gate of ["stop", "lgpd", "pacing", "messaging_window"]) {
      expect(
        decidirFallbackHumano({ vetos: [{ gate, code: "x" }], mensagensEnviadas: 0 }).fallback,
      ).toBe(false);
    }
  });

  it("o código que vai ao caso é o do ÚLTIMO veto de ensino", () => {
    const d = decidirFallbackHumano({
      vetos: [
        { gate: "comprovante_sem_anexo", code: "comprovante_sem_anexo" },
        { gate: "pacing", code: "daily_cap" },
        { gate: "acao_de_pagamento", code: "acao_de_pagamento_nao_e_do_agente" },
      ],
      mensagensEnviadas: 0,
    });
    expect(d).toEqual({ fallback: true, code: "acao_de_pagamento_nao_e_do_agente" });
  });

  it("turno sem veto nenhum e sem envio não abre caso — esse é o silêncio de outro dono", () => {
    expect(decidirFallbackHumano({ vetos: [], mensagensEnviadas: 0 }).fallback).toBe(false);
  });
});

/**
 * A REGRA DO DONO, acima de tudo (17/09/2026): o agente só concorda com cobrança que
 * REALMENTE está paga, e quem valida é a ferramenta. Não vale a palavra do cliente, não
 * vale o comprovante, não vale plausibilidade.
 */
describe("pagamentoSoPelaFerramentaGate", () => {
  const VETAM = [
    "recebi seu pagamento",
    "pagamento confirmado",
    "pagamento recebido",
    "está pago",
    "já consta pago",
    "já caiu",
    "tudo certo com o pagamento",
    "obrigado pelo pagamento",
    "pagamento identificado",
    "está quitado",
    "sua mensalidade está em dia",
  ];
  for (const frase of VETAM) {
    it(`veta sem a ferramenta: ${frase}`, () => {
      const v = pagamentoSoPelaFerramentaGate.evaluate(
        baseCtx({ body: frase, pagamentos: PAGAMENTOS_ARMADO }),
      );
      expect(v.pass).toBe(false);
      if (!v.pass) expect(v.code).toBe("pagamento_so_pela_ferramenta");
    });

    it(`passa COM a ferramenta confirmando: ${frase}`, () => {
      // A mesma frase, autorizada pelo único insumo que autoriza.
      expect(
        pagamentoSoPelaFerramentaGate.evaluate(
          baseCtx({
            body: frase,
            pagamentos: { ...PAGAMENTOS_ARMADO, cobrancaPagaPelaFerramentaNesteTurno: true },
          }),
        ).pass,
      ).toBe(true);
    });
  }

  const PASSAM = [
    "ainda não consta o pagamento aqui",
    "não identificamos o pagamento",
    "assim que o pagamento for confirmado eu te aviso",
    "a confirmação é automática",
    // Achado 3: as frases centrais do caso de uso que o gate veio proteger.
    "Seu pagamento ainda não foi confirmado.",
    "Após o pagamento ser confirmado, o acesso volta.",
    "Assim que o pagamento é confirmado, o sistema libera sozinho.",
    "O pagamento foi confirmado pelo sistema, não por mim.",
    "Nenhum pagamento consta em dia por aqui.",
  ];
  for (const frase of PASSAM) {
    it(`passa: ${frase}`, () => {
      expect(
        pagamentoSoPelaFerramentaGate.evaluate(
          baseCtx({ body: frase, pagamentos: PAGAMENTOS_ARMADO }),
        ).pass,
      ).toBe(true);
    });
  }

  it("no-op sem o campo — caller que não conhece o gate segue idêntico", () => {
    expect(pagamentoSoPelaFerramentaGate.evaluate(baseCtx({ body: "pagamento confirmado" })).pass).toBe(
      true,
    );
  });
});

describe("alegacaoDePagamentoExigeHumanoGate — os 3 sinais em combinação", () => {
  // 2x2x2. Só UMA combinação veta: o cliente alegou, a ferramenta não confirmou, e não há
  // caso humano aberto. É a pré-condição do turno, não um padrão de texto — por isso o
  // corpo é uma frase inocente em todos os casos.
  const CORPO = "Oi! Como posso ajudar?";
  for (const alegou of [false, true]) {
    for (const ferramentaConfirmou of [false, true]) {
      for (const casoAberto of [false, true]) {
        const deveVetar = alegou && !ferramentaConfirmou && !casoAberto;
        it(`alegou=${alegou} ferramenta=${ferramentaConfirmou} caso=${casoAberto} → ${deveVetar ? "veta" : "passa"}`, () => {
          const v = alegacaoDePagamentoExigeHumanoGate.evaluate(
            baseCtx({
              body: CORPO,
              pagamentos: {
                active: true,
                clienteAlegouPagamento: alegou,
                cobrancaPagaPelaFerramentaNesteTurno: ferramentaConfirmou,
                casoHumanoAbertoNesteTurno: casoAberto,
              },
            }),
          );
          expect(v.pass).toBe(!deveVetar);
          if (!v.pass) expect(v.code).toBe("alegacao_de_pagamento_exige_humano");
        });
      }
    }
  }

  it("no-op sem o campo", () => {
    expect(alegacaoDePagamentoExigeHumanoGate.evaluate(baseCtx({ body: "oi" })).pass).toBe(true);
  });
});

describe("sinais que os gates leem", () => {
  it("reconhece a cobrança paga na projeção da tool de UMA cobrança", () => {
    expect(resultadoMostraCobrancaPaga({ payment_id: "p1", status: "RECEIVED" })).toBe(true);
    expect(resultadoMostraCobrancaPaga({ payment_id: "p1", status: "CONFIRMED" })).toBe(true);
    expect(resultadoMostraCobrancaPaga({ payment_id: "p1", status: "RECEIVED_IN_CASH" })).toBe(true);
  });

  it("reconhece na LISTA, e não confunde vencida/pendente com paga", () => {
    expect(
      resultadoMostraCobrancaPaga({ charges: [{ status: "OVERDUE" }, { status: "CONFIRMED" }] }),
    ).toBe(true);
    expect(
      resultadoMostraCobrancaPaga({ charges: [{ status: "OVERDUE" }, { status: "PENDING" }] }),
    ).toBe(false);
  });

  it("resultado que não é cobrança nenhuma não autoriza nada", () => {
    expect(resultadoMostraCobrancaPaga({ needs_document: true })).toBe(false);
    expect(resultadoMostraCobrancaPaga({ error: "RECEIVED" })).toBe(false);
    expect(resultadoMostraCobrancaPaga(null)).toBe(false);
    expect(resultadoMostraCobrancaPaga("RECEIVED")).toBe(false);
  });

  it("reconhece a alegação do cliente, com e sem acento", () => {
    for (const frase of [
      "paguei ontem",
      "já paguei",
      "acabei de pagar",
      "tá pago",
      "quitei",
      "fiz o pix",
      "já fiz o pix agora",
      "fiz a transferência",
      "transferi hoje de manhã",
      "depositei na conta",
      "mandei o comprovante",
      "enviei o comprovante no zap",
    ])
      expect(clienteAlegaPagamento(frase), frase).toBe(true);
  });

  it("não confunde pergunta com alegação", () => {
    for (const frase of [
      "como faço para pagar?",
      "qual o valor da mensalidade?",
      "posso pagar amanhã?",
      "ainda não paguei",
    ])
      expect(clienteAlegaPagamento(frase), frase).toBe(false);
  });
});
