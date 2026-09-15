# Linha de base do rebrand — 2026-09-15

Plano 1 v2.1, Task 0.

## Código de produto = último CI verde

```
$ git diff --stat f52796ab HEAD -- app lib components hooks workers tests supabase hostgator-setup-kit scripts .github
(vazio)
```

Linha de base: run `34990752387` do `ci` em `f52796ab` (success; `evidence/bacco-deploy/01-ci.md`).
Os commits depois dele só tocam `evidence/` e `docs/`.

## O que ainda diz "deskcomm"

```
$ grep -rIniE "deskcomm" app components lib hooks workers public Dockerfile* | grep -vE "\.test\.|/design/" | wc -l
70
```

70 linhas em 47 arquivos. Classificação:

| Classe | Arquivos | Destino |
|---|---|---|
| **Visível ao usuário ou ao operador** | `lib/branding.ts:19` (`DEFAULT_APP_NAME`), `public/llms.txt` (9), `Dockerfile:2-3,58`, `Dockerfile.worker:11`, `Dockerfile.scheduler:12`, `app/globals.css:28` (cabeçalho) | Tasks 1, 4, 7 |
| **Dívida registrada** | `lib/email/templates/ai-budget-alarm.tsx:35` — template sem chamador | fica (Task 4) |
| **Identificador técnico / contrato** | `sb-deskcomm-auth` (`lib/supabase/browser.ts`, `server.ts`), `deskcomm-theme` (`lib/theme.tsx`, `app/layout.tsx:122`), `deskcomm-impersonate` (`lib/impersonate/*`), `X-Deskcomm-*` (`lib/automation/actions/call-webhook.ts`, `app/api/v1/webhooks/in/[token]/route.ts`), MCP `deskcomm-crm` (`lib/mcp/server.ts`), `X-Client-Info` (`lib/supabase/admin.ts`), `X-Client-Id` (`lib/wacalls/events-bridge.ts`), `SUFIXO_ICAL_UID`/`PREFIXO_PROPRIEDADE` (`lib/agenda/google/evento.ts`), `deskcomm.show_ai_citations` (`hooks/ai/useDebugToggle.ts`), `@keyframes deskcomm-card-pulse` (`app/globals.css`), User-Agent Nuvemshop (`lib/nuvemshop/config.ts`, integração desligada) | fica |
| **Comentário** | `lib/lgpd/*`, `lib/legal/operador.ts`, `lib/agent-engine/*`, `lib/ai/*`, `lib/api/errors.ts`, `lib/email/resend.ts`, `lib/mcp/tools/pacotes.ts`, `lib/agenda/google/vinculo.ts`, `lib/branding/desenho.ts` (regenerado na Task 3), `hooks/kanban/useBoard.ts`, `components/agenda/tipos.ts`, `workers/agent-worker/main.ts`, `lib/webhooks/inbound.ts`, `app/app/agenda/page.tsx`, `app/app/settings/atualizacao/_components/UpdatePanel.tsx`, `app/actions/*`, `app/api/v1/cron/sync-model-catalog/route.ts`, `app/(admin)/README.md` | fica |

`app/design/*` (showcase interno, `noindex`) fica fora do grep; os três títulos dele mudam na Task 4.
