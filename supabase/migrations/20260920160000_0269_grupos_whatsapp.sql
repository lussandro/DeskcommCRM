-- 0269 — Grupos de WhatsApp: administração e moderação (fatia 1).
--
-- Subsistema PARALELO: `conversations` não é tocada e `is_group` continua
-- morta de propósito (ver spec 2026-09-20-grupos-whatsapp-design.md §4.1).
-- Grupo fora do funil é ESTRUTURA aqui, não uma sequência de `if`.

create table if not exists public.whatsapp_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel_session_id uuid not null references public.channel_sessions(id) on delete cascade,
  wa_group_id text not null,
  subject text,
  description text,
  owner_lid text,
  owner_pn text,
  created_at_wa timestamptz,
  size int,
  announce boolean not null default false,
  restrict_info boolean not null default false,
  member_add_mode boolean not null default true,
  join_approval_mode boolean not null default false,
  somos_admin boolean not null default false,
  modo text not null default 'vigiado' check (modo in ('vigiado','semi','autonomo')),
  settings jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, channel_session_id, wa_group_id)
);

create table if not exists public.whatsapp_group_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  group_id uuid not null references public.whatsapp_groups(id) on delete cascade,
  wa_lid text not null,
  wa_pn text,
  push_name text,
  role text not null default 'participant'
    check (role in ('participant','admin','superadmin','left')),
  contact_id uuid references public.contacts(id) on delete set null,
  strikes int not null default 0,
  silenciado_ate timestamptz,
  entrou_em timestamptz,
  saiu_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, group_id, wa_lid)
);

create table if not exists public.whatsapp_group_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  group_id uuid not null references public.whatsapp_groups(id) on delete cascade,
  member_id uuid references public.whatsapp_group_members(id) on delete set null,
  acao text not null check (acao in ('remover','promover','rebaixar','silenciar','avisar','advertir')),
  decidido_por text not null check (decidido_por in ('ia','humano','regra')),
  aprovado_por_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'pendente'
    check (status in ('pendente','executando','concluida','falhou','revertida','cancelada')),
  waha_http_status int,
  waha_status_participante text,
  waha_resposta jsonb,
  pos_condicao_ok boolean,
  erro_texto text,
  executada_em timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_wa_groups_org on public.whatsapp_groups (organization_id, updated_at desc);
create index if not exists idx_wa_group_members_group on public.whatsapp_group_members (organization_id, group_id);
create index if not exists idx_wa_group_actions_group on public.whatsapp_group_actions (organization_id, group_id, created_at desc);
create index if not exists idx_wa_group_actions_pendentes on public.whatsapp_group_actions (organization_id, created_at)
  where status in ('pendente','executando');

alter table public.whatsapp_groups enable row level security;
alter table public.whatsapp_group_members enable row level security;
alter table public.whatsapp_group_actions enable row level security;

drop policy if exists tenant_isolation_whatsapp_groups_all on public.whatsapp_groups;
create policy tenant_isolation_whatsapp_groups_all on public.whatsapp_groups
  for all using (organization_id in (select public.fn_user_org_ids()))
  with check (organization_id in (select public.fn_user_org_ids()));

drop policy if exists tenant_isolation_whatsapp_group_members_all on public.whatsapp_group_members;
create policy tenant_isolation_whatsapp_group_members_all on public.whatsapp_group_members
  for all using (organization_id in (select public.fn_user_org_ids()))
  with check (organization_id in (select public.fn_user_org_ids()));

drop policy if exists tenant_isolation_whatsapp_group_actions_all on public.whatsapp_group_actions;
create policy tenant_isolation_whatsapp_group_actions_all on public.whatsapp_group_actions
  for all using (organization_id in (select public.fn_user_org_ids()))
  with check (organization_id in (select public.fn_user_org_ids()));
