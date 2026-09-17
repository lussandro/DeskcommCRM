-- Empresas: o cliente pessoa jurídica com vários contatos (spec 2026-09-17-bacco-asaas-design §5.2a).
--
-- POR QUE: uma empresa tem mais de um telefone que fala com o financeiro. Sem a
-- entidade, o segundo telefone é um contato solto e a cobrança (módulo Asaas,
-- migration 0261) não sabe a quem pertence. `billing_contact_id` é o número
-- principal que recebe aviso de cobrança — decisão do dono; os demais contatos
-- só consultam quando eles mesmos escrevem.
--
-- ADITIVA: nada aqui é obrigatório. `contacts.company_id` é nullable, sem default
-- e sem trigger; quem não cadastra empresa não vê diferença. Os únicos pontos
-- existentes tocados são a anonimização LGPD (zera o vínculo) e a troca de
-- empresa de um contato (solta o principal de cobrança da empresa que ele
-- deixou) — dois triggers-irmãos em `contacts`, nenhum HTTP, nenhum novo
-- caminho de escrita.

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

-- Fix round 1 (gate da 0150): a primeira versão desta migration nasceu com
-- uma policy `for all` só-tenancy (`tenant_isolation_crm_companies_all`) — o
-- mesmo furo que a 0150 fechou nas tabelas de config de IA/canais: o
-- PostgREST é alcançável pelo browser com o JWT de QUALQUER papel do tenant,
-- então um `viewer` podia criar, editar e apagar empresa alheia dentro da
-- própria org. `tests/invariants/rbac-config-ia-canais.test.ts` ("nenhuma
-- tabela NOVA entra com policy ALL só-tenancy") pegou isso na primeira rodada
-- de `pnpm test:db` da suíte inteira. Padrão da 0210 (`crm_tasks`): SELECT
-- aberto ao tenant (senão a tela quebra pro viewer) + escrita a partir de
-- `agent` — o papel de quem cadastra empresa no dia a dia. A rota da API
-- (task futura) aperta DELETE para `manager`; a policy não precisa duplicar
-- essa régua porque a rota já é o portão para o fluxo comum, e o RLS aqui só
-- precisa fechar o buraco do PostgREST direto.
-- O `drop` da policy velha FICA para sempre: um clone que já rodou a
-- primeira versão da 0260 precisa perdê-la no `update.sh`.
drop policy if exists tenant_isolation_crm_companies_all on public.crm_companies;

drop policy if exists crm_companies_select on public.crm_companies;
create policy crm_companies_select on public.crm_companies
  for select using (
    (organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin()
  );

drop policy if exists crm_companies_write on public.crm_companies;
create policy crm_companies_write on public.crm_companies
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
-- Fix round 2 (I1): o `add constraint` rodava a cada update.sh sem guarda —
-- `drop`+`add` de FK em `contacts` (a tabela mais quente) com validação
-- integral toda vez que um clone atualiza, mesmo quando a constraint já
-- existe. Guardado no padrão do apêndice (`pg_constraint`, ver 11108 do
-- baseline nesta data); os `drop constraint if exists <nome_antigo>` ficam
-- FORA da guarda (cobrem quem já rodou a FK de coluna única inline).
alter table public.contacts drop constraint if exists contacts_company_id_fkey;
alter table public.crm_companies drop constraint if exists crm_companies_billing_contact_id_fkey;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'contacts_company_org_fk') then
    alter table public.contacts add constraint contacts_company_org_fk
      foreign key (organization_id, company_id)
      references public.crm_companies (organization_id, id) on delete set null (company_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'crm_companies_billing_contact_org_fk') then
    alter table public.crm_companies add constraint crm_companies_billing_contact_org_fk
      foreign key (organization_id, billing_contact_id)
      references public.contacts (organization_id, id) on delete set null (billing_contact_id);
  end if;
end $$;

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

-- Mudar a empresa de um contato (ou tirá-lo dela) solta o principal de cobrança da
-- empresa que ele deixou. É o único lugar por onde TODOS os caminhos passam (PATCH do
-- contato, vincular/desvincular, merge). Dispara só quando company_id entra no SET —
-- org sem empresa nunca o vê.
create or replace function public.fn_empresa_solta_principal_que_saiu()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.crm_companies
     set billing_contact_id = null, updated_at = now()
   where organization_id = new.organization_id
     and billing_contact_id = new.id
     and id is distinct from new.company_id;
  return new;
end;
$$;
revoke execute on function public.fn_empresa_solta_principal_que_saiu() from public, anon, authenticated;
grant execute on function public.fn_empresa_solta_principal_que_saiu() to service_role;

drop trigger if exists trg_crm_companies_principal_que_saiu on public.contacts;
create trigger trg_crm_companies_principal_que_saiu
  after update of company_id on public.contacts
  for each row
  when (new.company_id is distinct from old.company_id)
  execute function public.fn_empresa_solta_principal_que_saiu();

-- O PostgREST cacheia o schema; sem isto a rota que roda logo depois não vê a tabela.
notify pgrst, 'reload schema';

-- 8. fn_mesclar_contatos: empresas
-- A função já é redefinida três vezes no baseline (o último bloco vence); esta
-- é uma QUARTA redefinição, cópia integral da última (linha ~19442 do
-- baseline nesta data) com um único trecho novo inserido entre os passos 5 e
-- 6 (ver comentário "Empresas (0260)" abaixo). Nada mais do corpo mudou.
CREATE OR REPLACE FUNCTION public.fn_mesclar_contatos(p_organization_id uuid, p_contato_principal uuid, p_contatos_secundarios uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_principal public.contacts%rowtype;
  v_esperado integer;
  v_achado integer;
  v_alvo record;
  v_linha record;
  v_movidas integer;
  v_pulados integer;
  v_repontado jsonb := '{}'::jsonb;
  v_nao_repontado jsonb := '{}'::jsonb;
  v_nome text;
  v_apelido text;
  v_nascimento date;
  v_email text;
  v_telefone text;
  v_lid text;
  v_tags text[];
  v_leads integer := 0;
  v_service_contact uuid;
begin
  if not public.fn_support_write_allowed(p_organization_id) then raise exception 'support_readonly' using errcode='42501'; end if;
  -- 1 · Autorização. Fundir é destrutivo na prática: `manager`, o mesmo piso das
  --     policies de `merge_queue`. Sessão de service role (auth.uid() nulo) não
  --     passa por aqui — quem resolve a org nesse caminho é a rota, de fonte
  --     confiável, nunca do body.
  if auth.uid() is not null
     and not public.fn_role_at_least(p_organization_id, 'manager') then
    raise exception using errcode = '42501', message = 'insufficient_role';
  end if;

  if p_contato_principal is null
     or p_contatos_secundarios is null
     or cardinality(p_contatos_secundarios) = 0
     or p_contato_principal = any(p_contatos_secundarios) then
    raise exception using errcode = '22023', message = 'selecao_de_mesclagem_invalida';
  end if;

  select count(distinct id)::integer into v_esperado
    from unnest(p_contatos_secundarios) as ids(id);
  if v_esperado <> cardinality(p_contatos_secundarios) then
    raise exception using errcode = '22023', message = 'secundario_repetido';
  end if;

  -- Mesmo mutex dos atendimentos, ANTES de qualquer row lock.
  for v_service_contact in select distinct id from unnest(array[p_contato_principal]||p_contatos_secundarios) ids(id) order by id loop
    perform public.fn_service_lock(p_organization_id,v_service_contact);
  end loop;
  perform 1 from public.conversations where organization_id=p_organization_id
    and contact_id=any(array[p_contato_principal]||p_contatos_secundarios) order by id for no key update;

  -- Conversa colidente NÃO aborta a fusão. Duas conversas no mesmo
  -- `channel_session_id` é exatamente COMO a duplicata de WhatsApp nasce (dois
  -- cadastros, dois números, o mesmo número de atendimento), então recusar aqui
  -- fecharia o caminho dominante do recurso — medido: o caso ordinário do
  -- `tests/e2e/juntar-contatos-duplicados.spec.ts` virava 409.
  -- Quem trata a colisão é o passo 5: `uniq_conversations_1to1_per_contact_session`
  -- levanta unique_violation, o repontamento cai para linha a linha, a conversa
  -- que não coube FICA na lápide e sai contada em `nao_repontado` — que a rota
  -- devolve e a tela anuncia ("N registro(s) continuaram no cadastro antigo").
  -- Mensagem não se perde: `messages.contact_id` não tem índice único por
  -- contato e passa inteira para o vencedor.

  -- 2 · O principal existe, é desta org, está vivo — e trava até o fim.
  select * into v_principal from public.contacts
   where id = p_contato_principal
     and organization_id = p_organization_id
     and is_merged_into is null
     and is_anonymized = false
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'contato_principal_indisponivel';
  end if;

  -- 3 · Os secundários também. `is_anonymized = false` não é zelo: L-04 é
  --     irreversível, e reencaixar a linha anonimizada num contato ativo a
  --     traria de volta ao atendimento pela porta dos fundos.
  perform 1 from public.contacts
   where id = any(p_contatos_secundarios)
     and organization_id = p_organization_id
     and is_merged_into is null
     and is_anonymized = false
   for update;
  get diagnostics v_achado = row_count;
  if v_achado <> v_esperado then
    raise exception using errcode = 'P0002', message = 'contato_secundario_indisponivel';
  end if;

  -- 4 · A LÁPIDE VEM ANTES de tudo. É ela que solta telefone/e-mail/CPF dos
  --     índices únicos parciais para o vencedor poder herdá-los no passo 6.
  update public.contacts
     set is_merged_into = p_contato_principal,
         merged_at = now(),
         updated_at = now()
   where organization_id = p_organization_id
     and id = any(p_contatos_secundarios);

  -- Cadeia: quem já tinha sido mesclado NUM dos secundários passa a apontar para
  -- o vencedor. Sem isto, `is_merged_into` vira uma corrente que a leitura teria
  -- de percorrer, e ninguém percorre.
  update public.contacts
     set is_merged_into = p_contato_principal
   where organization_id = p_organization_id
     and is_merged_into = any(p_contatos_secundarios);

  -- 5 · Reponta TODO ponteiro para os perdedores. A lista sai do catálogo; o
  --     polimórfico entra à mão porque catálogo nenhum o conhece.
  for v_alvo in
    select n.nspname as esquema, c.relname as tabela, a.attname as coluna, ''::text as filtro
      from pg_catalog.pg_constraint co
      join pg_catalog.pg_class c on c.oid = co.conrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      join pg_catalog.pg_attribute a on a.attrelid = co.conrelid and a.attnum = co.conkey[1]
     where co.contype = 'f'
       and co.confrelid = 'public.contacts'::regclass
       and co.conrelid <> 'public.contacts'::regclass
       and array_length(co.conkey, 1) = 1
       and c.relkind = 'r'
       and n.nspname = 'public'
    union all
    select 'public', 'crm_lead_links', 'target_id', ' and target_kind = ''contact'''
     where to_regclass('public.crm_lead_links') is not null
    order by 2, 3
  loop
    v_pulados := 0;
    begin
      execute format(
        'update %I.%I set %I = $1 where %I = any($2)%s',
        v_alvo.esquema, v_alvo.tabela, v_alvo.coluna, v_alvo.coluna, v_alvo.filtro
      ) using p_contato_principal, p_contatos_secundarios;
      get diagnostics v_movidas = row_count;
    exception when unique_violation or exclusion_violation then
      -- Colisão REAL e esperada: `uniq_job_queue_one_running_per_contact` deixa
      -- um job 'running' por contato, e os dois lados podem ter um. Em vez de
      -- abortar a fusão inteira por causa de estado efêmero de runtime, reponta
      -- linha a linha e conta quem ficou. Quem fica NÃO vira FK órfã — continua
      -- apontando para a lápide, que existe.
      v_movidas := 0;
      for v_linha in execute format(
        'select ctid as tid from %I.%I where %I = any($1)%s',
        v_alvo.esquema, v_alvo.tabela, v_alvo.coluna, v_alvo.filtro
      ) using p_contatos_secundarios
      loop
        begin
          execute format(
            'update %I.%I set %I = $1 where ctid = $2',
            v_alvo.esquema, v_alvo.tabela, v_alvo.coluna
          ) using p_contato_principal, v_linha.tid;
          v_movidas := v_movidas + 1;
        exception when unique_violation or exclusion_violation then
          v_pulados := v_pulados + 1;
        end;
      end loop;
    end;

    if v_movidas > 0 then
      v_repontado := v_repontado
        || jsonb_build_object(v_alvo.tabela || '.' || v_alvo.coluna, v_movidas);
    end if;
    if v_pulados > 0 then
      v_nao_repontado := v_nao_repontado
        || jsonb_build_object(v_alvo.tabela || '.' || v_alvo.coluna, v_pulados);
    end if;
  end loop;

  -- Empresas (0260): o passo 5 só reponta FK de coluna única
  -- (array_length(conkey,1) = 1); `crm_companies.billing_contact_id` é FK
  -- composta (organization_id, billing_contact_id) e fica de fora do loop
  -- genérico, então continuaria apontando para a lápide. O principal do
  -- CONTATO manda sobre o da EMPRESA: se o sobrevivente é desta empresa, ele
  -- assume o posto; senão a empresa fica SEM principal — nunca herda vínculo
  -- que ninguém fez, e nunca fica com o principal fora da própria empresa
  -- (a cerca que o handler já impõe na escrita comum).
  update public.crm_companies e
     set billing_contact_id = case when e.id = v_principal.company_id
                                    then p_contato_principal else null end,
         updated_at = now()
   where e.organization_id = p_organization_id
     and e.billing_contact_id = any(p_contatos_secundarios);

  -- 6 · O principal MANDA; o que ele não tem, vem dos perdedores. Nunca o
  --     contrário: sobrescrever o que o atendente digitou seria fusão com
  --     surpresa, e fusão não tem desfazer.
  select c.name into v_nome from public.contacts c
   where c.id = any(p_contatos_secundarios) and c.name is not null
   order by c.created_at, c.id limit 1;
  select c.display_name into v_apelido from public.contacts c
   where c.id = any(p_contatos_secundarios) and c.display_name is not null
   order by c.created_at, c.id limit 1;
  select c.birthdate into v_nascimento from public.contacts c
   where c.id = any(p_contatos_secundarios) and c.birthdate is not null
   order by c.created_at, c.id limit 1;
  select c.email into v_email from public.contacts c
   where c.id = any(p_contatos_secundarios) and c.email is not null
   order by c.created_at, c.id limit 1;
  select c.phone_number into v_telefone from public.contacts c
   where c.id = any(p_contatos_secundarios) and c.phone_number is not null
   order by c.created_at, c.id limit 1;
  -- `wa_identity`/`wa_lid` são GERADAS: o que se herda é a origem delas. Sem
  -- isto o WhatsApp do perdedor fica órfão — `fn_upsert_wa_contact` filtra
  -- `is_merged_into is null`, não acharia mais ninguém e criaria um contato
  -- novo na mensagem seguinte, refazendo a duplicata que acabou de ser desfeita.
  select c.source_metadata->>'waha_lid' into v_lid from public.contacts c
   where c.id = any(p_contatos_secundarios)
     and c.source_metadata->>'waha_lid' is not null
   order by c.created_at, c.id limit 1;

  -- Guardas de unicidade. A lápide já tirou os perdedores dos índices parciais,
  -- então o que sobrar aqui é conflito com um TERCEIRO contato vivo — e nesse
  -- caso o vencedor simplesmente não herda o campo. Falhar a fusão inteira por
  -- causa de um e-mail seria perder o repontamento que já valeu a pena.
  if v_email is not null and exists (
    select 1 from public.contacts o
     where o.organization_id = p_organization_id and o.is_merged_into is null
       and o.id <> p_contato_principal and o.email_normalized = lower(btrim(v_email))
  ) then v_email := null; end if;
  if v_telefone is not null and exists (
    select 1 from public.contacts o
     where o.organization_id = p_organization_id and o.is_merged_into is null
       and o.id <> p_contato_principal and o.phone_number = v_telefone
  ) then v_telefone := null; end if;
  if v_lid is not null and exists (
    select 1 from public.contacts o
     where o.organization_id = p_organization_id and o.is_merged_into is null
       and o.id <> p_contato_principal and o.wa_lid = v_lid
  ) then v_lid := null; end if;

  select coalesce(array_agg(distinct t), '{}'::text[]) into v_tags
    from (
      select unnest(c.tags) as t from public.contacts c
       where c.organization_id = p_organization_id
         and (c.id = p_contato_principal or c.id = any(p_contatos_secundarios))
    ) as todas;

  -- CPF e `consent` NÃO são herdados, de propósito. CPF é um PAR
  -- (`cpf_encrypted` + `cpf_hash`) preso por check constraint e criptografado
  -- com a chave da instalação — mover metade quebra a linha. `consent` é
  -- registro legal do que AQUELA pessoa autorizou; herdar um "granted_at" de
  -- outro cadastro fabricaria consentimento. Falha fechada nos dois.
  update public.contacts set
    name = coalesce(name, v_nome),
    display_name = coalesce(display_name, v_apelido),
    birthdate = coalesce(birthdate, v_nascimento),
    email = coalesce(email, v_email),
    phone_number = coalesce(phone_number, v_telefone),
    tags = v_tags,
    last_activity_at = greatest(
      last_activity_at,
      (select max(c.last_activity_at) from public.contacts c
        where c.id = any(p_contatos_secundarios))
    ),
    source_metadata = (
      case when source_metadata->>'waha_lid' is null and v_lid is not null
        then source_metadata || jsonb_build_object('waha_lid', v_lid)
        else source_metadata end
    )
      - case when coalesce(phone_number, v_telefone) is not null
             then 'telefone_em_conflito' else '' end
      || jsonb_build_object(
           'mesclado_de',
           coalesce(source_metadata->'mesclado_de', '[]'::jsonb)
             || to_jsonb(p_contatos_secundarios),
           'mesclado_em', to_jsonb(now())
         ),
    updated_at = now()
  where id = p_contato_principal and organization_id = p_organization_id;

  -- 7 · A fusão aparece na timeline de cada negócio que o vencedor passou a ter.
  --     `crm_lead_activities.lead_id` é NOT NULL — contato sem negócio nenhum
  --     não tem onde escrever, e para esse caso quem guarda o rastro é o
  --     `api_audit_log` que a rota emite, sempre.
  insert into public.crm_lead_activities
    (organization_id, lead_id, contact_id, source_module, source_id, type,
     payload, metadata, performed_at, performed_by_user_id)
  select p_organization_id, l.id, p_contato_principal, 'crm', p_contato_principal,
         'contacts_merged',
         jsonb_build_object(
           'contatos_mesclados', to_jsonb(p_contatos_secundarios),
           'repontado', v_repontado,
           'nao_repontado', v_nao_repontado
         ),
         '{}'::jsonb, now(), auth.uid()
    from public.crm_leads l
   where l.organization_id = p_organization_id
     and l.contact_id = p_contato_principal;
  get diagnostics v_leads = row_count;

  return jsonb_build_object(
    'contato_id', p_contato_principal,
    'contatos_mesclados', to_jsonb(p_contatos_secundarios),
    'repontado', v_repontado,
    'nao_repontado', v_nao_repontado,
    'atividades_emitidas', v_leads
  );
end;
$function$;
revoke execute on function public.fn_mesclar_contatos(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.fn_mesclar_contatos(uuid, uuid, uuid[]) to authenticated, service_role;
