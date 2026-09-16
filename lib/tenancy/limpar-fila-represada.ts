/**
 * Descarta o trabalho represado de uma organização suspensa.
 *
 * Um módulo, dois chamadores — e os dois são ROTAS, chamando direto:
 *
 *  - na SUSPENSÃO, a rota chama DEPOIS do `update`: com a organização já
 *    suspensa o claim a ignora, então a limpeza não corre com worker em voo.
 *  - na REATIVAÇÃO, a rota chama ANTES do `update`: ele comita e o claim volta
 *    a enxergar a organização na hora — limpar depois seria tarde.
 *
 * Por que nenhum dos dois é consumidor de `event_log`, embora os dois eventos
 * continuem sendo emitidos: `fn_event_log_e_registro` (baseline) declara
 * `tenant.suspended` e `tenant.reactivated` como REGISTRO, e o trigger
 * `trg_event_log_marca_registro` faz a linha nascer `done`. O drain só enxerga
 * `pending` — um handler registrado nesses tipos nunca rodaria. Tirá-los da
 * lista seria mudança de schema; ligar as chamadas direto é melhor de qualquer
 * forma: o mecanismo vira síncrono, o erro aparece para quem clicou em vez de
 * sumir num consumidor mudo, e some um caminho assíncrono inteiro. Os eventos
 * seguem no `event_log` como histórico, que é exatamente o que "registro" quer
 * dizer.
 *
 * `run_after` finito exclui os jobs em HOLD sem depender de o PostgREST
 * entender o literal `infinity`: o session-watchdog usa `run_after='infinity'`
 * para segurar o turno enquanto a sessão de WhatsApp está fora do ar, o claim
 * nunca os entrega (`run_after <= now()`), e matá-los apagaria o marcador que o
 * watchdog usa para reconciliar. Hold é estado de sessão, não trabalho datado.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";

/** Qualquer data real é menor que esta; `infinity` não é. */
const LIMITE_FINITO = "9999-12-31T00:00:00.000Z";

export async function limparFilaRepresada(
  admin: SupabaseClient,
  organizationId: string,
): Promise<{ descartados: number }> {
  // `count` no próprio UPDATE, e NÃO `.select("id")`: o número chega pelo
  // header `Content-Range` e nenhuma linha viaja — trazer todos os ids só para
  // medir `.length` é payload puro. A opção mora no `update()` porque o
  // `select()` de pós-escrita do postgrest-js não aceita opções (só colunas);
  // `.select("id", { count: "exact", head: true })` ali seria ignorado.
  const { count, error } = await admin
    .from("job_queue")
    .update({ status: "dead", last_error: "organização suspensa" }, { count: "exact" })
    .eq("organization_id", organizationId)
    .eq("status", "pending")
    .lt("run_after", LIMITE_FINITO);

  if (error) throw new Error(`limparFilaRepresada: ${error.message}`);
  return { descartados: count ?? 0 };
}

/**
 * O aviso do descarte, na Central.
 *
 * NUNCA lança: quando ele roda, os jobs JÁ estão mortos — e, na suspensão, o
 * status JÁ está gravado. Derrubar a rota aqui transformaria "avisei mal" em "a
 * operação falhou", e o operador tentaria de novo uma coisa que já aconteceu (e
 * levaria 409). A falha vai para o log com o texto real, que é o que permite
 * descobrir por que o aviso não apareceu.
 *
 * O `try/catch` não é decorativo: `{ error }` cobre a recusa do PostgREST, e o
 * `catch` cobre o que o supabase-js LANÇA (queda de rede, DNS, fetch abortado) —
 * o caminho que faria a promessa acima ser só prosa. Medido por
 * `limpar-fila-represada.test.ts` nos dois sentidos, e pela rota em
 * `rotas-da-suspensao.test.ts`.
 *
 * `kind: 'job_dead'` porque o vocabulário de `agent_inbox_items` é CHECK fechado
 * e não tem valor de suspensão — e é o rótulo honesto: os jobs morreram mesmo.
 * O `title` é o que distingue do `job_dead` do reaper.
 */
export async function avisarDescarteDaFila(
  admin: SupabaseClient,
  organizationId: string,
  descartados: number,
  momento: "suspensao" | "reativacao",
): Promise<void> {
  // Fila vazia é silêncio, não um aviso de zero.
  if (descartados <= 0) return;

  const naReativacao = momento === "reativacao";

  // UM aviso com a contagem, não um por job: 300 alertas idênticos é o mesmo
  // que nenhum — foi o que a VPS já pagou com o `job_dead` do reaper.
  let falha: string | null = null;
  try {
    const { error } = await admin.from("agent_inbox_items").insert({
      organization_id: organizationId,
      kind: "job_dead",
      severity: "warn",
      title: naReativacao
        ? "Trabalho acumulado descartado antes de reativar"
        : "Trabalho pendente descartado pela suspensão",
      body: naReativacao
        ? `${descartados} job(s) que se acumularam enquanto a organização estava ` +
          `suspensa foram descartados agora, para que a reativação não dispare ` +
          `tudo de uma vez. Os dados não foram tocados; o atendimento recomeça do ` +
          `que chegar a partir de agora.`
        : `${descartados} job(s) pendentes foram descartados quando a organização ` +
          `foi suspensa. Os dados não foram tocados. Na reativação, nada será ` +
          `reenviado em massa — o atendimento recomeça do que chegar depois.`,
    });
    if (error) falha = error.message;
  } catch (err) {
    falha = err instanceof Error ? err.message : String(err);
  }

  if (falha) {
    logger.error(
      "aviso de descarte da fila não registrado — o operador não saberá quantos jobs morreram",
      { organization_id: organizationId, descartados, momento, error: falha },
    );
  }
}
