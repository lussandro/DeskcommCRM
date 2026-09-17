-- Empresas: o cliente pessoa jurídica com vários contatos (spec 2026-09-17-bacco-asaas-design §5.2a).
--
-- POR QUE: uma empresa tem mais de um telefone que fala com o financeiro. Sem a
-- entidade, o segundo telefone é um contato solto e a cobrança (módulo Asaas,
-- migration 0261) não sabe a quem pertence. `billing_contact_id` é o número
-- principal que recebe aviso de cobrança — decisão do dono; os demais contatos
-- só consultam quando eles mesmos escrevem.
--
-- ADITIVA: nada aqui é obrigatório. `contacts.company_id` é nullable, sem default
-- e sem trigger; quem não cadastra empresa não vê diferença. O único ponto
-- existente tocado é a anonimização LGPD, que passa a zerar o vínculo.

create table if not exists public.crm_companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  trade_name text,
  cnpj text,
  asaas_customer_id text,
  billing_contact_id uuid,
  notes text,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_companies_nome_nao_vazio check (length(btrim(name)) > 0),
  constraint crm_companies_cnpj_digitos check (cnpj is null or cnpj ~ '^[0-9]{14}$')
);

create unique index if not exists uq_crm_companies_org_cnpj
  on public.crm_companies (organization_id, cnpj) where cnpj is not null;
create unique index if not exists uq_crm_companies_org_asaas_customer
  on public.crm_companies (organization_id, asaas_customer_id) where asaas_customer_id is not null;
create index if not exists idx_crm_companies_org_name
  on public.crm_companies (organization_id, lower(name));

alter table public.crm_companies enable row level security;

drop policy if exists tenant_isolation_crm_companies_all on public.crm_companies;
create policy tenant_isolation_crm_companies_all on public.crm_companies
  using (organization_id in (select public.fn_user_org_ids()))
  with check (organization_id in (select public.fn_user_org_ids()));

revoke all on public.crm_companies from anon;
grant select, insert, update, delete on public.crm_companies to authenticated;
grant all on public.crm_companies to service_role;

drop trigger if exists trg_crm_companies_updated_at on public.crm_companies;
create trigger trg_crm_companies_updated_at
  before update on public.crm_companies
  for each row execute function public.fn_set_updated_at();

comment on table public.crm_companies is
  'Empresa cliente (pessoa jurídica) com N contatos. billing_contact_id = o contato que recebe aviso de cobrança (módulo Asaas). Aditiva: nada depende dela.';

-- O contato aponta a empresa. Nullable, sem default, sem trigger.
alter table public.contacts add column if not exists company_id uuid;
create index if not exists idx_contacts_org_company
  on public.contacts (organization_id, company_id) where company_id is not null;

-- FK CERCADA POR ORGANIZAÇÃO (fix round 1): a FK de coluna única aceitava uma
-- empresa/contato de OUTRO tenant — RLS barra a LEITURA, não o INSERT/UPDATE
-- pela service role nem uma query que erre o filtro. Mesmo padrão da 0228
-- (`channel_routing_policies` -> `channel_sessions(organization_id,id)`):
-- índice único (organization_id, id) como alvo, FK composta usando as duas
-- colunas. `drop constraint if exists <nome_default>` cobre quem já rodou o
-- apêndice com a FK de coluna única inline (nome autogerado pelo Postgres);
-- `drop ... if exists <nome_novo>` cobre a reaplicação idempotente normal.
create unique index if not exists uq_contacts_org_id
  on public.contacts (organization_id, id);
create unique index if not exists uq_crm_companies_org_id
  on public.crm_companies (organization_id, id);

-- ⚠️ `on delete set null` SEM lista de colunas, numa FK composta, zera TODAS as
-- colunas da FK — inclusive `organization_id`, que é NOT NULL em `contacts` e
-- `crm_companies`. Medido: `delete from crm_companies` derrubou com "null value
-- in column organization_id violates not-null constraint" antes deste comentário
-- existir. O PG15 (piso do baseline) aceita a forma com lista de colunas.
alter table public.contacts drop constraint if exists contacts_company_id_fkey;
alter table public.contacts drop constraint if exists contacts_company_org_fk;
alter table public.contacts add constraint contacts_company_org_fk
  foreign key (organization_id, company_id)
  references public.crm_companies (organization_id, id) on delete set null (company_id);

alter table public.crm_companies drop constraint if exists crm_companies_billing_contact_id_fkey;
alter table public.crm_companies drop constraint if exists crm_companies_billing_contact_org_fk;
alter table public.crm_companies add constraint crm_companies_billing_contact_org_fk
  foreign key (organization_id, billing_contact_id)
  references public.contacts (organization_id, id) on delete set null (billing_contact_id);

-- A oportunidade pode apontar a empresa pelo vínculo polimórfico (DIRC: Referenciar).
-- ⚠️ CHECK recriado inteiro (mesmo formato da 0242): `add constraint` não é idempotente.
alter table public.crm_lead_links drop constraint if exists crm_lead_links_target_kind_enum;
alter table public.crm_lead_links add constraint crm_lead_links_target_kind_enum
  check (target_kind in ('order','conversation','message','appointment','contact','lead','external','company'));

-- Anonimizar o contato zera o vínculo com a empresa (a empresa não é pessoa; fica).
-- Se ele era o número principal, a empresa fica sem principal — o módulo Asaas
-- abre aviso na Central na próxima vencida em vez de escolher outro no chute.
create or replace function public.fn_empresa_solta_principal_anonimizado()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.crm_companies
     set billing_contact_id = null, updated_at = now()
   where organization_id = new.organization_id
     and billing_contact_id = new.id;
  update public.contacts
     set company_id = null
   where id = new.id and company_id is not null;
  return new;
end;
$$;
revoke execute on function public.fn_empresa_solta_principal_anonimizado() from public, anon, authenticated;
grant execute on function public.fn_empresa_solta_principal_anonimizado() to service_role;

drop trigger if exists trg_crm_companies_principal_anonimizado on public.contacts;
create trigger trg_crm_companies_principal_anonimizado
  after update of is_anonymized on public.contacts
  for each row
  when (new.is_anonymized is true and old.is_anonymized is distinct from true)
  execute function public.fn_empresa_solta_principal_anonimizado();

-- O PostgREST cacheia o schema; sem isto a rota que roda logo depois não vê a tabela.
notify pgrst, 'reload schema';
