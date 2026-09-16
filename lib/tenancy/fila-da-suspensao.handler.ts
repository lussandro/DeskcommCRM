/**
 * O aviso da fila represada — nos DOIS eventos do ciclo.
 *
 * As duas rotas emitem seus eventos desde sempre
 * (`admin/tenants/[id]/suspend/route.ts:109` e `.../reactivate/route.ts:114`)
 * e até aqui ninguém escutava nenhum dos dois — o anti-pattern nº 3 da
 * doutrina, evento sem consumer, em dobro.
 *
 * O que ele faz em cada um é diferente, e essa assimetria é o conserto:
 *
 *  - `tenant.suspended`: limpa e avisa. Assíncrono serve, porque o status já
 *    está gravado e o claim já ignora a organização.
 *  - `tenant.reactivated`: só avisa, lendo `payload.jobs_descartados`. A
 *    limpeza já aconteceu DENTRO da rota, antes do `update` — se fosse aqui,
 *    chegaria até um minuto tarde (drain é cron `* * * * *`) e o backlog já
 *    teria saído no claim, que roda em laço contínuo.
 *
 * Por que descartar não é "perda": os dados ficam inteiros (conversas,
 * contatos, mensagens, fluxos). O que se descarta é trabalho DATADO, e é
 * anunciado — o aviso na Central diz quantos e por quê.
 *
 * `kind: 'job_dead'` porque o vocabulário de `agent_inbox_items` é CHECK
 * fechado e não tem valor de suspensão; e é o rótulo honesto: os jobs
 * morreram mesmo. O `title` é o que distingue do `job_dead` do reaper.
 */
import type { EventHandler, HandlerResult } from "@/lib/event-log/dispatcher";
import { createAdminClient } from "@/lib/supabase/admin";
import { limparFilaRepresada } from "@/lib/tenancy/limpar-fila-represada";

export const FILA_DA_SUSPENSAO_HANDLER_KEY = "fila-da-suspensao.v1";

export const filaDaSuspensaoHandler: EventHandler = {
  key: FILA_DA_SUSPENSAO_HANDLER_KEY,
  events: ["tenant.suspended", "tenant.reactivated"],
  async handle(row): Promise<HandlerResult> {
    try {
      const admin = createAdminClient();
      const orgId = row.organization_id;
      const naReativacao = row.event_type === "tenant.reactivated";

      const quantos = naReativacao
        ? Number((row.payload as { jobs_descartados?: number } | null)?.jobs_descartados ?? 0)
        : (await limparFilaRepresada(admin, orgId)).descartados;

      if (quantos === 0) {
        return {
          consumer_key: FILA_DA_SUSPENSAO_HANDLER_KEY,
          status: "skipped",
          detail: `descartados=0 (fila vazia em ${row.event_type})`,
        };
      }

      // UM aviso com a contagem, não um por job: 300 alertas idênticos é o
      // mesmo que nenhum — foi o que a VPS já pagou com o `job_dead` do reaper.
      const { error: erroAviso } = await admin.from("agent_inbox_items").insert({
        organization_id: orgId,
        kind: "job_dead",
        severity: "warn",
        title: naReativacao
          ? "Trabalho acumulado descartado antes de reativar"
          : "Trabalho pendente descartado pela suspensão",
        body: naReativacao
          ? `${quantos} job(s) que se acumularam enquanto a organização estava ` +
            `suspensa foram descartados agora, para que a reativação não ` +
            `dispare tudo de uma vez. Os dados não foram tocados; o atendimento ` +
            `recomeça do que chegar a partir de agora.`
          : `${quantos} job(s) pendentes foram descartados quando a organização ` +
            `foi suspensa. Os dados não foram tocados. Na reativação, nada será ` +
            `reenviado em massa — o atendimento recomeça do que chegar depois.`,
      });

      if (erroAviso) {
        return {
          consumer_key: FILA_DA_SUSPENSAO_HANDLER_KEY,
          status: "error",
          detail: `fila limpa (${quantos}) mas o aviso falhou: ${erroAviso.message}`,
        };
      }

      return {
        consumer_key: FILA_DA_SUSPENSAO_HANDLER_KEY,
        status: "ok",
        detail: `descartados=${quantos} (${row.event_type})`,
      };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return { consumer_key: FILA_DA_SUSPENSAO_HANDLER_KEY, status: "error", detail };
    }
  },
};
