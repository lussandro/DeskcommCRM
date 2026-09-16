/**
 * ORGANIZAÇÃO SUSPENSA NÃO RECEBE TRABALHO — e o trabalho não se perde.
 *
 * Quatro linhas da matriz de suspensão (§6a) morrem no MESMO ponto: agente
 * (`inbound_turn`), follow-up (`followup_turn`), automações e crons. Não
 * porque alguém as desligou uma a uma — a fila tem cinco produtores —, mas
 * porque o claim é o único caminho de SAÍDA.
 *
 * Invariante e não unidade porque o que pode quebrar é SQL: um predicado com
 * a polaridade trocada continua compilando, e o modo de falha é uma vinícola
 * suspensa cujo agente segue respondendo no WhatsApp.
 *
 * A segunda asserção é o outro lado, e é o que impede o conserto de virar
 * perda: o job da organização suspensa continua `pending` no banco. Quem o
 * descarta (e por quê) é o consumidor de `tenant.suspended`, com aviso.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

import { CLAIM_SQL, claimJobs, faltaParaOProximoJob } from "@/lib/agent-engine/queue/queue";

const container = process.env.TEST_DB_CONTAINER;
if (!container) {
  throw new Error("TEST_DB_CONTAINER not set — rode via `pnpm test:db` (scripts/test-db.sh)");
}

const ORG_ATIVA = "aaaaaaaa-5000-4000-8000-000000000001";
const ORG_SUSPENSA = "bbbbbbbb-5000-4000-8000-000000000002";
const CONTATO_ATIVO = "aaaaaaaa-5001-4000-8000-000000000001";
const CONTATO_SUSPENSO = "bbbbbbbb-5001-4000-8000-000000000002";

let pool: pg.Pool;

beforeAll(async () => {
  pool = new pg.Pool({
    host: "127.0.0.1",
    port: Number(process.env.TEST_DB_PORT ?? 54329),
    user: "postgres",
    // `password` NÃO é opcional: `scripts/test-db.sh` sobe o container com
    // `POSTGRES_PASSWORD=postgres` e SEM `POSTGRES_HOST_AUTH_METHOD=trust`, e
    // nada exporta `PGPASSWORD`. Os 78 pools de tests/invariants/ passam
    // `postgres:postgres` — omitir aqui é erro de conexão, não de lógica.
    password: "postgres",
    database: "postgres",
  });
  await pool.query(
    `insert into organizations (id, slug, legal_name, display_name, status)
     values ($1, 'susp-inv-ativa', 'Ativa', 'Ativa', 'active'),
            ($2, 'susp-inv-susp', 'Suspensa', 'Suspensa', 'suspended')
     on conflict (id) do nothing`,
    [ORG_ATIVA, ORG_SUSPENSA],
  );
  await pool.query(
    `insert into contacts (id, organization_id, name)
     values ($1, $3, 'Contato Ativo'), ($2, $4, 'Contato Suspenso')
     on conflict (id) do nothing`,
    [CONTATO_ATIVO, CONTATO_SUSPENSO, ORG_ATIVA, ORG_SUSPENSA],
  );
  await pool.query(
    `insert into job_queue (organization_id, contact_id, kind, payload)
     values ($1, $3, 'inbound_turn', '{}'::jsonb),
            ($2, $4, 'inbound_turn', '{}'::jsonb)`,
    [ORG_ATIVA, ORG_SUSPENSA, CONTATO_ATIVO, CONTATO_SUSPENSO],
  );
});

afterAll(async () => {
  await pool.query(`delete from job_queue where organization_id in ($1, $2)`, [
    ORG_ATIVA,
    ORG_SUSPENSA,
  ]);
  await pool.end();
});

describe("claim sob organização suspensa", () => {
  it("entrega o job da organização ativa e ignora o da suspensa", async () => {
    const jobs = await claimJobs(pool, { workerId: "invariante-suspensao", maxConcurrency: 10 });
    const orgs = jobs.map((j) => j.organization_id);
    expect(orgs).toContain(ORG_ATIVA);
    expect(orgs).not.toContain(ORG_SUSPENSA);
  });

  it("o job da suspensa continua pendente — não foi perdido nem consumido", async () => {
    const { rows } = await pool.query<{ status: string }>(
      `select status from job_queue where organization_id = $1`,
      [ORG_SUSPENSA],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("pending");
  });

  it("o relógio não acorda o worker por trabalho de organização suspensa", async () => {
    // Comportamento, não plano de execução: com APENAS job de org suspensa
    // pendente, a função tem de dizer "não há nada". Se o NOT EXISTS do
    // Step 3-A sumir, ela devolve um prazo e o laço volta ao ritmo curto.
    await pool.query(`delete from job_queue where organization_id = $1`, [ORG_ATIVA]);
    const falta = await faltaParaOProximoJob(pool);
    expect(falta).toBeNull();
  });

  // ⚠️ O QUE ESTE CASO PROVA, E O QUE NÃO PROVA. Ele mede que **histórico morto
  // não empurra o claim para varredura sequencial**: as 5.000 linhas de
  // enchimento são `status='done'`, que o índice parcial exclui por definição.
  // Ele NÃO prova nada sobre o `not exists` novo — fica verde com o predicado
  // da suspensão sabotado —, e NÃO mede o teto que o plano declarava, que era
  // backlog de dezenas de milhares de `pending`. Quem garante o comportamento
  // do gate são os casos 1 a 3; este é medidor de custo, e só.
  it("histórico morto não empurra o claim para varredura sequencial", async () => {
    await pool.query(
      `insert into job_queue (organization_id, contact_id, kind, payload, status, run_after)
       select $1, null, 'watchdog', '{}'::jsonb, 'done', now() from generate_series(1, 5000)`,
      [ORG_ATIVA],
    );
    await pool.query("analyze job_queue");
    await pool.query("analyze organizations");

    // `explain (analyze)` EXECUTA — e o CLAIM_SQL é um UPDATE. Precisa de
    // transação com rollback; e precisa ser no MESMO cliente, senão não há
    // transação nenhuma: `Pool.query` pega e devolve um cliente por chamada, e
    // `begin`/`explain`/`rollback` cairiam em conexões diferentes, deixando o
    // UPDATE em autocommit. Hoje ele casa 0 linhas, mas a garantia escrita tem
    // de ser verdadeira, não incidental.
    const client = await pool.connect();
    let plano: string;
    try {
      await client.query("begin");
      const { rows } = await client.query<{ "QUERY PLAN": string }>(
        `explain (analyze, buffers) ${CLAIM_SQL}`,
        [10, "invariante-explain"],
      );
      plano = rows.map((r) => r["QUERY PLAN"]).join("\n");
    } finally {
      await client.query("rollback");
      client.release();
    }

    expect(plano).toContain("idx_job_queue_claim");
    // Qualificado em `job_queue` de propósito, e o motivo é MEDIDO: o plano real
    // traz `Seq Scan on organizations o` como lado interno de um Nested Loop
    // Anti Join — com duas organizações, o planner escolhe isso e está certo.
    // O brief dizia "lookup por chave primária de organizations"; não é, e o
    // instrumento diz a verdade em vez de acomodá-la em silêncio.
    expect(plano).not.toContain("Seq Scan on job_queue");
  });
});
