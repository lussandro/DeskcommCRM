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
-- A 0228 já criou `channel_sessions_org_id_unique` nessas mesmas colunas — criar
-- outro com nome diferente (o `if not exists` só olha o NOME) daria a toda
-- instalação um segundo índice idêntico, pago em cada escrita da tabela. Cria só
-- onde não houver nenhum índice único sobre exatamente essas duas colunas.
do $$
begin
  if not exists (
    select 1
      from pg_index i
      join pg_class t on t.oid = i.indrelid
     where t.relname = 'channel_sessions'
       and t.relnamespace = 'public'::regnamespace
       and i.indisunique
       and i.indnatts = 2
       and (
         select array_agg(a.attname::text order by k.ord)
           from unnest(i.indkey) with ordinality as k(attnum, ord)
           join pg_attribute a on a.attrelid = t.oid and a.attnum = k.attnum
       ) = array['organization_id', 'id']
  ) then
    create unique index uq_channel_sessions_org_id
      on public.channel_sessions (organization_id, id);
  end if;
end $$;

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

-- ── O card que NÃO nasceu precisa aparecer na tela ──────────────────────────
--
-- Com os funis amarrados a números, a conversa que chega por um número sem funil
-- não vira card — é o comportamento pedido, mas o efeito é mudo: a conversa segue
-- no Inbox e o agente responde, enquanto funil, Radar de Risco, follow-up e
-- métricas simplesmente não existem para aquele contato. Sem este kind o único
-- registro seria `logger.info`, que numa VPS é `docker logs`.
--
-- A constraint é RECONSTRUÍDA INTEIRA (regra #159: um bloco por constraint; N
-- blocos quebram o `update.sh` de quem já tem vocabulário posterior).
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
    -- 0262: a mensagem chegou e não virou card (número sem funil, ou funil sem etapa aberta)
    'lead_sem_funil',
    'other'
  ));

notify pgrst, 'reload schema';
