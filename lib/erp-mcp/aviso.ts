/**
 * O QUE FALHA APARECE NA TELA (spec 2026-09-18-mcp-cliente-design, D8).
 *
 * Sem isto, o ERP fora do ar é mudo: o modelo recebe "não consegui falar com o
 * sistema de gestão", diz isso ao cliente, e ninguém que possa CONSERTAR fica
 * sabendo. É o modo de morte que o Sistema Vivo proíbe — o efeito existe e não
 * tem superfície.
 *
 * Três regras, e cada uma tem uma razão medida atrás:
 *
 *  1. **Três consecutivas, não uma.** Uma falha isolada é a rede piscando, e
 *     avisar nela treinaria a equipe a ignorar a Central. O contador vive em
 *     `store_metadata.falhas_consecutivas` da própria linha de integração —
 *     onde `lib/erp-mcp/config.ts` já o lê desde a Task 3.
 *  2. **O sucesso ZERA e FECHA.** Contador que só sobe transforma três falhas
 *     espalhadas por um mês em alarme; e aviso que não se retrata fica aceso
 *     afirmando uma parada que acabou (o defeito que `orcamento.ts` já pagou).
 *  3. **Só falha de COMUNICAÇÃO conta.** `rpc` e `tool_error` são o servidor
 *     respondendo — argumento errado da nossa parte, ou negócio que ele recusou.
 *     Contá-los abriria "o ERP está fora do ar" para um ERP são.
 *
 * **Precedência (D8):** capacidade ausente no agente NÃO é assunto deste
 * módulo — quem avisa é o `capabilities_missing` de `inbound-turn.ts`. Aqui só
 * entra falha de comunicação com o ERP.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";
import { carregarIntegracaoErpMcp } from "./config";
import { motivoDaFalha } from "./motivo";
import { chamarRpc } from "./transporte";
import type { FalhaExterna } from "./tipos";

/** Quantas consecutivas antes de ocupar uma linha da Central. */
export const FALHAS_ATE_AVISAR = 3;

const KIND = "mcp_externo_falhou";

/** O servidor RESPONDEU: não é o ERP fora do ar, e não conta para o aviso. */
export function ehFalhaDeComunicacao(falha: FalhaExterna): boolean {
  return falha.tipo !== "rpc" && falha.tipo !== "tool_error";
}

interface Metadata {
  url: string;
  catalogo: string[];
  falhas_consecutivas: number;
}

async function lerMetadata(
  admin: SupabaseClient,
  orgId: string,
  integracaoId: string,
): Promise<Metadata | null> {
  const { data } = await admin
    .from("tenant_integrations")
    .select("store_metadata")
    .eq("organization_id", orgId)
    .eq("id", integracaoId)
    .maybeSingle();
  const m = (data as { store_metadata?: unknown } | null)?.store_metadata as Partial<Metadata> | undefined;
  if (!m || typeof m.url !== "string") return null;
  return {
    url: m.url,
    catalogo: Array.isArray(m.catalogo) ? m.catalogo : [],
    falhas_consecutivas: typeof m.falhas_consecutivas === "number" ? m.falhas_consecutivas : 0,
  };
}

async function gravarContador(
  admin: SupabaseClient,
  orgId: string,
  integracaoId: string,
  metadata: Metadata,
  falhas: number,
): Promise<void> {
  await admin
    .from("tenant_integrations")
    .update({ store_metadata: { ...metadata, falhas_consecutivas: falhas } })
    .eq("organization_id", orgId)
    .eq("id", integracaoId);
}

/**
 * UM aviso aberto por integração (= por organização, que só tem uma linha
 * `provider='mcp'`). `ref_id` é o uuid da própria linha, o que faz "já existe
 * aviso para esta integração?" ser dedup real, sem inventar chave.
 *
 * `ref_kind` fica nulo de propósito: `tenant_integrations` não é uma das
 * entidades que `REFERENCIAS_DE_AVISO` sabe abrir. Quem dá destino a este kind é
 * o `geral` da política em `lib/ai/inbox-destino.ts`, que aponta para a tela da
 * integração.
 */
export async function abrirAvisoMcp(
  admin: SupabaseClient,
  orgId: string,
  integracaoId: string,
  introducao: string,
  motivo: string,
): Promise<boolean> {
  const { data: jaAberto } = await admin
    .from("agent_inbox_items")
    .select("id")
    .eq("organization_id", orgId)
    .eq("kind", KIND)
    .eq("ref_id", integracaoId)
    .eq("status", "open")
    .limit(1)
    .maybeSingle();
  if (jaAberto) return false;

  await admin.from("agent_inbox_items").insert({
    organization_id: orgId,
    kind: KIND,
    severity: "critical",
    title: "O assistente não está conseguindo consultar o sistema de gestão",
    body:
      `${introducao} Motivo: ${motivo} ` +
      "Enquanto isso, pergunta de cliente sobre fatura, contrato ou bloqueio vira atendimento humano. " +
      "Confira o endereço e a chave em Configurações → Sistema de gestão (MCP) e use Testar conexão.",
    ref_id: integracaoId,
  });
  return true;
}

/**
 * Uma consulta falhou: soma um, e no terceiro abre o aviso.
 *
 * Nunca lança e nunca atrapalha o turno: o cliente já recebeu (ou vai receber) a
 * resposta do agente, e um erro de bookkeeping não pode derrubar isso.
 */
export async function registrarFalha(
  admin: SupabaseClient,
  orgId: string,
  integracaoId: string,
  falha: FalhaExterna,
): Promise<void> {
  if (!ehFalhaDeComunicacao(falha)) return;
  try {
    const metadata = await lerMetadata(admin, orgId, integracaoId);
    if (!metadata) return;

    const falhas = metadata.falhas_consecutivas + 1;
    await gravarContador(admin, orgId, integracaoId, metadata, falhas);
    if (falhas < FALHAS_ATE_AVISAR) return;

    await abrirAvisoMcp(
      admin,
      orgId,
      integracaoId,
      `As últimas ${FALHAS_ATE_AVISAR} consultas ao sistema de gestão falharam.`,
      motivoDaFalha(falha),
    );
  } catch (err) {
    logger.warn("[erp-mcp] não consegui registrar a falha da integração", {
      org: orgId,
      error: err instanceof Error ? err.message.slice(0, 160) : "erro desconhecido",
    });
  }
}

export interface RevisaoMcp {
  /** Integrações `healthy` que o cron conferiu nesta rodada. */
  verificadas: number;
  /** Quantas caíram para `error` agora. É o número que decide se a rodada auditou. */
  erros: number;
}

/**
 * ANTI-MORTE (D9): uma vez por dia, cada integração saudável prova que ainda
 * fala com o ERP.
 *
 * Sem isto o D8 seria PASSIVO: a integração só seria testada quando um cliente
 * perguntasse, e quem descobriria a queda seria ele. Com isto, a chave revogada
 * na sexta aparece na Central no sábado de manhã — não na segunda, pela boca do
 * cliente.
 *
 * Roda pendurado no cron diário do Asaas (`asaas-reconcile`, 6h) em vez de um
 * cron irmão: um cron novo exigiria linha no `docker/scheduler/entrypoint.sh` e
 * no `vercel.ts`, e todo clone já instalado teria de ganhar o agendamento — a
 * doutrina de packaging cobra que a mudança chegue a quem já instalou, e
 * pendurar é o caminho que chega sozinho.
 */
export async function revisarSaudeDasIntegracoesMcp(admin: SupabaseClient): Promise<RevisaoMcp> {
  const revisao: RevisaoMcp = { verificadas: 0, erros: 0 };
  const { data, error } = await admin
    .from("tenant_integrations")
    .select("id, organization_id")
    .eq("provider", "mcp")
    .eq("status", "healthy");
  if (error || !data) return revisao;

  for (const linha of data as Array<{ id: string; organization_id: string }>) {
    const orgId = linha.organization_id;
    try {
      const integ = await carregarIntegracaoErpMcp(admin, orgId, { exigirHealthy: true });
      if (!integ) continue;

      const r = await chamarRpc({ url: integ.url, chave: integ.chave }, "tools/list", {});
      revisao.verificadas += 1;
      const agora = new Date().toISOString();

      if (r.ok) {
        await admin
          .from("tenant_integrations")
          .update({ last_health_check_at: agora })
          .eq("organization_id", orgId)
          .eq("id", integ.id);
        await registrarSucesso(admin, orgId, integ.id);
        continue;
      }

      const motivo = motivoDaFalha(r.falha);
      await admin
        .from("tenant_integrations")
        .update({ status: "error", status_reason: motivo, last_health_check_at: agora })
        .eq("organization_id", orgId)
        .eq("id", integ.id);
      // Aqui o aviso NÃO espera três: o status virou `error`, e com ele as cinco
      // ferramentas somem do agente. Tirar capacidade em silêncio é o defeito.
      await abrirAvisoMcp(admin, orgId, integ.id, "A conferência diária não conseguiu falar com o sistema de gestão.", motivo);
      revisao.erros += 1;
    } catch (err) {
      // Uma organização quebrada nunca aborta a passada das outras.
      logger.warn("[erp-mcp] conferência diária falhou nesta organização", {
        org: orgId,
        error: err instanceof Error ? err.message.slice(0, 160) : "erro desconhecido",
      });
    }
  }
  return revisao;
}

/** Uma consulta funcionou: zera o contador e retrata o aviso. */
export async function registrarSucesso(admin: SupabaseClient, orgId: string, integracaoId: string): Promise<void> {
  try {
    const metadata = await lerMetadata(admin, orgId, integracaoId);
    if (!metadata) return;
    if (metadata.falhas_consecutivas > 0) {
      await gravarContador(admin, orgId, integracaoId, metadata, 0);
    }
    await admin
      .from("agent_inbox_items")
      .update({ status: "resolved" })
      .eq("organization_id", orgId)
      .eq("kind", KIND)
      .eq("ref_id", integracaoId)
      .eq("status", "open");
  } catch (err) {
    logger.warn("[erp-mcp] não consegui zerar o contador da integração", {
      org: orgId,
      error: err instanceof Error ? err.message.slice(0, 160) : "erro desconhecido",
    });
  }
}
