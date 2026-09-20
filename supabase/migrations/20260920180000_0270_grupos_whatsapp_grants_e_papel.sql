-- 0270 — Grupos de WhatsApp: fecha a porta do PostgREST (forward-fix da 0269).
--
-- A 0269 criou as três tabelas com policy `ALL` só-tenancy e ZERO `grant`/
-- `revoke`. O baseline tem `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES
-- TO authenticated`, então elas nasceram GRAVÁVEIS por qualquer usuário logado
-- falando direto com o PostgREST (URL + anon key vão no bundle do browser, e o
-- JWT é o dele). Medido: um `viewer` fazia `PATCH /rest/v1/whatsapp_groups`
-- ligando `modo='autonomo'`, apagava membros, e forjava linha em
-- `whatsapp_group_actions` com `status='concluida', pos_condicao_ok=true` —
-- auditoria de moderação falsificada. O `requireRole("manager")` das rotas Next
-- nunca foi a única porta.
--
-- Mesmo molde da 0264/0265: SELECT ao tenant, escrita a partir de `manager`,
-- privilégio de tabela revogado e reconcedido de propósito. Os dois caminhos de
-- escrita do produto continuam intactos: o PATCH de `modo` já passa por
-- `requireRole("manager")` com o client de sessão, e todo o resto (cadastro,
-- sincronização por evento, execução de ação) escreve com `service_role`.

alter table public.whatsapp_groups enable row level security;
alter table public.whatsapp_group_members enable row level security;
alter table public.whatsapp_group_actions enable row level security;

-- As policies `ALL` só-tenancy da 0269 saem: elas é que davam escrita a
-- qualquer papel do tenant. `rbac-config-ia-canais.test.ts` reprova tabela
-- NOVA com policy `ALL` sem `fn_role_at_least`.
drop policy if exists tenant_isolation_whatsapp_groups_all on public.whatsapp_groups;
drop policy if exists tenant_isolation_whatsapp_group_members_all on public.whatsapp_group_members;
drop policy if exists tenant_isolation_whatsapp_group_actions_all on public.whatsapp_group_actions;

drop policy if exists whatsapp_groups_select on public.whatsapp_groups;
create policy whatsapp_groups_select on public.whatsapp_groups
  for select using (
    (organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin()
  );

drop policy if exists whatsapp_groups_write on public.whatsapp_groups;
create policy whatsapp_groups_write on public.whatsapp_groups
  using (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'manager'))
  )
  with check (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'manager'))
  );

revoke all on public.whatsapp_groups from anon, authenticated;
grant select, update on public.whatsapp_groups to authenticated;
grant all on public.whatsapp_groups to service_role;

drop policy if exists whatsapp_group_members_select on public.whatsapp_group_members;
create policy whatsapp_group_members_select on public.whatsapp_group_members
  for select using (
    (organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin()
  );

drop policy if exists whatsapp_group_members_write on public.whatsapp_group_members;
create policy whatsapp_group_members_write on public.whatsapp_group_members
  using (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'manager'))
  )
  with check (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'manager'))
  );

-- Membro é ESPELHO do WhatsApp: quem escreve é a sincronização, sempre com
-- `service_role`. Nenhuma tela grava aqui, então `authenticated` só lê.
revoke all on public.whatsapp_group_members from anon, authenticated;
grant select on public.whatsapp_group_members to authenticated;
grant all on public.whatsapp_group_members to service_role;

drop policy if exists whatsapp_group_actions_select on public.whatsapp_group_actions;
create policy whatsapp_group_actions_select on public.whatsapp_group_actions
  for select using (
    (organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin()
  );

drop policy if exists whatsapp_group_actions_write on public.whatsapp_group_actions;
create policy whatsapp_group_actions_write on public.whatsapp_group_actions
  using (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'manager'))
  )
  with check (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'manager'))
  );

-- É a AUDITORIA de moderação: a linha diz o que o WhatsApp respondeu e se a
-- pós-condição foi conferida. Quem a escreve é o executor com `service_role`,
-- depois de falar com o WAHA. Nenhum papel do tenant escreve — nem `manager`,
-- nem `admin`: uma linha de prova que o próprio operador redige não prova nada.
revoke all on public.whatsapp_group_actions from anon, authenticated;
grant select on public.whatsapp_group_actions to authenticated;
grant all on public.whatsapp_group_actions to service_role;
