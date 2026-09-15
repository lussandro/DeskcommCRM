# Nginx e TLS — 2026-09-15

Plano 4, Task 4. Config versionada em `deploy/nginx/` (cópia do arquivo da VPS depois do certbot — só caminhos de certificado, nenhum material de chave).

## Instalação

```
$ nginx -t
nginx: [warn] conflicting server name "_" on 0.0.0.0:80, ignored
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

O aviso vem do `server_name _` do bloco padrão do EL10 colidindo com o nosso bloco `default_server` (o nome é ignorado; o `default_server` vale — ver medição "IP sem Host").

```
$ certbot --nginx --non-interactive --agree-tos -m <e-mail do dono> --redirect \
    -d adega-crm.baccosistemas.com.br -d api-adega.baccosistemas.com.br
Successfully deployed certificate for adega-crm.baccosistemas.com.br to /etc/nginx/conf.d/bacco-adega.conf
Successfully deployed certificate for api-adega.baccosistemas.com.br to /etc/nginx/conf.d/bacco-adega.conf
```

Renovação: `certbot-renew.timer` ativo (próxima execução 2026-09-16 11:22 UTC).
Portas em escuta depois: `*:9090 0.0.0.0:22 0.0.0.0:443 0.0.0.0:80 [::]:22 [::]:80`.

## Medição de fora (antes de Supabase e CRM subirem)

| Requisição | Esperado | Obtido |
|---|---|---|
| `https://api-adega…/` (Studio) | 404 | 404 |
| `https://api-adega…/pg/tables` (meta) | 404 | 404 |
| `https://api-adega…/auth/v1/health` | 502 (Supabase fora) | 502 |
| `https://adega-crm…/` | 502 (CRM fora) | 502 |
| `http://adega-crm…/` | 301 → https | 301 `https://adega-crm.baccosistemas.com.br/` |
| `http://2.25.222.110/` (sem Host) | sem resposta (444) | `000` |
| `https://2.25.222.110/` (sem SNI) | recusar | **502** — cai no primeiro bloco 443 (CRM) |

Pendência medida: acesso HTTPS por IP/SNI desconhecido chega ao bloco do CRM.

## Correção dos blocos padrão

Em `deploy/nginx/bacco-adega.conf`: `server_name ""` no `default_server` da porta 80 (o `_` colidia com o bloco padrão do EL10) e novo bloco `listen 443 ssl default_server` com `ssl_reject_handshake on`.

```
$ nginx -t
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

(sem o aviso de `conflicting server name`)

| Requisição | Obtido depois |
|---|---|
| `https://2.25.222.110/` (sem SNI) | `000` (handshake recusado) |
| `http://2.25.222.110/` (sem Host) | `000` (444) |
| `https://api-adega…/auth/v1/health` (Supabase no ar) | `401` (chega ao GoTrue, pede `apikey`) |
| `https://api-adega…/rest/v1/` | `401` |
| `https://api-adega…/` e `/pg/tables` | `404` |
| `https://adega-crm…/` | `502` (CRM ainda fora) |
| `http://adega-crm…/` | `301 https://adega-crm.baccosistemas.com.br/` |
