-- 0265 — ritmo PRÓPRIO da campanha (spec 2026-09-18-campanha-de-prospeccao-design.md)
--
-- A campanha herdava só o ritmo do canal (throttle de 1,2s, janela e teto diário do
-- número). Para lista FRIA isso é rápido demais: 30 mensagens em 30 minutos, do mesmo
-- número, para gente que nunca falou com a empresa, é o padrão que o WhatsApp bane.
--
-- Todas as colunas são NULLABLE e null = herda do canal. Quem não configurar nada
-- continua com o comportamento de hoje; quem configurar, manda.
alter table public.campaigns add column if not exists intervalo_segundos integer;
alter table public.campaigns add column if not exists janela_inicio_hora smallint;
alter table public.campaigns add column if not exists janela_fim_hora smallint;
alter table public.campaigns add column if not exists teto_diario integer;

do $$ begin
  alter table public.campaigns add constraint campaigns_intervalo_check
    check (intervalo_segundos is null or (intervalo_segundos between 30 and 86400));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.campaigns add constraint campaigns_janela_check
    check ((janela_inicio_hora is null and janela_fim_hora is null)
        or (janela_inicio_hora between 0 and 23 and janela_fim_hora between 1 and 24
            and janela_fim_hora > janela_inicio_hora));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.campaigns add constraint campaigns_teto_check
    check (teto_diario is null or (teto_diario between 1 and 1000));
exception when duplicate_object then null; end $$;
