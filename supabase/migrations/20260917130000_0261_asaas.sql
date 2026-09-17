-- Módulo Asaas (spec 2026-09-17-bacco-asaas-design). Opt-in por organização.
-- Nada aqui é obrigatório para quem não liga o módulo: colunas nullable, tabelas
-- vazias, CHECKs só ganham valores.

-- 1. providers novos. Os CHECKs são recriados inteiros (add constraint não é idempotente).
alter table public.tenant_integrations drop constraint if exists tenant_integrations_provider_check;
alter table public.tenant_integrations add constraint tenant_integrations_provider_check
  check (provider in ('nuvemshop','vtex','shopify','asaas'));

alter table public.webhook_events_log drop constraint if exists webhook_events_log_provider_check;
alter table public.webhook_events_log add constraint webhook_events_log_provider_check
  check (provider in ('waha','nuvemshop','generic','meta_cloud','zernio','asaas'));

-- 2. idempotência REAL do webhook Asaas. O índice idx_webhook_events_external_id não é
-- único; dois reenvios concorrentes passariam. Parcial por provider: não impõe nada aos outros.
create unique index if not exists uq_webhook_events_asaas_external
  on public.webhook_events_log (organization_id, external_id)
  where provider = 'asaas' and external_id is not null;

-- 3. pessoa física: o vínculo com o cliente do Asaas mora no contato. Empresa: em crm_companies (0260).
alter table public.contacts add column if not exists asaas_customer_id text;
create unique index if not exists uq_contacts_org_asaas_customer
  on public.contacts (organization_id, asaas_customer_id) where asaas_customer_id is not null;

-- 4. estado mínimo por cobrança. Não é espelho: toda decisão lê o Asaas ao vivo.
create table if not exists public.asaas_charges (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  payment_id text not null,
  customer_id text not null,
  holder_kind text check (holder_kind in ('company','contact')),
  holder_id uuid,
  status text not null,
  due_date date not null,
  value_cents integer not null,
  enrollment_id uuid references public.followup_enrollments(id) on delete set null,
  reissue_count integer not null default 0,
  last_event_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, payment_id)
);
create index if not exists idx_asaas_charges_org_status on public.asaas_charges (organization_id, status);
create index if not exists idx_asaas_charges_enrollment on public.asaas_charges (enrollment_id) where enrollment_id is not null;
alter table public.asaas_charges enable row level security;

-- RLS: SELECT aberto ao tenant, escrita a partir de `agent` (padrão da 0260 — o gate
-- rbac-config-ia-canais.test.ts proíbe policy ALL só-tenancy em tabela nova). Só o
-- servidor escreve de fato: o GRANT abaixo dá só SELECT a `authenticated`.
drop policy if exists tenant_isolation_asaas_charges_all on public.asaas_charges;
drop policy if exists asaas_charges_select on public.asaas_charges;
create policy asaas_charges_select on public.asaas_charges
  for select using (
    (organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin()
  );
drop policy if exists asaas_charges_write on public.asaas_charges;
create policy asaas_charges_write on public.asaas_charges
  using (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'agent'))
  )
  with check (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'agent'))
  );
revoke all on public.asaas_charges from anon, authenticated;
grant select on public.asaas_charges to authenticated;      -- a tela lê; só o servidor escreve
grant all on public.asaas_charges to service_role;
drop trigger if exists trg_asaas_charges_updated_at on public.asaas_charges;
create trigger trg_asaas_charges_updated_at before update on public.asaas_charges
  for each row execute function public.fn_set_updated_at();

create table if not exists public.asaas_charge_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  payment_id text not null,
  action text not null check (action in ('reissue')),
  actor_kind text not null check (actor_kind in ('agent','user','system')),
  actor_id uuid,
  old_due_date date not null,
  new_due_date date not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_asaas_charge_actions_org_payment
  on public.asaas_charge_actions (organization_id, payment_id);
alter table public.asaas_charge_actions enable row level security;
drop policy if exists tenant_isolation_asaas_charge_actions_all on public.asaas_charge_actions;
drop policy if exists asaas_charge_actions_select on public.asaas_charge_actions;
create policy asaas_charge_actions_select on public.asaas_charge_actions
  for select using (
    (organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin()
  );
drop policy if exists asaas_charge_actions_write on public.asaas_charge_actions;
create policy asaas_charge_actions_write on public.asaas_charge_actions
  using (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'agent'))
  )
  with check (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'agent'))
  );
revoke all on public.asaas_charge_actions from anon, authenticated;
grant select on public.asaas_charge_actions to authenticated;
grant all on public.asaas_charge_actions to service_role;

-- 5. avisos novos na Central. Lista COMPLETA (gate kind-check-migration-x-baseline exige
-- igualdade com o bloco único do baseline).
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
    -- Asaas (0261)
    'charge_unmatched','charge_overdue_no_flow','charge_reissue_failed','charge_webhook_paused',
    'other'
  ));
-- "existe aviso aberto para esta chave?" — o consumidor pergunta a cada evento. ref_id é uuid:
-- para customer do Asaas o consumidor grava uuidv5(customer_id); para o aviso diário, uuidv5(data).
create index if not exists agent_inbox_items_charge_aberto_idx
  on public.agent_inbox_items (organization_id, kind, ref_id)
  where kind like 'charge_%' and status = 'open';

notify pgrst, 'reload schema';
