import { describe, expect, it, vi } from 'vitest';
import type pg from 'pg';
import { resolveFlowPinnedAgent } from './followup-flow-agent';
import type { PublishedAgentConfig } from './agent-config';
import type { LoadedRouter } from './router-config';

function fakeConfig(agentId: string): PublishedAgentConfig {
  return { agentId } as unknown as PublishedAgentConfig;
}
function pool(agentId: string | null | Error): pg.Pool {
  return {
    query: vi.fn(async () => {
      if (agentId instanceof Error) throw agentId;
      return { rows: agentId === null ? [] : [{ agent_id: agentId }] };
    }),
  } as unknown as pg.Pool;
}
const router: LoadedRouter = {
  id: 'router-1', name: 'R', classifierModel: 'm', classifierProvider: null, sticky: true, minConfidence: 0.6, fallbackAgentId: null,
  members: [
    { agentId: 'lina', intentName: 'comercial', intentDescription: '', examples: [] },
    { agentId: 'paulo', intentName: 'financeiro', intentDescription: '', examples: [] },
  ],
};
const log = { warn: vi.fn() };
const input = { tenantId: 'org', enrollmentId: 'enr', channelSessionId: 'sess' };

describe('resolveFlowPinnedAgent', () => {
  it('o agente fixado na matrícula fala, com o roteador e a intenção do membro (vira sticky)', async () => {
    const r = await resolveFlowPinnedAgent(pool('paulo'), input, {
      log,
      loadPublishedAgentConfigById: async (_db, _org, id) => fakeConfig(id),
      loadActiveRouter: async () => router,
    });
    expect(r?.config?.agentId).toBe('paulo');
    expect(r?.routerId).toBe('router-1');
    expect(r?.intentName).toBe('financeiro');
    expect(r?.outcome).toBe('sticky');
  });

  it('sem roteador na sessão: agente fixado, routerId null', async () => {
    const r = await resolveFlowPinnedAgent(pool('paulo'), input, {
      log,
      loadPublishedAgentConfigById: async (_db, _org, id) => fakeConfig(id),
      loadActiveRouter: async () => null,
    });
    expect(r?.config?.agentId).toBe('paulo');
    expect(r?.routerId).toBeNull();
    expect(r?.intentName).toBeNull();
  });

  it('matrícula sem agente ⇒ null (turno segue como antes)', async () => {
    const r = await resolveFlowPinnedAgent(pool(null), input, { log, loadActiveRouter: async () => null, loadPublishedAgentConfigById: async () => fakeConfig('x') });
    expect(r).toBeNull();
  });

  it('agente sem versão publicada ⇒ null com aviso', async () => {
    const warn = vi.fn();
    const r = await resolveFlowPinnedAgent(pool('paulo'), input, { log: { warn }, loadPublishedAgentConfigById: async () => null, loadActiveRouter: async () => router });
    expect(r).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('consulta que falha nunca derruba o turno ⇒ null com aviso', async () => {
    const warn = vi.fn();
    const r = await resolveFlowPinnedAgent(pool(new Error('db fora')), input, { log: { warn }, loadPublishedAgentConfigById: async () => fakeConfig('paulo'), loadActiveRouter: async () => router });
    expect(r).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
