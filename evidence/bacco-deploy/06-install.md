# Install do CRM — 2026-09-15

Plano 4, Task 6. Clone `/opt/bacco-adega-crm` em `v26.9.0` (`f52796ab`), árvore limpa, `.env` ignorado pelo git.

## Pré-voo (mesmas validações que o `install.sh` faz, rodadas da VPS pelo domínio público)

| Validação | Resultado |
|---|---|
| `getent hosts api-adega.baccosistemas.com.br` | `2.25.222.110` |
| `v_supabase_url`: `/auth/v1/health` ≠ `000` | `401` |
| `v_sb_key` (service): `/auth/v1/admin/users` | `200` |
| `v_sb_key` (anon): `/auth/v1/settings` | `200` |
| service no Storage: `/storage/v1/bucket` | `200` |
| anon na raiz do PostgREST `/rest/v1/` | `403` (raiz OpenAPI exige service; não afeta o app) |

`v_db_url` (agent_worker pelo Supavisor em `172.17.0.1:5432`) já provado nas redes `bridge` e `bacco_proxy` — ver `evidence/bacco-deploy/03-supabase.md`.

## Install (`/root/bacco-install.sh`, senha do admin por stdin)

Passos do `install.sh --yes` (log `/root/bacco-install.log`): dependências ✓; `.env` carregado e reescrito (600) ✓; segredos ✓; DNS ✓; baseline aplicado — extensões ✓, **132 tabelas** no `public` ✓; primeiro admin `lussandro@gmail.com` criado e promovido a super-admin ✓; imagens puxadas e serviços de pé ✓. Avisos: "As imagens do worker e do agendador ainda não estão publicadas" (consulta anônima ao GHCR recebe 403 de pacote privado — **nenhum build rodou**: `ps` sem `docker build`, `.env` com `ghcr.io/lussandro/*:26.9.0` e `*_PULL_POLICY=missing`); "sem SUPABASE_ACCESS_TOKEN" (esperado com Supabase próprio; modelos de e-mail vêm do override do GoTrue). Exit 0.

Depois do install, no mesmo script:

```
tableowner | count
postgres   |   129
GRANT / GRANT / GRANT            (tabelas, sequências, funções → agent_worker)
OWNER_PASSWORD vazio: 1          (com valor: 0)
app/worker recriados → app Healthy
```

## Estado medido

```
serviços: app healthy, redis healthy, scheduler healthy, srh running, waha running, worker healthy
rede do app: bacco-adega-crm_internal=172.19.0.6 bacco_proxy=10.231.0.3
worker → banco: {"usuario":"agent_worker","orgs":"1","contatos":"0"}
portas: *:9090 0.0.0.0:22 0.0.0.0:443 0.0.0.0:80 127.0.0.1:8000 172.17.0.1:5432 172.17.0.1:6543 [::]:22 [::]:80
memória host: 3.3 GiB usados de 7.5 GiB; swap 7 MiB
CRM: app 133 MiB/768, worker 210/512, waha 566/1250, srh 80, redis 11, scheduler 10
```

## Telemetria desligada (decisão do dono)

O install informou "Telemetria: LIGADA — relatórios de erro anonimizados vão ao Sentry do projeto". Medido no código: `SENTRY_DSN` vazio resolve para `DEFAULT_SENTRY_DSN` do upstream (`lib/sentry/dsn.ts:16-22`, `o4509908078559232.ingest.us.sentry.io`); `off`/`false`/`0` desligam (`dsn.ts:21`). O `.env` estava com `SENTRY_DSN=""` — erros do servidor iam para o Sentry do autor do upstream até a correção.

Correção: `SENTRY_DSN=off` no `.env` (printf) e `up -d app worker scheduler`.

```
app SENTRY_DSN=off
worker SENTRY_DSN=off
scheduler: não recebe o .env (sem Sentry)
logs: app-1    | [telemetria] Desligada (SENTRY_DSN=off) — nenhum erro é enviado.
      worker-1 | [telemetria] worker: Desligada (SENTRY_DSN=off) — nenhum erro é enviado.
browser (window.__PUBLIC_ENV__ na página /login): SENTRY_DSN = 'off'
chaves expostas ao browser: APP_LOGO_URL, APP_NAME, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_URL, SENTRY_DSN
health público depois: 200
```

Cosmético: os logs também mostram `Invalid Sentry Dsn: off` (alguma camada do SDK lê o valor cru antes do resolvedor); o envio fica desligado pela linha `[telemetria] Desligada`.

## Pré-voo — compose

Compose do CRM validado com o `.env` real antes do install (`docker compose -f docker-compose.prod.yml -f docker-compose.npm.yml config`, exit 0): serviços `app redis scheduler srh waha worker` (sem Caddy); app em `internal` + `bacco_proxy` `10.231.0.3`; nenhuma porta publicada; imagens `ghcr.io/lussandro/*:26.9.0`.
