# Bacco Adega CRM — Plano 4: CI, imagens e deploy na VPS

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Revisão 2 (2026-09-15)** — incorpora refutador (agente Claude, leitura + SSH só-leitura na VPS) e `codex exec`. Mudanças principais: workflows do upstream **restaurados** e desligados pelo GitHub (remover quebrava 21 testes); CI com heap maior no typecheck; **todos** os segredos do Supabase gerados (as chaves S3/Realtime ficariam com o valor público do `.env.example`); `agent_worker` criado por `supabase_admin` com grants **antes** do install; conectividade testada nas redes reais; `printf` em vez de `sed` para segredos; `ACME_EMAIL` definido; CRB antes do EPEL; sub-rede fora do pool do Docker; `default_server` 444; SHA completo do Supabase; limites de memória; reboot + nova medição; e-mail transacional pelo Resend da Bacco.

**Goal:** Colocar o fork (ainda sem rebrand) rodando a quente na VPS — CRM + WAHA + Supabase próprio atrás de Nginx com TLS em `adega-crm.baccosistemas.com.br` e `api-adega.baccosistemas.com.br` — com imagens do GitHub Actions no GHCR e atualização por tag.

**Architecture:** Código Bacco na `main` de `github.com/lussandro/bacco-adega-crm`; `publish-image.yml` publica `ghcr.io/lussandro/*` por tag `vAA.M.P`. Na VPS, **Nginx do host** termina TLS: app por IP fixo numa rede Docker externa (modo `REVERSE_PROXY=npm` do kit), gateway do Supabase por `127.0.0.1:8000`. Supabase = compose oficial com Postgres 15 e override Bacco sem porta pública e com limites de memória. Nada roda na máquina local além de `git`/`gh`/`ssh`.

**Tech Stack:** GitHub Actions, GHCR, CentOS Stream 10 (como está), Docker CE + Compose v2, Nginx 1.26 (appstream), certbot 4.2 (EPEL 10), Supabase self-hosted (`supabase/supabase` `docker/` @ `b824acdfd204071f931a0aee01bee953ef164b6b`, `supabase/postgres:15.8.1.085`), kit `hostgator-setup-kit/`, Resend (SMTP + API).

**Spec:** `docs/superpowers/specs/2026-09-15-bacco-adega-crm-design.md` (§3, §6, §6a, §7, §10)

## Global Constraints

- **Nada de app/Supabase/e2e na máquina local.** Local só `git`, `gh`, `ssh`, `scp`, `curl` contra os domínios públicos. Gates no CI do GitHub; teste a quente na VPS.
- VPS `root@2.25.222.110`, CentOS Stream 10 **como está**. SELinux `disabled`, firewalld/nftables inativos ⇒ **nenhuma porta de serviço em `0.0.0.0`** além de 22, 80, 443 (Docker publica ignorando firewall). Cockpit 9090 pré-existente: decisão do dono.
- Domínios (DNS Cloudflare, A DNS-only → `2.25.222.110`, medido): `adega-crm.baccosistemas.com.br` (app), `api-adega.baccosistemas.com.br` (API do Supabase).
- Repo `github.com/lussandro/bacco-adega-crm` (privado). Local: `bacco` rastreando `origin/main`. **Push sempre `--no-tags`**; tag só com `git push origin <tag>`.
- Versão Bacco `vAA.M.P` (primeira `v26.9.0`): semver sem hífen, acima de toda `v1.x` do upstream. **Tag só depois de `ci` success no SHA da `main`** (spec §3.1).
- Namespace `ghcr.io/lussandro`; nomes das imagens **inalterados** (`deskcommcrm`, `deskcomm-worker`, `deskcomm-scheduler`).
- Workflows do upstream **ficam no repo** (21 testes leem esses arquivos); os que não servem ao fork são **desligados no GitHub** (`gh workflow disable`), não apagados.
- Segredos: nunca em arquivo versionado, log de evidência ou saída de terminal. Escrita em `.env` por `printf` (nunca `sed` com o valor no replacement). Deploy key só-leitura; token GHCR só `read:packages`, digitado pelo dono. Chave do Resend vai de `~/bacco-controle/apps/api/.env` para a VPS **por pipe**.
- `SUPABASE_DB_ADMIN_URL` nunca no `.env` do CRM (só na linha de comando). `OWNER_PASSWORD` sai do `.env` depois do install.
- E-mail: Resend da Bacco, domínio `baccosistemas.com.br` verified; remetente `nao-responda@baccosistemas.com.br`, nome `Bacco Adega CRM`; SMTP `smtp.resend.com:465`, usuário `resend`.
- Toda afirmação de "funciona" tem comando + saída em `evidence/bacco-deploy/*.md` (texto; imagem só com caminho exato em crase — `tests/unit/evidencia-citada.test.ts`).
- Commit termina com `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

## Quando o dono entra

| Task | Ação do dono |
|---|---|
| antes de começar | aprovar este plano |
| 4 Step 3 | confirmar o e-mail do Let's Encrypt |
| 5 Step 3 | criar token classic só `read:packages` e digitá-lo na VPS |
| 7 Steps 3–4 | login no CRM, conectar WhatsApp pelo QR, mandar mensagem de teste |
| 7 Step 2 | decidir sobre o Cockpit (9090) |

E-mail e senha do primeiro admin: já fornecidos; entram na VPS por stdin (Task 6 Step 2), nunca gravados em arquivo local/repo/vault.

---

### Task 0: Pré-condições medidas

**Files:** Create `evidence/bacco-deploy/00-precondicoes.md`

- [ ] **Step 1: DNS, acesso e estado do CI da base**

```bash
dig +short A adega-crm.baccosistemas.com.br; dig +short A api-adega.baccosistemas.com.br
ssh -o BatchMode=yes root@2.25.222.110 'grep PRETTY_NAME /etc/os-release; nproc; free -h | sed -n 2p; df -h / | tail -1; ss -tlnp | awk "NR>1{print \$4}" | sort -u'
gh run list -R lussandro/bacco-adega-crm --branch main --limit 6 --json name,headSha,conclusion --jq '.[] | "\(.name) \(.headSha[0:8]) \(.conclusion)"'
```
Expected: dois A `2.25.222.110`; CentOS Stream 10, 2 vCPU, ~7.5 GiB, ~100 GB; portas `22`, `9090`. CI da base medido em 2026-09-15: `ci` failure (`verify` → Typecheck `JavaScript heap out of memory`, exit 134; `invariants` success), `perf` success, `publish-image` success. Registrar em `evidence/bacco-deploy/00-precondicoes.md`.

---

### Task 1: CI verde e imagens próprias

**Files:**
- Restore: `.github/workflows/acolhida.yml`, `.github/workflows/relogio.yml`, `.github/workflows/release.yml`, `.github/workflows/e2e.yml` (conteúdo da `v1.27.0`)
- Modify: `.github/workflows/ci.yml` (heap no typecheck; `workflow_dispatch` já existe)
- Modify: `hostgator-setup-kit/_common.sh:453,470`, `docker-compose.prod.yml:35,92,212`, `.env.hostgator.example:32,39,41`, `hostgator-setup-kit/install.sh:18`, `hostgator-setup-kit/comecar.sh:12,16`, `hostgator-setup-kit/diagnostico.sh:22`, `Dockerfile:56`, `Dockerfile.worker:9`, `Dockerfile.scheduler:10`
- Modify: `tests/unit/namespace-das-imagens.test.ts:56,162-163`
- Delete: `.github/dependabot.yml`
- Create: `evidence/bacco-deploy/01-ci.md`

**Interfaces:**
- Produces: `ghcr.io/lussandro/{deskcommcrm,deskcomm-worker,deskcomm-scheduler}:{26.9.0,stable}`; `IMG_NS="ghcr.io/lussandro"`.

- [ ] **Step 1: Restaurar os workflows removidos e desligá-los no GitHub**

```bash
cd /home/lussandro/Bacco-Crm
git checkout v1.27.0 -- .github/workflows/acolhida.yml .github/workflows/relogio.yml .github/workflows/release.yml .github/workflows/e2e.yml
git diff --stat v1.27.0 -- .github/workflows
```
Expected: diff contra `v1.27.0` só em `ci.yml` (o `workflow_dispatch`).

- [ ] **Step 2: Heap do typecheck**

Em `.github/workflows/ci.yml`, no job `verify`, o step `Typecheck` passa a ser:

```yaml
      - name: Typecheck
        run: pnpm typecheck
        env:
          # Runner de repo privado tem menos memória que o do upstream (repo
          # público): o tsc deste projeto estourou o heap default (exit 134,
          # run 34979163506). Mesmo motivo do NODE_OPTIONS do Dockerfile:40.
          NODE_OPTIONS: --max-old-space-size=6144
```

- [ ] **Step 3: Namespace e URLs do fork**

`tests/unit/namespace-das-imagens.test.ts`:

```ts
const NAMESPACE_DESTE_REPO = "ghcr.io/lussandro";
```
```ts
    const repo = "https://github.com/lussandro/bacco-adega-crm";
```

```bash
sed -i 's#^IMG_NS="ghcr.io/melgarafael"#IMG_NS="ghcr.io/lussandro"#' hostgator-setup-kit/_common.sh
sed -i 's#ghcr.io/melgarafael/#ghcr.io/lussandro/#g' docker-compose.prod.yml .env.hostgator.example
sed -i 's#https://github.com/melgarafael/DeskcommCRM.git#https://github.com/lussandro/bacco-adega-crm.git#g' hostgator-setup-kit/_common.sh hostgator-setup-kit/install.sh hostgator-setup-kit/comecar.sh
sed -i 's#https://raw.githubusercontent.com/melgarafael/DeskcommCRM/main/#https://raw.githubusercontent.com/lussandro/bacco-adega-crm/main/#g' hostgator-setup-kit/comecar.sh hostgator-setup-kit/diagnostico.sh
sed -i 's#org.opencontainers.image.source="https://github.com/melgarafael/DeskcommCRM"#org.opencontainers.image.source="https://github.com/lussandro/bacco-adega-crm"#' Dockerfile Dockerfile.worker Dockerfile.scheduler
git rm -q .github/dependabot.yml
git grep -n 'melgarafael' -- hostgator-setup-kit docker-compose*.yml .env.hostgator.example 'Dockerfile*' tests/unit/namespace-das-imagens.test.ts
```
Expected: o `git grep` final só mostra comentários históricos (ex.: `_common.sh:491-499`). `scripts/cortar-release.ts:27` (`REPO`) e `.agents/skills`/`.claude/skills` continuam citando o upstream — ferramenta de release e guias; fora deste plano.

- [ ] **Step 4: Commit, push e CI**

```bash
git add -A .github hostgator-setup-kit docker-compose.prod.yml .env.hostgator.example Dockerfile Dockerfile.worker Dockerfile.scheduler tests/unit/namespace-das-imagens.test.ts
git commit -m "ci(bacco): CI do fork verde e imagens em ghcr.io/lussandro

Restaura acolhida/relogio/release/e2e da v1.27.0 (21 testes leem esses
arquivos); ficam desligados no GitHub. Heap maior no typecheck do runner
privado. IMG_NS, URLs do repo e labels OCI apontam para o fork.
Dependabot sai: dependências chegam pelo merge de tag do upstream.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push --no-tags origin bacco:main
for w in acolhida.yml relogio.yml release.yml e2e.yml; do gh workflow disable "$w" -R lussandro/bacco-adega-crm; done
gh api repos/lussandro/bacco-adega-crm/actions/workflows --jq '.workflows[] | "\(.path) \(.state)"'
```
Expected: `acolhida`, `relogio`, `release`, `e2e` com `disabled_manually`; `ci`, `perf`, `publish-image` `active`.

Run (ao terminar): `gh run list -R lussandro/bacco-adega-crm --branch main --limit 4 --json name,headSha,conclusion --jq '.[] | "\(.name) \(.headSha[0:8]) \(.conclusion)"'`
Expected: `ci` **success** no SHA novo (prova typecheck, lint, `test:unit` com `namespace-das-imagens`, `test:shell`, `test:db`). Se falhar: `gh run view <id> --log-failed | grep -aE '×|FAIL|Error|Tests |Test Files'` — corrigir a causa e repetir; **sem tag enquanto `ci` não for success**. Registrar em `evidence/bacco-deploy/01-ci.md`.

- [ ] **Step 5: Primeira versão Bacco**

```bash
git tag -a v26.9.0 -m "Bacco Adega CRM 26.9.0 — base do fork (DeskcommCRM v1.27.0) sem rebrand"
git push origin v26.9.0
```
Expected (Actions): `a-tag-veio-da-main`, `build-and-push` (publica `26.9.0` e `26.9`), `imagem-do-app-sobe`, `promover-stable`, `imagens-ok` — todos `success`.

Run: `gh api 'users/lussandro/packages?package_type=container' --jq '.[] | "\(.name) \(.visibility)"'`
Expected: `deskcommcrm`, `deskcomm-worker`, `deskcomm-scheduler`, `private`.

---

### Task 2: Base da VPS

**Files:** Create `evidence/bacco-deploy/02-base-vps.md`

- [ ] **Step 1: Pacotes e Docker**

```bash
ssh root@2.25.222.110 'set -e
dnf install -y git curl openssl jq dnf-plugins-core
dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
docker --version; docker compose version
ip -4 addr show docker0 | grep inet'
```
Expected: Docker e Compose v2; `docker0` `inet 172.17.0.1/16` (medido pelo refutador: `dnf 4.20.0`, `dnf-plugins-core 4.7.0`, repo Docker CentOS 10 200). **Se `docker0` tiver outro endereço, usá-lo no lugar de `172.17.0.1` em todas as tarefas.**

- [ ] **Step 2: Swap 4 GB**

```bash
ssh root@2.25.222.110 'set -e
[ -f /swapfile ] || { fallocate -l 4G /swapfile; chmod 600 /swapfile; mkswap /swapfile; }
swapon /swapfile 2>/dev/null || true
grep -q "^/swapfile " /etc/fstab || echo "/swapfile none swap sw 0 0" >> /etc/fstab
swapon --show'
```

- [ ] **Step 3: Nginx e certbot**

```bash
ssh root@2.25.222.110 'set -e
dnf install -y nginx
dnf config-manager --set-enabled crb
dnf install -y epel-release
dnf install -y certbot python3-certbot-nginx
systemctl enable --now nginx
nginx -v; certbot --version'
```
Expected: nginx 1.26.x; certbot 4.2.x (EPEL 10 lista `certbot-4.2.0-1.el10_2` e `python3-certbot-nginx-4.2.0-1.el10_2`). Qualquer falha de pacote: **parar e reportar o erro exato**.

- [ ] **Step 4: Rede do proxy fora do pool do Docker**

```bash
ssh root@2.25.222.110 'docker network inspect bacco_proxy >/dev/null 2>&1 || docker network create --subnet 10.231.0.0/24 bacco_proxy; docker network inspect bacco_proxy --format "{{(index .IPAM.Config 0).Subnet}}"'
```
Expected: `10.231.0.0/24`. O app receberá `10.231.0.3`.

- [ ] **Step 5:** registrar versões/saídas em `evidence/bacco-deploy/02-base-vps.md`.

---

### Task 3: Supabase próprio

**Files (VPS):** `/opt/supabase/docker/.env`, `/opt/supabase/docker/docker-compose.bacco.yml`, `/root/.agent_worker_pw`, `/root/.resend_key`
**Files (repo):** Create `evidence/bacco-deploy/03-supabase.md`

**Interfaces:**
- Produces: gateway `127.0.0.1:8000`; Supavisor `172.17.0.1:5432` (sessão) e `172.17.0.1:6543`; `POOLER_TENANT_ID=bacco-adega`; role `agent_worker` com grants e default privileges.

Todos os comandos compose desta task usam: `C="docker compose -f docker-compose.yml -f docker-compose.pg15.yml -f docker-compose.bacco.yml"` (em `/opt/supabase/docker`).

- [ ] **Step 1: Código fixado**

```bash
ssh root@2.25.222.110 'set -e
mkdir -p /opt && cd /opt
[ -d supabase ] || git clone --filter=blob:none --sparse https://github.com/supabase/supabase.git supabase
cd supabase && git sparse-checkout set docker && git checkout b824acdfd204071f931a0aee01bee953ef164b6b
cd docker && [ -f .env ] || cp .env.example .env
ls docker-compose.yml docker-compose.pg15.yml utils/generate-keys.sh'
```

- [ ] **Step 2: Todos os segredos**

`generate-keys.sh --update-env` grava JWT/ANON/SERVICE, `SECRET_KEY_BASE`, `REALTIME_DB_ENC_KEY`, `VAULT_ENC_KEY`, `PG_META_CRYPTO_KEY`, `LOGFLARE_*`, `S3_PROTOCOL_ACCESS_KEY_*`, `MINIO_ROOT_PASSWORD`, `POSTGRES_PASSWORD`, `DASHBOARD_PASSWORD` (`utils/generate-keys.sh:84-125`) — sem isso as chaves S3 e Realtime ficam com o valor **público** do `.env.example`.

```bash
ssh root@2.25.222.110 'set -e; cd /opt/supabase/docker
sh utils/generate-keys.sh --update-env >/dev/null
chmod 600 .env; rm -f .env.old
for k in JWT_SECRET ANON_KEY SERVICE_ROLE_KEY POSTGRES_PASSWORD SECRET_KEY_BASE REALTIME_DB_ENC_KEY VAULT_ENC_KEY PG_META_CRYPTO_KEY LOGFLARE_PUBLIC_ACCESS_TOKEN LOGFLARE_PRIVATE_ACCESS_TOKEN S3_PROTOCOL_ACCESS_KEY_ID S3_PROTOCOL_ACCESS_KEY_SECRET MINIO_ROOT_PASSWORD DASHBOARD_PASSWORD; do
  atual="$(grep "^$k=" .env | cut -d= -f2-)"; exemplo="$(grep "^$k=" .env.example | cut -d= -f2-)"
  if [ -z "$atual" ]; then echo "$k VAZIO"; elif [ "$atual" = "$exemplo" ]; then echo "$k IGUAL AO EXEMPLO"; else echo "$k ok (${#atual})"; fi
done'
```
Expected: todas `ok`. Qualquer `VAZIO`/`IGUAL AO EXEMPLO`: **não subir**. (Só tamanhos são impressos.)

- [ ] **Step 3: URLs, Auth e SMTP pelo Resend**

A chave do Resend vai por pipe, sem aparecer:

```bash
grep -E '^RESEND_API_KEY=' ~/bacco-controle/apps/api/.env | head -1 | cut -d= -f2- | tr -d '"'"'"' \r\n' \
  | ssh root@2.25.222.110 'umask 077; cat > /root/.resend_key; printf "resend key: %s chars\n" "$(wc -c < /root/.resend_key)"'
```
Expected: `resend key: 36 chars`.

```bash
ssh root@2.25.222.110 'set -e; cd /opt/supabase/docker
put() { grep -v "^$1=" .env > .env.tmp || true; printf "%s=%s\n" "$1" "$2" >> .env.tmp; mv .env.tmp .env; }
put SUPABASE_PUBLIC_URL https://api-adega.baccosistemas.com.br
put API_EXTERNAL_URL https://api-adega.baccosistemas.com.br/auth/v1
put SITE_URL https://adega-crm.baccosistemas.com.br
put ADDITIONAL_REDIRECT_URLS https://adega-crm.baccosistemas.com.br/auth/confirm
put DISABLE_SIGNUP false
put ENABLE_EMAIL_SIGNUP true
put ENABLE_EMAIL_AUTOCONFIRM false
put ENABLE_ANONYMOUS_USERS false
put ENABLE_PHONE_SIGNUP false
put POOLER_TENANT_ID bacco-adega
put SMTP_ADMIN_EMAIL nao-responda@baccosistemas.com.br
put SMTP_HOST smtp.resend.com
put SMTP_PORT 465
put SMTP_USER resend
put SMTP_PASS "$(cat /root/.resend_key)"
put SMTP_SENDER_NAME "Bacco Adega CRM"
chmod 600 .env
grep -cE "^(SUPABASE_PUBLIC_URL|API_EXTERNAL_URL|SITE_URL|ADDITIONAL_REDIRECT_URLS|POOLER_TENANT_ID|SMTP_HOST|SMTP_PASS)=." .env'
```
Expected: `7`.

- [ ] **Step 4: Override Bacco**

```bash
ssh root@2.25.222.110 'cat > /opt/supabase/docker/docker-compose.bacco.yml <<"YML"
# Bacco Adega CRM — nenhuma porta pública; limites de memória para caber com o
# CRM numa VPS de 2 vCPU / 8 GB. Nginx do host fala com 127.0.0.1:8000; kit e
# CRM falam com o Supavisor pelo gateway do docker0 (não roteável da internet).
services:
  api-gw:
    ports: !override
      - "127.0.0.1:8000:8000/tcp"
    mem_limit: 256m
  supavisor:
    ports: !override
      - "172.17.0.1:5432:5432"
      - "172.17.0.1:6543:6543"
    mem_limit: 384m
  auth:
    mem_limit: 256m
    environment:
      GOTRUE_MAILER_TEMPLATES_CONFIRMATION: https://adega-crm.baccosistemas.com.br/email-templates/confirmation
      GOTRUE_MAILER_TEMPLATES_RECOVERY: https://adega-crm.baccosistemas.com.br/email-templates/recovery
      GOTRUE_MAILER_SUBJECTS_CONFIRMATION: "Confirme seu e-mail"
      GOTRUE_MAILER_SUBJECTS_RECOVERY: "Redefinir sua senha"
  rest:
    mem_limit: 256m
  realtime:
    mem_limit: 512m
  storage:
    mem_limit: 384m
  imgproxy:
    mem_limit: 256m
  meta:
    mem_limit: 256m
  functions:
    mem_limit: 256m
  studio:
    mem_limit: 512m
  db:
    mem_limit: 1536m
YML
cd /opt/supabase/docker
docker compose -f docker-compose.yml -f docker-compose.pg15.yml -f docker-compose.bacco.yml config --format json \
  | jq -r "[.services[\"api-gw\"].ports, .services.supavisor.ports] | tostring, .services.db.image"'
```
Expected: `api-gw` só `host_ip 127.0.0.1`, `supavisor` só `host_ip 172.17.0.1`, `db.image` `supabase/postgres:15.8.1.085`. Qualquer porta sem `host_ip`: **não subir**. (Studio e imgproxy ficam ligados: `api-gw` depende de `studio` saudável e `storage` de `imgproxy`, `docker-compose.yml:87`; desligar exigiria `depends_on: !reset` — fora deste plano. Studio não é exposto pelo Nginx.)

- [ ] **Step 5: Subir e medir**

```bash
ssh root@2.25.222.110 'set -e; cd /opt/supabase/docker
C="docker compose -f docker-compose.yml -f docker-compose.pg15.yml -f docker-compose.bacco.yml"
$C pull && $C up -d
for i in $(seq 1 30); do n=$($C ps --format "{{.Health}}" | grep -vc healthy || true); [ "$n" -le 1 ] && break; sleep 10; done
$C ps --format "table {{.Service}}\t{{.Status}}"
ss -tlnp | awk "NR>1{print \$4}" | sort -u
curl -s -o /dev/null -w "auth health %{http_code}\n" -H "apikey: $(grep ^ANON_KEY= .env | cut -d= -f2-)" http://127.0.0.1:8000/auth/v1/health
docker stats --no-stream --format "{{.Name}} {{.MemUsage}}"'
```
Expected: serviços healthy/running; escuta só `22`, `9090`, `80` (nginx), `127.0.0.1:8000`, `172.17.0.1:5432`, `172.17.0.1:6543`; `auth health 200`. Memória por contêiner → evidência.

- [ ] **Step 6: Extensões, role `agent_worker` e privilégios (antes do install)**

`create role … bypassrls` no PG15 exige superusuário; na imagem Supabase é `supabase_admin` (`CONFIG.md:1357`). Os grants e default privileges entram **agora**, antes de o install subir o worker.

```bash
ssh root@2.25.222.110 'set -e; cd /opt/supabase/docker
C="docker compose -f docker-compose.yml -f docker-compose.pg15.yml -f docker-compose.bacco.yml"
umask 077; [ -s /root/.agent_worker_pw ] || openssl rand -hex 24 > /root/.agent_worker_pw
$C exec -T db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -v wpw="$(cat /root/.agent_worker_pw)" <<"SQL"
create extension if not exists vector with schema public;
create extension if not exists citext with schema public;
create extension if not exists pg_trgm with schema public;
select exists(select 1 from information_schema.schemata where schema_name = 'storage') as tem_storage;
select rolsuper from pg_roles where rolname = 'postgres';
select format('create role agent_worker login password %L bypassrls', :'wpw')
 where not exists (select 1 from pg_roles where rolname = 'agent_worker') \gexec
grant usage on schema public to agent_worker;
alter default privileges for role postgres in schema public grant select, insert, update, delete on tables to agent_worker;
alter default privileges for role postgres in schema public grant usage, select on sequences to agent_worker;
alter default privileges for role postgres in schema public grant execute on functions to agent_worker;
SQL'
```
Expected: `tem_storage = t`; o `rolsuper` do `postgres` fica registrado (se `f`, o baseline aplicado como `postgres` cria tabelas com dono `postgres` e os default privileges acima valem — conferido no Step 6 da Task 6).

- [ ] **Step 7: Conectividade nas redes reais**

```bash
ssh root@2.25.222.110 'PW="$(grep ^POSTGRES_PASSWORD= /opt/supabase/docker/.env | cut -d= -f2-)"; WPW="$(cat /root/.agent_worker_pw)"
for rede in bridge bacco_proxy; do
  echo "== rede $rede"
  docker run --rm --network "$rede" -e PGPASSWORD="$PW"  postgres:17-alpine psql -h 172.17.0.1 -p 5432 -U postgres.bacco-adega -d postgres -tAc "select current_user"
  docker run --rm --network "$rede" -e PGPASSWORD="$WPW" postgres:17-alpine psql -h 172.17.0.1 -p 5432 -U agent_worker.bacco-adega -d postgres -tAc "select current_user"
done'
```
Expected: `postgres` e `agent_worker` nas duas redes (a senha vai por `PGPASSWORD`, não pelo argv). Falhou em alguma: registrar o erro exato e **parar** — não publicar 5432 em `0.0.0.0`.

---

### Task 4: Nginx com TLS

**Files (repo):** Create `deploy/nginx/bacco-adega.conf`, `deploy/nginx/bacco-proxy-headers.conf`, `evidence/bacco-deploy/04-nginx.md`
**Files (VPS):** `/etc/nginx/conf.d/bacco-adega.conf`, `/etc/nginx/bacco-proxy-headers.conf`

- [ ] **Step 1: Configuração versionada**

`deploy/nginx/bacco-adega.conf`:

```nginx
# Bacco Adega CRM — Nginx do host. TLS pelo certbot (--nginx).
# App: rede Docker externa bacco_proxy, IP fixo (docker-compose.npm.yml).
# API: gateway do Supabase só em 127.0.0.1:8000. Studio e /pg NÃO são expostos.

map $http_upgrade $connection_upgrade {
    default upgrade;
    ""      close;
}

# Host desconhecido não cai no CRM (o server padrão do EL10 não é default_server).
server {
    listen 80 default_server;
    server_name _;
    return 444;
}

server {
    listen 80;
    server_name adega-crm.baccosistemas.com.br;
    client_max_body_size 50m;

    # Paridade com o Caddyfile do kit: webhook global do WAHA não é público.
    location = /api/v1/webhooks/waha { return 403; }

    location /api/internal/agents/run {
        proxy_pass http://10.231.0.3:3000;
        proxy_read_timeout 320s;
        proxy_send_timeout 320s;
        include /etc/nginx/bacco-proxy-headers.conf;
    }

    location / {
        proxy_pass http://10.231.0.3:3000;
        include /etc/nginx/bacco-proxy-headers.conf;
    }
}

server {
    listen 80;
    server_name api-adega.baccosistemas.com.br;
    client_max_body_size 50m;

    # Só as APIs que app e navegador usam (envoy: lds.template.yaml).
    location ~ ^/(auth|rest|realtime|storage|functions)/v1/|^/graphql/v1(/|$) {
        proxy_pass http://127.0.0.1:8000;
        proxy_read_timeout 120s;
        include /etc/nginx/bacco-proxy-headers.conf;
    }

    location / { return 404; }
}
```

`deploy/nginx/bacco-proxy-headers.conf`:

```nginx
proxy_http_version 1.1;
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection $connection_upgrade;
```

- [ ] **Step 2: Instalar e validar**

```bash
scp deploy/nginx/bacco-adega.conf root@2.25.222.110:/etc/nginx/conf.d/bacco-adega.conf
scp deploy/nginx/bacco-proxy-headers.conf root@2.25.222.110:/etc/nginx/bacco-proxy-headers.conf
ssh root@2.25.222.110 'nginx -t && systemctl reload nginx'
```
Expected: `syntax is ok` e `test is successful`.

- [ ] **Step 3: Certificados** (e-mail ACME confirmado pelo dono na hora)

```bash
ssh root@2.25.222.110 'certbot --nginx --non-interactive --agree-tos -m "<EMAIL_CONFIRMADO_PELO_DONO>" --redirect -d adega-crm.baccosistemas.com.br -d api-adega.baccosistemas.com.br && systemctl enable --now certbot-renew.timer; systemctl list-timers | grep -i certbot'
```
Expected: certificado para os dois nomes; redirect 80→443; timer de renovação ativo. Registros A devem seguir DNS-only.

- [ ] **Step 4: Medir**

```bash
curl -s -o /dev/null -w "api auth health %{http_code}\n" https://api-adega.baccosistemas.com.br/auth/v1/health
curl -s -o /dev/null -w "api raiz (studio) %{http_code}\n" https://api-adega.baccosistemas.com.br/
curl -s -o /dev/null -w "api /pg (meta) %{http_code}\n" https://api-adega.baccosistemas.com.br/pg/tables
curl -s -o /dev/null -w "app (sem CRM ainda) %{http_code}\n" https://adega-crm.baccosistemas.com.br/
curl -s -o /dev/null -w "ip direto %{http_code}\n" http://2.25.222.110/
```
Expected: auth health `401`/`200`; raiz `404`; `/pg` `404`; app `502`; IP direto sem resposta (444 → `000`).

- [ ] **Step 5: Commit**

```bash
git add deploy/nginx evidence/bacco-deploy/00-precondicoes.md evidence/bacco-deploy/01-ci.md evidence/bacco-deploy/02-base-vps.md evidence/bacco-deploy/03-supabase.md evidence/bacco-deploy/04-nginx.md
git commit -m "ops(bacco): Nginx do host e Supabase pg15 sem porta pública na VPS

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Credenciais só-leitura

- [ ] **Step 1: Deploy key**

```bash
P=/tmp/claude-1000/-home-lussandro-Bacco-Crm/a6337255-8451-4cc2-b075-9903d245160c/scratchpad/bacco_deploy.pub
ssh root@2.25.222.110 'test -f /root/.ssh/bacco_deploy || ssh-keygen -t ed25519 -N "" -C "vps-bacco-adega-deploy" -f /root/.ssh/bacco_deploy >/dev/null; cat /root/.ssh/bacco_deploy.pub' > "$P"
gh repo deploy-key add "$P" -R lussandro/bacco-adega-crm --title "vps-2.25.222.110 (read-only)"
gh repo deploy-key list -R lussandro/bacco-adega-crm
```
Expected: chave listada `read-only`.

- [ ] **Step 2: Alias SSH e host key do GitHub conferida**

```bash
FP=$(curl -s https://api.github.com/meta | jq -r '.ssh_key_fingerprints.SHA256_ED25519')
ssh root@2.25.222.110 "set -e
grep -q '^Host github-bacco' /root/.ssh/config 2>/dev/null || printf 'Host github-bacco\n  HostName github.com\n  User git\n  IdentityFile /root/.ssh/bacco_deploy\n  IdentitiesOnly yes\n' >> /root/.ssh/config
chmod 600 /root/.ssh/config
ssh-keyscan -t ed25519 github.com 2>/dev/null > /tmp/gh.key
[ \"\$(ssh-keygen -lf /tmp/gh.key | awk '{print \$2}')\" = 'SHA256:$FP' ] && cat /tmp/gh.key >> /root/.ssh/known_hosts && echo 'host key do github conferida'
git ls-remote --tags git@github-bacco:lussandro/bacco-adega-crm.git v26.9.0"
```
Expected: `host key do github conferida` e a linha da tag `v26.9.0`.

- [ ] **Step 3: Login no GHCR (dono)**

Dono cria token classic com **apenas** `read:packages` e roda no terminal dele:

```bash
ssh -t root@2.25.222.110 'docker login ghcr.io -u lussandro'
```
Depois: `ssh root@2.25.222.110 'docker pull ghcr.io/lussandro/deskcommcrm:26.9.0 >/dev/null && echo pull-ok'` → `pull-ok`.

---

### Task 6: Instalar o CRM pelo kit

**Files (VPS):** `/opt/bacco-adega-crm/.env`; **(repo)** `evidence/bacco-deploy/06-install.md`

- [ ] **Step 1: Clonar a tag**

```bash
ssh root@2.25.222.110 'set -e
[ -d /opt/bacco-adega-crm ] || git clone git@github-bacco:lussandro/bacco-adega-crm.git /opt/bacco-adega-crm
cd /opt/bacco-adega-crm && git fetch --tags origin && git checkout v26.9.0 && git describe --tags'
```

- [ ] **Step 2: `.env` (escrita literal)**

```bash
ssh -t root@2.25.222.110 'set -e; cd /opt/bacco-adega-crm
[ -f .env ] || cp .env.hostgator.example .env
put() { grep -v "^#\?$1=" .env > .env.tmp || true; printf "%s=%s\n" "$1" "$2" >> .env.tmp; mv .env.tmp .env; }
g() { grep "^$1=" /opt/supabase/docker/.env | cut -d= -f2-; }
put DOMAIN adega-crm.baccosistemas.com.br
put ACME_EMAIL "<EMAIL_CONFIRMADO_PELO_DONO>"
put NEXT_PUBLIC_APP_URL https://adega-crm.baccosistemas.com.br
put REVERSE_PROXY npm
put PROXY_NETWORK_NAME bacco_proxy
put PROXY_NETWORK_APP_IP 10.231.0.3
put APP_IMAGE ghcr.io/lussandro/deskcommcrm:26.9.0
put WORKER_IMAGE ghcr.io/lussandro/deskcomm-worker:26.9.0
put SCHEDULER_IMAGE ghcr.io/lussandro/deskcomm-scheduler:26.9.0
put NEXT_PUBLIC_SUPABASE_URL https://api-adega.baccosistemas.com.br
put NEXT_PUBLIC_SUPABASE_ANON_KEY "$(g ANON_KEY)"
put SUPABASE_SERVICE_ROLE_KEY "$(g SERVICE_ROLE_KEY)"
put SUPABASE_DB_URL "postgresql://agent_worker.bacco-adega:$(cat /root/.agent_worker_pw)@172.17.0.1:5432/postgres"
put RESEND_API_KEY "$(cat /root/.resend_key)"
put RESEND_FROM_EMAIL "Bacco Adega CRM <nao-responda@baccosistemas.com.br>"
read -r -p "E-mail do primeiro admin: " OE; put OWNER_EMAIL "$OE"
read -r -s -p "Senha do primeiro admin: " OP; echo; put OWNER_PASSWORD "$OP"; unset OP
chmod 600 .env
grep -cE "^(DOMAIN|ACME_EMAIL|REVERSE_PROXY|PROXY_NETWORK_NAME|PROXY_NETWORK_APP_IP|APP_IMAGE|NEXT_PUBLIC_SUPABASE_URL|SUPABASE_DB_URL|RESEND_API_KEY|OWNER_EMAIL|OWNER_PASSWORD)=." .env'
```
Expected: `11`. `APP_NAME`, `APP_ACCENT_HEX`, `APP_LOGO_URL` vazios (spec §4.5). O formato exato de `RESEND_FROM_EMAIL` aceito pelo app é conferido em `lib/email/` antes deste passo; se o app exigir só o endereço, gravar só `nao-responda@baccosistemas.com.br`.

- [ ] **Step 3: Instalador**

```bash
ssh root@2.25.222.110 'cd /opt/bacco-adega-crm
PW="$(grep ^POSTGRES_PASSWORD= /opt/supabase/docker/.env | cut -d= -f2-)"
REPO_URL=git@github-bacco:lussandro/bacco-adega-crm.git \
SUPABASE_DB_ADMIN_URL="postgresql://postgres.bacco-adega:${PW}@172.17.0.1:5432/postgres" \
bash hostgator-setup-kit/install.sh --yes > /root/bacco-install.log 2>&1; echo "exit=$?"; grep -nE "✖|die|Falta|inválido|serão construídas|build" /root/bacco-install.log | head -20; tail -25 /root/bacco-install.log'
```
Expected: `exit=0`; passos até "Ativando as automações"; **nenhuma** linha "serão construídas neste servidor" nem `build` (imagens privadas precisam do login da Task 5). Qualquer `die`: mensagem exata em `evidence/bacco-deploy/06-install.md` e **parar**. Não editar o kit na VPS.

- [ ] **Step 4: Grants nas tabelas criadas e senha do admin fora do `.env`**

```bash
ssh root@2.25.222.110 'set -e; cd /opt/supabase/docker
docker compose -f docker-compose.yml -f docker-compose.pg15.yml -f docker-compose.bacco.yml exec -T db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 <<"SQL"
select tableowner, count(*) from pg_tables where schemaname = 'public' group by 1;
grant select, insert, update, delete on all tables in schema public to agent_worker;
grant usage, select on all sequences in schema public to agent_worker;
grant execute on all functions in schema public to agent_worker;
SQL
cd /opt/bacco-adega-crm
grep -v "^OWNER_PASSWORD=" .env > .env.tmp && printf "OWNER_PASSWORD=\n" >> .env.tmp && mv .env.tmp .env && chmod 600 .env
docker compose -f docker-compose.prod.yml -f docker-compose.npm.yml up -d
grep -c "^OWNER_PASSWORD=$" .env'
```
Expected: dono das tabelas registrado (se não for `postgres`, os default privileges da Task 3 não cobrem migrations futuras — registrar e ajustar `for role <dono>`); `GRANT` sem erro; `1` (senha esvaziada).

- [ ] **Step 5: Estado**

```bash
ssh root@2.25.222.110 'cd /opt/bacco-adega-crm
D="docker compose -f docker-compose.prod.yml -f docker-compose.npm.yml"
$D ps --format "table {{.Service}}\t{{.Status}}"
docker inspect -f "{{range \$k,\$v := .NetworkSettings.Networks}}{{\$k}}={{\$v.IPAddress}} {{end}}" $($D ps -q app)
$D exec -T worker node -e "const {Client}=require(\"pg\");const c=new Client({connectionString:process.env.SUPABASE_DB_URL});c.connect().then(()=>c.query(\"select current_user, count(*) from public.contacts\")).then(r=>{console.log(JSON.stringify(r.rows));c.end()}).catch(e=>{console.error(\"ERRO\",e.message);process.exit(1)})"
docker stats --no-stream --format "{{.Name}} {{.MemUsage}}"; free -h | sed -n 2,3p
ss -tlnp | awk "NR>1{print \$4}" | sort -u'
```
Expected: `app` healthy com `bacco_proxy=10.231.0.3`; worker/waha/srh/redis/scheduler up; nenhum `caddy`; o worker lê `public.contacts` como `agent_worker` (prova rede `internal` → Supavisor + grants); nenhuma porta nova em `0.0.0.0`. Memória total → `evidence/bacco-deploy/06-install.md`.

---

### Task 7: Verificação a quente

**Files:** Create `evidence/bacco-deploy/07-verificacao.md`

- [ ] **Step 1: Saúde**

```bash
curl -s https://adega-crm.baccosistemas.com.br/api/v1/health | jq .
curl -s -o /dev/null -w "icon %{http_code} %{content_type}\n" https://adega-crm.baccosistemas.com.br/icon
curl -s -o /dev/null -w "waha global %{http_code}\n" -X POST https://adega-crm.baccosistemas.com.br/api/v1/webhooks/waha
```
Expected: health ok; `icon 200 image/png`; `waha global 403`.

- [ ] **Step 2: Superfície pública**

```bash
for p in 5432 6543 8000 3000 9090; do timeout 5 bash -c "</dev/tcp/2.25.222.110/$p" 2>/dev/null && echo "$p ABERTA" || echo "$p fechada"; done
```
Expected: 5432/6543/8000/3000 fechadas. 9090 (Cockpit) aberta: perguntar ao dono (`systemctl disable --now cockpit.socket` só com ok).

- [ ] **Step 3: Login, onboarding e e-mail** — dono entra em `https://adega-crm.baccosistemas.com.br/login`. Depois, pela tela de equipe, convida um e-mail seu: o convite chega de `nao-responda@baccosistemas.com.br` (prova Resend pela API do app); na tela de login, "esqueci a senha" para esse convidado chega com o molde do app (prova SMTP do GoTrue + template). Registrar texto exato de qualquer erro.

- [ ] **Step 4: WhatsApp ponta a ponta** — dono conecta número (QR do WAHA) e manda mensagem + foto de outro celular. Conferir: conversa aparece na inbox **sem recarregar** (Realtime via `api-adega`), contato criado, foto abre (Storage).

```bash
ssh root@2.25.222.110 'cd /opt/bacco-adega-crm && docker compose -f docker-compose.prod.yml -f docker-compose.npm.yml logs --since 15m app worker waha 2>&1 | grep -iE "error|fatal|unhandled" | tail -30'
```

- [ ] **Step 5: Atualização idempotente**

```bash
ssh root@2.25.222.110 'cd /opt/bacco-adega-crm && PW="$(grep ^POSTGRES_PASSWORD= /opt/supabase/docker/.env | cut -d= -f2-)" && SUPABASE_DB_ADMIN_URL="postgresql://postgres.bacco-adega:${PW}@172.17.0.1:5432/postgres" bash hostgator-setup-kit/update.sh --to v26.9.0 --force > /root/bacco-update.log 2>&1; echo "exit=$?"; tail -20 /root/bacco-update.log'
```
Expected: `exit=0`, app saudável. (O `agent.sh` não atualiza sozinho: só executa o `update.sh` quando alguém clica "Atualizar agora" na tela — `agent.sh:4-6`.)

- [ ] **Step 6: Reboot e nova medição**

```bash
ssh root@2.25.222.110 'systemctl reboot' || true
until ssh -o BatchMode=yes -o ConnectTimeout=5 root@2.25.222.110 true 2>/dev/null; do sleep 10; done
sleep 90
ssh root@2.25.222.110 'ip -4 addr show docker0 | grep inet; ss -tlnp | awk "NR>1{print \$4}" | sort -u; docker ps --format "{{.Names}} {{.Status}}" | sort'
curl -s -o /dev/null -w "app pós-reboot %{http_code}\n" https://adega-crm.baccosistemas.com.br/api/v1/health
curl -s -o /dev/null -w "api pós-reboot %{http_code}\n" https://api-adega.baccosistemas.com.br/auth/v1/health
```
Expected: mesmos binds de antes (`172.17.0.1:5432/6543`, `127.0.0.1:8000`), todos os contêineres de volta, app `200`, api `401`/`200`. Se o Supavisor não subir porque `docker0` ainda não existia: registrar e parar.

- [ ] **Step 7: Commit da evidência e push**

```bash
git add evidence/bacco-deploy
git commit -m "ops(bacco): fork no ar na VPS — verificação a quente

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push --no-tags origin bacco:main
```

---

### Task 8: Runbook durável

**Files:** Create `/home/lussandro/Obsidian/Vault/projetos/bacco-adega-crm/runbooks/deploy-vps.md`; Modify `/home/lussandro/Obsidian/Vault/projetos/bacco-adega-crm/CLAUDE.md`

- [ ] **Step 1:** runbook só com o que foi **medido** nas Tasks 2–7: caminhos, comando compose de cada stack, rede `bacco_proxy` e IP, binds, onde ficam segredos (`.env` 600, `/root/.agent_worker_pw`, `/root/.resend_key`), atualização por tag, renovação TLS, memória medida, erros encontrados e correção. Sem log de sessão, sem checkbox.
- [ ] **Step 2:** link no `CLAUDE.md` do projeto (o hook do vault commita).

---

## Fora deste plano

- Rebrand (Plano 1), maioridade (Plano 2), enforcement da suspensão (Plano 3).
- Backup do volume do Postgres/Storage do Supabase: runbook próprio depois de medir tamanho.
- Desligar Studio/imgproxy (exige `depends_on: !reset` e medir se a API continua íntegra).
- Fragmento `.changes/` + `pnpm release:conferir`: a primeira mudança **visível ao operador** do fork é o rebrand (Plano 1); este plano só troca namespace/URLs do kit.
- `scripts/cortar-release.ts:27` e guias em `.agents/skills`/`.claude/skills` ainda citam o upstream.
