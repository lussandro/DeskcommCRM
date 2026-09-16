/**
 * Suspender guarda os dados e descarta o trabalho DATADO — pelas ROTAS.
 *
 * ## Por que estes casos não são mais de um handler de `event_log`
 *
 * Eles foram, e o consumidor era letra morta. A cadeia, medida no repo:
 *
 *   1. `fn_event_log_e_registro` (baseline) lista `tenant.suspended` e
 *      `tenant.reactivated` como REGISTRO;
 *   2. `fn_event_log_marca_registro()`, trigger `before insert` em `event_log`,
 *      grava `status := 'done'` para todo tipo dessa lista;
 *   3. `lib/event-log/drain.ts` seleciona `status='pending'` E tipo com handler
 *      registrado.
 *
 * Os dois eventos nasciam `done`, o drain nunca os via, e o handler registrado
 * nunca rodava — com a suíte verde. (O invariante
 * `tests/unit/evento-de-fato-nao-fica-pendente.test.ts` acusa exatamente isso:
 * "tipo com consumidor na lista de registro: ele nasceria `done` e o handler
 * registrado nunca rodaria".)
 *
 * O conserto foi ligar as duas chamadas direto nas rotas. Não é só o que cabia
 * sem mexer em schema: é melhor. O mecanismo vira síncrono, o erro chega a quem
 * CLICOU em vez de sumir num consumidor que ninguém lê, e some um caminho
 * assíncrono que dependia de o evento ficar pendente. A emissão dos dois eventos
 * continua — ela serve a quem lê o `event_log` como histórico, que é o que a
 * lista de registro quer dizer.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRegisteredHandlers } from "@/lib/event-log/dispatcher";
import { ensureHandlersRegistered } from "@/lib/event-log/register-handlers";

vi.mock("@/lib/auth/requirePlatformAdmin", () => ({ requirePlatformAdmin: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const ORG = "22222222-2222-4222-8222-222222222222";

type Opcoes = {
  /** `organizations.status` na leitura de entrada da rota. */
  status?: string;
  /** Quantos pendentes o UPDATE de `job_queue` diz ter matado. */
  descartados?: number;
  /** Faz o UPDATE de `job_queue` falhar — o texto real tem de subir. */
  erroDaLimpeza?: string;
  /** Segura o insert do aviso até o teste liberar — é assim que se prova `await`. */
  travarAviso?: Promise<void>;
  /** Quebra o insert do aviso: recusa do PostgREST (`erro`) ou queda de rede (`lanca`). */
  avisoQuebra?: "erro" | "lanca";
};

/**
 * Dublê que REGISTRA a ordem das operações. A ordem é o coração desta task:
 * nenhuma asserção sobre "limpou" prova coisa alguma sem "limpou QUANDO".
 */
function banco(opcoes: Opcoes = {}) {
  const ops: string[] = [];
  const avisos: Record<string, unknown>[] = [];
  const eventos: Record<string, unknown>[] = [];

  function cadeia(tabela: string) {
    const c: Record<string, unknown> = {};
    for (const m of ["select", "eq", "lt", "gte", "is", "not"]) c[m] = () => c;
    c.maybeSingle = async () => ({
      data: { id: ORG, slug: "org", display_name: "Org", status: opcoes.status ?? "active" },
      error: null,
    });
    c.update = (_patch: unknown, _opts?: unknown) => {
      ops.push(`update:${tabela}`);
      return c;
    };
    c.insert = async (linha: Record<string, unknown>) => {
      ops.push(`insert:${tabela}`);
      if (tabela === "agent_inbox_items") {
        if (opcoes.travarAviso) await opcoes.travarAviso;
        if (opcoes.avisoQuebra === "lanca") throw new Error("fetch failed");
        if (opcoes.avisoQuebra === "erro") {
          return { error: { message: "violates check constraint agent_inbox_items_kind_check" } };
        }
        avisos.push(linha);
      }
      if (tabela === "event_log") eventos.push(linha);
      return { error: null };
    };
    // A cadeia é ela própria o thenable: é assim que o postgrest-js devolve
    // `count` de um UPDATE sem trazer linha nenhuma.
    c.then = (resolva: (r: unknown) => unknown) =>
      Promise.resolve(
        tabela === "job_queue"
          ? {
              data: null,
              count: opcoes.erroDaLimpeza ? null : (opcoes.descartados ?? 0),
              error: opcoes.erroDaLimpeza ? { message: opcoes.erroDaLimpeza } : null,
            }
          : { data: null, count: null, error: null },
      ).then(resolva);
    return c;
  }

  vi.mocked(createAdminClient).mockReturnValue({
    from: (tabela: string) => cadeia(tabela),
  } as never);

  return { ops, avisos, eventos };
}

function pedido(rota: string) {
  return new NextRequest(`http://localhost/api/v1/admin/tenants/${ORG}/${rota}`, {
    method: "POST",
    body: JSON.stringify({ reason: "inadimplência de três meses" }),
    headers: { "content-type": "application/json" },
  });
}

async function chamar(rota: "suspend" | "reactivate") {
  const { POST } =
    rota === "suspend"
      ? await import("@/app/api/v1/admin/tenants/[id]/suspend/route")
      : await import("@/app/api/v1/admin/tenants/[id]/reactivate/route");
  return POST(pedido(rota), { params: Promise.resolve({ id: ORG }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireSupportWrite).mockResolvedValue(null as never);
  vi.mocked(requirePlatformAdmin).mockResolvedValue({
    user: { id: ADMIN_ID },
    platformAdmin: { user_id: ADMIN_ID, scope: "full", mfa_required: true },
  } as never);
});

describe("POST /admin/tenants/:id/suspend — limpa a fila e avisa", () => {
  it("limpa DEPOIS de gravar o status, e abre UM aviso com a contagem", async () => {
    const { ops, avisos } = banco({ status: "active", descartados: 2 });

    const res = await chamar("suspend");

    expect(res.status).toBe(200);
    // Depois, e não antes: com a organização já `suspended` o claim a ignora, e
    // a limpeza não corre com worker em voo.
    expect(ops.indexOf("update:organizations")).toBeGreaterThan(-1);
    expect(ops.indexOf("update:job_queue")).toBeGreaterThan(
      ops.indexOf("update:organizations"),
    );
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({ organization_id: ORG, kind: "job_dead", severity: "warn" });
    expect(String(avisos[0]!.body)).toContain("2 job(s)");
  });

  it("continua emitindo tenant.suspended, com a contagem no payload", async () => {
    const { eventos } = banco({ status: "active", descartados: 1 });

    await chamar("suspend");

    const evento = eventos.find((e) => e.event_type === "tenant.suspended");
    expect(evento, "o evento é histórico, não trabalho — mas continua sendo emitido").toBeDefined();
    // Desde que a suspensão também descarta, o número existe dos dois lados;
    // omiti-lo aqui faria o histórico saber de metade do descarte.
    expect(evento?.payload).toMatchObject({ jobs_descartados: 1 });
  });

  // A promessa "NUNCA lança" do helper do aviso não era medida por ninguém: o
  // revisor trocou o `logger.error` por `throw` e a suíte ficou 14/14 verde.
  // É o pior lugar possível para um throw — a suspensão JÁ está gravada, então a
  // rota devolveria 500 numa operação que aconteceu, o operador repetiria, e
  // levaria 409 com o aviso perdido.
  it.each(["erro", "lanca"] as const)(
    "aviso que falha (%s) não derruba a suspensão já gravada",
    async (avisoQuebra) => {
      const { ops } = banco({ status: "active", descartados: 2, avisoQuebra });

      const res = await chamar("suspend");

      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ data: { status: "suspended" } });
      // E a suspensão de fato aconteceu: não é um 200 de caminho curto.
      expect(ops).toContain("update:organizations");
      expect(ops).toContain("update:job_queue");
    },
  );

  it("fila vazia é silêncio, não um aviso de zero", async () => {
    const { avisos, ops } = banco({ status: "active", descartados: 0 });

    await chamar("suspend");

    expect(ops).toContain("update:job_queue");
    expect(avisos).toHaveLength(0);
  });

  it("falha da limpeza sobe com o texto real do banco, e diz que a suspensão foi gravada", async () => {
    banco({ status: "active", erroDaLimpeza: "deadlock detected" });

    const res = await chamar("suspend");

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toContain("deadlock detected");
    // Mascarar em "falhou" faria o operador repetir algo que já aconteceu.
    expect(body.error.message).toMatch(/suspended/i);
  });
});

describe("POST /admin/tenants/:id/reactivate — limpa ANTES de reativar, e avisa", () => {
  it("limpa a fila ANTES de virar o status, e avisa com a contagem", async () => {
    const { ops, avisos } = banco({ status: "suspended", descartados: 3 });

    const res = await chamar("reactivate");

    expect(res.status).toBe(200);
    expect(ops.indexOf("update:job_queue")).toBeGreaterThan(-1);
    expect(
      ops.indexOf("update:job_queue"),
      "limpar depois do update não adianta: no commit o claim volta a enxergar a organização",
    ).toBeLessThan(ops.indexOf("update:organizations"));
    expect(avisos).toHaveLength(1);
    expect(String(avisos[0]!.title)).toContain("antes de reativar");
    expect(String(avisos[0]!.body)).toContain("3 job(s)");
  });

  it("o aviso é AGUARDADO, não `void` — a tela não diz 'ativo' antes dele", async () => {
    // Com `void`, a resposta sai com o insert ainda em voo e a falha dele fica
    // invisível. Aqui o insert fica preso: se a rota respondesse assim mesmo,
    // `respondeu` ganharia a corrida.
    let liberar!: () => void;
    const travarAviso = new Promise<void>((r) => (liberar = r));
    banco({ status: "suspended", descartados: 4, travarAviso });

    const emVoo = chamar("reactivate");
    const quemGanhou = await Promise.race([
      emVoo.then(() => "respondeu"),
      new Promise((r) => setTimeout(() => r("ainda esperando o aviso"), 20)),
    ]);

    expect(quemGanhou).toBe("ainda esperando o aviso");
    liberar();
    expect((await emVoo).status).toBe(200);
  });

  it("reativação sem fila represada não abre aviso nenhum", async () => {
    const { avisos } = banco({ status: "suspended", descartados: 0 });

    await chamar("reactivate");

    expect(avisos).toHaveLength(0);
  });

  it("leva a contagem no payload do evento — é o histórico do descarte", async () => {
    const { eventos } = banco({ status: "suspended", descartados: 5 });

    await chamar("reactivate");

    const evento = eventos.find((e) => e.event_type === "tenant.reactivated");
    expect(evento?.payload).toMatchObject({ jobs_descartados: 5 });
  });

  // Catraca de ORDEM, herdada do teste do handler que morreu. O risco central
  // desta task não é a query, é QUANDO ela roda — e o caso acima mede a ordem
  // pelo dublê, que alguém pode reordenar sem perceber. Este mede o TEXTO.
  it("a rota limpa ANTES de virar o status — a ordem é a task inteira", () => {
    const rota = readFileSync(
      join(process.cwd(), "app", "api", "v1", "admin", "tenants", "[id]", "reactivate", "route.ts"),
      "utf8",
    );
    const limpeza = rota.indexOf("limparFilaRepresada(");
    const virada = rota.indexOf('status: "active"');

    expect(limpeza, "a rota de reativação chama a limpeza").toBeGreaterThan(-1);
    expect(virada, "a rota de reativação vira o status").toBeGreaterThan(-1);
    expect(
      limpeza,
      "limpar DEPOIS do update não adianta: no commit o claim volta a enxergar a organização e drena a fila antes de o drain rodar",
    ).toBeLessThan(virada);
  });
});

describe("os eventos do ciclo NÃO ganham consumidor", () => {
  it("register-handlers não registra tenant.suspended nem tenant.reactivated", () => {
    // Sem este caso, alguém reintroduz o handler morto: ele passa no CI, fica
    // registrado, e nunca roda — porque os dois tipos estão em
    // `fn_event_log_e_registro` e a linha nasce `done`, fora do alcance do drain.
    ensureHandlersRegistered();
    const consumidos = getRegisteredHandlers().flatMap((h) => h.events);

    expect(consumidos.length, "o registry não pode vir vazio — senão isto passa por não medir").
      toBeGreaterThan(5);
    expect(consumidos).not.toContain("tenant.suspended");
    expect(consumidos).not.toContain("tenant.reactivated");
  });
});
