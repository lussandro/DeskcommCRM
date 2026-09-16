/**
 * A QUERY da limpeza, medida.
 *
 * O teste do handler mocka este módulo de propósito — lá o que se prova é o
 * consumidor. Sem ESTE arquivo, os filtros não teriam prova alguma e uma troca
 * de `pending` por `running` passaria verde: o descarte silenciosamente não
 * descartaria nada, e a enxurrada voltaria na reativação seguinte.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { logger } from "@/lib/logger";
import { avisarDescarteDaFila, limparFilaRepresada } from "@/lib/tenancy/limpar-fila-represada";

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const ORG = "22222222-2222-4222-8222-222222222222";

/** Dublê que REGISTRA o que foi filtrado — é o filtro que está sob teste. */
function clienteQueRegistra(resultado: {
  count: number | null;
  error: { message: string } | null;
}) {
  const chamadas = {
    tabela: "",
    patch: {} as Record<string, unknown>,
    opcoes: {} as Record<string, unknown>,
    filtros: [] as [string, string, unknown][],
  };
  const cadeia = {
    update(patch: Record<string, unknown>, opcoes: Record<string, unknown> = {}) {
      chamadas.patch = patch;
      chamadas.opcoes = opcoes;
      return cadeia;
    },
    // A cadeia SEM `.select()` é ela própria o thenable — é assim que o
    // postgrest-js devolve `count` sem trazer linha nenhuma.
    then(
      resolva: (r: { data: null; count: number | null; error: { message: string } | null }) => unknown,
    ) {
      return Promise.resolve({ data: null, count: resultado.count, error: resultado.error }).then(
        resolva,
      );
    },
    eq(coluna: string, valor: unknown) {
      chamadas.filtros.push(["eq", coluna, valor]);
      return cadeia;
    },
    lt(coluna: string, valor: unknown) {
      chamadas.filtros.push(["lt", coluna, valor]);
      return cadeia;
    },
  };
  const admin = {
    from(tabela: string) {
      chamadas.tabela = tabela;
      return cadeia;
    },
  };
  return { admin, chamadas };
}

beforeEach(() => vi.clearAllMocks());

describe("limparFilaRepresada", () => {
  it("descarta só o pendente da organização certa, e devolve a contagem", async () => {
    const { admin, chamadas } = clienteQueRegistra({ count: 2, error: null });

    const r = await limparFilaRepresada(admin as never, ORG);

    expect(r.descartados).toBe(2);
    // A contagem vem do `count` do próprio UPDATE; pedi-la é o que faz o
    // PostgREST mandar o `Content-Range`. Sem esta opção, `count` é `null` e o
    // descarte passaria a relatar 0 — aviso nenhum na Central.
    expect(chamadas.opcoes).toMatchObject({ count: "exact" });
    expect(chamadas.tabela).toBe("job_queue");
    expect(chamadas.filtros).toContainEqual(["eq", "organization_id", ORG]);
    // É ESTE expect que a sabotagem nº 1 do Step 5 derruba.
    expect(chamadas.filtros).toContainEqual(["eq", "status", "pending"]);
  });

  it("deixa o hold do watchdog em paz", async () => {
    const { admin, chamadas } = clienteQueRegistra({ count: 0, error: null });

    await limparFilaRepresada(admin as never, ORG);

    const lt = chamadas.filtros.find(([op, coluna]) => op === "lt" && coluna === "run_after");
    expect(lt, "o hold sai do descarte por um limite finito de run_after").toBeDefined();
    expect(String(lt?.[2])).toMatch(/^9999-/);
  });

  it("marca dead com o motivo, para a Central não mentir sobre a causa", async () => {
    const { admin, chamadas } = clienteQueRegistra({ count: 1, error: null });

    await limparFilaRepresada(admin as never, ORG);

    expect(chamadas.patch).toMatchObject({
      status: "dead",
      last_error: "organização suspensa",
    });
  });

  it("erro do banco sobe com o texto real, nunca engolido", async () => {
    const { admin } = clienteQueRegistra({ count: null, error: { message: "deadlock detected" } });

    await expect(limparFilaRepresada(admin as never, ORG)).rejects.toThrow(/deadlock detected/);
  });
});

/**
 * O contrário do caso acima, e de propósito: a LIMPEZA lança, o AVISO nunca.
 *
 * Quando o aviso roda, os jobs já morreram e — na suspensão — o status já está
 * gravado. Um throw aqui transformaria "avisei mal" em "a operação falhou", e o
 * operador repetiria algo que já aconteceu, levando 409. A promessa estava só no
 * comentário: o revisor trocou o `logger.error` por `throw` e a suíte seguiu
 * verde. Estes dois casos são a medida dela, nas duas formas de falha do
 * supabase-js — a recusa que volta em `{ error }` e a queda de rede que LANÇA.
 */
describe("avisarDescarteDaFila nunca lança", () => {
  function clienteDeAviso(modo: "erro" | "lanca") {
    return {
      from: () => ({
        insert: async () => {
          if (modo === "lanca") throw new Error("fetch failed");
          return { error: { message: "violates check constraint" } };
        },
      }),
    };
  }

  it.each([
    ["recusa do PostgREST", "erro", "violates check constraint"],
    ["queda de rede", "lanca", "fetch failed"],
  ] as const)("%s: resolve e vai para o log com o texto real", async (_nome, modo, texto) => {
    await expect(
      avisarDescarteDaFila(clienteDeAviso(modo) as never, ORG, 3, "suspensao"),
    ).resolves.toBeUndefined();

    expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
      expect.stringContaining("aviso de descarte"),
      expect.objectContaining({ organization_id: ORG, descartados: 3, error: texto }),
    );
  });

  it("fila vazia nem chega a tocar o banco", async () => {
    const admin = {
      from: () => {
        throw new Error("não devia ter sido chamado");
      },
    };

    await expect(avisarDescarteDaFila(admin as never, ORG, 0, "reativacao")).resolves.toBeUndefined();
    expect(vi.mocked(logger.error)).not.toHaveBeenCalled();
  });
});
