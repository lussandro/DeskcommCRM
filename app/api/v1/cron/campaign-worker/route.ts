/**
 * GET /api/v1/cron/campaign-worker — uma rodada de campanha de prospecção.
 *
 * A lógica inteira mora em `lib/campanha/rodada.ts`; esta rota só autentica,
 * chama e audita **quando houve efeito**. Rodada que não enviou, não pulou e
 * não concluiu nada não é mutação e não ocupa linha de auditoria (mesmo
 * critério de `asaas-reconcile` e `attendant-heartbeat`, e o mesmo que
 * `tests/unit/cron-audita-so-quando-ha-efeito.test.ts` varre no AST).
 *
 * Uma mensagem por rodada, no máximo — o ritmo é o produto, e quem dispara em
 * rajada queima o número. Ver o cabeçalho de `lib/campanha/rodada.ts`.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { rodarUmaRodadaDeCampanha } from "@/lib/campanha/rodada";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  const authHeader = req.headers.get("authorization") ?? "";
  const provided = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
  const accepted = [env.INTERNAL_CRON_SECRET, env.INTERNAL_SECRET].filter(Boolean);
  if (accepted.length === 0 || !provided || !accepted.includes(provided)) {
    return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });
  }

  const r = await rodarUmaRodadaDeCampanha(createAdminClient());

  if (r.enviadas > 0 || r.pulados > 0 || r.concluidas > 0) {
    void audit({
      action: "cron.campaign_worker",
      requestId,
      bypassedRls: true,
      metadata: { enviadas: r.enviadas, pulados: r.pulados, concluidas: r.concluidas, detalhe: r.detalhe },
    });
  }

  return ok(r, { requestId });
}
