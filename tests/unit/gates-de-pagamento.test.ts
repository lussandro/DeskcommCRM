import { describe, expect, it } from "vitest";

import {
  acaoDePagamentoGate,
  comprovanteSemAnexoGate,
  type GateContext,
} from "@/lib/agent-engine/guardrails/before-send";
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
    ["Recebi sim, querida. Deixo o comprovante registrado", SEM_MIDIA],
    ["recebi o comprovante, obrigada!", SEM_MIDIA],
    ["A foto chegou aqui certinho", SEM_MIDIA],
    ["consegui ver o print, tudo certo", SEM_MIDIA],
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

const PAGAMENTOS_ARMADO = { active: true } as const;

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
