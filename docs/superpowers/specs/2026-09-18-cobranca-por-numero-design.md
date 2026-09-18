# Cobrança por número — desenho

**Estado:** aprovado para implementar (18/09/2026), **v2** — a v1 foi derrubada em dois pontos
por um refutador e pelo Codex, e o §"O que a v1 errava" registra o quê.
Irmã da `0262` (funil por número, `v26.9.19`).

## O defeito, medido

`tenant_integrations.provider='asaas'` guarda **um** `store_metadata.followup_pointer_id` por
organização. A organização `f4bbc2c7…` atende dois negócios na mesma conta Asaas — Bacco
(`554891972220`) e ChatCore (`554899357781`) — e o ponteiro em vigor é o `f1e5ae4b`
("Cobrança — vencida no Asaas"), armado pelo **Paulo · Financeiro**, publicado no número do
Bacco. Fatura vencida de cliente da ChatCore matricula o cliente no fluxo do Bacco.

Medido na VPS em 18/09/2026: 8 agentes publicados (4 no `2220`, 4 no `7781`), **1** pointer
`active` com gatilho `webhook`, **0** versões publicadas sem `channel_session_id`, 1 titular de
cobrança (com conversa), 16 cobranças ainda sem titular (`charge_unmatched`).

## O defeito de verdade é maior — e é ele que manda no desenho

Escolher o pointer **não** escolhe o número de saída. Hoje:

- `lib/asaas/consumidor.db.ts:110` chama `enrollFollowupFlow` **sem canal**;
- `lib/followup/enroll.ts:117` chama `beginServiceAtOrigin(supabase, org, contact)` — 4º
  argumento (`session`) fica `undefined`;
- `fn_service_begin` com `p_session` nulo (`supabase/baseline.sql:19412`) pega a conversa de
  `last_message_at` mais recente **de qualquer número**, e se não houver nenhuma, **cria** uma
  no primeiro canal `WORKING` (`:19437`);
- o envio sai por `boundary.conversation_id` (`lib/followup/enviar-texto-fixo.ts:100`).

Ou seja: o produto já decide o número de saída por "último que falou". Um desenho que só
troque o pointer trocaria um bug por outro — contato que falou nos dois números, um fluxo só,
e a cobrança do Bacco sai pela linha da ChatCore.

**O coração do conserto é descer o `channel_session_id` até `p_session`.**

## A decisão

Fluxo de cobrança escolhido **por número**, como os funis; e a matrícula **nasce no canal do
fluxo**, não no da última mensagem. Quando não der para amarrar a exatamente um número,
ninguém é disparado e abre-se aviso na Central (decisão do dono, 18/09/2026).

## O que NÃO entra, e por quê

**Nenhuma coluna nova em `followup_flow_pointers`.** O número do fluxo já é derivável: pointer
→ agente publicado que o arma → `channel_session_id` da versão publicada. Gravá-lo no pointer
seria segundo lugar para verdade existente (anti-pattern nº 2; letra "I" do DIRC). Os funis
precisaram de coluna porque funil não tem agente.

**Nenhuma migration.** `followup_pointer_id` vive no jsonb `store_metadata` — `grep` em
`supabase/**/*.sql` dá **zero** ocorrências. Não é schema, é forma. E a migration que a v1
propunha era ativamente perigosa: ela apagaria a chave antiga, e rollback de imagem não reverte
banco — o operador que voltasse a imagem ficaria com cobrança morta e sem aviso.

## O desenho

### 1. Config: um ponteiro vira uma lista, com espelho

`configSchema` (`lib/asaas/config.ts`) passa a emitir `followup_pointer_ids: string[]`, lido
retrocompatível no `.transform()` que já existe:

```
followup_pointer_ids: v.followup_pointer_ids ?? (v.followup_pointer_id ? [v.followup_pointer_id] : [])
```

Ao gravar, a action escreve **as duas** chaves por um ciclo: a lista (fonte) e
`followup_pointer_id` = primeiro item (espelho, só para imagem antiga em rollback). A chave
antiga sai numa versão seguinte, quando nenhuma imagem no ar a ler.

### 2. Validação devolve o número, e acusa o fluxo de dois donos

`validarFluxoDeCobranca` passa a devolver `channelSessionId` (da versão publicada do agente
que arma o pointer) e ganha dois motivos de recusa:

- `agente_sem_canal` — agente publicado sem `channel_session_id` (medido: 0 casos hoje);
- `fluxo_de_dois_numeros` — o mesmo pointer armado por agentes publicados em **números
  diferentes**. Isso exige listar os agentes, não pegar o primeiro:
  `resolveAgentForAutomaticTrigger` devolve o **menor uuid** de propósito
  (`lib/followup/agent-followup-gate.ts:54`), então `agentsEnablingPointer` precisa ser
  exportada (ou uma `numerosQueArmamOPointer` ao lado dela).

**O número NUNCA é cacheado na config.** O agente que arma um pointer pode trocar sem ninguém
abrir a tela do Asaas (basta publicar outro agente com uuid menor). Por isso o disparo
revalida — `tratarVencida` já chama `db.validarFluxo(pointerId)` — e usa o `channelSessionId`
que a validação devolveu **naquele momento**.

### 3. Disparo: interseção, com um degrau que salva a instalação de um número

Em `tratarVencida` (`lib/asaas/consumidor.ts`), onde hoje há `db.followupPointerId(orgId)`:

1. `db.fluxosDeCobranca(orgId)` → a lista da config, cada item revalidado agora →
   `[{ pointerId, channelSessionId }]` (os inválidos saem, e o motivo vai para o aviso);
2. `db.canaisDoContato(contactId)` → números em que o contato tem conversa não-grupo;
3. candidatos = fluxos cujo número está nesses canais:
   - **1 candidato** → matricula **passando o canal** (§4);
   - **0 candidatos e a org tem exatamente 1 fluxo válido** → matricula nesse fluxo. Não é
     adivinhação: com um fluxo só não existe outro financeiro para errar, e é o caso do
     self-host de um número — sem este degrau, cliente novo que ainda não escreveu deixaria de
     ser cobrado (hoje ele é, porque `fn_service_begin` cria a conversa);
   - **0 candidatos com ≥2 fluxos**, ou **≥2 candidatos** → aviso, `detail`
     `sem_fluxo_para_o_numero` / `fluxo_ambiguo`. Adivinhar quem cobra é o defeito que se
     conserta; "último número que falou" não vira regra.

### 4. A matrícula nasce no canal do fluxo (o conserto que faz a feature existir)

`enrollFollowupFlow` ganha `channelSessionId?: string` e o repassa a `beginServiceAtOrigin(…,
channelSessionId)` → `p_session`. A função SQL **já** sabe filtrar a conversa por canal e já
sabe criar a conversa naquele canal (`baseline.sql:19412-19441`) — nada de SQL novo.

Com isso, contato que falou nos dois números e tem um fluxo só recebe a cobrança **na conversa
do número daquele fluxo**, não na mais recente.

### 5. O aviso aponta para o cliente

`charge_overdue_no_flow` já tem cópia (`lib/ai/agent-inbox-copy.ts`) e destino
(`lib/ai/inbox-destino.ts:84`, que declara `refs: ["contact"]`). As cinco chamadas de hoje
passam `refKind = null` — o botão "Ver contato" foi prometido e nunca entregue. Nos avisos
desta feature: `ref_kind: "contact"` e `ref_id` = o **contact_id real** (não o uuid v5
sintético de `lib/asaas/avisos.ts`, que o `inbox-destino` não conseguiria resolver). A dedup é
o próprio aviso aberto (`consumidor.db.ts:132` filtra `status='open'`), então não entra o dia.

Os avisos que não têm contato (sem fluxo nenhum configurado) seguem como estão.

## Limite conhecido, dito em voz alta

`idx_followup_enrollments_one_live` (`baseline.sql:7559`) permite **uma** matrícula viva por
`(organization_id, contact_id)`. Quem for cliente dos dois negócios na mesma org e vencer nos
dois entra num fluxo e o outro vira `aguardando_outro_fluxo` (atividade no contato, sem aviso).
Separar cobrança por número **não** separa a fila. Fora do escopo desta entrega.

## O que a v1 errava (para não voltar)

1. Achava que escolher o pointer bastava — ignorava `p_session` nulo. **Era o defeito inteiro.**
2. Barrava contato sem conversa, o que **desligaria a cobrança** em instalação de um número.
3. Pedia migration `0264` para um jsonb, com remoção destrutiva que quebra rollback de imagem.
4. Pedia dedup "contato + dia" incompatível com `abrirAviso`, e `ref_kind` que o
   `inbox-destino` não resolveria.
5. Propunha detectar fluxo ambíguo por uma função que devolve um agente só.

## Prova exigida antes de "pronto"

1. **O teste que mede o produto** (falha se o §4 sumir): contato com conversa nos **dois**
   números, **um** fluxo só (o do `2220`), última mensagem no `7781` → a matrícula nasce com a
   conversa do **`2220`**. Um teste que só confira o `pointerId` escolhido fica verde com o
   defeito intacto.
2. Contato só com conversa no `7781`, dois fluxos configurados, nenhum do `7781` → `skipped` +
   aviso com `ref_kind: "contact"`.
3. Contato sem conversa nenhuma, um fluxo só → **matricula** (o degrau do §3).
4. `pnpm test:unit` e `pnpm test:db` verdes, e os 7 arquivos de teste que passam a mentir
   (`lib/asaas/consumidor.test.ts`, `config.test.ts`, `reconcile.test.ts`,
   `app/actions/integrations/asaas.test.ts`, `tests/unit/mcp-cobranca-tools.test.ts`,
   `tests/e2e/bacco-asaas.spec.ts`) atualizados — não silenciados.
5. Prova em produção: fluxo de cobrança da ChatCore criado e armado pelo `ChatCore ·
   Financeiro`; cobrança vencida de cliente da ChatCore matricula **nesse** fluxo, na conversa
   do `7781`.
