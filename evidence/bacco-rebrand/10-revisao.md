# Prova em tela do rebrand na VPS — 2026-09-15

Plano 1 v2.1, Task 10. Produção `https://adega-crm.baccosistemas.com.br`, versão `26.9.1`.

## Atualização

`update.sh --to v26.9.1` → `exit=0`, "app no ar e saudável". Depois:

```
v26.9.1
APP_IMAGE=ghcr.io/lussandro/deskcommcrm:26.9.1
WORKER_IMAGE=ghcr.io/lussandro/deskcomm-worker:26.9.1
SCHEDULER_IMAGE=ghcr.io/lussandro/deskcomm-scheduler:26.9.1
{"data":{"status":"healthy","version":"26.9.1",...}}
icon 200 image/png
[telemetria] Desligada (SENTRY_DSN=off) — nenhum erro é enviado.
```

## Marca gravada no banco (autorizado pelo dono)

O `install.sh` antigo gravou o padrão `APP_NAME="DeskcommCRM"` e o banco foi semeado com ele; o banco
vence o `.env`, então a tela seguiria "DeskcommCRM" e sem o símbolo.

```
antes:  DeskcommCRM|||t|2026-09-15 16:19:02.570831+00
update public.platform_branding set app_name = 'Bacco Adega CRM', updated_at = now() where id = 1
depois: Bacco Adega CRM|||t|2026-09-15 18:13:28.55679+00
.env:   APP_NAME="Bacco Adega CRM"   (cópia anterior em /root/.env.bacco.antes-marca)
app recriado com os dois compose → healthy; domínio 307; <title>Entrar · Bacco Adega CRM</title>
```

## Conta QA

Cadastro pela tela (`tests/e2e/bacco-qa-cadastro.spec.ts`, 1 passed) com `chatcoreapi@gmail.com`, organização
"Vinícola Serra Alta (QA)". Confirmação pela mesma rota do e-mail:
`/auth/confirm?type=signup&token_hash=<auth.users.confirmation_token>` → `307 → /onboarding/welcome`;
`email_confirmed_at` preenchido; `user_organizations`: organização `7326ddce-8840-4e4f-92ca-5be9a9190a95`,
papel `admin`. Senha só em `/root/.bacco_qa` (600) na VPS.

## Medidas (`tests/e2e/bacco-evidencia.spec.ts`, 1 passed na terceira rodada)

`getComputedStyle` em cada tela e tema, gravado em `evidence/bacco-rebrand/medidas.jsonl` (rodadas anteriores
em `medidas-rodada1.jsonl` e `medidas-rodada2.jsonl`):

| Tela | Accent claro | Accent escuro | Corpo | Título |
|---|---|---|---|---|
| login | `rgb(74, 14, 31)` | `rgb(185, 130, 139)` | Inter | Playfair Display |
| onboarding welcome / funil / done | idem | idem | Inter | Playfair Display |
| inbox, catálogo, funis, kanban | idem | idem | Inter | Inter (sem Playfair) |

Funil do onboarding: sem chave de IA, caiu no pacote "Vender para restaurantes, empórios e distribuidores" com
o quadro "Clientes da vinícola" (texto do onboarding: "Vendemos vinho para restaurantes e empórios").
Detalhe do lead: o card do quadro não linka para `/app/leads/` (medido) — não fotografado.

Defeitos da spec corrigidos entre rodadas (não do produto): medir o `h1` do layout em vez do título do passo;
tomar `/onboarding` (redirecionador) como fim do onboarding; esperar redirect de `/app/kanban`, que é a lista
de funis; procurar o nome do quadro como texto quando ele está num `<input>`.

## Imagens

| Imagem | O que foi visto |
|---|---|
| `evidence/bacco-rebrand/10-icon.png` | Favicon: B com folha e uvas em ouro. |
| `evidence/bacco-rebrand/10-signup-light.png` | Cadastro com a marca Bacco. |
| `evidence/bacco-rebrand/10-signup-enviado-light.png` | "Confirme seu e-mail" depois do envio. |
| `evidence/bacco-rebrand/10-login-light.png` | Logotipo Bacco, "Entrar" em Playfair, botão borgonha. |
| `evidence/bacco-rebrand/10-login-dark.png` | Logotipo creme/ouro, botão rosé (grau 300) com texto escuro legível. |
| `evidence/bacco-rebrand/10-onboarding-welcome-light.png` | "Boas-vindas ao Bacco Adega CRM" em Playfair; ajuda e placeholder de vinícola. |
| `evidence/bacco-rebrand/10-onboarding-welcome-dark.png` | Idem no escuro. Card de status diz "Funil de vendas criado: Pedidos" (funil semeado pelo gatilho do upstream, antes do passo do funil). |
| `evidence/bacco-rebrand/10-onboarding-funil-light.png` | Pacote "Clientes da vinícola" com as 7 etapas de vinícola; aviso de que a IA não está no ar. |
| `evidence/bacco-rebrand/10-onboarding-funil-dark.png` | Idem no escuro; "Usar este quadro" em rosé. |
| `evidence/bacco-rebrand/10-onboarding-done-light.png` | "Tudo pronto!" em Playfair; "Começar a usar" borgonha. |
| `evidence/bacco-rebrand/10-onboarding-done-dark.png` | Idem no escuro. |
| `evidence/bacco-rebrand/10-inbox-light.png` | Barra com logotipo Bacco; item ativo borgonha; versão 26.9.1. |
| `evidence/bacco-rebrand/10-inbox-dark.png` | Item ativo rosé; texto legível. |
| `evidence/bacco-rebrand/10-catalogo-light.png` | "Novo produto" borgonha; convenção "safra, uva e volume no nome". |
| `evidence/bacco-rebrand/10-catalogo-dark.png` | Idem no escuro. |
| `evidence/bacco-rebrand/10-funis-light.png` | Lista de funis com "Clientes da vinícola" padrão; item "Funis" ativo. |
| `evidence/bacco-rebrand/10-funis-dark.png` | Idem no escuro. |
| `evidence/bacco-rebrand/10-kanban-light.png` | Quadro "Clientes da vinícola" com o lead "Restaurante Serra — carta de vinhos" criado pela tela. |
| `evidence/bacco-rebrand/10-kanban-dark.png` | Idem no escuro; "Novo Lead" rosé. |

## Pendente do dono

- **Aprovar a paleta** (spec §4.2), sobretudo o escuro no grau 300 (alternativa medida: grau 200).
- Vão entre "Bacco" e "ADEGA CRM" no logotipo (ver `evidence/bacco-rebrand/03-revisao.md`).
- Organização QA na produção: fica até o dono decidir apagar.
- Supabase: conferir Site URL / Redirect URLs (aviso do `update.sh`) — sem isso o e-mail de confirmação real
  pode apontar para `localhost`.
