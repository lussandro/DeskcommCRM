# Spec — o CRM consulta um ERP externo por MCP

**Data:** 2026-09-18 · **Branch alvo:** `bacco` · **Migration:** 0263
**Objetivo:** `.superpowers/sdd/2026-09-18-mcp-cliente/objetivo.md`
**Medições:** `mcp-externo-medido.md` (contrato real do servidor, chamadas de produção) ·
`levantamento.md` (pontos de integração com arquivo:linha)
**Revisões que reescreveram esta spec:** `refutacao-spec.md` (25 achados, 5 bloqueantes) e o
Codex (5 críticos). A versão anterior — "as ferramentas do servidor entram no catálogo do
agente" — **foi descartada**, e a §11 diz por quê.

---

## 1. O problema, medido

O CRM **serve** MCP e não **consome** nenhum: zero `sdk/client` no repositório; o
`@modelcontextprotocol/sdk` só entra pelo lado servidor (`app/api/mcp/route.ts:14`).

A organização do dono atende dois negócios. O segundo (ChatCore, número 554899357781) tem ERP
próprio com 24 ferramentas MCP em produção — contrato, fatura, instância, QR, situação de
cobrança ao vivo. Os três agentes dela foram publicados e **não alcançam nada disso**: toda
pergunta de contrato, fatura ou instância vira ocorrência humana. A análise de 18 meses (3.069
mensagens) mostra que é aí que está o volume — 22 conversas de suporte, 10 de financeiro — e
que **11% das mensagens de cliente nunca tiveram resposta humana**.

## 2. O que esta spec entrega

**Cinco ferramentas locais de CONSULTA**, declaradas no catálogo como qualquer outra, que por
baixo perguntam ao ERP externo por MCP. O admin liga uma integração (URL + chave) e marca as
capacidades no agente, exatamente como já faz com as do Asaas.

**Fora de escopo, declarado:** escrever no ERP (nenhuma ferramenta de escrita no v1); expor as
24 ferramentas do servidor; mais de um servidor por organização; OAuth; `resources`/`prompts`
do protocolo; descoberta automática de ferramenta nova.

## 3. As cinco ferramentas

Nome, descrição e schema são **nossos**, escritos em código. O servidor não escreve nada que
chegue ao modelo sem passar por uma projeção que declaramos campo a campo.

| ferramenta local | pergunta ao ERP | responde a |
|---|---|---|
| `crm_erp_situacao_do_cliente` | `customer.status` | "estou em atraso?", "por que bloqueou?" |
| `crm_erp_faturas_do_cliente` | `invoice.list` | "quais faturas estão abertas?" |
| `crm_erp_fatura` | `invoice.list` + escolha pelo número | "detalhe e link da fatura X" |
| `crm_erp_contrato` | `customer.status` (prova de posse) + `contract.get` | "o que tem no meu contrato?" |
| `crm_erp_instancia` | `customer.status` + escolha pelo nome | "minha instância está bloqueada?" |

Todas `category: "read"`, `requiresScope: "mcp:read"`, e `requerIntegracao: "mcp:<método>"` —
a capacidade é **por consulta**, concedida só quando aquele método aparece no `catalogo` que o
último `tools/list` daquele cliente descobriu. `"mcp"` sozinho era grosso demais: a tela media
o catálogo e dizia "Não encontrada no servidor" enquanto o runtime montava a ferramenta assim
mesmo, para falhar na conversa — medir e ignorar a medição é pior que não medir. Catálogo
vazio (linha salva antes disso) degrada para conceder as cinco; fail-closed ali deixaria sem
ferramenta nenhuma quem já está no ar e nunca mudou nada.
Cinco vagas do teto de 25, **no pacote `reter`** — um pacote conta contra o teto mesmo para
quem não tem ERP, e em `atender` as cinco tornavam aquele pacote inatingível para toda
instalação.

**As três últimas exigem PROVA DE POSSE (D11).** `numero` e `nome` vêm do modelo e no ERP
medido são sequenciais (`CT-2026-00NN`) ou derivados do CNPJ (`inst<cnpj>`): a versão da
revisão adversarial devolvia contrato, itens e link de pagamento de OUTRO cliente. Hoje o
identificador só é atendido se aparecer numa consulta feita pelo DOCUMENTO DO CADASTRO — e é
por isso que `invoice.get` e `chatcore.instance.get` saíram: a consulta que prova já traz o
registro pedido dentro, e chamar o método específico depois seria uma segunda ida à rede
(com um nome de parâmetro que nunca foi medido) para receber o que já está na mão.

**As cinco NÃO são servidas pelo servidor MCP do próprio CRM.** O teto de 4 por turno é por
`requestId`, que no HTTP é um UUID por requisição: lá elas seriam um proxy sem limite para o
ERP do cliente, com a nossa chave. Ver `FERRAMENTAS_SO_DO_AGENTE` em `lib/mcp/tools/erp.ts`.

## 4. Decisões

### D1 — Ferramenta LOCAL que roteia, não ferramenta externa no catálogo

É a decisão estruturante, e ela existe porque a alternativa foi medida e reprovada (§11).
Consequências que vêm de graça: `tool_id` continua no catálogo compilado, então publicação,
server actions, `ToolPicker`, pacotes, escopo de funil, breaker e a rota do catálogo **não
mudam**; a descrição no prompt é nossa, então não há injeção pela `description` remota; o
schema é Zod nosso, então não é preciso converter JSON Schema.

### D2 — Só leitura no v1, e a lista é allowlist

As cinco ferramentas da §3 são as únicas que existem. **Tudo o mais do servidor é inalcançável
por construção** — não há denylist a manter, não há renomeação remota que escape, e as
destrutivas (`*.cancel`, `payment.settle_manual`, `chatcore.instance.delete`) nem entram na
conversa. Escrita no ERP, se um dia entrar, é spec nova com o gate de escopo correspondente.

*A revisão mostrou por que a polaridade importa:* a denylist da versão anterior deixava passar
`contract.suspend`, `contract.activate`, `chatcore.instance.block`, `invoice.create_standalone`,
`invoice.resend_email` e `customer.create` — todas medidas no servidor real.

### D3 — A resposta é PROJETADA, não repassada

Cada ferramenta devolve ao modelo um objeto que **nós montamos**, com os campos que o
atendimento precisa. O JSON do ERP (que vem dentro de uma string, `content[].text`) é
desembrulhado, validado por Zod nosso, e projetado.

`crm_erp_situacao_do_cliente` devolve: `em_atraso`, `faturas_vencidas` (quantidade),
`total_vencido_centavos`, `proxima_fatura` (data e valor), `instancias` (nome, bloqueada,
motivo). **Não devolve** `emailsRecentes`, e-mail, telefone, razão social nem ids internos.

*Isto resolve o vazamento que as duas revisões apontaram por caminhos diferentes:* o dado
sensível não chega ao prompt, não entra em `ai_agent_runs` e não entra no audit — porque nunca
sai da projeção. Redação depois do fato não protege o que já foi para o contexto do modelo.

O que a projeção descarta é registrado em log agregado (contagem, nunca conteúdo).

### D4 — Erro é `{ ok: false, error }`, não exceção e não `{ error }`

Timeout, 5xx, SSE malformado, JSON inválido, `isError: true` e `-32602` viram
`{ ok: false, error: "<texto em pt-BR>" }`. **`ok: false` é o que o breaker do engine entende
como falha** (`lib/agent-engine/agent/tool-breaker.ts:18-20`); a versão anterior usava
`{ error }`, que o breaker não conta.

Toda falha emite `logger.error` com `ferramenta`, `http_status` e `motivo` — nunca a URL
completa, nunca o cabeçalho, nunca o corpo.

### D5 — Orçamento de tempo, que hoje não existe

10 segundos por chamada (`AbortSignal.timeout`, igual ao cliente do Asaas) e **no máximo 4
chamadas ao ERP por turno**; a quinta devolve `{ ok:false, error:"limite de consultas neste
atendimento" }` sem sair para a rede. O loop do agente para por passo, token e custo, **nunca
por tempo de parede** (`lib/ai/runtime/agent.ts:503-538`).

### D6 — SSRF: os dois guards, a cada chamada, e o risco residual declarado

`assertSafeOutboundUrl` e `assertDestinoResolvidoSeguro` na ordem, mais `redirect: "manual"`,
como `call-webhook.ts:70-121`. Em produção, só `https`.

**Risco residual aceito e escrito:** entre a resolução e o `fetch` o DNS pode mudar
(`lib/automation/outbound-ip.ts:88-93` já declara essa janela). A consequência aqui é entregar
o Bearer a um destino interno. Mitigação do v1: a URL é cadastrada por um admin da própria
organização, o destino é fixo e o `redirect: "manual"` impede o salto. Fechar a janela exige
transporte com IP fixado, que é trabalho próprio e fica declarado como dívida.

### D7 — Configuração no molde do Asaas, sem segredo falso

`tenant_integrations` com `provider = 'mcp'`: chave cifrada em
`oauth_access_token_encrypted`, URL e catálogo descoberto em `store_metadata`, `status`
`connecting|healthy|error`, `status_reason`, `last_health_check_at`.

**A migration torna `webhook_secret_encrypted` nullable.** Hoje é `NOT NULL`
(`supabase/baseline.sql:1819`) e o Asaas fabrica um segredo de webhook que nunca usa
(`app/actions/integrations/asaas.ts:99-114`). Um provider sem webhook não deve inventar
segredo: `drop not null` é aditivo e não quebra quem já grava.

Papel: **admin**, com `notFound()` na página, como o Asaas — embora a RLS de
`tenant_integrations` permita manager escrever, a tela e a server action exigem admin.

### D8 — O que falha aparece na tela, sem duplicar o que já existe

Aviso na Central, kind `mcp_externo_falhou`, **um aberto por organização**, quando três
chamadas consecutivas falham; fecha quando uma volta a funcionar. O contador de consecutivas
vive em `store_metadata.falhas_consecutivas` da própria linha de integração.

**Precedência:** quando o motivo for capacidade ausente, quem avisa é o `capabilities_missing`
que já existe (`inbound-turn.ts:1563-1592`); `mcp_externo_falhou` é só para falha de
comunicação com o ERP. O kind novo exige os cinco pontos além da migration que a revisão
listou: `repository.ts`, `agent-inbox-copy.ts`, `inbox-destino.ts` (dois lugares) e o
vocabulário banco × TypeScript.

### D9 — Anti-morte ativo

O cron diário de reconciliação (o mesmo lugar onde o Asaas já se re-testa) chama `tools/list`
uma vez por dia por organização com integração `healthy` **ou `error`**, atualiza
`last_health_check_at` e, falhando, marca `status='error'` com motivo. Sem isso o D8 seria
passivo e o operador só descobriria pelo cliente reclamando.

**Confere as `error` também, e é isso que fecha o laço.** Olhando só as `healthy`, a
conferência era uma catraca: quem ela derrubava perdia as cinco ferramentas, logo nenhuma
consulta voltava a rodar, logo nada voltava a testar — uma queda de dois minutos às 6h
desligava a capacidade até alguém clicar "Testar conexão". Quando o servidor volta a
responder, a integração volta sozinha para `healthy` e o aviso da Central se retrata.
Integração `disconnected` (desligada por uma pessoa) fica fora: ninguém a religa pelas costas
— e é pela mesma razão que **"Testar conexão" não ativa nada**: `healthy` é decidido por quem
clicou em Ativar, e por mais nada. (A primeira versão dessa separação perguntava "a linha não
está `disconnected`?", que é verdade justamente em `connecting` e em `error`, os dois estados
em que se testa de verdade — o diagnóstico continuava ligando, só que escondido.)

**A varredura tem orçamento de 30s e a fila gira.** Ela pega carona no cron da reconciliação
do Asaas, o laço é sequencial e cada `tools/list` pode levar 10s: sem teto, três integrações
lentas fariam a COBRANÇA do cliente deixar de rodar — e num self-host comportamento instalado
é comportamento do produto. O que não coube fica para a próxima rodada (`adiadas`, com log), e
a ordem é por `last_health_check_at` para que a mesma ponta da fila não consuma o orçamento
todo dia.

### D10 — O que o servidor devolve é dado, e o mecanismo é a projeção

Não é frase de boa intenção: o texto livre do ERP não chega ao modelo porque **nenhuma das
cinco ferramentas devolve texto livre**. `support.docs`, que devolve documento inteiro, **fica
fora do v1** exatamente por isso.

**Campo TIPADO não é campo FECHADO, e esta linha já foi falsa.** A revisão adversarial provou
rodando que `instancias[].motivo` saía verbatim — com `"JOAO DA SILVA, CPF 123.456.789-09, tel
11999998888"` dentro —, e o mesmo valia para `status`, `ciclo`, `itens[].produto` e
`link_pagamento`, todos `string` tipada. Hoje cada um tem uma das três saídas: valor do nosso
vocabulário, `"outro"`, ou `null`. `itens[].produto` é a única exceção (o cliente precisa ler
o nome do que contratou) e é **saneada**: uma linha, 80 caracteres, e recusada inteira se
carregar cara de documento, telefone ou e-mail. `link_pagamento` só sai em `https` de host
permitido. O texto original vai para o log, truncado e com documento mascarado — inclusive o
`mensagem` de `rpc`/`tool_error`, que é onde vive o `{"erro":…}` de negócio do ERP.

### D11 — Identificador vindo do modelo não é prova de posse

Ver §3. A regra: nenhuma das cinco devolve um recurso que o titular da conversa não tenha, e
quem decide isso é sempre uma consulta feita pelo documento do CADASTRO, nunca o parâmetro que
o modelo digitou. Tentativa recusada vira linha de log (`identificador recusado`) — uma
enumeração aparece ali como uma sequência delas.

## 5. Migration 0263

1. `'mcp'` em `tenant_integrations_provider_check` — **no bloco único existente**.
2. `'mcp_externo_falhou'` em `agent_inbox_items_kind_check` — **no bloco único existente**.
3. `alter table public.tenant_integrations alter column webhook_secret_encrypted drop not null;`

Tripla obrigatória: arquivo + apêndice idempotente no `baseline.sql` **antes** do bloco de
varredura anon + linha no MANIFEST.

## 6. Arquivos

**Novos** (`lib/erp-mcp/`):

- `transporte.ts` — POST JSON-RPC: guards SSRF, `redirect:"manual"`, timeout, **leitura de SSE**
  (`data: `) e de JSON puro, erro tipado. É onde mora tudo que a medição do servidor ensinou.
- `config.ts` — molde de `lib/asaas/config.ts`: lê a linha cifrada, `null` = desligado, nunca lança.
- `projecao.ts` — os cinco Zod de entrada e as cinco projeções de saída (D3).
- `chamar.ts` — orquestra: config → transporte → desembrulha `content[].text` → projeta →
  `{ ok }`; conta as chamadas do turno (D5).

**Tocados:** `lib/mcp/tools/erp.ts` + `lib/mcp/tools/catalogo/erp.ts` (as cinco, no padrão do
Asaas), `lib/mcp/tools/index.ts` e `catalogo/index.ts` (registro), `lib/asaas/config.ts`
(`carregarCapacidadesDeIntegracao` passa a devolver `"mcp"` também — é a função canônica de
capacidades), `lib/agent-engine/db/repository.ts` + `lib/ai/agent-inbox-copy.ts` +
`lib/ai/inbox-destino.ts` (kind novo), `app/app/integrations/mcp/**` +
`app/actions/integrations/mcp.ts` (tela, molde do Asaas), `lib/navigation/catalogo.ts` (porta),
`app/api/v1/cron/asaas-reconcile` ou cron irmão (D9), `supabase/*` (0263), `.changes/`.

## 7. Prova

**Unidade:** transporte contra respostas gravadas do servidor real (SSE, JSON puro, `isError`,
`-32602`, corpo truncado, 500, timeout); as cinco projeções com o payload real de
`customer.status`, provando que e-mail, telefone e `emailsRecentes` **não** aparecem na saída;
o limite de 4 por turno; `ok:false` alimentando o breaker.

**test:db:** a migration aplica em banco novo e em atualização.

**Produção, e é esta que vale:** o agente financeiro da ChatCore responde "sua fatura venceu em
…, aqui está o link" com o dado vindo do ERP, numa conversa real pelo WhatsApp de testes.

## 8. Riscos

| risco | efeito | mitigação |
|---|---|---|
| ERP fora do ar | agente escala | D4 + D8 + D9 |
| ERP lento | turno preso | D5 |
| URL interna (SSRF) | Bearer para destino interno | D6, com janela residual declarada |
| dado pessoal no prompt | vazamento fora do cascade LGPD | D3, projeção — não redação |
| modelo executa ação destrutiva | contrato cancelado | D2, allowlist de cinco leituras |
| texto do ERP vira instrução | injeção | D3 + D10, vocabulário fechado (nada verbatim) |
| identificador de outro cliente | dado de terceiro na conversa | D11, prova de posse pelo cadastro |
| ferramenta some do ERP | capacidade morta | D4 (erro com log) + D9 |

## 9. Definition of Done

Além do padrão: porta em `NAV_CATALOG` (DoD 14), fragmento em `.changes/` (DoD 17), espanhol de
toda string nova, e a prova de produção da §7.

## 10. NÃO MEDIDO

- `tools/list` paginado ou com mais de 24 ferramentas.
- `invoice.get` e `chatcore.instance.get` **nunca foram chamados** — e agora não são mais
  usados por ferramenta nenhuma. A forma da fatura e da instância que chega ao cliente é a de
  `invoice.list` e `customer.status`, essas sim medidas.
- Servidor que exija `initialize` antes de `tools/list` (o da ChatCore não exigiu).
- Custo em tokens dos cinco schemas no prompt.
- Comportamento sob `Content-Type` errado ou stream truncado no meio de um `data:`.

## 11. Por que a versão anterior desta spec foi descartada

Ela propunha que as ferramentas do servidor entrassem no catálogo do agente com prefixo
`mcp:`. Duas revisões independentes a reprovaram, e por razões que não se resolvem com remendo:

- `tool_id` fora do catálogo compilado é recusado em **três** lugares além do que a spec citava
  (`publish/route.ts:80`, `_actions.ts:383` e `:502`) — o agente não publicava.
- A ferramenta externa não passaria por `wrapMcpTool`, escapando do gate de escopo de funil:
  `contract.suspend` rodaria sem escopo enquanto `crm_update_lead` é recusada.
- A `description` de cada ferramenta vem do servidor e vira descrição no prompt: texto remoto
  viraria instrução **antes** de qualquer chamada.
- O JSON Schema remoto teria de virar Zod, e não há conversor no repo nem nas dependências.
- O `ToolPicker` marcaria toda externa como órfã e ofereceria removê-las; `ligarPacote`
  apagaria os ids externos ao reconstruir a lista.
- A redação depois do fato não protegia o prompt: CNPJ e telefone de terceiro entrariam em
  `ai_agent_runs` em texto puro, fora do cascade de anonimização.

O desenho atual elimina todos esses por construção. O custo é que expor uma consulta nova exige
um commit — e isso é aceitável para um produto que já declara, na §2, que escrita no ERP fica
fora do escopo.
