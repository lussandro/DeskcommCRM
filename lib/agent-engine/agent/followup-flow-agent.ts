/**
 * Quem fala no turno de um fluxo de follow-up é o agente que ARMA o fluxo — o
 * `agent_id` fixado na matrícula (Task 8.6) —, não o agente "sticky" da
 * conversa.
 *
 * Medido em produção (2026-09-17): o fluxo de cobrança do Asaas, armado pelo
 * agente financeiro, foi executado pelo agente comercial porque a conversa era
 * sticky dele desde a véspera. O comercial não tem as ferramentas de cobrança e
 * disse "está tudo em dia" a um cliente com boleto vencido.
 *
 * Aditivo: matrícula sem agente, agente sem versão publicada, ou consulta que
 * falha ⇒ `null`, e o turno segue como antes (resolução por sticky/roteador).
 * Com roteador ativo na sessão, a resolução devolvida carrega `routerId` e a
 * intenção do membro, para que `runAgentTurn` grave a aderência da conversa a
 * este agente — a resposta do cliente ao aviso fica com quem o mandou.
 */
import type pg from 'pg';
import { loadPublishedAgentConfigById, type PublishedAgentConfig } from './agent-config';
import { loadActiveRouter, type LoadedRouter } from './router-config';
import type { TurnAgentResolution } from './resolve-turn-agent';

export interface FollowupFlowAgentDeps {
  loadPublishedAgentConfigById?: (db: pg.Pool, organizationId: string, agentId: string) => Promise<PublishedAgentConfig | null>;
  loadActiveRouter?: (db: pg.Pool, organizationId: string, channelSessionId: string) => Promise<LoadedRouter | null>;
  log: { warn: (msg: string, fields?: Record<string, unknown>) => void };
}

export async function resolveFlowPinnedAgent(
  db: pg.Pool,
  input: { tenantId: string; enrollmentId: string; channelSessionId: string },
  deps: FollowupFlowAgentDeps,
): Promise<TurnAgentResolution | null> {
  const _loadAgentById = deps.loadPublishedAgentConfigById ?? loadPublishedAgentConfigById;
  const _loadActiveRouter = deps.loadActiveRouter ?? loadActiveRouter;
  try {
    const { rows } = await db.query<{ agent_id: string | null }>(
      'select agent_id from followup_enrollments where organization_id = $1 and id = $2',
      [input.tenantId, input.enrollmentId],
    );
    const agentId = rows[0]?.agent_id ?? null;
    if (agentId === null) return null;
    const config = await _loadAgentById(db, input.tenantId, agentId);
    if (config === null) {
      deps.log.warn('followup-flow-agent: agente da matrícula sem versão publicada — turno segue pela resolução da conversa', {
        enrollment_id: input.enrollmentId,
        agent_id: agentId,
      });
      return null;
    }
    const router = await _loadActiveRouter(db, input.tenantId, input.channelSessionId);
    const member = router?.members.find((m) => m.agentId === agentId);
    return {
      config,
      routerId: router?.id ?? null,
      intentName: member?.intentName ?? null,
      confidence: null,
      outcome: 'sticky',
    };
  } catch (err) {
    deps.log.warn('followup-flow-agent: erro ao resolver o agente da matrícula — turno segue pela resolução da conversa', {
      enrollment_id: input.enrollmentId,
      error: (err instanceof Error ? err.message : String(err)).slice(0, 160),
    });
    return null;
  }
}
