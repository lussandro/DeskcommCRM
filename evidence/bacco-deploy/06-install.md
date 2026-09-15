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

Compose do CRM validado com o `.env` real antes do install (`docker compose -f docker-compose.prod.yml -f docker-compose.npm.yml config`, exit 0): serviços `app redis scheduler srh waha worker` (sem Caddy); app em `internal` + `bacco_proxy` `10.231.0.3`; nenhuma porta publicada; imagens `ghcr.io/lussandro/*:26.9.0`.
