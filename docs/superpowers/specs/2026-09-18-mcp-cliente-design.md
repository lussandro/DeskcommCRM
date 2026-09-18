# Spec — o CRM como CLIENTE de MCP

**Data:** 2026-09-18 · **Branch alvo:** `bacco` · **Migration:** 0263
**Objetivo:** `.superpowers/sdd/2026-09-18-mcp-cliente/objetivo.md`
**Medições que a spec herda:** `.superpowers/sdd/2026-09-18-mcp-cliente/mcp-externo-medido.md`
(contrato real do servidor) e `levantamento.md` (pontos de integração, com arquivo:linha).

---

## 1. O problema, medido

O CRM **serve** MCP (`app/api/mcp/route.ts` → `lib/mcp/server.ts`) e não **consome** nenhum:
zero ocorrência de `sdk/client`, `StreamableHTTPClientTransport` ou `experimental_createMCPClient`
no repositório; o `@modelcontextprotocol/sdk` (`package.json:47`) entra só pelo lado servidor.

A consequência foi medida em produção (18/09/2026). A organização do dono atende dois negócios;
o segundo (ChatCore, número 554899357781) tem um ERP próprio com 24 ferramentas MCP em produção
— contrato, fatura, instância, QR, situação de cobrança ao vivo. Os três agentes da ChatCore
foram publicados e **não alcançam nada disso**: toda pergunta de contrato, fatura ou instância
vira ocorrência humana. A análise de 18 meses de conversa (3.069 mensagens) mostra que é
exatamente aí que está o volume: 22 conversas de suporte, 10 de financeiro, e **11% das
mensagens de cliente nunca tiveram resposta humana**.

Não é falta de configuração. É metade de mecanismo que não existe.

## 2. O que esta spec entrega

Uma organização passa a poder **cadastrar um servidor MCP externo** (URL + chave), e as
ferramentas desse servidor ficam disponíveis para os agentes dela, escolhidas uma a uma pelo
admin, como qualquer outra capacidade.

**Fora de escopo, declarado:** mais de um servidor por organização; OAuth (só Bearer estático);
`resources` e `prompts` do protocolo MCP (só `tools`); descoberta automática de mudança no
servidor remoto.

## 3. Decisões

### D1 — Um servidor por organização (v1)

O cadastro vive em `tenant_integrations` com `provider = 'mcp'`, o mesmo padrão do Asaas —
chave cifrada em `oauth_access_token_encrypted`, config em `store_metadata`, `status`
`connecting|healthy|error`, `status_reason`, `last_health_check_at`. A constraint
`tenant_integrations_provider_check` ganha `'mcp'` **no bloco único já existente**
(`supabase/baseline.sql:25336-25338`), nunca num segundo bloco (regra #159).

*Por quê:* `tenant_integrations` é unique por `(organization_id, provider)`, e o dono tem um
servidor. Dois servidores exigiriam tabela própria e multiplicariam a superfície sem demanda
medida. Quando existir a demanda, a migração é de uma linha para N.

### D2 — Namespace próprio, e o teto também

`tool_id` externo é **`mcp:<tool>`** — prefixo reservado, literal. `customer.status` do servidor
vira `mcp:customer.status` no `tool_ids` da versão do agente.

- `lib/ai/agents/validation.ts:97-100` passa a aceitar `VALID_TOOL_IDS` **ou** o padrão
  `^mcp:[A-Za-z0-9._-]{1,80}$`.
- **Teto próprio de 10 ferramentas externas**, contado à parte das 25 locais — o mesmo desenho
  que `operator_tool_ids` já usa (`validation.ts:142-160`). Sem isto, toda ferramenta externa
  come vaga de ferramenta de negócio num teto que o repo já declara apertado
  (`selecao-por-pacote.ts:17-55`).
- Colisão com nome local é impossível por construção (o prefixo não existe no catálogo local), e
  a montagem **loga** quando descarta algo, em vez do silêncio de hoje
  (`inbound-turn.ts:3624`).

### D3 — Quatro ferramentas nunca são ligáveis

`invoice.cancel`, `contract.cancel`, `payment.settle_manual`, `chatcore.instance.delete` —
e, em geral, **qualquer ferramenta cujo nome case a lista de destrutivas configurada** — não
aparecem para marcar na tela e são recusadas no salvamento, mesmo por API. A lista vive no
código, não em config de tenant: config de tenant é o que o operador erra às duas da manhã.

*Nota de desenho:* a recusa é por nome porque o protocolo MCP não expõe "esta ferramenta é
destrutiva". O `tools/list` traz `name`, `description` e `inputSchema` — nada de risco. Se o
servidor renomear uma destrutiva, a proteção falha; por isso a lista é **denylist + prefixos**
(`*.cancel`, `*.delete`, `payment.settle_*`) e o teste a congela.

### D4 — Erro do servidor externo é resposta, nunca exceção

Timeout, 5xx, SSE malformado, JSON inválido e `isError: true` viram `{ error: "<texto em
pt-BR>" }` devolvido ao modelo — o mesmo contrato de `lib/ai/runtime/tools.ts:265-266`. O turno
segue e o agente escala.

**Mas o silêncio acaba:** toda falha externa emite `logger.error` com `tool`, `http_status` e
`motivo`, e a falha repetida abre aviso na Central (D8). O levantamento mostrou que hoje a
montagem engole erro sem log (`inbound-turn.ts:3657-3660`), e esse é o modo de falha que o
próprio repo já documentou como o pior: capacidade ligada na tela, inalcançável na prática.

**`isError` é traduzido, não repassado cru.** O texto técnico do servidor entra como
`{ error: … }` e o prompt já proíbe repassar erro técnico ao cliente. Precedente: `tools.ts:256-263`.

### D5 — Orçamento de tempo, que hoje não existe

- **10 segundos por chamada** (`AbortSignal.timeout`), igual ao cliente do Asaas
  (`lib/asaas/cliente.ts:32`).
- **No máximo 4 chamadas externas por turno.** A quinta devolve
  `{ error: "limite de consultas externas neste atendimento" }` sem sair para a rede.

*Por quê:* o loop do agente para por passo, token e custo, **nunca por tempo de parede**
(`lib/ai/runtime/agent.ts:503-538`). Um servidor lento consome o turno inteiro e o cliente fica
sem resposta.

### D6 — A URL é do tenant, então passa pelos guards que já existem

`assertSafeOutboundUrl` (`lib/automation/outbound-url.ts:18`) **e**
`assertDestinoResolvidoSeguro` (`lib/automation/outbound-ip.ts:95`), na ordem, mais
`redirect: "manual"` no fetch — exatamente como `call-webhook.ts:70-121`. Em produção, só
`https`. Os dois guards rodam **a cada chamada**, não só no cadastro: DNS muda.

### D7 — Redação recursiva, dos dois lados

A resposta do servidor externo carrega dado pessoal e financeiro real (medido: CNPJ, e-mail,
telefone, valores). Antes de ir para log, auditoria ou serialização de passo, ela passa pela
redação **recursiva** que já existe em `lib/ai/runtime/serialize.ts:21-34`. A lista de chaves
sensíveis, hoje duplicada em dois arquivos (`lib/mcp/audit.ts:23-34` e `serialize.ts:8-19`),
passa a ter **uma fonte** importada pelos dois, e `redactArgs` do audit passa a ser recursivo.

*Isto conserta um buraco que já existia*, e é pré-requisito: sem ele, a primeira chamada ao
servidor externo grava CNPJ e telefone de terceiro no audit em texto puro.

### D8 — O que falha aparece na tela

Aviso novo na Central, kind `mcp_externo_falhou` (CHECK de `agent_inbox_items` no bloco único),
**um aberto por organização**: aberto quando N falhas consecutivas acontecem no mesmo dia, com
o motivo real e o caminho ("Configurações › Integrações › MCP"). Fecha quando uma chamada
volta a dar certo.

### D9 — Ferramenta que sumiu do servidor

`tool_ids` é snapshot congelado por versão (`selecao-por-pacote.ts:30-31`). Se o servidor
deixar de expor uma ferramenta marcada, a montagem a descarta **com log** e o aviso do D8
nomeia quais sumiram. Nada tenta re-derivar a versão publicada sozinho.

### D10 — O que o servidor devolve é dado, nunca instrução

Texto vindo do MCP externo entra como resultado de ferramenta e não altera o comportamento do
agente. Mesma regra que o repo aplica a webhook e conteúdo de página.

## 4. Arquitetura

```
Configurações › Integrações › MCP  (admin)
        │  URL + chave → cifrada em tenant_integrations (provider 'mcp')
        │  "Testar conexão" → tools/list → grava o catálogo em store_metadata
        ▼
Agentes › capacidades  ── o admin marca as ferramentas externas (teto 10, destrutivas fora)
        ▼
turno do agente
  pickToolsFromMcp  ──► tools locais (como hoje)
        └────────────► tools externas: lib/mcp-cliente/*  ──► POST JSON-RPC (SSE)
                                  guards SSRF · 10s · máx 4/turno · redação
```

**Arquivos novos** (`lib/mcp-cliente/`):

- `tipos.ts` — `FerramentaExterna { nome, descricao, inputSchema }`, `RespostaExterna`.
- `transporte.ts` — o POST JSON-RPC: monta o corpo, aplica os dois guards, `redirect:"manual"`,
  timeout, **lê SSE** (`data: `) e também JSON puro, devolve `result` ou erro tipado. É aqui que
  mora tudo que a medição do servidor real ensinou.
- `catalogo.ts` — `listarFerramentas(config)` (`tools/list`) e a filtragem de destrutivas.
- `executar.ts` — `chamarFerramenta(config, nome, args)` (`tools/call`), desembrulha
  `result.content[].text` (JSON dentro de string), traduz `isError`.
- `config.ts` — molde de `lib/asaas/config.ts`: lê a linha cifrada, `null` = desligado, nunca lança.
- `denylist.ts` — as destrutivas, com o teste que as congela.

**Pontos tocados:** `lib/ai/agents/validation.ts` (aceitar `mcp:`, teto próprio),
`lib/ai/runtime/tools.ts` (montar as externas), `lib/agent-engine/edge/crm/mcp-tools.ts` (idem no
engine), `lib/mcp/audit.ts` + `lib/ai/runtime/serialize.ts` (redação única e recursiva),
`app/api/v1/mcp/tools/route.ts` (a tela precisa ver as externas), `ToolPicker.tsx` (marcar),
`lib/navigation/catalogo.ts` (porta), `supabase/*` (0263).

## 5. Migration 0263

1. `'mcp'` em `tenant_integrations_provider_check` — **no bloco único existente**.
2. `'mcp_externo_falhou'` em `agent_inbox_items_kind_check` — **no bloco único existente**.
3. Nada mais: o cadastro reusa as colunas que já existem.

Tripla obrigatória: arquivo + apêndice no `baseline.sql` **antes** do bloco de varredura anon +
linha no MANIFEST.

## 6. Prova de que funciona

**Unidade:** o transporte contra respostas gravadas do servidor real (SSE, JSON puro, `isError`,
`-32602` de argumento faltando, corpo truncado, 500, timeout); a denylist; o teto de 10; a
redação recursiva com um payload real de `customer.status`.

**Integração (test:db):** a migration aplica em banco novo e em atualização.

**Produção, e é esta que vale:** o agente financeiro da ChatCore responde
"sua fatura FAT-… venceu em …, aqui está o link" **com o dado vindo do MCP**, numa conversa real
pelo WhatsApp de testes. Sem isso, a feature não está pronta.

## 7. O que pode dar errado, e o que acontece então

| risco | efeito | mitigação |
|---|---|---|
| servidor fora do ar | agente escala | D4 + aviso D8 |
| servidor lento | turno preso | D5 (10s, máx 4) |
| URL interna (SSRF) | acesso à rede do host | D6, os dois guards por chamada |
| dado pessoal em log | vazamento | D7, redação recursiva |
| modelo chama destrutiva | contrato cancelado | D3, denylist em duas camadas |
| ferramenta some do servidor | capacidade morta em silêncio | D9, log + aviso |
| texto do servidor vira instrução | injeção | D10 |

## 8. NÃO MEDIDO

- Comportamento do `tools/list` quando o servidor tem mais de 24 ferramentas ou pagina.
- Servidor MCP que exija `initialize` antes de `tools/list` (o da ChatCore não exigiu).
- Custo em tokens de injetar 10 `inputSchema` externos no prompt.
