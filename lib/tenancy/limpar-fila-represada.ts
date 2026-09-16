/**
 * Descarta o trabalho represado de uma organização suspensa.
 *
 * Um módulo, dois chamadores, porque o INSTANTE de limpar é diferente em cada
 * ponta e só um deles pode ser um consumidor de evento:
 *
 *  - na SUSPENSÃO, quem chama é o handler de `tenant.suspended`. Pode ser
 *    assíncrono: quando o evento é drenado, o status já é `suspended` e o
 *    claim já ignora a organização, então nada corre com worker em voo.
 *  - na REATIVAÇÃO, quem chama é a PRÓPRIA ROTA, antes do `update` do status.
 *    Aqui não dá para esperar o evento: o `update` comita e o claim volta a
 *    enxergar a organização na hora, enquanto o drain é cron de um minuto.
 *
 * `run_after` finito exclui os jobs em HOLD sem depender de o PostgREST
 * entender o literal `infinity`: o session-watchdog usa `run_after='infinity'`
 * para segurar o turno enquanto a sessão de WhatsApp está fora do ar, o claim
 * nunca os entrega (`run_after <= now()`), e matá-los apagaria o marcador que o
 * watchdog usa para reconciliar. Hold é estado de sessão, não trabalho datado.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** Qualquer data real é menor que esta; `infinity` não é. */
const LIMITE_FINITO = "9999-12-31T00:00:00.000Z";

export async function limparFilaRepresada(
  admin: SupabaseClient,
  organizationId: string,
): Promise<{ descartados: number }> {
  const { data, error } = await admin
    .from("job_queue")
    .update({ status: "dead", last_error: "organização suspensa" })
    .eq("organization_id", organizationId)
    .eq("status", "pending")
    .lt("run_after", LIMITE_FINITO)
    .select("id");

  if (error) throw new Error(`limparFilaRepresada: ${error.message}`);
  return { descartados: data?.length ?? 0 };
}
