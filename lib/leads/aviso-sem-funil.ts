/**
 * A MENSAGEM CHEGOU E NÃO VIROU CARD — E ISSO APARECE NA TELA.
 *
 * Com os funis amarrados a números (migration 0262), a conversa que chega por um
 * número sem funil não cria card. É o comportamento pedido — cliente de um negócio
 * não entra no funil do outro —, mas o efeito colateral é mudo: a conversa segue no
 * Inbox e o agente responde, enquanto funil, Radar de Risco, follow-up e métricas
 * simplesmente não existem para aquele contato. O único registro era um
 * `logger.info`, que numa VPS significa `docker logs` (invariantes 3 e 4 do Sistema
 * Vivo: log visível, nenhuma demanda sem próximo passo).
 *
 * UM aviso aberto por número, não um por mensagem: o que está errado é a
 * configuração daquele número, e N avisos idênticos enterrariam a Central no dia em
 * que ela mais precisa ser lida — mesmo raciocínio de `message_send_stuck`.
 */
import { createHash } from "node:crypto";
import type { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

type Admin = ReturnType<typeof createAdminClient>;

/** uuidv5-ish determinístico a partir do canal: a chave "já existe aviso para este número?". */
function refDoCanal(channelSessionId: string): string {
  const h = createHash("sha1").update(`lead_sem_funil:${channelSessionId}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export async function avisarFunilDeEntradaAusente(
  admin: Admin,
  input: {
    organizationId: string;
    conversationId: string;
    channelSessionId: string;
    motivo: "sem_funil_de_entrada" | "sem_etapa";
  },
): Promise<void> {
  try {
    const refId = refDoCanal(input.channelSessionId);
    const { data: jaAberto } = await admin
      .from("agent_inbox_items")
      .select("id")
      .eq("organization_id", input.organizationId)
      .eq("kind", "lead_sem_funil")
      .eq("ref_id", refId)
      .eq("status", "open")
      .limit(1)
      .maybeSingle();
    if (jaAberto) return;

    const { data: channelSession } = await admin
      .from("channel_sessions")
      .select("display_name, phone_number")
      .eq("organization_id", input.organizationId)
      .eq("id", input.channelSessionId)
      .maybeSingle();
    // Cadeia do CANAL, não do contato: `channel_sessions.display_name` é o apelido
    // que o dono deu ao número, e a cadeia dele é própria e legítima (ver o gate em
    // tests/unit/rotulo-do-contato.test.ts, que isenta sessão de canal).
    const numero = channelSession?.display_name || channelSession?.phone_number || "este número";

    const body =
      input.motivo === "sem_funil_de_entrada"
        ? `As conversas que chegam por ${numero} não estão virando card: nenhum funil está ligado a esse número, ` +
          `e os funis existentes pertencem a outros números. O atendimento continua normal no Inbox, mas sem card ` +
          `não há funil, acompanhamento nem métrica. Crie um funil para ${numero} — ou, na lista de funis, marque ` +
          `um funil como "Todos os números".`
        : `As conversas que chegam por ${numero} não estão virando card: o funil desse número não tem nenhuma etapa ` +
          `aberta onde o card possa nascer (todas arquivadas, ou só de ganho/perda). Abra uma etapa de entrada nesse funil.`;

    const { error } = await admin.from("agent_inbox_items").insert({
      organization_id: input.organizationId,
      kind: "lead_sem_funil",
      severity: "critical",
      title: `Conversas de ${numero} não estão virando card`,
      body,
      ref_kind: "conversation",
      ref_id: refId,
    });
    if (error) throw new Error(error.message);
  } catch (err) {
    // O aviso nunca derruba a ingestão — a mensagem do cliente já está gravada.
    logger.warn("pos-entrada: não consegui abrir o aviso de funil ausente", {
      organization_id: input.organizationId,
      conversation_id: input.conversationId,
      error: err instanceof Error ? err.message.slice(0, 160) : "erro desconhecido",
    });
  }
}
