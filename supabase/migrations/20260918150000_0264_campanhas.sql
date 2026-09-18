-- 0264 — Campanha de prospecção ativa (spec 2026-09-18-campanha-de-prospeccao-design.md)
--
-- Duas tabelas e nada mais: a campanha (por NÚMERO, como funil na 0262 e cobrança na 26.9.21)
-- e o destinatário, que é onde mora o estado de cada envio.
--
-- Por que destinatário é linha, e não uma lista em jsonb: é ele que precisa de estado
-- individual (pendente/enviado/pulado + motivo), de unicidade (ninguém recebe duas vezes) e
-- de contagem para o relatório. Em jsonb, cada envio reescreveria o documento inteiro e duas
-- rodadas concorrentes do cron perderiam uma da outra.
--
-- `base_legal` não tem default de propósito: campanha sem base legal declarada não deve
-- existir, e um default plausível aqui seria exatamente o tipo de buraco que a Regra nº 1
-- proíbe — pareceria configurado e não estaria.

create table if not exists public.campaigns (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  channel_session_id uuid not null references public.channel_sessions(id) on delete restrict,
  status text not null default 'draft',
  template_body text not null,
  base_legal text not null,
  lia_ref text,
  created_by uuid references auth.users(id) on delete set null,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaigns_status_check check (status in ('draft','running','paused','done','cancelled')),
  constraint campaigns_base_legal_check check (base_legal in ('consent','legitimate_interest')),
  -- Interesse legítimo SEM a referência da LIA é o mesmo que nenhuma base legal: é a
  -- referência que permite responder "com base em quê você me mandou isto?".
  constraint campaigns_lia_exige_ref check (base_legal <> 'legitimate_interest' or coalesce(trim(lia_ref), '') <> '')
);

create index if not exists idx_campaigns_org_status on public.campaigns (organization_id, status);

create table if not exists public.campaign_recipients (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  status text not null default 'pending',
  skip_reason text,
  message_id uuid references public.messages(id) on delete set null,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_recipients_status_check check (status in ('pending','sent','failed','skipped')),
  constraint campaign_recipients_unicos unique (campaign_id, contact_id)
);

-- O claim do worker: o índice existe para o `order by created_at` dos pendentes de UMA
-- campanha ser um index scan, não um seq scan na tabela inteira a cada rodada de cron.
create index if not exists idx_campaign_recipients_fila
  on public.campaign_recipients (campaign_id, status, created_at);

-- RLS no padrão da 0261: SELECT aberto ao tenant, ESCRITA só a partir de `admin`.
-- Policy `ALL` só-tenancy em tabela nova é reprovada por
-- `tests/invariants/rbac-config-ia-canais.test.ts` — e com razão: disparar para
-- uma lista de gente é gesto de administrador, não de qualquer membro.
alter table public.campaigns enable row level security;
drop policy if exists tenant_isolation_campaigns_all on public.campaigns;
drop policy if exists campaigns_select on public.campaigns;
create policy campaigns_select on public.campaigns
  for select using (
    (organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin()
  );
drop policy if exists campaigns_write on public.campaigns;
create policy campaigns_write on public.campaigns
  using (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'admin'))
  )
  with check (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'admin'))
  );
revoke all on public.campaigns from anon, authenticated;
grant select on public.campaigns to authenticated;   -- a tela lê; só o servidor escreve
grant all on public.campaigns to service_role;

alter table public.campaign_recipients enable row level security;
drop policy if exists tenant_isolation_campaign_recipients_all on public.campaign_recipients;
drop policy if exists campaign_recipients_select on public.campaign_recipients;
create policy campaign_recipients_select on public.campaign_recipients
  for select using (
    (organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin()
  );
drop policy if exists campaign_recipients_write on public.campaign_recipients;
create policy campaign_recipients_write on public.campaign_recipients
  using (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'admin'))
  )
  with check (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'admin'))
  );
revoke all on public.campaign_recipients from anon, authenticated;
grant select on public.campaign_recipients to authenticated;   -- a tela lê; só o servidor escreve
grant all on public.campaign_recipients to service_role;
