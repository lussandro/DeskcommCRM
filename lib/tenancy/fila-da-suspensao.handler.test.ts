/**
 * Suspender guarda os dados e descarta o trabalho DATADO.
 *
 * Sem este consumidor, `tenant.suspended` era emitido
 * (`app/api/v1/admin/tenants/[id]/suspend/route.ts:109`) e ninguém escutava —
 * o anti-pattern nº 3 da doutrina, evento sem consumer. O efeito prático
 * aparecia só na REATIVAÇÃO: toda a fila represada saía de uma vez, que é o
 * "reenvio em massa" que a spec proíbe.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  FILA_DA_SUSPENSAO_HANDLER_KEY,
  filaDaSuspensaoHandler,
} from "@/lib/tenancy/fila-da-suspensao.handler";
import { limparFilaRepresada } from "@/lib/tenancy/limpar-fila-represada";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRegisteredHandlers } from "@/lib/event-log/dispatcher";
import { ensureHandlersRegistered } from "@/lib/event-log/register-handlers";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

const ORG = "22222222-2222-4222-8222-222222222222";

vi.mock("@/lib/tenancy/limpar-fila-represada", () => ({ limparFilaRepresada: vi.fn() }));

function banco() {
  const inseridos: Record<string, unknown>[] = [];
  vi.mocked(createAdminClient).mockReturnValue({
    from: vi.fn(() => ({
      insert: vi.fn(async (linha: Record<string, unknown>) => {
        inseridos.push(linha);
        return { error: null };
      }),
    })),
  } as unknown as ReturnType<typeof createAdminClient>);
  return inseridos;
}

function evento(
  tipo: "tenant.suspended" | "tenant.reactivated",
  payload: Record<string, unknown> = {},
) {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    organization_id: ORG,
    event_type: tipo,
    payload: { tenant_id: ORG, reason: "inadimplência", ...payload },
    // `as unknown as` porque o dublê traz só os campos que o handler lê — o
    // EventRow real tem entity_kind/metadata/consumed_by/attempts, e nenhum
    // deles participa desta regra.
  } as unknown as Parameters<typeof filaDaSuspensaoHandler.handle>[0];
}

beforeEach(() => vi.clearAllMocks());

describe("consumidor da fila represada por suspensão", () => {
  it("na SUSPENSÃO limpa a fila e abre UM aviso com a contagem", async () => {
    const inseridos = banco();
    vi.mocked(limparFilaRepresada).mockResolvedValue({ descartados: 2 });
    const r = await filaDaSuspensaoHandler.handle(evento("tenant.suspended"));
    expect(r.status).toBe("ok");
    expect(r.detail).toContain("descartados=2");
    expect(inseridos).toHaveLength(1);
    expect(inseridos[0]).toMatchObject({
      organization_id: ORG,
      kind: "job_dead",
      severity: "warn",
    });
  });

  it("na REATIVAÇÃO não limpa nada — quem limpou foi a rota, antes do UPDATE", async () => {
    // Este é o caso que registra a correção mais cara deste plano. Limpar aqui
    // seria tarde: o `update({status:"active"})` da rota comita e o claim volta
    // a enxergar a organização IMEDIATAMENTE, enquanto este handler só roda no
    // próximo tick do cron do drain (`* * * * *`) — até 60s depois, com o
    // worker claimando em laço contínuo. O backlog já teria saído.
    const inseridos = banco();
    const r = await filaDaSuspensaoHandler.handle(
      evento("tenant.reactivated", { jobs_descartados: 3 }),
    );
    expect(limparFilaRepresada).not.toHaveBeenCalled();
    expect(r.status).toBe("ok");
    expect(r.detail).toContain("descartados=3");
    expect(inseridos[0]).toMatchObject({ kind: "job_dead" });
  });

  it("sem fila represada, não abre aviso nenhum", async () => {
    const inseridos = banco();
    vi.mocked(limparFilaRepresada).mockResolvedValue({ descartados: 0 });
    const r = await filaDaSuspensaoHandler.handle(evento("tenant.suspended"));
    expect(r.status).toBe("skipped");
    expect(inseridos).toHaveLength(0);
  });

  it("reativação sem contagem no payload é silenciosa, não um aviso de zero", async () => {
    const inseridos = banco();
    const r = await filaDaSuspensaoHandler.handle(evento("tenant.reactivated"));
    expect(r.status).toBe("skipped");
    expect(inseridos).toHaveLength(0);
  });

  it("consome os dois eventos do ciclo, e só eles", () => {
    expect(filaDaSuspensaoHandler.events).toEqual([
      "tenant.suspended",
      "tenant.reactivated",
    ]);
  });

  it("está REGISTRADO no dispatcher — senão nada disto roda em produção", () => {
    // Declarar `events` não registra nada. Sem este caso, esquecer o Step 4
    // deixaria a suíte inteira verde com os dois eventos ainda sem consumidor,
    // que é o defeito que esta task existe para fechar.
    ensureHandlersRegistered();
    const chaves = getRegisteredHandlers().map((h) => h.key);
    expect(chaves).toContain(FILA_DA_SUSPENSAO_HANDLER_KEY);
  });

  // Catraca de ORDEM. O risco central desta task não é a query, é QUANDO ela
  // roda: o `update` do status comita e o `agent-worker` claima em laço
  // contínuo, enquanto o drain do event_log é cron de um minuto. Nenhuma prova
  // de comportamento alcança isso numa unidade — então vigia-se o texto.
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
