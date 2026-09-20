/**
 * O PEDIDO DA LOJA VIRA TRABALHO NO CRM — a ponta que faltava.
 *
 * ═══ O que estava quebrado, medido ═══
 *
 * O webhook da Nuvemshop validava HMAC, gravava em `webhook_events_log` e
 * emitia em `event_log` desde a migration 0006. **Nenhum handler consumia.**
 * Varredura em 2026-09-19: zero ocorrência de `nuvemshop` em
 * `register-handlers.ts`, e a tabela `orders` com quatro LEITORES (resumo do
 * contato, MCP de comércio, export LGPD, painel de admin) e **zero
 * escritores**. Uma loja conectada recebia os eventos e nada acontecia.
 *
 * É o anti-pattern nº 3 do `CLAUDE.md`, literal: evento sem consumer.
 *
 * ═══ Nenhum nome de funil aqui ═══
 *
 * A Spec 06 §5.1 resolvia a etapa por NOME (`'pedidos'`, `'aguardando_pagamento'`).
 * Este módulo não faz isso: o destino sai de `funilDeEntrada()`, a mesma função
 * que o nascimento do lead por conversa já usa, e o avanço por pagamento usa a
 * etapa de GANHO do próprio funil (`is_won`), que toda organização declara.
 * Uma loja chama "Pago", outra "Aprovado" — e quem renomeia a etapa não pode
 * quebrar a integração.
 *
 * ═══ Idempotência ═══
 *
 * `orders` tem unique `(organization_id, external_provider, external_id)`: o
 * mesmo pedido reentregue faz upsert, não segunda linha. O vínculo
 * `crm_lead_links` é procurado antes de criar, e o lead só nasce uma vez por
 * pedido. A Nuvemshop reentrega em caso de timeout, então isto não é zelo: é o
 * caminho normal.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { EventRow } from "@/lib/event-log/dispatcher";
import { emitLeadActivity } from "@/lib/leads/activity-emitter";
import { funilDeEntrada } from "@/lib/leads/nascimento-do-lead";
import { logger } from "@/lib/logger";

import { decidir } from "./decisao";
import { lerCarrinho, lerPedido, type PedidoDaLoja } from "./pedido";
import {
  ALVO_DE_VINCULO_DO_PEDIDO,
  EVENTO_CARRINHO_ABANDONADO,
  ORIGEM_NUVEMSHOP,
  VINCULO_DE_PEDIDO,
  ehEventoDeComercio,
} from "./vocabulario";

export interface ResultadoDoConsumo {
  status: "ok" | "skipped" | "error";
  detail?: string;
}

/** O `data` do webhook da Nuvemshop vem dentro do payload do evento. */
function dadosDoEvento(row: EventRow): unknown {
  const p = row.payload as Record<string, unknown>;
  return p.data !== undefined ? p.data : p;
}

/**
 * Acha o contato pelo id que a loja usa. Só isso — NÃO cria contato aqui.
 *
 * Quem compra na loja não necessariamente falou no WhatsApp, e criar um contato
 * a cada pedido encheria a base de gente sem canal de conversa. O pedido é
 * gravado com `customer_external_id` de qualquer forma: quando essa pessoa
 * escrever, o vínculo se faz pelo telefone e o histórico já está lá.
 */
async function acharContato(
  db: SupabaseClient,
  organizationId: string,
  pedido: Pick<PedidoDaLoja, "clienteTelefone" | "clienteEmail">,
): Promise<string | null> {
  if (pedido.clienteTelefone) {
    const tel = pedido.clienteTelefone.replace(/\D/g, "");
    if (tel !== "") {
      const { data } = await db
        .from("contacts")
        .select("id")
        .eq("organization_id", organizationId)
        .is("is_merged_into", null)
        .ilike("phone_number", `%${tel.slice(-8)}`)
        .limit(1)
        .maybeSingle();
      if (data?.id) return data.id as string;
    }
  }
  if (pedido.clienteEmail) {
    const { data } = await db
      .from("contacts")
      .select("id")
      .eq("organization_id", organizationId)
      .is("is_merged_into", null)
      .eq("email_normalized", pedido.clienteEmail.trim().toLowerCase())
      .limit(1)
      .maybeSingle();
    if (data?.id) return data.id as string;
  }
  return null;
}

/** A etapa de GANHO do funil — onde um pedido pago deve parar. */
async function etapaDeGanho(
  db: SupabaseClient,
  organizationId: string,
  pipelineId: string,
): Promise<string | null> {
  const { data } = await db
    .from("crm_stages")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("pipeline_id", pipelineId)
    .eq("is_archived", false)
    .eq("is_won", true)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data?.id as string) ?? null;
}

async function etapaDePerda(
  db: SupabaseClient,
  organizationId: string,
  pipelineId: string,
): Promise<string | null> {
  const { data } = await db
    .from("crm_stages")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("pipeline_id", pipelineId)
    .eq("is_archived", false)
    .eq("is_lost", true)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data?.id as string) ?? null;
}

/**
 * O CARRINHO VIRA OPORTUNIDADE — sem linha em `orders`.
 *
 * Carrinho não é pedido: não tem total fechado nem `ordered_at` de compra, e
 * `orders_status_check` não prevê 'abandoned'. Forçá-lo naquela tabela faria
 * "quanto a loja vendeu" somar carrinho que ninguém pagou.
 *
 * O card nasce porque ele É a demanda: alguém quase comprou e parou. Sem ele,
 * esse quase-cliente não aparece em nenhuma tela que alguém olhe — o invariante
 * 4 do sistema vivo (nenhuma demanda sem próximo passo).
 */
async function processarCarrinho(
  db: SupabaseClient,
  organizationId: string,
  dados: unknown,
): Promise<ResultadoDoConsumo> {
  const leitura = lerCarrinho(dados);
  if (!leitura.ok) return { status: "skipped", detail: leitura.motivo };
  const carrinho = leitura.carrinho;

  const contactId = await acharContato(db, organizationId, {
    clienteTelefone: carrinho.clienteTelefone,
    clienteEmail: carrinho.clienteEmail,
  });

  // Um card por carrinho. `crm_leads.external_id` é o que impede o segundo:
  // a loja reentrega o abandono, e duas entregas não podem virar dois cards.
  const externoDoCarrinho = `cart:${carrinho.externalId}`;
  const { data: existente } = await db
    .from("crm_leads")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("source", ORIGEM_NUVEMSHOP)
    .eq("external_id", externoDoCarrinho)
    .limit(1)
    .maybeSingle();

  if (existente?.id) {
    return { status: "skipped", detail: "carrinho_ja_tem_card" };
  }

  const destino = await funilDeEntrada(db, organizationId);
  if ("erro" in destino) return { status: "skipped", detail: destino.erro };

  const { data: lead, error: erroLead } = await db
    .from("crm_leads")
    .insert({
      organization_id: organizationId,
      pipeline_id: destino.pipelineId,
      stage_id: destino.stageId,
      contact_id: contactId,
      title: `Carrinho abandonado #${carrinho.externalId}`,
      status: "open",
      // Sem total, o card não afirma valor nenhum — melhor vazio que inventado.
      value_cents: carrinho.totalCents,
      currency: carrinho.currency,
      source: ORIGEM_NUVEMSHOP,
      source_metadata: {
        external_id: carrinho.externalId,
        provider: ORIGEM_NUVEMSHOP,
        kind: "cart",
        recovery_url: carrinho.urlDeRetomada,
      },
      external_id: externoDoCarrinho,
    })
    .select("id")
    .single();

  if (erroLead || !lead) {
    return { status: "error", detail: `crm_leads: ${erroLead?.message ?? "sem retorno"}` };
  }

  await emitLeadActivity(db, {
    organizationId,
    leadId: lead.id as string,
    contactId,
    type: "order_abandoned",
    sourceModule: ORIGEM_NUVEMSHOP,
    sourceId: carrinho.externalId,
    actor: { type: "webhook_source", id: ORIGEM_NUVEMSHOP },
    reason: "Carrinho deixado para trás na loja",
    payload: {
      cart_external_id: carrinho.externalId,
      total_cents: carrinho.totalCents,
      currency: carrinho.currency,
    },
  });

  return { status: "ok", detail: `carrinho ${carrinho.externalId}` };
}

export async function processarEvento(
  db: SupabaseClient,
  row: EventRow,
): Promise<ResultadoDoConsumo> {
  if (!ehEventoDeComercio(row.event_type)) {
    return { status: "skipped", detail: "evento_fora_do_vocabulario" };
  }
  const organizationId = row.organization_id;

  // Carrinho abandonado não é pedido: sem total fechado e sem `ordered_at` de
  // compra, ele não cabe em `orders` (CHECK de status não o prevê). Ele existe
  // para virar oportunidade de recuperação — e isso é o lead, não a linha de
  // pedido.
  if (row.event_type === EVENTO_CARRINHO_ABANDONADO) {
    return processarCarrinho(db, organizationId, dadosDoEvento(row));
  }

  const leitura = lerPedido(dadosDoEvento(row));
  if (!leitura.ok) {
    // RECUSA, não conserto: pedido sem total ou sem id não vira card com valor
    // inventado. O motivo vai no detail e fica em `event_log.consumed_by`.
    return { status: "error", detail: leitura.motivo };
  }
  const pedido = leitura.pedido;

  const contactId = await acharContato(db, organizationId, pedido);
  const decisao = decidir(row.event_type);
  if (!decisao) return { status: "error", detail: "evento_sem_status_mapeado" };
  const statusDoPedido = decisao.statusDoPedido;

  // 1 · o PEDIDO. Upsert pela unique natural — reentrega não duplica.
  const { data: ordem, error: erroOrdem } = await db
    .from("orders")
    .upsert(
      {
        organization_id: organizationId,
        external_id: pedido.externalId,
        external_provider: ORIGEM_NUVEMSHOP,
        customer_external_id: pedido.customerExternalId,
        contact_id: contactId,
        status: statusDoPedido,
        total_cents: pedido.totalCents,
        currency: pedido.currency,
        payment_method: pedido.paymentMethod,
        payload: (dadosDoEvento(row) ?? {}) as Record<string, unknown>,
        ordered_at: pedido.orderedAt,
        updated_at_remote: pedido.updatedAtRemote,
      },
      { onConflict: "organization_id,external_provider,external_id" },
    )
    .select("id")
    .single();

  if (erroOrdem || !ordem) {
    return { status: "error", detail: `orders: ${erroOrdem?.message ?? "sem retorno"}` };
  }
  const orderId = ordem.id as string;

  // 2 · o CARD. Um por pedido — o vínculo é a prova de que já nasceu.
  const { data: vinculo } = await db
    .from("crm_lead_links")
    .select("lead_id")
    .eq("organization_id", organizationId)
    .eq("target_kind", ALVO_DE_VINCULO_DO_PEDIDO)
    .eq("target_id", orderId)
    .limit(1)
    .maybeSingle();

  let leadId = (vinculo?.lead_id as string) ?? null;

  if (!leadId) {
    const destino = await funilDeEntrada(db, organizationId);
    if ("erro" in destino) {
      // ⚠️ `sem_funil_de_entrada` NÃO distingue "a organização não configurou
      // funil" de "a consulta ao banco falhou" — `funilDeEntrada` descarta o
      // `error` do Supabase e devolve o mesmo motivo nos dois casos (medido em
      // 2026-09-20, provando o consumidor contra Postgres real: uma falha de
      // permissão apareceu como "sem funil"). Por isso `skipped` e não `error`:
      // o evento fica em `event_log` e a reentrega da loja tenta de novo, em
      // vez de marcar como consumido algo que talvez fosse transitório.
      return { status: "skipped", detail: destino.erro };
    }

    const { data: lead, error: erroLead } = await db
      .from("crm_leads")
      .insert({
        organization_id: organizationId,
        pipeline_id: destino.pipelineId,
        stage_id: destino.stageId,
        contact_id: contactId,
        title: `Pedido #${pedido.externalId}`,
        status: "open",
        value_cents: pedido.totalCents,
        currency: pedido.currency,
        source: ORIGEM_NUVEMSHOP,
        source_metadata: { external_id: pedido.externalId, provider: ORIGEM_NUVEMSHOP },
        external_id: pedido.externalId,
      })
      .select("id")
      .single();

    if (erroLead || !lead) {
      return { status: "error", detail: `crm_leads: ${erroLead?.message ?? "sem retorno"}` };
    }
    leadId = lead.id as string;

    await db.from("crm_lead_links").insert({
      organization_id: organizationId,
      lead_id: leadId,
      target_kind: ALVO_DE_VINCULO_DO_PEDIDO,
      target_id: orderId,
      link_kind: VINCULO_DE_PEDIDO,
    });
  }

  // 3 · o AVANÇO. Pago vai para a etapa de ganho, cancelado para a de perda —
  // as duas declaradas pelo próprio funil, nunca por nome.
  if (decisao.fechamento) {
    const { data: leadAtual } = await db
      .from("crm_leads")
      .select("pipeline_id, status")
      .eq("organization_id", organizationId)
      .eq("id", leadId)
      .maybeSingle();

    const pipelineId = leadAtual?.pipeline_id as string | undefined;
    if (pipelineId && leadAtual?.status === "open") {
      const fech = decisao.fechamento;
      const etapa =
        fech.etapa === "ganho"
          ? await etapaDeGanho(db, organizationId, pipelineId)
          : await etapaDePerda(db, organizationId, pipelineId);

      if (etapa) {
        await db
          .from("crm_leads")
          .update({
            stage_id: etapa,
            status: fech.status,
            // O CHECK `crm_leads_closed_at_consistency` exige a data no fechado,
            // e `crm_leads_lost_reason_required` exige o motivo na perda.
            closed_at: new Date().toISOString(),
            ...(fech.lostReason ? { lost_reason: fech.lostReason } : {}),
          })
          .eq("organization_id", organizationId)
          .eq("id", leadId);
      } else {
        // Funil sem etapa de ganho/perda declarada não é erro do pedido: o card
        // fica onde está e alguém vê a atividade na timeline.
        logger.warn("nuvemshop: funil sem etapa de fechamento", { organizationId, pipelineId });
      }
    }
  }

  // 4 · a TIMELINE. Sem ela, o card muda de etapa e parece que alguém arrastou.
  await emitLeadActivity(db, {
    organizationId,
    leadId,
    contactId,
    type: decisao.atividade,
    sourceModule: ORIGEM_NUVEMSHOP,
    sourceId: orderId,
    // `webhook_source`: o produto agiu a mando da loja, não uma pessoa nem um
    // agente. `actorParaAtividade` o mapeia para `system` na timeline.
    actor: { type: "webhook_source", id: ORIGEM_NUVEMSHOP },
    reason: `Pedido #${pedido.externalId} na loja`,
    payload: {
      order_external_id: pedido.externalId,
      total_cents: pedido.totalCents,
      currency: pedido.currency,
    },
  });

  return { status: "ok", detail: `pedido ${pedido.externalId}` };
}
