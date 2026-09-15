# Verificação a quente — 2026-09-15

Plano 4, Task 7.

## Step 1 — saúde pelo domínio público

```
GET https://adega-crm.baccosistemas.com.br/api/v1/health → 200
{"data":{"status":"healthy","version":"26.9.0","timestamp":"2026-09-15T16:19:01.544Z",
 "checks":{"supabase":{"status":"ok","latency_ms":88},"redis":{"status":"ok","latency_ms":89},"waha":{"status":"ok","latency_ms":88}}}}
GET /login → 200
GET / → 307 → https://adega-crm.baccosistemas.com.br/app
GET /icon → 200 image/png
POST /api/v1/webhooks/waha → 403
```

## Step 2 — superfície pública (conexão TCP de fora)

```
porta 5432 fechada
porta 6543 fechada
porta 8000 fechada
porta 3000 fechada
porta 9090 ABERTA   (cockpit.socket do CentOS, pré-existente)
```

Decisão do dono: desligar o Cockpit.

```
$ systemctl disable --now cockpit.socket
Removed '/etc/systemd/system/sockets.target.wants/cockpit.socket'.
cockpit.socket: inactive / enabled: disabled
portas em escuta: 0.0.0.0:22 0.0.0.0:443 0.0.0.0:80 127.0.0.1:8000 172.17.0.1:5432 172.17.0.1:6543 [::]:22 [::]:80
de fora: porta 9090 fechada
```

Superfície pública final: 22 (SSH), 80 e 443 (Nginx).

## Step 3 — login e onboarding

Dono entrou com o admin criado no install e concluiu o onboarding (relato do dono, 2026-09-15: "feito e conectado"). Telemetria e Cockpit desligados antes do login (ver acima e `evidence/bacco-deploy/06-install.md`).

## Step 4 — WhatsApp

Conexão pelo QR feita pelo dono. Medido no banco logo depois:

```
channel_sessions | waha | WORKING | 1
organizations    | 1
conversations    | 0
contacts         | 0
```

Sessão conectada. **Mensagem de ponta a ponta ainda não provada**: nenhuma conversa nem contato no banco — falta enviar mensagem + foto de outro número e conferir inbox sem recarregar, contato criado e mídia abrindo (Storage).

## Steps 5–7

Pendentes: Step 4 (mensagem ponta a ponta); atualização idempotente (`update.sh --to v26.9.0 --force`); reboot e nova medição dos binds/serviços.
