-- 0263 — CONSULTA AO ERP EXTERNO POR MCP (bacco)
--
-- Spec: docs/superpowers/specs/2026-09-18-mcp-cliente-design.md
-- Medições do servidor real: .superpowers/sdd/2026-09-18-mcp-cliente/mcp-externo-medido.md
--
-- ═══ O que entra ═══
--
-- O CRM passa a CONSUMIR um servidor MCP externo (o ERP do cliente) por cinco
-- ferramentas locais de leitura. A integração é opt-in por organização e vive em
-- `tenant_integrations` com `provider = 'mcp'`: chave cifrada em
-- `oauth_access_token_encrypted`, URL e catálogo descoberto em `store_metadata`.
--
-- Três mudanças, todas ADITIVAS — nada existente passa a depender delas.
--
-- 1. `'mcp'` no vocabulário de `tenant_integrations_provider_check`.
-- 2. `'mcp_externo_falhou'` no vocabulário de `agent_inbox_items_kind_check`:
--    três chamadas consecutivas que falham abrem aviso na Central (um por
--    organização), que fecha no primeiro sucesso. Sem ele o ERP fora do ar só
--    apareceria no `docker logs` da VPS, e o operador descobriria pelo cliente
--    reclamando.
-- 3. `tenant_integrations.webhook_secret_encrypted` deixa de ser `NOT NULL`.
--
-- ═══ Por que o `drop not null` ═══
--
-- A coluna nasceu `NOT NULL` quando todo provider tinha webhook (Nuvemshop,
-- VTEX, Shopify). O Asaas já não tem — e, para satisfazer a coluna,
-- `app/actions/integrations/asaas.ts:99-114` FABRICA um segredo de webhook que
-- nunca assina nada. Segredo inventado é pior que coluna vazia: parece
-- credencial em uso, entra em backup e em auditoria, e o dia em que alguém for
-- verificar uma assinatura com ele o erro não vai apontar para aqui. Um provider
-- sem webhook não deve inventar segredo de webhook.
--
-- `drop not null` é aditivo: quem já grava o valor continua gravando, e nenhuma
-- linha existente é tocada.
--
-- As duas constraints são RECONSTRUÍDAS INTEIRAS, cada uma no seu bloco único
-- (regra #159: N blocos da mesma constraint quebram o `update.sh` de todo clone
-- que já tenha uma linha de vocabulário posterior).

-- ── 1. provider 'mcp' ───────────────────────────────────────────────────────
alter table public.tenant_integrations
  drop constraint if exists tenant_integrations_provider_check;
alter table public.tenant_integrations
  add constraint tenant_integrations_provider_check
  check (provider in ('nuvemshop','vtex','shopify','asaas','mcp'));

-- ── 2. o provider sem webhook não fabrica segredo de webhook ────────────────
alter table public.tenant_integrations
  alter column webhook_secret_encrypted drop not null;

comment on column public.tenant_integrations.webhook_secret_encrypted is
  'Segredo do webhook do provider, cifrado. NULLABLE desde a 0263: provider sem webhook (asaas, mcp) grava NULL em vez de fabricar um segredo que nunca assina nada.';

-- ── 3. o ERP fora do ar aparece na Central ──────────────────────────────────
alter table public.agent_inbox_items drop constraint if exists agent_inbox_items_kind_check;
alter table public.agent_inbox_items add constraint agent_inbox_items_kind_check
  check (kind in (
    'appointment_outcome_required','appointment_recovery_review','qr_rescan','routing_unassigned',
    'job_dead','event_dead','budget_exceeded','handoff','promotion_review','judge_unaligned',
    'followup_dead','snooze_expired','next_action_ambiguous','risk_backlog_seeded',
    'reactivation_expired','capabilities_missing','message_send_stuck','midia_nao_lida',
    'channel_template_review','channel_number_alert','promise_unfulfilled',
    'contact_proposal_expired','budget_warning','conhecimento_nao_indexado','voice_call_missed',
    'case_stale',
    'charge_unmatched','charge_overdue_no_flow','charge_reissue_failed','charge_webhook_paused',
    'lead_sem_funil',
    -- 0263: três chamadas consecutivas ao ERP externo falharam. Fecha no primeiro
    -- sucesso. Só para falha de COMUNICAÇÃO — capacidade ausente continua sendo
    -- `capabilities_missing`.
    'mcp_externo_falhou',
    'other'
  ));

notify pgrst, 'reload schema';
