/**
 * Uma RODADA de campanha: no máximo um destinatário, e só se o ritmo permitir.
 *
 * ═══ Por que o motor de pacing do AGENTE, e não o da automação ═══
 *
 * `lib/automation/throttle.ts` espaça por um `Map` de módulo (não sobrevive a
 * restart nem a dois processos) e o cap diário dele lê `channel_session_warmup`,
 * tabela **sem escritor** — o ramo nunca dispara (medido; ver o cabeçalho de lá).
 * Campanha é exatamente o caso que estoura número: precisa do contador real
 * (`pacing_ledger`) e do lock por número que o `before-send.ts` já usa, para
 * campanha e agente não furarem o ritmo um do outro.
 *
 * ═══ Por que a rodada vazia não audita ═══
 *
 * Regra do `CLAUDE.md`: rodada de cron que não fez nada NÃO é mutação. Numa
 * instalação sem campanha rodando, auditar cada tique encheria o audit log —
 * foi o achado 17 do mapa de jornadas (95% do audit log de uma VPS era batida
 * de cron vazia).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import { decidePacing } from "@/lib/agent-engine/pacing/engine";
import { loadChannelKnobs, loadPacingState, recordSend } from "@/lib/agent-engine/pacing/store";
import { beginServiceAtOrigin } from "@/lib/atendimento/origem";
import { logger } from "@/lib/logger";

import { corpoParaODestinatario, motivoParaPular, TEXTO_DO_PULO, type DestinatarioDaCampanha } from "./decisao";

export interface ResultadoDaRodada {
  /** Quantas mensagens saíram de fato (0 ou 1 por rodada). */
  enviadas: number;
  /** Destinatários marcados como pulados nesta rodada. */
  pulados: number;
  /** Campanhas que terminaram nesta rodada. */
  concluidas: number;
  detalhe: string;
}

const VAZIA: ResultadoDaRodada = { enviadas: 0, pulados: 0, concluidas: 0, detalhe: "nada_a_fazer" };

interface CampanhaRow {
  id: string;
  organization_id: string;
  channel_session_id: string;
  template_body: string;
  name: string;
}

interface DestinatarioRow {
  id: string;
  contact_id: string;
  contacts: {
    id: string;
    name: string | null;
    display_name: string | null;
    phone_number: string | null;
    is_blocked: boolean;
    is_anonymized: boolean;
    consent: unknown;
  } | null;
}

function leuRecusaDeMarketing(consent: unknown): boolean {
  if (!consent || typeof consent !== "object") return false;
  const marketing = (consent as Record<string, unknown>).marketing;
  if (!marketing || typeof marketing !== "object") return false;
  return !!(marketing as Record<string, unknown>).declined_at;
}

/**
 * Executa UMA rodada para a campanha em execução mais antiga da instalação.
 *
 * Devolve sempre — nunca lança para o cron: uma campanha quebrada não pode
 * derrubar a rodada, que é compartilhada com os outros varredores.
 */
export async function rodarUmaRodadaDeCampanha(admin: SupabaseClient): Promise<ResultadoDaRodada> {
  // Organização SUSPENSA não prospecta. A matriz de suspensão (§6a) tinha esta
  // linha como "não existe superfície", e `tests/unit/suspensao-campanha-nao-
  // existe.test.ts` era o congelamento que obrigava a decidir quando existisse.
  // Existe agora, e a decisão é a mesma da fila do agente: `= 'suspended'` e não
  // `<> 'active'`, porque o CHECK aceita também 'redacted' e 'archived' e
  // desligá-los seria mudança que ninguém pediu.
  const { data: suspensas } = await admin.from("organizations").select("id").eq("status", "suspended");
  const idsSuspensas = (suspensas ?? []).map((o) => (o as { id: string }).id);

  let consulta = admin
    .from("campaigns")
    .select("id, organization_id, channel_session_id, template_body, name")
    .eq("status", "running")
    .order("started_at", { ascending: true })
    .limit(1);
  if (idsSuspensas.length > 0) {
    consulta = consulta.not("organization_id", "in", `(${idsSuspensas.join(",")})`);
  }
  const { data: campanhas } = await consulta;
  const campanha = (campanhas ?? [])[0] as CampanhaRow | undefined;
  if (!campanha) return VAZIA;

  // Fila desta campanha: o mais antigo primeiro, para a ordem da lista ser a
  // ordem do envio (previsível para quem acompanha a tela).
  const { data: fila } = await admin
    .from("campaign_recipients")
    .select("id, contact_id, contacts(id, name, display_name, phone_number, is_blocked, is_anonymized, consent)")
    .eq("campaign_id", campanha.id)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1);
  const alvo = (fila ?? [])[0] as DestinatarioRow | undefined;

  if (!alvo) {
    await admin
      .from("campaigns")
      .update({ status: "done", finished_at: new Date().toISOString() })
      .eq("id", campanha.id)
      .eq("status", "running");
    return { enviadas: 0, pulados: 0, concluidas: 1, detalhe: "campanha_concluida" };
  }

  const contato = alvo.contacts;
  const destinatario: DestinatarioDaCampanha = {
    contactId: alvo.contact_id,
    telefone: contato?.phone_number ?? null,
    bloqueado: !!contato?.is_blocked,
    anonimizado: !!contato?.is_anonymized,
    recusouMarketing: leuRecusaDeMarketing(contato?.consent),
  };

  // Os vetos por PESSOA vêm antes do ritmo: pular não gasta janela de envio, e
  // uma fila cheia de bloqueados não pode consumir o cap diário do número.
  const pulo = motivoParaPular(destinatario);
  if (pulo) {
    await admin
      .from("campaign_recipients")
      .update({ status: "skipped", skip_reason: TEXTO_DO_PULO[pulo] })
      .eq("id", alvo.id);
    return { enviadas: 0, pulados: 1, concluidas: 0, detalhe: `pulado:${pulo}` };
  }

  // ─── O ritmo ───
  const pool = getRequestPool();
  const { knobs, numberActivatedAt } = await loadChannelKnobs(pool, campanha.organization_id, campanha.channel_session_id);
  const { data: canal } = await admin
    .from("channel_sessions")
    .select("daily_message_limit")
    .eq("id", campanha.channel_session_id)
    .maybeSingle();
  const agora = new Date();
  const estado = await loadPacingState(pool, campanha.organization_id, campanha.channel_session_id, {
    now: agora,
    timezone: knobs.timezone,
    numberActivatedAt,
  });
  const decisao = decidePacing({
    now: agora,
    knobs,
    state: estado,
    crmDailyLimit: (canal as { daily_message_limit: number | null } | null)?.daily_message_limit ?? null,
  });
  if (!decisao.allow) {
    // Nada é marcado: o destinatário continua `pending` e a próxima rodada tenta
    // de novo. Não existe "falhou por ritmo" — ritmo é espera, não erro.
    return { enviadas: 0, pulados: 0, concluidas: 0, detalhe: `aguardando_ritmo:${decisao.code}` };
  }

  // O corpo é montado DEPOIS do ritmo, e não antes: a saudação ("bom dia" x
  // "boa tarde") tem de ser a do instante em que a mensagem sai, no fuso do
  // canal. Montar antes de saber se o envio é agora produziria "bom dia" numa
  // mensagem enviada à tarde — foi o defeito do primeiro piloto.
  const corpo = corpoParaODestinatario(
    campanha.template_body,
    { nome: contato?.name ?? contato?.display_name ?? null },
    { agora, fuso: knobs.timezone },
  );
  if (!corpo) {
    await admin
      .from("campaign_recipients")
      .update({ status: "skipped", skip_reason: "Sem nome no cadastro e a mensagem usa o nome" })
      .eq("id", alvo.id);
    return { enviadas: 0, pulados: 1, concluidas: 0, detalhe: "pulado:sem_nome" };
  }

  try {
    const boundary = await beginServiceAtOrigin(
      admin,
      campanha.organization_id,
      alvo.contact_id,
      campanha.channel_session_id,
    );
    const mensagem = await sendMessageHandler(
      admin,
      {
        organization_id: campanha.organization_id,
        serviceBoundary: boundary,
        proactiveContext: { organizationId: campanha.organization_id, contactId: alvo.contact_id },
        actor: { type: "webhook_source", id: `campaign:${campanha.id}` },
        requestId: `campaign:${campanha.id}:${alvo.id}`,
      } as Parameters<typeof sendMessageHandler>[1],
      { conversation_id: boundary.conversation_id, type: "text", body: corpo } as Parameters<
        typeof sendMessageHandler
      >[2],
    );
    await recordSend(pool, campanha.organization_id, campanha.channel_session_id, agora);
    const id = (mensagem as { id?: string }).id ?? null;
    const status = (mensagem as { status?: string }).status;
    await admin
      .from("campaign_recipients")
      .update({
        // O desfecho vem do ESTADO da mensagem, nunca da ausência de exceção —
        // `sendMessageHandler` marca `failed` e devolve normalmente.
        status: status === "failed" ? "failed" : "sent",
        message_id: id,
        sent_at: new Date().toISOString(),
      })
      .eq("id", alvo.id);
    return { enviadas: status === "failed" ? 0 : 1, pulados: 0, concluidas: 0, detalhe: `enviado:${status}` };
  } catch (err) {
    const motivo = err instanceof Error ? err.message : String(err);
    logger.warn("[campanha] envio falhou", { campanha: campanha.id, destinatario: alvo.id, motivo });
    await admin
      .from("campaign_recipients")
      .update({ status: "failed", skip_reason: motivo.slice(0, 300) })
      .eq("id", alvo.id);
    return { enviadas: 0, pulados: 0, concluidas: 0, detalhe: `falhou:${motivo.slice(0, 60)}` };
  }
}
