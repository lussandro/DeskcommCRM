# Bacco Adega CRM — Plano 4: CI, imagens e deploy na VPS

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Colocar o fork (ainda sem rebrand) rodando a quente na VPS — CRM + WAHA + Supabase próprio atrás de Nginx com TLS em `adega-crm.baccosistemas.com.br` e `api-adega.baccosistemas.com.br` — com imagens construídas pelo GitHub Actions no GHCR e atualização por tag.

**Architecture:** O código Bacco vive na `main` de `github.com/lussandro/bacco-adega-crm`; o `publish-image.yml` publica em `ghcr.io/lussandro/*` a cada tag `vAA.M.P`. Na VPS, **Nginx do host** termina TLS para os dois domínios: o app é alcançado por IP fixo numa rede Docker externa (modo `REVERSE_PROXY=npm` que o kit já suporta), o gateway do Supabase por `127.0.0.1:8000`. Supabase é o compose oficial com Postgres 15, com override Bacco que tira toda porta pública. Nada roda na máquina local além de `git`/`gh`.

**Tech Stack:** GitHub Actions, GHCR, CentOS Stream 10 (como está na VPS), Docker CE + Compose v2, Nginx 1.26 (appstream), certbot (EPEL 10), Supabase self-hosted (`supabase/supabase` `docker/` no commit `b824acd`, Postgres `supabase/postgres:15.8.1.085`), kit `hostgator-setup-kit/` do upstream.

**Spec:** `docs/superpowers/specs/2026-09-15-bacco-adega-crm-design.md` (§3, §6, §6a, §7, §10)

## Global Constraints

- **Nada de app/Supabase/e2e na máquina local.** Local só `git`, `gh`, `ssh`. Gates rodam no CI do GitHub; teste a quente, na VPS.
- VPS: `root@2.25.222.110`, CentOS Stream 10 **como está** (não reinstalar, não discutir SO). SELinux `disabled`, firewalld/nftables inativos — por isso **nenhuma porta de serviço pode ser publicada em `0.0.0.0`** exceto 22, 80, 443 (Docker publica ignorando firewall).
- Domínios (DNS Cloudflare, registro A DNS-only → `2.25.222.110`, medido): app `adega-crm.baccosistemas.com.br`; API do Supabase `api-adega.baccosistemas.com.br`.
- Repo: `github.com/lussandro/bacco-adega-crm` (privado). Local: branch `bacco` rastreando `origin/main`. **Push sempre com `--no-tags`**; tag só `git push origin <tag>` explícito.
- Versão Bacco: `vAA.M.P` (primeira: `v26.9.0`). Semver sem hífen (o kit trata hífen como prerelease, `_common.sh:472-477`) e acima de toda tag `v1.x` do upstream presente localmente.
- Namespace de imagem: `ghcr.io/lussandro`. Nomes das imagens **não mudam** (`deskcommcrm`, `deskcomm-worker`, `deskcomm-scheduler` — identificador técnico, spec §2).
- Credenciais: deploy key **só-leitura** no repo; token GHCR **só `read:packages`**, digitado pelo dono na VPS — o agente nunca vê nem grava o valor. Nenhum segredo em arquivo versionado nem em log de evidência.
- `SUPABASE_DB_ADMIN_URL` nunca vai para o `.env` do CRM (é passada só na linha de comando, `docs/deploy-selfhost/README.md:117-125`).
- Supabase: Postgres 15 (upstream testa o baseline em pg15, `CLAUDE.md:446`). Realtime e Storage ligados. Studio **não** exposto publicamente.
- Toda afirmação de "funciona" vem com comando rodado e saída observada, registrada em `evidence/bacco-deploy/` (texto; se houver imagem, citar o caminho exato em crase num `.md` — `tests/unit/evidencia-citada.test.ts`).
- Commit termina com `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

## Pendências do dono (bloqueiam só os passos indicados)

| Dado | Usado em |
|---|---|
| Token GitHub classic com **só** `read:packages` (digitado por ele na VPS) | Task 5 Step 3 |
| E-mail e senha do primeiro admin do CRM | Task 6 Step 2 |
| SMTP para o GoTrue (host, porta, usuário, senha, remetente) — sem isso convite/recuperação de senha não saem | Task 3 Step 3 |
| Escanear o QR do WhatsApp e mandar a mensagem de teste | Task 7 Step 4 |

---

### Task 0: Pré-condições medidas

**Files:** Create `evidence/bacco-deploy/00-precondicoes.md`

- [ ] **Step 1: CI da base verde**

Run: `gh run list -R lussandro/bacco-adega-crm --limit 10 --json name,headSha,status,conclusion --jq '.[] | "\(.name) \(.headSha[0:8]) \(.status) \(.conclusion)"'`
Expected: `ci`, `perf` e `Publicar imagem Docker (GHCR)` com `completed success` num SHA da `main`. Se `ci` falhar, abra o job (`gh run view <id> --log-failed | tail -80`) e registre: falha pré-existente do upstream (reproduz na `v1.27.0` sem mudança nossa) ou nossa. **Não seguir** com falha nossa.

- [ ] **Step 2: DNS e acesso**

```bash
dig +short A adega-crm.baccosistemas.com.br; dig +short A api-adega.baccosistemas.com.br
ssh -o BatchMode=yes root@2.25.222.110 'grep PRETTY_NAME /etc/os-release; nproc; free -h | sed -n 2p; df -h / | tail -1; ss -tlnp | awk "NR>1{print \$4}"'
```
Expected: os dois registros `2.25.222.110`; CentOS Stream 10, 2 vCPU, ~7.5 GiB, ~100 GB; portas só `22` e `9090`.

- [ ] **Step 3: Registrar e commitar** as saídas em `evidence/bacco-deploy/00-precondicoes.md` (sem segredos).

```bash
git add evidence/bacco-deploy/00-precondicoes.md
git commit -m "chore(bacco): pré-condições do deploy medidas

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 1: Fork publica imagens próprias

**Files:**
- Modify: `hostgator-setup-kit/_common.sh:453,470`
- Modify: `docker-compose.prod.yml:35,92,212`
- Modify: `.env.hostgator.example:32,39,41`
- Modify: `hostgator-setup-kit/install.sh:18`, `hostgator-setup-kit/comecar.sh:12,16`, `hostgator-setup-kit/diagnostico.sh:22`
- Modify: `Dockerfile:56`, `Dockerfile.worker:9`, `Dockerfile.scheduler:10`
- Modify: `tests/unit/namespace-das-imagens.test.ts:56,162-163`
- Delete: `.github/dependabot.yml`

**Interfaces:**
- Produces: imagens `ghcr.io/lussandro/{deskcommcrm,deskcomm-worker,deskcomm-scheduler}:{26.9.0,stable}`; `IMG_NS="ghcr.io/lussandro"`.

- [ ] **Step 1: Teste primeiro** — em `tests/unit/namespace-das-imagens.test.ts`:

```ts
const NAMESPACE_DESTE_REPO = "ghcr.io/lussandro";
```

e, nas linhas 162-163, a URL do repo:

```ts
    const repo = "https://github.com/lussandro/bacco-adega-crm";
```

- [ ] **Step 2: Trocar o namespace e as URLs**

```bash
cd /home/lussandro/Bacco-Crm
sed -i 's#^IMG_NS="ghcr.io/melgarafael"#IMG_NS="ghcr.io/lussandro"#' hostgator-setup-kit/_common.sh
sed -i 's#ghcr.io/melgarafael/#ghcr.io/lussandro/#g' docker-compose.prod.yml .env.hostgator.example
sed -i 's#https://github.com/melgarafael/DeskcommCRM.git#https://github.com/lussandro/bacco-adega-crm.git#g' hostgator-setup-kit/_common.sh hostgator-setup-kit/install.sh hostgator-setup-kit/comecar.sh
sed -i 's#https://raw.githubusercontent.com/melgarafael/DeskcommCRM/main/#https://raw.githubusercontent.com/lussandro/bacco-adega-crm/main/#g' hostgator-setup-kit/comecar.sh hostgator-setup-kit/diagnostico.sh
sed -i 's#org.opencontainers.image.source="https://github.com/melgarafael/DeskcommCRM"#org.opencontainers.image.source="https://github.com/lussandro/bacco-adega-crm"#' Dockerfile Dockerfile.worker Dockerfile.scheduler
git rm -q .github/dependabot.yml
git grep -n 'melgarafael' -- hostgator-setup-kit docker-compose*.yml .env.hostgator.example Dockerfile* .github tests/unit/namespace-das-imagens.test.ts
```
Expected: o último `git grep` só lista comentários que citam o upstream como origem histórica (ex.: `_common.sh:491-499`). Qualquer uso funcional restante: troque e repita.

- [ ] **Step 3: Push e CI**

```bash
git add -A hostgator-setup-kit docker-compose.prod.yml .env.hostgator.example Dockerfile Dockerfile.worker Dockerfile.scheduler tests/unit/namespace-das-imagens.test.ts .github
git commit -m "ci(bacco): imagens e kit apontam para o fork

IMG_NS ghcr.io/lussandro, URLs do repo e da raw no kit, labels OCI e o
teste namespace-das-imagens. Dependabot sai: dependências chegam pelo
merge de tag do upstream.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push --no-tags origin bacco:main
```
Run (quando terminar): `gh run list -R lussandro/bacco-adega-crm --limit 5 --json name,headSha,conclusion --jq '.[] | "\(.name) \(.headSha[0:8]) \(.conclusion)"'`
Expected: `ci` e `Publicar imagem Docker (GHCR)` `success` no SHA novo. `ci` verde prova `namespace-das-imagens` e `test:shell`.

- [ ] **Step 4: Primeira versão Bacco**

```bash
git tag -a v26.9.0 -m "Bacco Adega CRM 26.9.0 — base do fork (DeskcommCRM v1.27.0) sem rebrand"
git push origin v26.9.0
```
Expected (Actions): `a-tag-veio-da-main` `success` (tag no topo da `main`), `build-and-push` publica `26.9.0` e `26.9`, `promover-stable` aponta `stable`, `imagens-ok` `success`.

Run: `gh api 'users/lussandro/packages?package_type=container' --jq '.[].name'`
Expected: `deskcommcrm`, `deskcomm-worker`, `deskcomm-scheduler` (visibilidade privada).

---

### Task 2: Base da VPS

**Files:** Create `evidence/bacco-deploy/02-base-vps.md`

- [ ] **Step 1: Pacotes e Docker**

```bash
ssh root@2.25.222.110 'set -e
dnf --version | head -1
dnf install -y git curl openssl jq dnf-plugins-core
dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo \
  || dnf config-manager addrepo --from-repofile=https://download.docker.com/linux/centos/docker-ce.repo
dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
docker --version; docker compose version
ip -4 addr show docker0 | grep inet'
```
Expected: Docker e Compose v2 instalados; `docker0` com `inet 172.17.0.1/16`. **Se o endereço do `docker0` for outro, use-o no lugar de `172.17.0.1` em todas as tarefas seguintes.**

- [ ] **Step 2: Swap de 4 GB**

```bash
ssh root@2.25.222.110 'set -e
[ -f /swapfile ] || { fallocate -l 4G /swapfile; chmod 600 /swapfile; mkswap /swapfile; }
swapon /swapfile 2>/dev/null || true
grep -q "^/swapfile " /etc/fstab || echo "/swapfile none swap sw 0 0" >> /etc/fstab
swapon --show; free -h | sed -n 3p'
```
Expected: `/swapfile` 4G ativo.

- [ ] **Step 3: Nginx e certbot**

```bash
ssh root@2.25.222.110 'set -e
dnf install -y nginx
dnf install -y epel-release
dnf install -y certbot python3-certbot-nginx
systemctl enable --now nginx
nginx -v; certbot --version'
```
Expected: nginx 1.26.x e certbot instalados. **Se `certbot` não existir no EPEL 10: pare e reporte o erro exato ao dono** — não trocar por outro cliente ACME sem decisão dele.

- [ ] **Step 4: Rede do proxy com sub-rede fixa**

```bash
ssh root@2.25.222.110 'docker network inspect bacco_proxy >/dev/null 2>&1 || docker network create --subnet 172.30.0.0/24 bacco_proxy; docker network inspect bacco_proxy --format "{{(index .IPAM.Config 0).Subnet}}"'
```
Expected: `172.30.0.0/24`. O app receberá `172.30.0.3` (Task 6).

- [ ] **Step 5: Registrar** versões e saídas em `evidence/bacco-deploy/02-base-vps.md`.

---

### Task 3: Supabase próprio (Postgres 15, sem porta pública)

**Files (na VPS):** `/opt/supabase/docker/.env`, `/opt/supabase/docker/docker-compose.bacco.yml`
**Files (repo):** Create `evidence/bacco-deploy/03-supabase.md`

**Interfaces:**
- Produces: gateway em `127.0.0.1:8000`; Supavisor em `172.17.0.1:5432` (sessão) e `172.17.0.1:6543` (transação); `ANON_KEY`, `SERVICE_ROLE_KEY`, `POSTGRES_PASSWORD`, `POOLER_TENANT_ID=bacco-adega` — lidos por Task 6.

- [ ] **Step 1: Código do compose oficial fixado**

```bash
ssh root@2.25.222.110 'set -e
mkdir -p /opt && cd /opt
[ -d supabase ] || git clone --filter=blob:none --sparse https://github.com/supabase/supabase.git supabase
cd supabase && git sparse-checkout set docker && git checkout b824acd
cd docker && [ -f .env ] || cp .env.example .env
ls docker-compose.yml docker-compose.pg15.yml utils/generate-keys.sh'
```
Expected: os três arquivos existem.

- [ ] **Step 2: Segredos**

```bash
ssh root@2.25.222.110 'set -e; cd /opt/supabase/docker
set_env() { grep -q "^$1=" .env && sed -i "s|^$1=.*|$1=$2|" .env || echo "$1=$2" >> .env; }
chaves="$(sh utils/generate-keys.sh)"
for k in JWT_SECRET ANON_KEY SERVICE_ROLE_KEY; do set_env "$k" "$(printf "%s\n" "$chaves" | grep "^$k=" | cut -d= -f2-)"; done
set_env POSTGRES_PASSWORD "$(openssl rand -hex 24)"
set_env SECRET_KEY_BASE "$(openssl rand -base64 48 | tr -d "\n")"
set_env VAULT_ENC_KEY "$(openssl rand -hex 16)"
set_env PG_META_CRYPTO_KEY "$(openssl rand -hex 16)"
set_env DASHBOARD_PASSWORD "$(openssl rand -hex 16)"
set_env POOLER_TENANT_ID bacco-adega
chmod 600 .env
for k in JWT_SECRET ANON_KEY SERVICE_ROLE_KEY POSTGRES_PASSWORD SECRET_KEY_BASE VAULT_ENC_KEY PG_META_CRYPTO_KEY DASHBOARD_PASSWORD; do
  v="$(grep "^$k=" .env | cut -d= -f2-)"; [ -n "$v" ] && echo "$k ok (${#v} chars)" || echo "$k VAZIO"
done'
```
Expected: todas `ok`. Imprime só o tamanho, nunca o valor. Se `generate-keys.sh` pedir interação ou não imprimir as três chaves: pare e registre a saída (sem valores).

- [ ] **Step 3: URLs, Auth e SMTP**

```bash
ssh root@2.25.222.110 'set -e; cd /opt/supabase/docker
set_env() { grep -q "^$1=" .env && sed -i "s|^$1=.*|$1=$2|" .env || echo "$1=$2" >> .env; }
set_env SUPABASE_PUBLIC_URL https://api-adega.baccosistemas.com.br
set_env API_EXTERNAL_URL https://api-adega.baccosistemas.com.br/auth/v1
set_env SITE_URL https://adega-crm.baccosistemas.com.br
set_env ADDITIONAL_REDIRECT_URLS https://adega-crm.baccosistemas.com.br/auth/confirm
set_env DISABLE_SIGNUP false
set_env ENABLE_EMAIL_SIGNUP true
set_env ENABLE_EMAIL_AUTOCONFIRM false
set_env ENABLE_ANONYMOUS_USERS false
set_env ENABLE_PHONE_SIGNUP false'
```

SMTP (pendência do dono): com os dados em mãos, o **dono** roda na VPS, digitando os valores:

```bash
cd /opt/supabase/docker
for k in SMTP_ADMIN_EMAIL SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS SMTP_SENDER_NAME; do
  read -r -p "$k: " v; sed -i "s|^$k=.*|$k=$v|" .env
done
```

Sem SMTP o stack sobe, mas convite e recuperação de senha não são entregues — registrar como pendência aberta na evidência.

- [ ] **Step 4: Override Bacco (portas, Postgres 15, templates de e-mail)**

```bash
ssh root@2.25.222.110 'cat > /opt/supabase/docker/docker-compose.bacco.yml <<"YML"
# Bacco Adega CRM — nada de porta pública. Nginx do host fala com 127.0.0.1:8000;
# o kit e o CRM falam com o Supavisor pelo gateway do docker0 (não roteável da internet).
services:
  api-gw:
    ports: !override
      - "127.0.0.1:8000:8000/tcp"
  supavisor:
    ports: !override
      - "172.17.0.1:5432:5432"
      - "172.17.0.1:6543:6543"
  auth:
    environment:
      GOTRUE_MAILER_TEMPLATES_CONFIRMATION: https://adega-crm.baccosistemas.com.br/email-templates/confirmation
      GOTRUE_MAILER_TEMPLATES_RECOVERY: https://adega-crm.baccosistemas.com.br/email-templates/recovery
      GOTRUE_MAILER_SUBJECTS_CONFIRMATION: "Confirme seu e-mail"
      GOTRUE_MAILER_SUBJECTS_RECOVERY: "Redefinir sua senha"
YML
cd /opt/supabase/docker
docker compose -f docker-compose.yml -f docker-compose.pg15.yml -f docker-compose.bacco.yml config --format json \
  | jq -r ".services[\"api-gw\"].ports, .services.supavisor.ports, .services.db.image"'
```
Expected: `api-gw` só `127.0.0.1:8000`, `supavisor` só `172.17.0.1:5432/6543`, `db.image` `supabase/postgres:15.8.1.085`. Se o `jq` mostrar `0.0.0.0` ou `host_ip` vazio em alguma porta, **não subir**. (Os subjects vão sem marca: o nome do produto muda no Plano 1; o corpo do e-mail já sai com a marca resolvida pelo app, spec `docs/deploy-selfhost/README.md:195-212`.)

- [ ] **Step 5: Subir e medir**

```bash
ssh root@2.25.222.110 'set -e; cd /opt/supabase/docker
C="docker compose -f docker-compose.yml -f docker-compose.pg15.yml -f docker-compose.bacco.yml"
$C pull
$C up -d
sleep 60
$C ps --format "table {{.Service}}\t{{.Status}}"
ss -tlnp | awk "NR>1{print \$4}" | sort -u
curl -s -o /dev/null -w "auth health %{http_code}\n" -H "apikey: $(grep ^ANON_KEY= .env | cut -d= -f2-)" http://127.0.0.1:8000/auth/v1/health
docker stats --no-stream --format "{{.Name}} {{.MemUsage}}"'
```
Expected: serviços `healthy`/`running`; portas em escuta só `22`, `9090`, `127.0.0.1:8000`, `172.17.0.1:5432`, `172.17.0.1:6543` (e 80 do Nginx); `auth health 200`. Registrar memória por contêiner em `evidence/bacco-deploy/03-supabase.md`.

- [ ] **Step 6: Extensões, schema `storage` e role do worker**

```bash
ssh root@2.25.222.110 'set -e; cd /opt/supabase/docker
PW="$(grep ^POSTGRES_PASSWORD= .env | cut -d= -f2-)"
WPW="$(openssl rand -hex 24)"; umask 077; echo "$WPW" > /root/.agent_worker_pw
docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<SQL
create extension if not exists vector with schema public;
create extension if not exists citext with schema public;
create extension if not exists pg_trgm with schema public;
select exists(select 1 from information_schema.schemata where schema_name = '"'"'storage'"'"') as tem_storage;
do \$\$ begin
  if not exists (select 1 from pg_roles where rolname = '"'"'agent_worker'"'"') then
    execute format('"'"'create role agent_worker login password %L bypassrls'"'"', '"'"'$WPW'"'"');
  end if;
end \$\$;
SQL
docker run --rm postgres:17-alpine psql "postgresql://postgres.bacco-adega:${PW}@172.17.0.1:5432/postgres" -tAc "select 1"
docker run --rm postgres:17-alpine psql "postgresql://agent_worker.bacco-adega:${WPW}@172.17.0.1:5432/postgres" -tAc "select current_user"'
```
Expected: `tem_storage = t`; o primeiro `psql` devolve `1` e o segundo `agent_worker`. Isso prova o caminho que o kit usa (`docker run ... postgres:17-alpine psql`, `install.sh:291-341`). **Se falhar** (usuário de pooler, rede bridge→`docker0`): registrar o erro exato e parar — não publicar 5432 em `0.0.0.0` para contornar.

---

### Task 4: Nginx com TLS para os dois domínios

**Files (na VPS):** `/etc/nginx/conf.d/bacco-adega.conf`
**Files (repo):** Create `deploy/nginx/bacco-adega.conf` (cópia versionada), `evidence/bacco-deploy/04-nginx.md`

- [ ] **Step 1: Configuração versionada**

Create `deploy/nginx/bacco-adega.conf`:

```nginx
# Bacco Adega CRM — Nginx do host. TLS por certbot (--nginx).
# App: rede Docker externa bacco_proxy, IP fixo do compose (docker-compose.npm.yml).
# API: gateway do Supabase só em 127.0.0.1:8000. Studio NÃO é exposto.

map $http_upgrade $connection_upgrade {
    default upgrade;
    ""      close;
}

server {
    listen 80;
    server_name adega-crm.baccosistemas.com.br;

    client_max_body_size 50m;

    # Paridade com o Caddyfile do kit: o webhook global do WAHA não é público.
    location = /api/v1/webhooks/waha { return 403; }

    location /api/internal/agents/run {
        proxy_pass http://172.30.0.3:3000;
        proxy_read_timeout 320s;
        proxy_send_timeout 320s;
        include /etc/nginx/bacco-proxy-headers.conf;
    }

    location / {
        proxy_pass http://172.30.0.3:3000;
        include /etc/nginx/bacco-proxy-headers.conf;
    }
}

server {
    listen 80;
    server_name api-adega.baccosistemas.com.br;

    client_max_body_size 50m;

    # Só as APIs que o CRM e o navegador usam. Studio e o resto: 404.
    location ~ ^/(auth|rest|realtime|storage|functions|graphql)/v1/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_read_timeout 120s;
        include /etc/nginx/bacco-proxy-headers.conf;
    }

    location / { return 404; }
}
```

Create também, no mesmo diretório, `deploy/nginx/bacco-proxy-headers.conf`:

```nginx
proxy_http_version 1.1;
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection $connection_upgrade;
```

- [ ] **Step 2: Instalar na VPS e validar sintaxe**

```bash
scp deploy/nginx/bacco-adega.conf root@2.25.222.110:/etc/nginx/conf.d/bacco-adega.conf
scp deploy/nginx/bacco-proxy-headers.conf root@2.25.222.110:/etc/nginx/bacco-proxy-headers.conf
ssh root@2.25.222.110 'nginx -t && systemctl reload nginx'
```
Expected: `syntax is ok` / `test is successful`.

- [ ] **Step 3: Certificados**

O e-mail ACME é do dono; ele roda, digitando o e-mail:

```bash
ssh -t root@2.25.222.110 'read -r -p "E-mail para o Let'"'"'s Encrypt: " M; certbot --nginx --non-interactive --agree-tos -m "$M" --redirect -d adega-crm.baccosistemas.com.br -d api-adega.baccosistemas.com.br'
```
Expected: certificado emitido para os dois nomes, redirect 80→443 inserido pelo certbot. Registro A precisa continuar DNS-only (proxy laranja da Cloudflare quebra o desafio HTTP).

- [ ] **Step 4: Medir**

```bash
curl -s -o /dev/null -w "api auth health %{http_code}\n" https://api-adega.baccosistemas.com.br/auth/v1/health
curl -s -o /dev/null -w "api raiz (studio) %{http_code}\n" https://api-adega.baccosistemas.com.br/
curl -s -o /dev/null -w "app (ainda sem CRM) %{http_code}\n" https://adega-crm.baccosistemas.com.br/
ssh root@2.25.222.110 'systemctl list-timers | grep -i certbot || echo "sem timer de renovação"'
```
Expected: `auth health` 401 ou 200 (401 = chegou no GoTrue pedindo `apikey`); raiz `404`; app `502` (CRM ainda não subiu); timer de renovação do certbot presente (se ausente, habilitar `systemctl enable --now certbot-renew.timer` e registrar).

- [ ] **Step 5: Commit**

```bash
git add deploy/nginx evidence/bacco-deploy/02-base-vps.md evidence/bacco-deploy/03-supabase.md evidence/bacco-deploy/04-nginx.md
git commit -m "ops(bacco): Nginx do host para app e API do Supabase, Supabase pg15 sem porta pública

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Credenciais só-leitura da VPS

- [ ] **Step 1: Deploy key**

```bash
ssh root@2.25.222.110 'test -f /root/.ssh/bacco_deploy || ssh-keygen -t ed25519 -N "" -C "vps-bacco-adega-deploy" -f /root/.ssh/bacco_deploy >/dev/null; cat /root/.ssh/bacco_deploy.pub' > /tmp/claude-1000/-home-lussandro-Bacco-Crm/a6337255-8451-4cc2-b075-9903d245160c/scratchpad/bacco_deploy.pub
gh repo deploy-key add /tmp/claude-1000/-home-lussandro-Bacco-Crm/a6337255-8451-4cc2-b075-9903d245160c/scratchpad/bacco_deploy.pub -R lussandro/bacco-adega-crm --title "vps-2.25.222.110 (read-only)"
gh repo deploy-key list -R lussandro/bacco-adega-crm
```
Expected: chave listada com `read-only` (sem `--allow-write`).

- [ ] **Step 2: Alias SSH do GitHub na VPS**

```bash
ssh root@2.25.222.110 'set -e
grep -q "^Host github-bacco" /root/.ssh/config 2>/dev/null || cat >> /root/.ssh/config <<CFG
Host github-bacco
  HostName github.com
  User git
  IdentityFile /root/.ssh/bacco_deploy
  IdentitiesOnly yes
CFG
chmod 600 /root/.ssh/config
ssh -o StrictHostKeyChecking=accept-new -T github-bacco 2>&1 | head -1
git ls-remote --tags git@github-bacco:lussandro/bacco-adega-crm.git "v26.9.0"'
```
Expected: "successfully authenticated" e a linha da tag `v26.9.0`.

- [ ] **Step 3: Login no GHCR (o dono digita o token)**

O dono cria em github.com → Settings → Developer settings → Tokens (classic) um token com **apenas** `read:packages`, e roda no terminal dele:

```bash
ssh -t root@2.25.222.110 'docker login ghcr.io -u lussandro'
```
(cola o token quando pedir a senha). Depois:

```bash
ssh root@2.25.222.110 'docker pull ghcr.io/lussandro/deskcommcrm:26.9.0 >/dev/null && echo pull-ok'
```
Expected: `pull-ok`.

---

### Task 6: Instalar o CRM pelo kit (modo proxy externo)

**Files (na VPS):** `/opt/bacco-adega-crm/.env`

- [ ] **Step 1: Clonar a tag**

```bash
ssh root@2.25.222.110 'set -e
[ -d /opt/bacco-adega-crm ] || git clone git@github-bacco:lussandro/bacco-adega-crm.git /opt/bacco-adega-crm
cd /opt/bacco-adega-crm && git fetch --tags origin && git checkout v26.9.0 && git describe --tags'
```
Expected: `v26.9.0`.

- [ ] **Step 2: `.env` não interativo**

```bash
ssh -t root@2.25.222.110 'set -e; cd /opt/bacco-adega-crm
[ -f .env ] || cp .env.hostgator.example .env
set_env() { grep -q "^#\?$1=" .env && sed -i "s|^#\?$1=.*|$1=$2|" .env || echo "$1=$2" >> .env; }
SB=/opt/supabase/docker/.env; g() { grep "^$1=" "$SB" | cut -d= -f2-; }
set_env DOMAIN adega-crm.baccosistemas.com.br
set_env NEXT_PUBLIC_APP_URL https://adega-crm.baccosistemas.com.br
set_env REVERSE_PROXY npm
set_env PROXY_NETWORK_NAME bacco_proxy
set_env PROXY_NETWORK_APP_IP 172.30.0.3
set_env APP_IMAGE ghcr.io/lussandro/deskcommcrm:26.9.0
set_env WORKER_IMAGE ghcr.io/lussandro/deskcomm-worker:26.9.0
set_env SCHEDULER_IMAGE ghcr.io/lussandro/deskcomm-scheduler:26.9.0
set_env NEXT_PUBLIC_SUPABASE_URL https://api-adega.baccosistemas.com.br
set_env NEXT_PUBLIC_SUPABASE_ANON_KEY "$(g ANON_KEY)"
set_env SUPABASE_SERVICE_ROLE_KEY "$(g SERVICE_ROLE_KEY)"
set_env SUPABASE_DB_URL "postgresql://agent_worker.bacco-adega:$(cat /root/.agent_worker_pw)@172.17.0.1:5432/postgres"
read -r -p "E-mail do primeiro admin: " OE; set_env OWNER_EMAIL "$OE"
read -r -s -p "Senha do primeiro admin: " OP; echo; set_env OWNER_PASSWORD "$OP"
chmod 600 .env
grep -cE "^(DOMAIN|REVERSE_PROXY|PROXY_NETWORK_NAME|PROXY_NETWORK_APP_IP|APP_IMAGE|NEXT_PUBLIC_SUPABASE_URL|SUPABASE_DB_URL|OWNER_EMAIL)=." .env'
```
Expected: `8`. `APP_NAME`, `APP_ACCENT_HEX` e `APP_LOGO_URL` ficam vazios (spec §4.5). Chave de IA e Resend ficam para depois (opcionais no boot).

- [ ] **Step 3: Rodar o instalador com a conexão do dono só na linha de comando**

```bash
ssh root@2.25.222.110 'cd /opt/bacco-adega-crm
PW="$(grep ^POSTGRES_PASSWORD= /opt/supabase/docker/.env | cut -d= -f2-)"
REPO_URL=git@github-bacco:lussandro/bacco-adega-crm.git \
SUPABASE_DB_ADMIN_URL="postgresql://postgres.bacco-adega:${PW}@172.17.0.1:5432/postgres" \
bash hostgator-setup-kit/install.sh --yes 2>&1 | tee /root/bacco-install.log | tail -60'
```
Expected: passos até "Aguardando o app ficar saudável" e "Ativando as automações" sem `die`. **Em qualquer `die`**: copiar a mensagem exata para `evidence/bacco-deploy/06-install.md` e parar. Não editar o kit na VPS.

- [ ] **Step 4: Permissões do worker (tabelas existentes e futuras)**

O baseline cria as tabelas como `postgres`; migrations futuras também. Por isso o grant cobre o que existe **e** o que vier:

```bash
ssh root@2.25.222.110 'cd /opt/supabase/docker && docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<"SQL"
grant usage on schema public to agent_worker;
grant select, insert, update, delete on all tables in schema public to agent_worker;
grant usage, select on all sequences in schema public to agent_worker;
grant execute on all functions in schema public to agent_worker;
alter default privileges for role postgres in schema public grant select, insert, update, delete on tables to agent_worker;
alter default privileges for role postgres in schema public grant usage, select on sequences to agent_worker;
alter default privileges for role postgres in schema public grant execute on functions to agent_worker;
SQL
cd /opt/bacco-adega-crm && docker compose -f docker-compose.prod.yml -f docker-compose.npm.yml restart worker scheduler'
```
Expected: `GRANT`/`ALTER DEFAULT PRIVILEGES` sem erro; worker reinicia.

- [ ] **Step 5: Estado dos contêineres**

```bash
ssh root@2.25.222.110 'cd /opt/bacco-adega-crm
docker compose -f docker-compose.prod.yml -f docker-compose.npm.yml ps --format "table {{.Service}}\t{{.Status}}"
docker inspect -f "{{range \$k,\$v := .NetworkSettings.Networks}}{{\$k}}={{\$v.IPAddress}} {{end}}" $(docker compose -f docker-compose.prod.yml -f docker-compose.npm.yml ps -q app)
docker stats --no-stream --format "{{.Name}} {{.MemUsage}}"
free -h | sed -n 2,3p
ss -tlnp | awk "NR>1{print \$4}" | sort -u'
```
Expected: `app` healthy com `bacco_proxy=172.30.0.3`; `worker`, `waha`, `srh`, `redis`, `scheduler` up; nenhum `caddy`; nenhuma porta nova em `0.0.0.0`. Registrar memória total (CRM + Supabase) em `evidence/bacco-deploy/06-install.md`.

---

### Task 7: Verificação a quente

**Files:** Create `evidence/bacco-deploy/07-verificacao.md`

- [ ] **Step 1: Saúde pelo domínio**

```bash
curl -s https://adega-crm.baccosistemas.com.br/api/v1/health | jq .
curl -s -o /dev/null -w "icon %{http_code} %{content_type}\n" https://adega-crm.baccosistemas.com.br/icon
curl -s -o /dev/null -w "waha global %{http_code}\n" -X POST https://adega-crm.baccosistemas.com.br/api/v1/webhooks/waha
```
Expected: health com status ok; `icon 200 image/png`; `waha global 403`.

- [ ] **Step 2: Superfície pública**

```bash
for p in 5432 6543 8000 3000 9090; do timeout 5 bash -c "</dev/tcp/2.25.222.110/$p" 2>/dev/null && echo "$p ABERTA" || echo "$p fechada"; done
```
Expected: `5432`, `6543`, `8000`, `3000` fechadas. `9090` (Cockpit do CentOS) aberta é pré-existente: registrar e perguntar ao dono se desliga (`systemctl disable --now cockpit.socket`) — não desligar sem ok.

- [ ] **Step 3: Login e onboarding** — o dono entra em `https://adega-crm.baccosistemas.com.br/login` com o admin da Task 6 e percorre o onboarding. Registrar o que aconteceu em cada passo (incluindo erros, com o texto exato).

- [ ] **Step 4: WhatsApp de ponta a ponta** — o dono conecta um número pela tela (QR do WAHA) e manda uma mensagem de outro celular. Conferir: conversa aparece na inbox **sem recarregar a página** (Realtime pelo `api-adega`), contato criado, mídia (uma foto) abre (Storage `whatsapp-media`).

```bash
ssh root@2.25.222.110 'cd /opt/bacco-adega-crm && docker compose -f docker-compose.prod.yml -f docker-compose.npm.yml logs --since 10m app worker waha 2>&1 | grep -iE "error|fatal|unhandled" | tail -30'
```
Expected: sem erro relacionado ao fluxo; qualquer linha encontrada vai para a evidência com o texto exato.

- [ ] **Step 5: Atualização idempotente** — reaplicar a mesma versão prova o caminho do `update.sh` (baseline, pull, up) sem mudar nada:

```bash
ssh root@2.25.222.110 'cd /opt/bacco-adega-crm && PW="$(grep ^POSTGRES_PASSWORD= /opt/supabase/docker/.env | cut -d= -f2-)" && SUPABASE_DB_ADMIN_URL="postgresql://postgres.bacco-adega:${PW}@172.17.0.1:5432/postgres" bash hostgator-setup-kit/update.sh --to v26.9.0 --force 2>&1 | tail -30'
```
Expected: termina com o app saudável. Se exigir flag diferente, ler `update.sh:89-105` e registrar.

- [ ] **Step 6: Commit da evidência e push**

```bash
git add evidence/bacco-deploy
git commit -m "ops(bacco): fork no ar na VPS — evidência da verificação a quente

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push --no-tags origin bacco:main
```

---

### Task 8: Runbook durável

**Files:** Create `/home/lussandro/Obsidian/Vault/projetos/bacco-adega-crm/runbooks/deploy-vps.md`; Modify `/home/lussandro/Obsidian/Vault/projetos/bacco-adega-crm/CLAUDE.md` (tabela lazy-load)

- [ ] **Step 1:** Escrever o runbook só com o que foi **medido** nas Tasks 2–7: caminhos (`/opt/supabase/docker`, `/opt/bacco-adega-crm`), comando compose de cada stack, rede `bacco_proxy` e IP, binds de porta, onde ficam segredos (`.env` 600, `/root/.agent_worker_pw`), como atualizar (tag nova → `update.sh`), como renovar TLS, memória medida, e cada erro encontrado com a correção. Sem log de sessão, sem checkbox.

- [ ] **Step 2:** Link no `CLAUDE.md` do projeto no vault. (O hook do vault faz commit/push; não commitar à mão.)

---

## Fora deste plano

- Rebrand (Plano 1), maioridade (Plano 2), enforcement da suspensão (Plano 3).
- Backup do volume do Postgres/Storage do Supabase: runbook próprio depois de medir tamanho real.
- Agente de atualização automática (`agent.sh`, cron de 5 min): o kit instala; decidir com o dono se atualiza sozinho para toda tag nova ou só manual.
- Cockpit (`9090`): decisão do dono.
