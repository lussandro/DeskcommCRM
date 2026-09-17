/**
 * Cobranças no Asaas — as três capacidades do módulo (spec §6).
 * Toda query filtra ctx.organizationId; o Asaas não isola por contato, nós isolamos:
 * o handler confere que payment.customer é o customer do titular do contato do turno.
 * Recusa de negócio é RESPOSTA ({ refused }), nunca exceção (padrão do pacote reter).
 */
import { z } from "zod";
import type { McpToolDefinition } from "../types";
import { carregarIntegracaoAsaas } from "@/lib/asaas/config";
import { AsaasErro } from "@/lib/asaas/cliente";
import { titularDoContato, vincularContatoPorDocumento } from "@/lib/asaas/titular";
import { emitAgentActivityForContact } from "@/lib/leads/agent-activity";
import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import { fusoDaOrganizacao } from "@/lib/agent-engine/agent/fuso-da-org";
import { diaLocalISO } from "@/lib/agenda/fuso";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { STATUS_PAGO, type AsaasPayment } from "@/lib/asaas/tipos";

const SEM_MODULO = "A integração com o Asaas não está ativa nesta organização.";

function centavos(v: number): number {
  return Math.round(v * 100);
}
function diasVencidos(dueDate: string, hoje: string): number {
  return Math.max(0, Math.round((Date.parse(hoje) - Date.parse(dueDate)) / 86_400_000));
}
function projetar(p: AsaasPayment, hoje: string) {
  return {
    payment_id: p.id,
    status: p.status,
    billing_type: p.billingType,
    value_cents: centavos(p.value),
    due_date: p.dueDate,
    days_overdue: p.status === "OVERDUE" ? diasVencidos(p.dueDate, hoje) : 0,
    invoice_url: p.invoiceUrl ?? null,
  };
}
function erroParaOModelo(err: unknown): { error: string } {
  if (err instanceof AsaasErro) return { error: err.descricao };
  return { error: err instanceof Error ? err.message : String(err) };
}

async function hojeDaOrg(orgId: string): Promise<string> {
  const fuso = await fusoDaOrganizacao(getRequestPool(), orgId);
  return diaLocalISO(new Date(), fuso);
}

/** Ata da atividade na timeline do negócio — nunca derruba a tool se falhar. */
async function atividade(
  ctx: { organizationId: string },
  contactId: string,
  type: "charge_reissued",
  reason: string,
  payload: Record<string, unknown>,
  agentId: string | null,
) {
  try {
    await emitAgentActivityForContact({
      pool: getRequestPool(),
      organizationId: ctx.organizationId,
      contactId,
      type,
      sourceModule: "asaas",
      sourceId: String(payload.payment_id),
      evidence: { trace_ids: [String(payload.request_id)] },
      agentId,
      reason,
      payload,
    });
  } catch (err) {
    logger.warn("[asaas] atividade não gravada", { err: err instanceof Error ? err.message : String(err) });
  }
}

/** `Actor.agent_id` só existe na variante `ai_agent` (ver lib/api/handlers/types.ts). */
function agentIdDoAtor(ctx: { actor: { type: string; agent_id?: string } }): string | null {
  return ctx.actor.type === "ai_agent" ? (ctx.actor.agent_id ?? null) : null;
}

const listShape = {
  contact_id: z.string().uuid().describe("O cliente da conversa."),
};

const linkShape = {
  contact_id: z.string().uuid(),
  document: z.string().min(11).max(18).describe("O CPF que o cliente acabou de informar na conversa."),
};

export const crmLinkContactToBilling: McpToolDefinition<typeof linkShape> = {
  name: "crm_link_contact_to_billing",
  description:
    "Liga este cliente ao cadastro dele no Asaas usando o CPF que ele informou. Só funciona se o telefone do cadastro no Asaas for o deste atendimento. " +
    "Depois de ok, chame crm_list_contact_charges. Se voltar refused, não insista: diga que a equipe vai conferir o cadastro.",
  inputSchema: linkShape,
  category: "write",
  // Sem rota HTTP equivalente (não é atalho de trabalho de atendente): nenhuma
  // tela humana vincula pelo CPF conferindo telefone. `ai_operator`, como as
  // escritas de `retencao.ts` sem paridade — vive só no token efêmero do
  // agente, nunca em `user_organizations` (tests/unit/capacidade-alcancavel-pelo-agente.test.ts).
  requiresRole: "ai_operator",
  requiresScope: "mcp:write",
  handler: async (input, ctx) => {
    const integ = await carregarIntegracaoAsaas(ctx.supabase, ctx.organizationId);
    if (!integ) return { error: SEM_MODULO };
    try {
      const v = await vincularContatoPorDocumento(ctx.supabase, ctx.organizationId, input.contact_id, input.document, integ.cliente);
      if (!v.ok) {
        if (v.motivo === "telefone_nao_confere") return { refused: "documento_nao_confere", message: "O documento informado não confere com o telefone deste atendimento." };
        if (v.motivo === "contato_de_empresa") return { refused: "contato_de_empresa", message: "Este cliente é de uma empresa; o vínculo é feito pela equipe." };
        return { refused: "nao_encontrado", message: "Não encontrei cadastro no Asaas com esse documento." };
      }
      await audit({
        action: "asaas.contact_linked",
        organizationId: ctx.organizationId,
        resourceType: "contact",
        resourceId: input.contact_id,
        requestId: ctx.requestId,
        metadata: { customer_id: v.customerId, actor: "agent" },
      });
      return { ok: true };
    } catch (err) {
      return erroParaOModelo(err);
    }
  },
};

export const crmListContactCharges: McpToolDefinition<typeof listShape> = {
  name: "crm_list_contact_charges",
  description:
    "Lista as cobranças em aberto e vencidas deste cliente no Asaas (se ele pertence a uma empresa, as da empresa). " +
    "Se voltar needs_document, peça o CPF ou CNPJ ao cliente e chame de novo com document. " +
    "Se a lista vier vazia, NÃO fale de pendência: o cliente não deve nada agora.",
  inputSchema: listShape,
  category: "read",
  requiresRole: "agent",
  requiresScope: "mcp:read",
  handler: async (input, ctx) => {
    const integ = await carregarIntegracaoAsaas(ctx.supabase, ctx.organizationId);
    if (!integ) return { error: SEM_MODULO };
    const titular = await titularDoContato(ctx.supabase, ctx.organizationId, input.contact_id);
    if (titular.kind === "sem_vinculo") {
      if (titular.companyId) return { needs_link_by_operator: true, message: "A empresa deste cliente ainda não está vinculada ao Asaas. Diga que o cadastro financeiro será conferido pela equipe." };
      return { needs_document: true, message: "Peça o CPF ao cliente e chame crm_link_contact_to_billing." };
    }
    try {
      const hoje = await hojeDaOrg(ctx.organizationId);
      const [pend, venc] = await Promise.all([
        integ.cliente.payments(titular.customerId, "PENDING"),
        integ.cliente.payments(titular.customerId, "OVERDUE"),
      ]);
      const todas = [...venc.data, ...pend.data].sort((a, b) => b.dueDate.localeCompare(a.dueDate)).map((p) => projetar(p, hoje));
      return { holder: titular.kind, charges: todas, has_more: pend.hasMore || venc.hasMore };
    } catch (err) {
      return erroParaOModelo(err);
    }
  },
};

const infoShape = { contact_id: z.string().uuid(), payment_id: z.string().min(1) };

export const crmGetChargePaymentInfo: McpToolDefinition<typeof infoShape> = {
  name: "crm_get_charge_payment_info",
  description:
    "Devolve link, linha digitável e Pix copia-e-cola de UMA cobrança deste cliente, para você mandar na conversa. Só funciona para cobrança do próprio cliente.",
  inputSchema: infoShape,
  category: "read",
  requiresRole: "agent",
  requiresScope: "mcp:read",
  handler: async (input, ctx) => {
    const integ = await carregarIntegracaoAsaas(ctx.supabase, ctx.organizationId);
    if (!integ) return { error: SEM_MODULO };
    const titular = await titularDoContato(ctx.supabase, ctx.organizationId, input.contact_id);
    if (titular.kind === "sem_vinculo") return { needs_document: true };
    try {
      const p = await integ.cliente.payment(input.payment_id);
      if (p.customer !== titular.customerId) return { error: "Essa cobrança não é deste cliente." };
      const out: Record<string, unknown> = {
        payment_id: p.id,
        status: p.status,
        billing_type: p.billingType,
        invoice_url: p.invoiceUrl ?? null,
        bank_slip_url: p.bankSlipUrl ?? null,
      };
      if (p.billingType === "BOLETO") out.identification_field = (await integ.cliente.identificationField(p.id)).identificationField;
      // pixQrCode funciona para BOLETO e PIX (medição da spec de sandbox); pedimos sempre e
      // ignoramos falha — nem toda cobrança tem Pix (ex.: CREDIT_CARD).
      const pix = await integ.cliente.pixQrCode(p.id).catch(() => null);
      if (pix) {
        out.pix_copy_paste = pix.payload;
        out.pix_expires_at = pix.expirationDate ?? null;
      }
      return out;
    } catch (err) {
      return erroParaOModelo(err);
    }
  },
};

const reissueShape = { contact_id: z.string().uuid(), payment_id: z.string().min(1) };

export const crmReissueOverdueCharge: McpToolDefinition<typeof reissueShape> = {
  name: "crm_reissue_overdue_charge",
  description:
    "Prorroga o vencimento de um boleto VENCIDO deste cliente pelo prazo que o administrador definiu e devolve o boleto novo. " +
    "Se voltar refused, explique o motivo ao cliente; se for limite de vezes, ofereça falar com uma pessoa (crm_request_human_handoff).",
  inputSchema: reissueShape,
  category: "write",
  // Idem crm_link_contact_to_billing: sem rota HTTP equivalente, `ai_operator`.
  requiresRole: "ai_operator",
  requiresScope: "mcp:write",
  handler: async (input, ctx) => {
    const integ = await carregarIntegracaoAsaas(ctx.supabase, ctx.organizationId);
    if (!integ) return { error: SEM_MODULO };
    if (!integ.config.reemissao) return { refused: "sem_cerca", message: "A prorrogação não está liberada nesta organização." };
    const titular = await titularDoContato(ctx.supabase, ctx.organizationId, input.contact_id);
    if (titular.kind === "sem_vinculo") return { needs_document: true };
    try {
      const p = await integ.cliente.payment(input.payment_id);
      if (p.customer !== titular.customerId) return { error: "Essa cobrança não é deste cliente." };
      if (p.status !== "OVERDUE") {
        if (p.status === "PENDING") return { refused: "ainda_nao_venceu", status: p.status };
        // "Paga" é a tríade medida (STATUS_PAGO); qualquer outro status vira "status_<STATUS>"
        // (ex.: DELETED, REFUNDED) — nunca inventamos um rótulo de negócio que não medimos.
        if (STATUS_PAGO.has(p.status)) return { refused: "ja_paga", status: p.status };
        return { refused: `status_${p.status}`, status: p.status };
      }
      const maximo = integ.config.reemissao.max_por_cobranca;

      // Garante a linha ANTES de tentar o Asaas, sem tocar reissue_count se ela já
      // existir (ignoreDuplicates) — senão o upsert reiniciaria a contagem de quem
      // já tinha prorrogado.
      await ctx.supabase.from("asaas_charges").upsert(
        {
          organization_id: ctx.organizationId,
          payment_id: p.id,
          customer_id: p.customer,
          holder_kind: titular.kind,
          holder_id: titular.id,
          status: p.status,
          due_date: p.dueDate,
          value_cents: centavos(p.value),
        },
        { onConflict: "organization_id,payment_id", ignoreDuplicates: true },
      );

      // O TETO É ATÔMICO NO BANCO. Ler `reissue_count` e comparar em JS (como a
      // versão anterior fazia) tem uma janela: dois turnos concorrentes para o
      // MESMO payment_id podem ler o mesmo valor, os dois passarem no `<` e os
      // dois prorrogarem — o limite vira sugestão, não trava. `update ... where
      // reissue_count < $max` faz o Postgres decidir sob o lock da própria linha:
      // só uma das duas corridas incrementa; a outra recebe `rowCount === 0`.
      const pool = getRequestPool();
      const { rows: incrementadas, rowCount } = await pool.query<{ reissue_count: number }>(
        `update public.asaas_charges
            set reissue_count = reissue_count + 1, updated_at = now()
          where organization_id = $1 and payment_id = $2 and reissue_count < $3
          returning reissue_count`,
        [ctx.organizationId, p.id, maximo],
      );
      if (!rowCount) {
        const { data: estado } = await ctx.supabase
          .from("asaas_charges")
          .select("reissue_count")
          .eq("organization_id", ctx.organizationId)
          .eq("payment_id", p.id)
          .maybeSingle();
        return { refused: "limite", vezes: estado?.reissue_count ?? maximo, maximo };
      }
      const vezes = incrementadas[0]!.reissue_count;

      const hoje = await hojeDaOrg(ctx.organizationId);
      const nova = new Date(Date.parse(hoje) + integ.config.reemissao.dias * 86_400_000).toISOString().slice(0, 10);
      let atualizado: AsaasPayment;
      try {
        atualizado = await integ.cliente.alterarVencimento(p.id, nova);
      } catch (err) {
        // Compensação: a contagem já subiu, o Asaas recusou — devolve a vaga.
        // Best effort: se a compensação falhar, a contagem fica alta demais por
        // uma vez (falso negativo depois), nunca baixa demais (que deixaria
        // passar do limite) — o lado seguro do erro.
        try {
          await pool.query(
            `update public.asaas_charges
                set reissue_count = reissue_count - 1, updated_at = now()
              where organization_id = $1 and payment_id = $2 and reissue_count > 0`,
            [ctx.organizationId, p.id],
          );
        } catch (compErr) {
          logger.warn("[asaas] não consegui compensar reissue_count após falha no Asaas", {
            err: compErr instanceof Error ? compErr.message : String(compErr),
          });
        }
        throw err;
      }

      await ctx.supabase
        .from("asaas_charges")
        .update({ status: atualizado.status, due_date: nova, value_cents: centavos(p.value), last_event_at: new Date().toISOString() })
        .eq("organization_id", ctx.organizationId)
        .eq("payment_id", p.id);

      const agentId = agentIdDoAtor(ctx);
      await ctx.supabase.from("asaas_charge_actions").insert({
        organization_id: ctx.organizationId,
        payment_id: p.id,
        action: "reissue",
        actor_kind: "agent",
        actor_id: agentId,
        old_due_date: p.dueDate,
        new_due_date: nova,
      });
      // resource_id é uuid: o contato. O id do Asaas vai em metadata.
      await audit({
        action: "asaas.charge_reissued",
        organizationId: ctx.organizationId,
        resourceType: "contact",
        resourceId: input.contact_id,
        requestId: ctx.requestId,
        metadata: { payment_id: p.id, old_due_date: p.dueDate, new_due_date: nova, vezes },
      });
      await atividade(
        ctx,
        input.contact_id,
        "charge_reissued",
        `Boleto prorrogado de ${p.dueDate} para ${nova}`,
        { payment_id: p.id, request_id: ctx.requestId, new_due_date: nova },
        agentId,
      );
      const ident = atualizado.billingType === "BOLETO" ? (await integ.cliente.identificationField(p.id).catch(() => null))?.identificationField ?? null : null;
      return { new_due_date: nova, invoice_url: atualizado.invoiceUrl ?? null, bank_slip_url: atualizado.bankSlipUrl ?? null, identification_field: ident };
    } catch (err) {
      if (err instanceof AsaasErro && err.nossoErro) {
        await ctx.supabase.from("agent_inbox_items").insert({
          organization_id: ctx.organizationId,
          kind: "charge_reissue_failed",
          severity: "warn",
          title: "O Asaas recusou a prorrogação de um boleto",
          body: `Cobrança ${input.payment_id}: ${err.descricao}`,
          ref_kind: "contact",
          ref_id: input.contact_id,
        });
      }
      return erroParaOModelo(err);
    }
  },
};
