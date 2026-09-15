# Credenciais só-leitura da VPS — 2026-09-15

Plano 4, Task 5. Nenhum valor de segredo registrado aqui.

## Deploy key

Gerada na VPS (`/root/.ssh/bacco_deploy`, ed25519, comentário `vps-bacco-adega-deploy`). Este `gh` não tem `repo deploy-key`; cadastro pela API REST:

```
$ gh api -X POST repos/lussandro/bacco-adega-crm/keys -f title="vps-2.25.222.110 (read-only)" -f key=<pública> -F read_only=true
id=163380987 read_only=true title=vps-2.25.222.110 (read-only)
```

## Host key do GitHub conferida

```
fingerprint oficial (api.github.com/meta): SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU
fingerprint recebido (ssh-keyscan):         SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU
host key do github conferida
Hi lussandro/bacco-adega-crm! You've successfully authenticated, but GitHub does not provide shell access.
```

Alias `github-bacco` em `/root/.ssh/config` (600).

## Clone na VPS

```
$ git clone git@github-bacco:lussandro/bacco-adega-crm.git /opt/bacco-adega-crm
26bdf24a ci(bacco): teto do verify em 45 min no runner privado
origin  git@github-bacco:lussandro/bacco-adega-crm.git (fetch)
```

## Chave do Resend

Enviada de `~/bacco-controle/apps/api/.env` por pipe no SSH: `/root/.resend_key`, 36 chars, perm 600.

## `.env` do CRM (sem valores)

16 chaves gravadas por `printf` (DOMAIN, ACME_EMAIL, NEXT_PUBLIC_APP_URL, REVERSE_PROXY=npm, PROXY_NETWORK_NAME=bacco_proxy, PROXY_NETWORK_APP_IP=10.231.0.3, APP/WORKER/SCHEDULER_IMAGE `ghcr.io/lussandro/*:26.9.0`, NEXT_PUBLIC_SUPABASE_URL, ANON/SERVICE keys, SUPABASE_DB_URL do `agent_worker`, RESEND_API_KEY, RESEND_FROM_EMAIL, OWNER_EMAIL), uma linha cada, perm 600. `OWNER_PASSWORD` ausente até o install.

## GHCR

Login só-leitura pelo **device flow** do GitHub, rodado na própria VPS (o token nasce e fica lá; nunca impresso). `gh auth login` não serve: sempre soma `repo`, `read:org`, `gist`. Chamada direta a `POST https://github.com/login/device/code` com o client ID público do GitHub CLI e `scope=read:packages`; o dono autorizou em `github.com/login/device`.

Primeira tentativa (código `E2FB-17FE`) expirou sem autorização; segunda (código `B625-3AA9`, gerado 15:06:46 UTC) — o GitHub respondeu "couldn't find anything" na primeira digitação e aceitou na seguinte.

```
ESCOPOS=read:packages          # cabeçalho X-OAuth-Scopes de api.github.com
Login Succeeded
PULL_OK ghcr.io/lussandro/deskcommcrm:latest
$ jq -r ".auths | keys[]" /root/.docker/config.json
ghcr.io
$ docker images | grep ghcr.io/lussandro
ghcr.io/lussandro/deskcommcrm:latest 748MB
```

O token é recusado se o escopo vier diferente de exatamente `read:packages`.
