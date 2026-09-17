-- 0262 — O FUNIL PERTENCE A UM NÚMERO (bacco)
--
-- ═══ O problema, MEDIDO em produção (17/09/2026) ═══
--
-- Toda primeira mensagem de um contato sem card aberto cria um lead no funil
-- `is_default` da ORGANIZAÇÃO (`lib/leads/nascimento-do-lead.ts`) — sem olhar por
-- qual número ela chegou. Numa instalação com mais de um número de WhatsApp, de
-- negócios diferentes, os funis de um recebem os contatos do outro: medido, 7 dos
-- 12 cards da organização do dono vieram de dois números que não são do negócio
-- daquele funil, incluindo cliente de outro produto virando "oportunidade de venda".
--
-- ═══ A correção ═══
--
-- O funil passa a poder DECLARAR de qual número ele é. `null` = serve a todos, que
-- é o comportamento de hoje e o de toda instalação com um número só — aplicar esta
-- migration não muda nada em ninguém até alguém preencher o campo.
--
-- A escolha do funil de entrada (no código) fica: funil do canal da conversa →
-- senão, funil sem canal → senão, não nasce lead. Um número sem funil próprio, numa
-- organização que já separou os funis por número, deixa de criar card — que é o
-- pedido explícito do dono: "esse funil só pode ser ligado ao número final 2220".
--
-- FK composta `(organization_id, channel_session_id)` pela doutrina multi-tenant:
-- um funil não pode apontar para o número de OUTRA organização. `on delete set
-- null (channel_session_id)` zera só a coluna — nunca o `organization_id`.

alter table public.crm_pipelines
  add column if not exists channel_session_id uuid;

-- Alvo da FK composta: índice único (organization_id, id) em channel_sessions.
create unique index if not exists uq_channel_sessions_org_id
  on public.channel_sessions (organization_id, id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'crm_pipelines_channel_org_fk'
       and conrelid = 'public.crm_pipelines'::regclass
  ) then
    alter table public.crm_pipelines
      add constraint crm_pipelines_channel_org_fk
      foreign key (organization_id, channel_session_id)
      references public.channel_sessions (organization_id, id)
      on delete set null (channel_session_id);
  end if;
end $$;

create index if not exists idx_crm_pipelines_channel
  on public.crm_pipelines (organization_id, channel_session_id)
  where channel_session_id is not null;

notify pgrst, 'reload schema';
