# Plano — Jornadas de vinícola do Bacco Adega CRM

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to execute
> this plan. Cada task vai para um subagente próprio, com o texto da task inteiro no briefing. O
> subagente não escolhe escopo: ele executa os steps na ordem, roda o comando de cada step e cola a
> saída. Step que não dá o esperado **para a task** e volta para quem orquestra — nunca se afrouxa o
> esperado para seguir.

**Data:** 2026-09-15 · **Branch:** `bacco` · **Release alvo:** `v26.9.4` · **HEAD publicado hoje:** `v26.9.3` (`03099807`)

## Goal

Dar ao Bacco Adega CRM o conteúdo operacional de vinícola que hoje não existe: **quatro jornadas**
prontas — canal e revenda, enoturismo, clube de assinatura e vendas ao consumidor —, cada uma com
funil, etapas, vocabulário, campos personalizados, motivos de perda, tags, respostas rápidas com
atalho, tipos de compromisso e cadências de follow-up em rascunho. A vinícola marca as que usa no
onboarding (seleção múltipla) e ativa as demais depois, numa tela própria em Configurações.

Pronto = uma vinícola nova marca as jornadas, entra no sistema e encontra tudo isso semeado, sem
digitar nada e sem nenhum dado inventado sobre a casa dela.

## Architecture

Três camadas novas, todas código do fork, nenhuma tocando o núcleo herdado:

1. **Definições (dados puros)** — `lib/vertical/vinicola/*.ts`. Um arquivo por jornada, mais
   `tipos.ts` (o tipo `JornadaDeVinicola`) e `index.ts` (o registro por chave). Sem import de banco,
   sem lógica: o que estes arquivos exportam é literal, e o teste de forma o mede contra o anexo.
2. **Aplicador** — `lib/vertical/vinicola/aplicar.ts`. Recebe `(organizationId, chave, atorUserId)`,
   grava no banco pelo **admin client** com filtro explícito de `organization_id`, na ordem
   obrigatória, e devolve um relatório por peça. Reusa `etapasParaGravar` e `slugDeNome` — não
   recalcula slug nem `position`.
3. **Entradas** — o passo do funil do onboarding (`app/onboarding/funil/`) vira seleção múltipla, e
   nasce a tela `app/app/settings/tenant/jornadas/`. As duas chamam o mesmo aplicador.

O **ledger** de aplicação mora em `organizations.settings.bacco_jornadas` (jsonb sem CHECK), gravado
por merge. É ele — não a chave natural — que faz reaplicar não duplicar e faz o que a vinícola apagou
não voltar.

## Tech Stack

- TypeScript 6 estrito, Next.js 16 App Router, React 19 (mesma stack do repo — nada novo entra).
- Vitest para unidade (`pnpm exec vitest run <arquivo>`), Playwright para a prova em tela (só na VPS).
- Supabase (Postgres) pelo admin client `createAdminClient` (`lib/supabase/admin.ts`).
- Zero dependência nova. Zero migration.

## Spec

- Design: [`docs/superpowers/specs/2026-09-15-bacco-jornadas-de-vinicola-design.md`](../specs/2026-09-15-bacco-jornadas-de-vinicola-design.md)
- Conteúdo (**fonte do texto das 4 jornadas**): [`docs/superpowers/specs/2026-09-15-bacco-jornadas-de-vinicola-conteudo.md`](../specs/2026-09-15-bacco-jornadas-de-vinicola-conteudo.md)
- Contratos medidos no código: `.superpowers/sdd/2026-09-15-bacco-jornadas-de-vinicola/contratos-medidos.md`

⚠️ **O texto das jornadas NÃO está reescrito neste plano, e isso é deliberado.** Uma terceira cópia
do conteúdo divergiria da segunda no primeiro ajuste. O implementador **copia do anexo, seção por
seção**, e quem confere é o teste de forma da Task 1, que compara as contagens do *Inventário*
(anexo, linhas 1045-1096) contra o que os arquivos exportam.

## Global Constraints

- **Sem mudança de schema.** Nenhum arquivo em `supabase/migrations/`, nenhuma linha no
  `supabase/baseline.sql`, nenhuma linha no `MANIFEST.md`. O ledger cabe em `organizations.settings`
  (jsonb sem CHECK) e a ação de auditoria nova cabe em `api_audit_log.action` (`text` sem CHECK).
- **Nenhum gatilho de banco existente é alterado** — nem `trg_seed_default_pipeline_for_org`, nem o
  que semeia os três tipos de compromisso padrão. O pacote cria funil **novo** e tipos **novos**.
- **Nenhuma rota existente é alterada.** `app/api/v1/pipelines/route.ts`,
  `app/api/v1/pipelines/[id]/stages/route.ts`, `app/api/v1/agenda/tipos/route.ts` e
  `app/api/v1/ai/followup-flows/route.ts` não recebem uma linha de diff. O aplicador grava direto.
- **Papel para aplicar: `admin`.** Um só papel para a operação inteira. A tela é `manager+` em
  leitura; a ação só aparece para `admin` (padrão de `app/app/settings/tenant/pipelines/page.tsx:26-31`).
- **Admin client com filtro manual de `organization_id` em toda query.** O id vem da sessão (tela) ou
  do contexto do onboarding — **nunca do body**.
- **Cadências nascem em rascunho.** `followup_flow_pointers.status` fica `'draft'` (default do banco,
  `supabase/baseline.sql:7323`). O aplicador **nunca publica**.
- **Lembrete de tipo de compromisso nasce desligado, e é gravado EXPLÍCITO.** O aplicador passa
  `reminder_enabled: false` em cada insert. Não herda default: o DDL base tem
  `reminder_enabled boolean not null default true` (`supabase/baseline.sql:15148`) e só o apêndice o
  vira `false` (`:16330`). Um clone cujo apêndice não rodou receberia lembrete **ligado** —
  mensagem para o telefone do cliente, irreversível.
- **Conteúdo semeado só em português.** Nome de funil, etapa, vocabulário, rótulo de campo, motivo de
  perda, título e corpo de resposta rápida, nome de tipo de compromisso e de cadência **não** entram
  em `lib/i18n/dicionario.ts`. Isso é conteúdo, não interface. O que ganha espanhol é a **interface**
  da tela nova.
- **Marcação de nome é `{{nome}}`.** Nunca `{{contact.name}}`: a regex de `interpolateTemplate`
  (`lib/inbox/template-vars.ts:10`) é `/\{\{\s*([a-zA-Z_]+)\s*\}\}/g` e não casa ponto.
- **Nenhuma mensagem de cadência usa marcação de nome.** O envio de follow-up só troca
  `{{volta}}`/`{{voltas}}` (`lib/agent-engine/agent/followup-turn.ts:480`).
- **Atalho de resposta rápida é único no pacote inteiro** — os 67. `message_templates` não tem unique
  por `shortcut` (só `idx_message_templates_org`, `supabase/baseline.sql:7598`): quem garante é o teste.
- **Chave de campo personalizado:** `^[a-z][a-z0-9_]*$`, até 40 (`lib/schemas/settings.ts:134-139`).
  Opção de `select`/`multiselect` é par `{ value, label }`, ambos `min(1)` (`:154-156`).
- **Vocabulário do funil:** 40 caracteres por chave (`lib/schemas/settings.ts:161-168`). Motivo de
  perda: 80 caracteres, máximo 50 (`:170`). Campos: máximo 50 (`:169`).
- **Etapas: mínimo 4, máximo 8** (`lib/onboarding/proposta-de-funil.ts:52-53`), exatamente uma `won` e
  uma `lost`, e as 5 dicas não-terminais de `PASSOS_QUE_PRECISAM_DE_ETAPA`
  (`lib/leads/agent-mapping.ts:261`) presentes e distintas em cada jornada.
- **Local do compromisso é valor único** — um de `LOCAIS_DE_AGENDAMENTO` (`lib/agenda/tipos.ts:58-64`).
- **Gatilho de silêncio: 5 a 10.080 minutos** (`lib/followup/api-schemas.ts:38`). `conversation_end`
  não entra: não publica.
- **Espera de cadência: 300.000 a 7.776.000.000 ms** (`lib/followup/graph-schema.ts:88-90`).
- **Condição por etapa usa o `id` real da etapa**, resolvido na aplicação
  (`lib/followup/graph-schema.ts` `conditionCheckSchema`, `field: 'lead_stage'`, `op: 'eq'`).
- **Local roda só teste, typecheck e lint.** App, Supabase e e2e **só na VPS** (`2.25.222.110`).
  Comandos locais permitidos: `pnpm exec vitest run <arquivo>`,
  `NODE_OPTIONS=--max-old-space-size=6144 pnpm typecheck`, `pnpm lint`.
- **Node 22 no PATH em toda sessão de shell:** `export PATH=/home/lussandro/.nvm/versions/node/v22.23.2/bin:$PATH`.
- **Um commit por task**, com o trailer exato:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- **Sem `git push` até a Task 5.**
- **Os checks obrigatórios são MEDIDOS, nunca afirmados de cor.** Uma lista escrita aqui envelhece e,
  quando envelhece, a triagem mede contra a régua errada. Os dois comandos, com a expectativa
  **derivada** da saída deles:

  ```bash
  # 1. Há branch protection na main deste fork?
  gh api repos/lussandro/bacco-adega-crm/branches/main/protection --jq '.required_status_checks.contexts|join(", ")'
  # 2. Que workflows existem, e quais estão ligados?
  gh api repos/lussandro/bacco-adega-crm/actions/workflows --jq '.workflows[]|"\(.state)\t\(.path)"' | sort
  ```

  Medido em 2026-09-15, e é **diferente do upstream**: (1) responde
  `HTTP 403 — Upgrade to GitHub Pro or make this repository public`, ou seja **a `main` deste fork não
  tem branch protection** e não há lista de checks obrigatórios para ler; (2) devolve `ci` e `perf`
  `active`, `publish-image` `active`, e **`e2e` `disabled_manually`** (junto de `acolhida`, `release` e
  `relogio`).

  **Expectativa derivada, e é assim que ela se lê:** o conjunto de checks que aparece num commit é o
  dos workflows `active` — `verify` e `invariants` (do `ci`), `build-and-size` (do `perf`) e os jobs do
  `publish-image`, incluindo `imagens-ok`. **Nenhum deles é obrigatório por configuração do repositório
  — quem os exige é este plano.** Verde é condição de seguir; a ausência de `e2e` é o esperado, não uma
  falta. Se o comando (1) passar a responder JSON algum dia, é ELE que manda, não esta prosa.

## Estrutura de arquivos

| Arquivo | Novo/Modificado | O que faz |
|---|---|---|
| `lib/vertical/vinicola/tipos.ts` | novo | O tipo `JornadaDeVinicola` e os tipos das peças. Sem dado. |
| `lib/vertical/vinicola/canal.ts` | novo | Jornada 1, *Canal e revenda* — 8 etapas, 6 motivos, 8 campos, 8 tags, 17 respostas, 3 cadências, 4 tipos de agenda. |
| `lib/vertical/vinicola/enoturismo.ts` | novo | Jornada 2, *Visitas e degustações* — 7/6/8/8/17/4/4. |
| `lib/vertical/vinicola/clube.ts` | novo | Jornada 3, *Clube de assinatura* — 7/6/8/8/18/3/4. |
| `lib/vertical/vinicola/consumidor.ts` | novo | Jornada 4, *Vendas ao consumidor* — 7/6/8/8/15/3/4. |
| `lib/vertical/vinicola/index.ts` | novo | `JORNADAS` (registro por chave `canal\|enoturismo\|clube\|consumidor`), `CHAVES_DE_JORNADA`, `VERSAO_DO_PACOTE`. |
| `lib/vertical/vinicola/aplicar.ts` | novo | `aplicarJornada()`, `lerLedger()`, `estadoDaJornada()`. A única peça que toca o banco. |
| `tests/unit/jornadas-de-vinicola-forma.test.ts` | novo | Teste de forma das definições: contagens do Inventário, slugs derivados, cobertura 5/5, jargão, atalhos únicos, chaves de campo, opções, agenda. |
| `tests/unit/jornadas-de-vinicola-aplicar.test.ts` | novo | Teste do aplicador com banco dublê. |
| `lib/audit/actions.ts` | modificado | Acrescenta `"vertical.jornada_aplicada"` **no fim** do array. |
| `lib/onboarding/pacotes-de-funil.ts` | modificado | Os três pacotes de vinícola saem; entram os quatro derivados das jornadas. |
| `lib/onboarding/sugerir-funil.ts` | modificado | `sugerirJornadas()` — sugere N jornadas em vez de uma. |
| `lib/onboarding/sugerir-funil.test.ts` | reescrito | Os 13 casos de tabela + fallback passam a apontar para as chaves novas. |
| `app/onboarding/funil/_client.tsx` | modificado | Seleção múltipla de jornadas. |
| `app/onboarding/funil/page.tsx` | modificado | Passa as jornadas sugeridas para o cliente. |
| `app/actions/onboarding/montarQuadro.ts` | modificado | `aplicarQuadro` chama o aplicador para cada jornada marcada. |
| `app/app/settings/tenant/jornadas/page.tsx` | novo | A tela: `manager+`, lista as 4 com estado. |
| `app/app/settings/tenant/jornadas/_client.tsx` | novo | O cliente da tela, com o botão só para `admin`. |
| `app/actions/settings/aplicarJornadaDeVinicola.ts` | novo | Server action de sessão que chama o aplicador. |
| `lib/navigation/catalogo.ts` | modificado | Entrada `/app/settings/tenant/jornadas`, grupo `organizacao`, seção `"Sua empresa"`, `minRole: "manager"`. |
| `lib/i18n/dicionario.ts` | modificado | Espanhol de todo texto **de interface** da tela nova. |
| `.changes/bacco-jornadas-de-vinicola.md` | novo | Fragmento de release, `impacto: capacidade_nova`. |
| `tests/e2e/bacco-jornadas.spec.ts` | novo | Prova em tela na VPS, autocontida. |
| `tests/e2e/bacco-evidencia.spec.ts` | modificado | A medida da linha 214 (`Clientes da vinícola` deixa de existir). |
| `app/actions/onboarding/montarQuadro.test.ts` | modificado | Os quatro casos dos dois caminhos (Task 3 Step 8b). |
| `docs/architecture/jornadas-de-vinicola.architecture.json` | novo | O mapa vivo da peça, com ≥2 arestas por nó. |
| `docs/architecture/README.md` | modificado | A linha do mapa novo na tabela. |
| `evidence/bacco-jornadas/` | novo | Capturas + `revisao.md` citando cada PNG + o Living System Checklist respondido. |

---

## Task 0 — Conferir a base

**Files:** nenhum. Task de medição.

**Interfaces:** Consumes: nada. Produces: a certeza de que os steps seguintes medem o que dizem medir.

- [ ] **Step 1:** Árvore limpa na branch certa.

```bash
cd /home/lussandro/Bacco-Crm && git status --short && git branch --show-current && git log --oneline -1
```
Expected: saída de `--short` **vazia**; a branch é `bacco`; e o último commit é de documento — a linha
do `git log` contém `docs(bacco)`.

⚠️ **Sem SHA fixo aqui, de propósito.** Esta linha já trazia `03099807` como esperado, e um SHA
esperado envelhece a cada commit de documento — inclusive os que corrigem este plano. O subagente que
medisse contra ele pararia numa base que está certa. O que importa é o estado (árvore limpa, branch
certa, topo ainda em documentação), não o identificador. Árvore suja = **pare** e reporte: nunca mexer
em worktree de outra sessão.

- [ ] **Step 2:** Node 22 no PATH.

```bash
export PATH=/home/lussandro/.nvm/versions/node/v22.23.2/bin:$PATH && node -v && pnpm -v
```
Expected: `v22.23.2` e uma versão de pnpm. **Esta linha de `export` abre toda sessão de shell deste plano.**

- [ ] **Step 3:** A suíte de onboarding está verde ANTES de qualquer mudança — é contra ela que a Task 3 mede.

```bash
export PATH=/home/lussandro/.nvm/versions/node/v22.23.2/bin:$PATH && cd /home/lussandro/Bacco-Crm && pnpm exec vitest run lib/onboarding > /tmp/vt-base.log 2>&1; echo "exit=$?"; grep -aE "Test Files|Tests |Errors " /tmp/vt-base.log | tail -3
```
Expected: `exit=0`, `Test Files` e `Tests` sem `failed`, nenhuma linha `Errors`. Vermelho aqui = **pare**: a base não é o que o plano supõe.

- [ ] **Step 4:** A v26.9.3 é o topo publicado, e não há tag `v26.9.4` já existente.

```bash
cd /home/lussandro/Bacco-Crm && git tag --list 'v26.9.*' | sort -V | tail -3 && git fetch --tags origin 2>&1 | tail -2
```
Expected: `v26.9.4` **não** aparece; a maior é `v26.9.3`.

- [ ] **Step 5:** `lib/vertical/` ainda não existe — o pacote nasce limpo.

```bash
cd /home/lussandro/Bacco-Crm && ls lib/vertical 2>&1 | head -2
```
Expected: `No such file or directory`.

Sem commit: esta task não escreve nada.

---

## Task 1 — As definições das quatro jornadas

**Files:**
- Create: `lib/vertical/vinicola/tipos.ts`
- Create: `lib/vertical/vinicola/canal.ts`
- Create: `lib/vertical/vinicola/enoturismo.ts`
- Create: `lib/vertical/vinicola/clube.ts`
- Create: `lib/vertical/vinicola/consumidor.ts`
- Create: `lib/vertical/vinicola/index.ts`
- Create: `tests/unit/jornadas-de-vinicola-forma.test.ts`

**Interfaces:**

Consumes:
- `type LeadStage` de `@/lib/agent-engine/agent/lead-state`
- `type CustomFieldDef` de `@/lib/schemas/settings` (`lib/schemas/settings.ts:158`)
- `type CategoriaDeAgendamento`, `type LocalDeAgendamento` de `@/lib/agenda/tipos` (`lib/agenda/tipos.ts:41`, `:65`)
- `PASSOS_QUE_PRECISAM_DE_ETAPA`, `coberturaDoFunil` de `@/lib/leads/agent-mapping` (`:261`, `:295`)
- `slugDeNome` de `@/lib/leads/stage-editing` (`:121`)
- `etapasParaGravar` de `@/lib/onboarding/proposta-de-funil` (`:171`)

Produces:
```ts
export type ChaveDeJornada = "canal" | "enoturismo" | "clube" | "consumidor";
export const JORNADAS: Readonly<Record<ChaveDeJornada, JornadaDeVinicola>>;
export const CHAVES_DE_JORNADA: readonly ChaveDeJornada[];
export const VERSAO_DO_PACOTE = 1;
/**
 * A guarda que a Task 3 (onboarding) e a Task 4 (tela) usam para validar o que
 * chega de formulário — `FormData` devolve `string`, e sem esta função cada uma
 * das duas inventaria a própria validação.
 */
export function ehChaveDeJornada(v: unknown): v is ChaveDeJornada;
```

- [ ] **Step 1:** Criar `lib/vertical/vinicola/tipos.ts` com o tipo e nada mais.

```ts
/**
 * A FORMA de uma jornada de vinícola. Só tipo — o texto mora nos quatro
 * arquivos de dados, e a fonte dele é o anexo de conteúdo da spec.
 *
 * ⚠️ `slug` de etapa NÃO é campo aqui, e a ausência é a decisão. O aplicador
 * deriva o slug por `etapasParaGravar` + `slugDeNome`, que é o que o onboarding
 * já faz (`app/actions/onboarding/montarQuadro.ts:237`). Um slug digitado seria
 * uma segunda conta, e ela divergiria da primeira no primeiro ajuste.
 *
 * ⚠️ `is_won`/`is_lost` também não são campos: derivam de `passo`, como manda o
 * CHECK `crm_stages_hint_coerente_com_won_lost`.
 */
import type { LeadStage } from "@/lib/agent-engine/agent/lead-state";
import type { CategoriaDeAgendamento, LocalDeAgendamento } from "@/lib/agenda/tipos";
import type { CustomFieldDef } from "@/lib/schemas/settings";

export interface EtapaDaJornada {
  /** O que aparece no topo da coluna. */
  nome: string;
  /** `null` = coluna que só pessoas movem. Estado válido, não pendência. */
  passo: LeadStage | null;
}

/** O que a vinícola renomeia no funil. Até 40 caracteres cada. */
export interface VocabularioDaJornada {
  lead: string;
  deal: string;
  won: string;
  lost: string;
}

export interface RespostaRapidaDaJornada {
  titulo: string;
  /** Único em TODO o pacote — `message_templates` não tem unique por shortcut. */
  atalho: string;
  corpo: string;
  /** `true` = tem lacuna dentro de mensagem automática; a vinícola revisa antes de publicar. */
  revisarAntesDePublicar?: boolean;
}

export interface TipoDeCompromissoDaJornada {
  nome: string;
  categoria: CategoriaDeAgendamento;
  duracaoMinutos: number;
  local: LocalDeAgendamento;
  /**
   * O complemento do local, quando "Presencial" sozinho mente.
   *
   * O anexo distingue **"Presencial"** (na vinícola) de **"Presencial (no
   * canal)"** — a visita do representante, que acontece no estabelecimento do
   * CLIENTE (anexo, linha 348). `LOCAIS_DE_AGENDAMENTO` não tem como separar os
   * dois: é uma lista fechada de cinco valores (`lib/agenda/tipos.ts:56-64`) e
   * `in_person` é o único presencial. Quem carrega a diferença é a coluna
   * `location_details` (`supabase/baseline.sql:15127`), que já existe e é
   * `text` livre — e é ela que a tela de Agenda mostra ao lado do local
   * (`CAMPO_EXIGIDO_PELO_LOCAL` pede "endereco" justamente para `in_person`,
   * `lib/agenda/tipos.ts:75`).
   *
   * Sem este campo, os dois tipos nasceriam indistinguíveis e quem marcasse a
   * visita do representante não saberia para onde ir.
   */
  detalhesDoLocal?: string;
  /**
   * Antecedência SUGERIDA do lembrete, em minutos (15 a 10.080 pela rota).
   * O lembrete nasce DESLIGADO — quem liga é a vinícola, na tela de Agenda.
   */
  lembreteMinutosAntes?: number;
}

/** Um passo de cadência. Sempre `template`: o corpo mora numa resposta rápida. */
export interface PassoDeCadencia {
  /** 0 = imediato. Senão, de 300.000 a 7.776.000.000 ms (`waitConfigSchema`). */
  esperaMs: number;
  /** O atalho da resposta rápida desta jornada que carrega o corpo. */
  atalho: string;
}

export type GatilhoDaCadencia =
  | { kind: "manual" }
  | { kind: "appointment_no_show" }
  /** `nomeDaEtapa` é resolvido para o id real na aplicação. */
  | { kind: "stage_change"; nomeDaEtapa: string }
  /** 5 a 10.080 minutos. Não filtra por etapa — `segments` casa TAGS. */
  | { kind: "silence"; minutos: number };

export interface CadenciaDaJornada {
  nome: string;
  gatilho: GatilhoDaCadencia;
  /**
   * Quando presente, um nó `condition` entra entre o gatilho e o primeiro
   * passo: `lead_stage` `eq` o **id** desta etapa. Nome ou slug cairia sempre
   * no ramo "não", em silêncio (`lib/followup/node-handlers.ts:294`).
   */
  somenteNaEtapa?: string;
  passos: PassoDeCadencia[];
}

export interface JornadaDeVinicola {
  /** Como a vinícola se reconhece na lista do onboarding. */
  comoSeApresenta: string;
  /** O nome do funil. */
  nomeDoFunil: string;
  vocabulario: VocabularioDaJornada;
  etapas: EtapaDaJornada[];
  motivosDePerda: string[];
  campos: CustomFieldDef[];
  /** Tags canônicas do funil e da conversa. Minúsculas, até 40. */
  tags: string[];
  respostasRapidas: RespostaRapidaDaJornada[];
  tiposDeCompromisso: TipoDeCompromissoDaJornada[];
  cadencias: CadenciaDaJornada[];
}
```

- [ ] **Step 2:** Escrever o teste de forma ANTES dos dados — ele tem de falhar por arquivo inexistente.
  Criar `tests/unit/jornadas-de-vinicola-forma.test.ts`:

```ts
/**
 * A FORMA das quatro jornadas — o que o banco recusaria, trazido para antes dele.
 *
 * O texto vem do anexo (`docs/superpowers/specs/2026-09-15-bacco-jornadas-de-vinicola-conteudo.md`);
 * este arquivo não o repete. O que ele prende são as regras que, violadas,
 * chegariam como `23505` numa tela — ou, pior, como cadência que nunca dispara.
 *
 * As contagens saem do *Inventário* do anexo (linhas 1045-1096). Elas estão aqui
 * para que uma jornada não perca uma peça em silêncio num refactor.
 */
import { describe, expect, it } from "vitest";

import { CHAVES_DE_JORNADA, JORNADAS } from "@/lib/vertical/vinicola";
import { PASSOS_QUE_PRECISAM_DE_ETAPA, coberturaDoFunil } from "@/lib/leads/agent-mapping";
import { slugDeNome } from "@/lib/leads/stage-editing";
import { etapasParaGravar, MAX_ETAPAS, MIN_ETAPAS, validarProposta } from "@/lib/onboarding/proposta-de-funil";
import { CATEGORIAS_DE_AGENDAMENTO, LOCAIS_DE_AGENDAMENTO } from "@/lib/agenda/tipos";
import { customFieldSchema } from "@/lib/schemas/settings";

/** Inventário do anexo, por jornada: etapas, motivos, campos, tags, respostas, cadências, tipos. */
const INVENTARIO = {
  canal: { etapas: 8, motivos: 6, campos: 8, tags: 8, respostas: 17, cadencias: 3, tipos: 4 },
  enoturismo: { etapas: 7, motivos: 6, campos: 8, tags: 8, respostas: 17, cadencias: 4, tipos: 4 },
  clube: { etapas: 7, motivos: 6, campos: 8, tags: 8, respostas: 18, cadencias: 3, tipos: 4 },
  consumidor: { etapas: 7, motivos: 6, campos: 8, tags: 8, respostas: 15, cadencias: 3, tipos: 4 },
} as const;

/** Totais do anexo — a soma, conferida à parte, pega peça movida de jornada. */
const TOTAIS = { etapas: 29, motivos: 24, campos: 32, tags: 32, respostas: 67, cadencias: 13, tipos: 16 };

describe("o registro", () => {
  it("tem as quatro chaves, e só elas", () => {
    expect([...CHAVES_DE_JORNADA].sort()).toEqual(["canal", "clube", "consumidor", "enoturismo"]);
    expect(Object.keys(JORNADAS).sort()).toEqual(["canal", "clube", "consumidor", "enoturismo"]);
  });
});

describe("as contagens do Inventário do anexo", () => {
  it.each(CHAVES_DE_JORNADA)("%s bate peça por peça", (chave) => {
    const j = JORNADAS[chave];
    const esperado = INVENTARIO[chave];
    expect(j.etapas.length, "etapas").toBe(esperado.etapas);
    expect(j.motivosDePerda.length, "motivos de perda").toBe(esperado.motivos);
    expect(j.campos.length, "campos").toBe(esperado.campos);
    expect(j.tags.length, "tags").toBe(esperado.tags);
    expect(j.respostasRapidas.length, "respostas rápidas").toBe(esperado.respostas);
    expect(j.cadencias.length, "cadências").toBe(esperado.cadencias);
    expect(j.tiposDeCompromisso.length, "tipos de compromisso").toBe(esperado.tipos);
  });

  it("os totais fecham", () => {
    const soma = (f: (c: (typeof CHAVES_DE_JORNADA)[number]) => number) =>
      CHAVES_DE_JORNADA.reduce((t, c) => t + f(c), 0);
    expect(soma((c) => JORNADAS[c].etapas.length)).toBe(TOTAIS.etapas);
    expect(soma((c) => JORNADAS[c].motivosDePerda.length)).toBe(TOTAIS.motivos);
    expect(soma((c) => JORNADAS[c].campos.length)).toBe(TOTAIS.campos);
    expect(soma((c) => JORNADAS[c].tags.length)).toBe(TOTAIS.tags);
    expect(soma((c) => JORNADAS[c].respostasRapidas.length)).toBe(TOTAIS.respostas);
    expect(soma((c) => JORNADAS[c].cadencias.length)).toBe(TOTAIS.cadencias);
    expect(soma((c) => JORNADAS[c].tiposDeCompromisso.length)).toBe(TOTAIS.tipos);
  });
});

describe("o funil de cada jornada", () => {
  it.each(CHAVES_DE_JORNADA)("%s é aceito pelo próprio validador", (chave) => {
    const j = JORNADAS[chave];
    const r = validarProposta({ nome: j.nomeDoFunil, etapas: j.etapas });
    expect(r.ok ? [] : r.erros, chave).toEqual([]);
  });

  it.each(CHAVES_DE_JORNADA)("%s cabe entre o piso e o teto de etapas", (chave) => {
    const n = JORNADAS[chave].etapas.length;
    expect(n).toBeGreaterThanOrEqual(MIN_ETAPAS);
    expect(n).toBeLessThanOrEqual(MAX_ETAPAS);
  });

  it.each(CHAVES_DE_JORNADA)("%s tem exatamente uma de ganho e uma de perdido", (chave) => {
    const e = JORNADAS[chave].etapas;
    expect(e.filter((x) => x.passo === "won")).toHaveLength(1);
    expect(e.filter((x) => x.passo === "lost")).toHaveLength(1);
  });

  it.each(CHAVES_DE_JORNADA)("%s ensina o agente a percorrer o quadro inteiro", (chave) => {
    // O gate que `lib/onboarding/proposta-de-funil.test.ts:43` já cobra dos pacotes.
    const cobertura = coberturaDoFunil(
      JORNADAS[chave].etapas.map((e, i) => ({
        id: String(i),
        name: e.nome,
        is_won: e.passo === "won",
        is_lost: e.passo === "lost",
        agent_stage_hint: e.passo,
      })),
    );
    expect(cobertura.faltando, chave).toEqual([]);
    expect(cobertura.traduzidos, chave).toBe(PASSOS_QUE_PRECISAM_DE_ETAPA.length);
  });

  it.each(CHAVES_DE_JORNADA)("%s não repete dica de passo (uniq_crm_stages_pipeline_hint)", (chave) => {
    const dicas = JORNADAS[chave].etapas.map((e) => e.passo).filter((p): p is NonNullable<typeof p> => p !== null);
    expect(new Set(dicas).size).toBe(dicas.length);
  });

  it.each(CHAVES_DE_JORNADA)("%s produz slugs válidos e únicos dentro do funil", (chave) => {
    const j = JORNADAS[chave];
    const linhas = etapasParaGravar({ nome: j.nomeDoFunil, etapas: j.etapas }, slugDeNome);
    for (const l of linhas) expect(l.slug, `${chave}/${l.nome}`).toMatch(/^[a-z0-9_-]{2,40}$/);
    expect(new Set(linhas.map((l) => l.slug)).size).toBe(linhas.length);
    // `position` de 1000 em 1000 é o que o `midpoint()` do arrastar-e-soltar espera.
    expect(linhas.map((l) => l.position)).toEqual(linhas.map((_, i) => (i + 1) * 1000));
  });

  it("nenhuma etapa fala a língua de manual de vendas", () => {
    const jargao = /\b(MQL|SQL|lead scoring|prospec|funil de topo|fundo de funil|nutri)\w*/i;
    const sujos = CHAVES_DE_JORNADA.flatMap((c) =>
      JORNADAS[c].etapas.filter((e) => jargao.test(e.nome)).map((e) => `${c}: ${e.nome}`),
    );
    expect(sujos).toEqual([]);
  });

  it.each(CHAVES_DE_JORNADA)("%s renomeia as quatro palavras, dentro do limite", (chave) => {
    const v = JORNADAS[chave].vocabulario;
    for (const [k, texto] of Object.entries(v)) {
      expect(texto.length, `${chave}.${k}`).toBeGreaterThan(0);
      expect(texto.length, `${chave}.${k}`).toBeLessThanOrEqual(40);
    }
  });
});

describe("campos, motivos e tags", () => {
  it.each(CHAVES_DE_JORNADA)("%s tem campos que o schema aceita", (chave) => {
    for (const campo of JORNADAS[chave].campos) {
      const r = customFieldSchema.safeParse(campo);
      expect(r.success, `${chave}/${campo.key}: ${r.success ? "" : JSON.stringify(r.error.flatten())}`).toBe(true);
      expect(campo.key, `${chave}/${campo.key}`).toMatch(/^[a-z][a-z0-9_]*$/);
      if (campo.type === "select" || campo.type === "multiselect") {
        expect(campo.options, `${chave}/${campo.key} sem opções`).toBeDefined();
        for (const o of campo.options ?? []) {
          expect(o.value.length, `${chave}/${campo.key}`).toBeGreaterThan(0);
          expect(o.label.length, `${chave}/${campo.key}`).toBeGreaterThan(0);
          // `value` = slug do rótulo: é ele que fica no lead e que um relatório agrupa.
          expect(o.value, `${chave}/${campo.key}`).toMatch(/^[a-z0-9_]+$/);
        }
      }
    }
  });

  it.each(CHAVES_DE_JORNADA)("%s tem chave de campo única dentro da jornada", (chave) => {
    const chaves = JORNADAS[chave].campos.map((c) => c.key);
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it.each(CHAVES_DE_JORNADA)("%s tem motivo de perda dentro do limite de 80", (chave) => {
    for (const m of JORNADAS[chave].motivosDePerda) {
      expect(m.length, `${chave}: ${m}`).toBeGreaterThan(0);
      expect(m.length, `${chave}: ${m}`).toBeLessThanOrEqual(80);
    }
    expect(JORNADAS[chave].motivosDePerda.length).toBeLessThanOrEqual(50);
  });

  it.each(CHAVES_DE_JORNADA)("%s tem tag minúscula, sem espaço, até 40", (chave) => {
    for (const t of JORNADAS[chave].tags) expect(t, `${chave}: ${t}`).toMatch(/^[a-z0-9-]{1,40}$/);
    expect(new Set(JORNADAS[chave].tags).size).toBe(JORNADAS[chave].tags.length);
  });
});

describe("respostas rápidas", () => {
  it("os 67 atalhos são únicos em TODO o pacote", () => {
    // `message_templates` não tem unique por shortcut (`baseline.sql:7598`):
    // quem impede a colisão é este teste, não o banco.
    const atalhos = CHAVES_DE_JORNADA.flatMap((c) => JORNADAS[c].respostasRapidas.map((r) => r.atalho));
    expect(atalhos).toHaveLength(67);
    expect(new Set(atalhos).size).toBe(atalhos.length);
  });

  it("título e corpo cabem no que o schema aceita", () => {
    for (const c of CHAVES_DE_JORNADA) {
      for (const r of JORNADAS[c].respostasRapidas) {
        expect(r.titulo.length, `${c}/${r.atalho}`).toBeGreaterThanOrEqual(1);
        expect(r.titulo.length, `${c}/${r.atalho}`).toBeLessThanOrEqual(80);
        expect(r.corpo.length, `${c}/${r.atalho}`).toBeGreaterThanOrEqual(1);
        expect(r.corpo.length, `${c}/${r.atalho}`).toBeLessThanOrEqual(4096);
        expect(r.atalho, `${c}`).toMatch(/^\/[a-z0-9-]{1,39}$/);
      }
    }
  });

  it("nenhuma marcação com ponto — a regex do composer não a reconhece", () => {
    // `{{contact.name}}` sairia LITERAL no celular do cliente.
    for (const c of CHAVES_DE_JORNADA) {
      for (const r of JORNADAS[c].respostasRapidas) {
        expect(r.corpo, `${c}/${r.atalho}`).not.toMatch(/\{\{[^}]*\.[^}]*\}\}/);
      }
    }
  });
});

describe("cadências", () => {
  it("todo passo aponta para um atalho que existe NA MESMA jornada", () => {
    for (const c of CHAVES_DE_JORNADA) {
      const atalhos = new Set(JORNADAS[c].respostasRapidas.map((r) => r.atalho));
      for (const cad of JORNADAS[c].cadencias) {
        for (const p of cad.passos) {
          expect(atalhos.has(p.atalho), `${c}/${cad.nome} → ${p.atalho}`).toBe(true);
        }
      }
    }
  });

  it("nenhuma mensagem de cadência usa marcação de nome", () => {
    // O envio de follow-up só troca {{volta}}/{{voltas}}; o resto sai literal.
    for (const c of CHAVES_DE_JORNADA) {
      const usadosEmCadencia = new Set(JORNADAS[c].cadencias.flatMap((x) => x.passos.map((p) => p.atalho)));
      for (const r of JORNADAS[c].respostasRapidas) {
        if (!usadosEmCadencia.has(r.atalho)) continue;
        expect(r.corpo, `${c}/${r.atalho}`).not.toMatch(/\{\{\s*(nome|primeiro_nome)\s*\}\}/);
      }
    }
  });

  it("lacuna dentro de mensagem automática é declarada, e é UMA no pacote", () => {
    const marcadas = CHAVES_DE_JORNADA.flatMap((c) =>
      JORNADAS[c].respostasRapidas.filter((r) => r.revisarAntesDePublicar).map((r) => r.atalho),
    );
    expect(marcadas).toEqual(["/eno-pos-2"]);
    // E toda resposta usada em cadência que AINDA tem lacuna tem de estar marcada.
    for (const c of CHAVES_DE_JORNADA) {
      const emCadencia = new Set(JORNADAS[c].cadencias.flatMap((x) => x.passos.map((p) => p.atalho)));
      for (const r of JORNADAS[c].respostasRapidas) {
        if (!emCadencia.has(r.atalho)) continue;
        if (/\{\{[a-z_]+\}\}/.test(r.corpo)) {
          expect(r.revisarAntesDePublicar, `${c}/${r.atalho} tem lacuna e não está marcada`).toBe(true);
        }
      }
    }
  });

  it("espera de passo cabe na faixa do waitConfigSchema", () => {
    for (const c of CHAVES_DE_JORNADA) {
      for (const cad of JORNADAS[c].cadencias) {
        for (const p of cad.passos) {
          if (p.esperaMs === 0) continue;
          expect(p.esperaMs, `${c}/${cad.nome}`).toBeGreaterThanOrEqual(300_000);
          expect(p.esperaMs, `${c}/${cad.nome}`).toBeLessThanOrEqual(7_776_000_000);
        }
      }
    }
  });

  it("o gatilho tem motor — e silêncio cabe no teto de 7 dias", () => {
    for (const c of CHAVES_DE_JORNADA) {
      for (const cad of JORNADAS[c].cadencias) {
        const g = cad.gatilho;
        expect(["manual", "stage_change", "silence", "appointment_no_show"]).toContain(g.kind);
        if (g.kind === "silence") {
          expect(g.minutos, `${c}/${cad.nome}`).toBeGreaterThanOrEqual(5);
          expect(g.minutos, `${c}/${cad.nome}`).toBeLessThanOrEqual(10_080);
        }
        if (g.kind === "stage_change") {
          const nomes = JORNADAS[c].etapas.map((e) => e.nome);
          expect(nomes, `${c}/${cad.nome}`).toContain(g.nomeDaEtapa);
        }
        if (cad.somenteNaEtapa) {
          expect(JORNADAS[c].etapas.map((e) => e.nome)).toContain(cad.somenteNaEtapa);
        }
      }
    }
  });

  it("os 13 gatilhos, por tipo, são os do Inventário", () => {
    const todos = CHAVES_DE_JORNADA.flatMap((c) => JORNADAS[c].cadencias.map((x) => x.gatilho.kind));
    expect(todos).toHaveLength(13);
    const conta = (k: string) => todos.filter((x) => x === k).length;
    expect(conta("stage_change")).toBe(7);
    expect(conta("manual")).toBe(3);
    expect(conta("silence")).toBe(2);
    expect(conta("appointment_no_show")).toBe(1);
  });

  it("nome de cadência é único dentro da organização (unique organization_id, name)", () => {
    const nomes = CHAVES_DE_JORNADA.flatMap((c) => JORNADAS[c].cadencias.map((x) => x.nome));
    expect(new Set(nomes).size).toBe(nomes.length);
  });
});

describe("tipos de compromisso", () => {
  it("categoria, local e duração são os que o vocabulário aceita", () => {
    for (const c of CHAVES_DE_JORNADA) {
      for (const t of JORNADAS[c].tiposDeCompromisso) {
        expect(CATEGORIAS_DE_AGENDAMENTO, `${c}/${t.nome}`).toContain(t.categoria);
        expect(LOCAIS_DE_AGENDAMENTO, `${c}/${t.nome}`).toContain(t.local);
        expect(t.duracaoMinutos, `${c}/${t.nome}`).toBeGreaterThanOrEqual(5);
        expect(t.duracaoMinutos, `${c}/${t.nome}`).toBeLessThanOrEqual(1440);
        expect(t.nome.length, `${c}/${t.nome}`).toBeGreaterThanOrEqual(2);
        expect(t.nome.length, `${c}/${t.nome}`).toBeLessThanOrEqual(80);
        if (t.lembreteMinutosAntes !== undefined) {
          // Faixa da rota, mais estreita que a do banco.
          expect(t.lembreteMinutosAntes, `${c}/${t.nome}`).toBeGreaterThanOrEqual(15);
          expect(t.lembreteMinutosAntes, `${c}/${t.nome}`).toBeLessThanOrEqual(10_080);
        }
      }
    }
  });

  it("o slug derivado é único dentro da organização inteira", () => {
    // A unique real é (organization_id, slug) — atravessa jornadas.
    const slugs = CHAVES_DE_JORNADA.flatMap((c) =>
      JORNADAS[c].tiposDeCompromisso.map((t) => slugDeNome(t.nome, [], "tipo")),
    );
    expect(new Set(slugs).size, `slugs repetidos: ${slugs.join(", ")}`).toBe(slugs.length);
  });
});
```

- [ ] **Step 2b:** Rodar e VER FALHAR por módulo inexistente.

```bash
export PATH=/home/lussandro/.nvm/versions/node/v22.23.2/bin:$PATH && cd /home/lussandro/Bacco-Crm && pnpm exec vitest run tests/unit/jornadas-de-vinicola-forma.test.ts 2>&1 | tail -15
```
Expected: falha com `Cannot find module '@/lib/vertical/vinicola'` (ou `Failed to resolve import`). Verde aqui é impossível — se acontecer, pare: o arquivo foi criado no lugar errado.

- [ ] **Step 3:** Criar `lib/vertical/vinicola/canal.ts` copiando a **Jornada 1** do anexo
  (linhas 224-381): funil e vocabulário (§1), motivos (§2), campos (§3), tags (§4), respostas
  rápidas do operador **e** de cadência (§5), cadências (§6), tipos de agenda (§7). As **FAQs (§8) e
  as Lacunas (§9) NÃO entram em código** — §8 é material da fase do agente (decisão 18) e §9 é
  documentação da lacuna, que já viaja dentro do corpo das respostas.

Esqueleto exato a preencher com o texto do anexo (nada de resumir, nada de reescrever):

```ts
/**
 * Jornada 1 — Canal e revenda (B2B).
 *
 * Texto copiado do anexo da spec, §"Jornada 1 — Canal e revenda". Qualquer
 * mudança de conteúdo muda o anexo PRIMEIRO; este arquivo o segue.
 *
 * ⚠️ É a única jornada com 6 etapas de trabalho, logo a única com etapa sem
 * dica: `Amostra ou degustação`. Estado válido (`EtapaProposta.passo` é
 * `LeadStage | null`) e que não tira a cobertura de 5/5 — `coberturaDoFunil` só
 * conta as dicas presentes (`lib/leads/agent-mapping.ts:295-301`).
 */
import type { JornadaDeVinicola } from "./tipos";

const DIA = 24 * 60 * 60 * 1000;

export const CANAL: JornadaDeVinicola = {
  comoSeApresenta: "Vender para restaurantes, empórios e distribuidores",
  nomeDoFunil: "Canal e revenda",
  vocabulario: { lead: "Contato comercial", deal: "Proposta", won: "Pedido fechado", lost: "Não fechou" },
  etapas: [
    { nome: "Novo contato", passo: "new" },
    { nome: "Entendendo o canal", passo: "contacted" },
    { nome: "Cadastro conferido", passo: "qualifying" },
    { nome: "Tabela enviada", passo: "qualified" },
    { nome: "Amostra ou degustação", passo: null },
    { nome: "Negociando pedido", passo: "negotiating" },
    { nome: "Pedido fechado", passo: "won" },
    { nome: "Não fechou", passo: "lost" },
  ],
  motivosDePerda: [
    // As seis linhas da tabela §2 do anexo, no texto exato.
  ],
  campos: [
    // As oito linhas da tabela §3, com `key`, `label`, `type` e `options` {value,label}.
  ],
  tags: [
    // As oito de §4.
  ],
  respostasRapidas: [
    // As dez do operador + as sete de cadência de §5, com título, atalho e corpo exatos.
  ],
  tiposDeCompromisso: [
    // As quatro de §7. ⚠️ *Visita do representante* é o único "Presencial (no
    // canal)" do pacote (anexo, linha 348): `local: "in_person"` MAIS
    // `detalhesDoLocal: "No estabelecimento do cliente"`. Sem o complemento ele
    // fica idêntico a uma visita na vinícola, e quem marcar vai para o lugar
    // errado.
  ],
  cadencias: [
    {
      nome: "Canal · tabela enviada sem retorno",
      gatilho: { kind: "stage_change", nomeDaEtapa: "Tabela enviada" },
      passos: [
        { esperaMs: 2 * DIA, atalho: "/canal-tabela-1" },
        { esperaMs: 5 * DIA, atalho: "/canal-tabela-2" },
        { esperaMs: 10 * DIA, atalho: "/canal-tabela-3" },
      ],
    },
    {
      nome: "Canal · silêncio na negociação",
      gatilho: { kind: "silence", minutos: 7 * 24 * 60 },
      passos: [
        { esperaMs: 0, atalho: "/canal-silencio-1" },
        { esperaMs: 7 * DIA, atalho: "/canal-silencio-2" },
      ],
    },
    {
      nome: "Canal · recompra",
      gatilho: { kind: "manual" },
      passos: [
        { esperaMs: 0, atalho: "/canal-recompra-1" },
        { esperaMs: 7 * DIA, atalho: "/canal-recompra-2" },
      ],
    },
  ],
};
```

⚠️ O nome da cadência leva o prefixo da jornada (`Canal · `, `Enoturismo · `, `Clube · `, `Loja · `)
porque `followup_flow_pointers` tem `unique (organization_id, name)`
(`supabase/baseline.sql:7330`) e uma vinícola pode aplicar as quatro.

- [ ] **Step 4:** Criar `lib/vertical/vinicola/enoturismo.ts` com a **Jornada 2** do anexo (linhas
  384-609), mesmo esqueleto. Pontos que o anexo obriga e que o teste mede:
  - a cadência **B** leva `somenteNaEtapa: "Escolhendo data"` (o gatilho de silêncio não filtra por
    etapa — `segments` casa tags, `lib/followup/silence-sweep.ts:36-39`);
  - a cadência **C** usa `{ kind: "appointment_no_show" }`;
  - `/eno-pos-2` leva `revisarAntesDePublicar: true` — é a **única** do pacote inteiro;
  - *Visita guiada*, *Degustação* e *Visita + refeição* levam `lembreteMinutosAntes: 1440`.

- [ ] **Step 5:** Criar `lib/vertical/vinicola/clube.ts` com a **Jornada 3** (linhas 612-782). A
  cadência **A** tem gatilho `stage_change` em **`Plano escolhido`** (não *Aguardando adesão*), e a
  **B** tem um passo de 30 dias — `30 * DIA = 2_592_000_000 ms`, dentro do teto de `7_776_000_000`.

- [ ] **Step 6:** Criar `lib/vertical/vinicola/consumidor.ts` com a **Jornada 4** (linhas 786-938). A
  cadência **C** (*Recompra*) é `{ kind: "manual" }` — silêncio de 60 dias não existe no motor.

- [ ] **Step 7:** Criar `lib/vertical/vinicola/index.ts`:

```ts
/**
 * O registro das jornadas de vinícola. É por aqui que onboarding, tela e
 * aplicador chegam ao conteúdo — nunca importando os arquivos de dados direto.
 */
import { CANAL } from "./canal";
import { CLUBE } from "./clube";
import { CONSUMIDOR } from "./consumidor";
import { ENOTURISMO } from "./enoturismo";
import type { JornadaDeVinicola } from "./tipos";

export * from "./tipos";

export type ChaveDeJornada = "canal" | "enoturismo" | "clube" | "consumidor";

/**
 * A versão do PACOTE, gravada no ledger junto de cada aplicação.
 *
 * Existe para responder "de que versão saiu o que está no banco desta
 * organização" depois que o conteúdo mudar. Sobe quando o TEXTO de uma jornada
 * muda de forma que importe para quem já aplicou — não a cada correção de vírgula.
 */
export const VERSAO_DO_PACOTE = 1;

export const JORNADAS: Readonly<Record<ChaveDeJornada, JornadaDeVinicola>> = {
  canal: CANAL,
  enoturismo: ENOTURISMO,
  clube: CLUBE,
  consumidor: CONSUMIDOR,
};

/** Ordem estável: é a que a tela e o onboarding mostram. */
export const CHAVES_DE_JORNADA = ["canal", "enoturismo", "clube", "consumidor"] as const;

export function ehChaveDeJornada(v: unknown): v is ChaveDeJornada {
  return typeof v === "string" && (CHAVES_DE_JORNADA as readonly string[]).includes(v);
}
```

- [ ] **Step 8:** Rodar o teste de forma e ver **passar**.

```bash
export PATH=/home/lussandro/.nvm/versions/node/v22.23.2/bin:$PATH && cd /home/lussandro/Bacco-Crm && pnpm exec vitest run tests/unit/jornadas-de-vinicola-forma.test.ts 2>&1 | tail -12
```
Expected: `Test Files 1 passed`, todos os casos verdes. Falha de contagem = o arquivo de dados perdeu
uma linha do anexo; **volte ao anexo**, não ajuste o número esperado.

- [ ] **Step 9:** Typecheck e lint só do que mudou entrar no todo.

```bash
export PATH=/home/lussandro/.nvm/versions/node/v22.23.2/bin:$PATH && cd /home/lussandro/Bacco-Crm && NODE_OPTIONS=--max-old-space-size=6144 pnpm typecheck && pnpm lint 2>&1 | tail -5
```
Expected: exit 0 nos dois.

- [ ] **Step 10: Commit**

```bash
cd /home/lussandro/Bacco-Crm && git add lib/vertical tests/unit/jornadas-de-vinicola-forma.test.ts && git commit -m "feat(bacco): definições das quatro jornadas de vinícola

Dados puros em lib/vertical/vinicola/, um arquivo por jornada, com o texto
copiado do anexo da spec. O teste de forma prende as contagens do Inventário,
a cobertura 5/5, o slug derivado e os 67 atalhos únicos.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2 — O aplicador

**Files:**
- Modify: `lib/audit/actions.ts` (acrescentar `"vertical.jornada_aplicada"` **no fim** do array, depois de `"platform_admin.tenant_agents_viewed"`, linha 550)
- Create: `lib/vertical/vinicola/aplicar.ts`
- Create: `tests/unit/jornadas-de-vinicola-aplicar.test.ts`

**Interfaces:**

Consumes:
- `createAdminClient()` de `@/lib/supabase/admin`
- `audit(entry)` de `@/lib/audit` (`lib/audit/index.ts:51`)
- `etapasParaGravar`, `slugDeNome`
- `JORNADAS`, `VERSAO_DO_PACOTE`, `ChaveDeJornada`

Produces:
```ts
export type EstadoDaPeca = "criada" | "ja_existia" | "no_ledger_e_apagada" | "falhou";
export interface PecaDoRelatorio { tipo: "funil" | "etapa" | "config" | "tag" | "resposta_rapida" | "tipo_de_compromisso" | "cadencia"; chave: string; estado: EstadoDaPeca; erro?: string }
export interface RelatorioDaJornada { chave: ChaveDeJornada; versao: number; pecas: PecaDoRelatorio[]; completa: boolean }
export async function aplicarJornada(organizationId: string, chave: ChaveDeJornada, atorUserId: string | null): Promise<RelatorioDaJornada>;
export interface EntradaDoLedger { versao_do_pacote: number; aplicada_em: string; pecas: string[] }
export async function lerLedger(organizationId: string): Promise<Partial<Record<ChaveDeJornada, EntradaDoLedger>>>;
export async function estadoDaJornada(organizationId: string, chave: ChaveDeJornada): Promise<"nao_aplicada" | "aplicada" | "parcial">;

/**
 * Promove o funil da jornada a padrão da organização. Só o ONBOARDING chama.
 *
 * Existe porque o passo do funil do wizard promete, em texto, que o quadro de
 * loja online "é substituído" (`app/onboarding/funil/_client.tsx:198`) — e com
 * jornada marcada o wizard não chama mais a RPC que o substituía (Task 3). Sem
 * isto, a vinícola termina o onboarding com "Carrinho abandonado" como quadro
 * padrão e o funil dela ao lado, e a tela terá mentido.
 *
 * ⚠️ DUAS ESCRITAS, NESTA ORDEM, E NÃO DÁ PARA FAZER EM UMA.
 * `uniq_crm_pipelines_org_default` é um índice único PARCIAL sobre
 * `(organization_id) where is_default = true` (`supabase/baseline.sql:2902`):
 * marcar o novo antes de desmarcar o velho colide com 23505. Primeiro apaga a
 * flag do atual, depois acende a do novo — e, se a segunda falhar, DEVOLVE a
 * flag ao antigo, porque uma organização sem funil padrão quebra o próprio
 * wizard (`carregarQuadroAtual` filtra por `is_default` e devolve null,
 * `app/actions/onboarding/montarQuadro.ts:89-94`).
 *
 * É a ÚNICA escrita do pacote sobre linha que já existia, fora o merge de
 * `organizations.settings` — e por isso está aqui, nomeada, e não escondida
 * dentro de `aplicarJornada`.
 */
export async function tornarPadrao(organizationId: string, pipelineId: string): Promise<{ ok: boolean; erro?: string }>;
```

- [ ] **Step 1:** Acrescentar a ação de auditoria **no fim** de `AUDIT_ACTIONS`.

```ts
  // A primeira ação com prefixo `vertical.` — o pacote de conteúdo do fork.
  //
  // As ações por peça (`pipeline.created`, `followup_flow.created`, …) já
  // registram cada linha criada, e nenhuma delas responde QUEM ativou
  // *Enoturismo*, quando, em que versão do pacote e se o resultado saiu
  // completo. Sem esta linha a auditoria mostra dez criações avulsas — que é o
  // modo de falha que o cabeçalho deste arquivo descreve: a ausência lê-se como
  // "isso não acontece".
  "vertical.jornada_aplicada",
] as const;
```

- [ ] **Step 2:** Rodar o teste que deriva o painel de auditoria — ele não pode reprovar.

```bash
export PATH=/home/lussandro/.nvm/versions/node/v22.23.2/bin:$PATH && cd /home/lussandro/Bacco-Crm && pnpm exec vitest run tests/unit/audit-lista-do-painel-e-derivada.test.tsx 2>&1 | tail -8
```
Expected: exit 0. (A lista da tela é derivada de `AUDIT_ACTIONS`; a ação nova aparece sozinha.)

- [ ] **Step 3:** Escrever o teste do aplicador ANTES da implementação.
  Criar `tests/unit/jornadas-de-vinicola-aplicar.test.ts`, seguindo o padrão de dublê de
  `app/api/v1/agenda/tipos/route.test.ts:79-140` — o dublê **aplica os filtros de verdade**, senão o
  caso de isolamento mediria o dublê em vez do aplicador:

```ts
/**
 * O aplicador — e os quatro desfechos que só o ledger separa.
 *
 * O caminho feliz é o que menos precisa de guarda. O que esta entrega promete e
 * que o banco NÃO garante sozinho: reaplicar não duplica (`message_templates`
 * não tem unique por `shortcut`, `baseline.sql:7598`) e o que a vinícola apagou
 * não volta (chave natural ausente não distingue "nunca criei" de "criei e
 * apagaram"). As duas promessas vivem no ledger, e é o que se mede aqui.
 *
 * O dublê APLICA os filtros: sem isso, apagar o `.eq("organization_id", …)` do
 * aplicador deixaria o caso de isolamento verde.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

import { createAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { aplicarJornada, estadoDaJornada, lerLedger } from "@/lib/vertical/vinicola/aplicar";
import { JORNADAS, VERSAO_DO_PACOTE, type ChaveDeJornada } from "@/lib/vertical/vinicola";
import { slugDeNome } from "@/lib/leads/stage-editing";

const ORG = "22222222-2222-4222-8222-222222222222";
const OUTRA_ORG = "33333333-3333-4333-8333-333333333333";
const ATOR = "11111111-1111-4111-8111-111111111111";

type Linha = Record<string, unknown> & { id: string };

/** O banco de mentira: tabelas em memória, com os filtros aplicados de verdade. */
function bancoFalso(inicial: Partial<Record<string, Linha[]>> = {}) {
  const tabelas: Record<string, Linha[]> = {
    organizations: [{ id: ORG, settings: {} }, { id: OUTRA_ORG, settings: {} }],
    crm_pipelines: [],
    crm_stages: [],
    message_templates: [],
    calendar_event_types: [],
    followup_flow_pointers: [],
    ...inicial,
  } as Record<string, Linha[]>;

  /** Toda escrita que chegou, na ordem — é o que prova a ordem obrigatória. */
  const ordem: string[] = [];
  /**
   * ⚠️ ID É UUID, e isto não é preciosismo de dublê.
   *
   * Duas peças do contrato real exigem UUID e reprovariam um `id-0001`:
   * `actionConfigSchema` modo `template` pede `template_id: z.string().uuid()`
   * (`lib/followup/graph-schema.ts:222`) e o gatilho `stage_change` pede
   * `params.stage_id: z.string().uuid()` (`lib/followup/api-schemas.ts:32`).
   * Como o Step 7 passa o grafo e o gatilho pelos schemas DE VERDADE, um id
   * sintético faria o teste reprovar **por construção** — e a leitura natural
   * seria "o aplicador está errado", quando o errado era o banco de mentira.
   * `crypto.randomUUID()` é do runtime do Node 22, sem dependência nova.
   */
  const novoId = () => crypto.randomUUID();
  /** Tabelas que devem falhar no insert, para o caso de relatório parcial. */
  const quebradas = new Set<string>();

  /**
   * As tabelas em que TODA query precisa filtrar `organization_id` na mão.
   *
   * O aplicador roda com admin client, que bypassa a RLS: aqui o filtro não é
   * otimização, é a única fronteira que existe. O dublê o COBRA — sem isto,
   * apagar um `.eq("organization_id", …)` do aplicador deixaria o caso de
   * isolamento verde, que é o modo de falha nº 10 do CLAUDE.md.
   */
  const TENANT_AWARE = new Set([
    "crm_pipelines",
    "crm_stages",
    "message_templates",
    "calendar_event_types",
    "followup_flow_pointers",
  ]);

  function builder(tabela: string) {
    const filtros: Record<string, unknown[]> = {};
    let op: "select" | "insert" | "update" = "select";
    let campos: Record<string, unknown> = {};

    /** Um filtro casa quando o valor da linha está no CONJUNTO pedido. */
    const casa = (l: Linha) =>
      Object.entries(filtros).every(([k, vs]) => vs.includes(l[k]));

    /**
     * `organizations` é filtrada por `id`, as demais por `organization_id`.
     * Insert declara a organização no corpo, não no filtro.
     */
    function exigirFiltroDeOrganizacao() {
      if (!TENANT_AWARE.has(tabela)) return;
      if (op === "insert") {
        expect(
          campos.organization_id,
          `insert em ${tabela} sem organization_id no corpo — a linha nasceria órfã`,
        ).toBeDefined();
        return;
      }
      expect(
        filtros.organization_id,
        `${op} em ${tabela} SEM filtro de organization_id — o admin client bypassa a RLS, ` +
          `então esta query alcançaria a organização do vizinho`,
      ).toBeDefined();
    }

    function resolver(um: boolean) {
      exigirFiltroDeOrganizacao();
      if (op === "insert") {
        ordem.push(`insert:${tabela}`);
        if (quebradas.has(tabela)) {
          return { data: null, error: { code: "XX000", message: `falha proposital em ${tabela}` } };
        }
        const nova = { id: novoId(), ...campos } as Linha;
        tabelas[tabela]!.push(nova);
        return { data: nova, error: null };
      }
      if (op === "update") {
        ordem.push(`update:${tabela}`);
        const alvo = tabelas[tabela]!.filter(casa);
        for (const l of alvo) Object.assign(l, campos);
        return { data: um ? (alvo[0] ?? null) : alvo, error: null };
      }
      const achadas = tabelas[tabela]!.filter(casa);
      return { data: um ? (achadas[0] ?? null) : achadas, error: null };
    }

    const api: Record<string, unknown> = {
      select: () => api,
      insert: (v: Record<string, unknown>) => { op = "insert"; campos = v; return api; },
      update: (v: Record<string, unknown>) => { op = "update"; campos = v; return api; },
      eq: (c: string, v: unknown) => { filtros[c] = [v]; return api; },
      // `.in()` é CONJUNTO. A versão anterior deste dublê fazia
      // `filtros[c] = vs[0]` — guardava só o primeiro valor —, e com isso a
      // pré-leitura dos 17 atalhos de uma jornada devolvia só o primeiro,
      // fazendo o aplicador recriar os 16 restantes: o caso "reaplicar não
      // duplica" mediria o defeito do dublê e passaria assim mesmo.
      in: (c: string, vs: unknown[]) => { filtros[c] = [...vs]; return api; },
      neq: (c: string, v: unknown) => {
        // Só o `select` de slugs de funil usa; nega dentro do mesmo conjunto.
        const todos = tabelas[tabela]!.map((l) => l[c]).filter((x) => x !== v);
        filtros[c] = [...new Set(todos)];
        return api;
      },
      order: () => api,
      single: async () => resolver(true),
      maybeSingle: async () => resolver(true),
      then: (r: (x: unknown) => unknown) => Promise.resolve(resolver(false)).then(r),
    };
    return api;
  }

  vi.mocked(createAdminClient).mockReturnValue({
    from: (tabela: string) => builder(tabela),
  } as unknown as ReturnType<typeof createAdminClient>);

  return { tabelas, ordem, quebradas };
}

/**
 * A segunda organização, semeada com as chaves naturais EM CONFLITO.
 *
 * Os slugs e atalhos são exatamente os que a jornada vai criar em `ORG`. Se o
 * aplicador ler sem filtrar `organization_id`, ele acha estas linhas, conclui
 * "já existia" e NÃO cria nada em `ORG` — a jornada sai vazia e o relatório
 * mente. É o vazamento silencioso, e é por isso que o conflito é proposital.
 */
function semearOutraOrganizacao(banco: ReturnType<typeof bancoFalso>, chave: ChaveDeJornada) {
  const j = JORNADAS[chave];
  banco.tabelas.crm_pipelines!.push({
    id: crypto.randomUUID(),
    organization_id: OUTRA_ORG,
    name: j.nomeDoFunil,
    slug: slugDeNome(j.nomeDoFunil, [], "funil"),
  });
  for (const r of j.respostasRapidas) {
    banco.tabelas.message_templates!.push({
      id: crypto.randomUUID(),
      organization_id: OUTRA_ORG,
      shortcut: r.atalho,
      title: r.titulo,
      body: "TEXTO DA OUTRA VINÍCOLA — não pode ser lido nem alterado",
    });
  }
  for (const t of j.tiposDeCompromisso) {
    banco.tabelas.calendar_event_types!.push({
      id: crypto.randomUUID(),
      organization_id: OUTRA_ORG,
      slug: slugDeNome(t.nome, [], "tipo"),
      name: t.nome,
    });
  }
}

beforeEach(() => vi.clearAllMocks());

describe("aplicar numa organização vazia", () => {
  it("cria o funil, as etapas, os modelos, os tipos e as cadências", async () => {
    const banco = bancoFalso();
    const r = await aplicarJornada(ORG, "enoturismo", ATOR);

    const j = JORNADAS.enoturismo;
    expect(r.completa).toBe(true);
    expect(banco.tabelas.crm_pipelines).toHaveLength(1);
    expect(banco.tabelas.crm_stages).toHaveLength(j.etapas.length);
    expect(banco.tabelas.message_templates).toHaveLength(j.respostasRapidas.length);
    expect(banco.tabelas.calendar_event_types).toHaveLength(j.tiposDeCompromisso.length);
    expect(banco.tabelas.followup_flow_pointers).toHaveLength(j.cadencias.length);
    expect(r.pecas.filter((p) => p.estado === "criada").length).toBe(r.pecas.length);
  });

  it("toda linha nasce com o organization_id pedido, e nenhuma na outra organização", async () => {
    const banco = bancoFalso();
    await aplicarJornada(ORG, "canal", ATOR);
    for (const t of ["crm_pipelines", "crm_stages", "message_templates", "calendar_event_types", "followup_flow_pointers"]) {
      for (const l of banco.tabelas[t]!) expect(l.organization_id, t).toBe(ORG);
    }
  });
});

describe("a organização do vizinho", () => {
  // O caso que o dublê antigo não conseguia medir. A outra organização é
  // semeada com os MESMOS slugs e atalhos que a jornada vai criar: é a
  // coincidência de chave natural que um `select` sem filtro confundiria.
  it("não é lida: o pacote entra inteiro mesmo com as chaves naturais ocupadas lá", async () => {
    const banco = bancoFalso();
    semearOutraOrganizacao(banco, "canal");
    const j = JORNADAS.canal;

    const r = await aplicarJornada(ORG, "canal", ATOR);

    expect(r.completa, "ler a outra organização faria tudo parecer 'já existia'").toBe(true);
    const daOrg = (t: string) => banco.tabelas[t]!.filter((l) => l.organization_id === ORG);
    expect(daOrg("crm_pipelines")).toHaveLength(1);
    expect(daOrg("message_templates")).toHaveLength(j.respostasRapidas.length);
    expect(daOrg("calendar_event_types")).toHaveLength(j.tiposDeCompromisso.length);
    expect(r.pecas.every((p) => p.estado === "criada")).toBe(true);
  });

  it("não é alterada: nenhuma linha dela muda de conteúdo", async () => {
    const banco = bancoFalso();
    semearOutraOrganizacao(banco, "canal");
    const antes = JSON.stringify(
      Object.values(banco.tabelas).flat().filter((l) => l.organization_id === OUTRA_ORG),
    );

    await aplicarJornada(ORG, "canal", ATOR);

    const depois = JSON.stringify(
      Object.values(banco.tabelas).flat().filter((l) => l.organization_id === OUTRA_ORG),
    );
    expect(depois, "o aplicador tocou a organização do vizinho").toBe(antes);
    // E o `settings` dela também não recebeu ledger nenhum.
    const outra = banco.tabelas.organizations!.find((o) => o.id === OUTRA_ORG)!;
    expect((outra.settings as Record<string, unknown>).bacco_jornadas).toBeUndefined();
  });

  it("a resposta rápida nasce compartilhada — a cadência aponta para ela", async () => {
    const banco = bancoFalso();
    await aplicarJornada(ORG, "clube", ATOR);
    for (const l of banco.tabelas.message_templates!) expect(l.owner_user_id).toBeNull();
  });

  it("o tipo de compromisso nasce com o lembrete DESLIGADO, explícito", async () => {
    // O DDL base tem default TRUE (`baseline.sql:15148`); só o apêndice o vira
    // false. Herdar o default mandaria mensagem ao cliente num clone atrasado.
    const banco = bancoFalso();
    await aplicarJornada(ORG, "enoturismo", ATOR);
    for (const l of banco.tabelas.calendar_event_types!) expect(l.reminder_enabled).toBe(false);
  });

  it("a cadência nasce em rascunho e nunca é publicada", async () => {
    const banco = bancoFalso();
    await aplicarJornada(ORG, "consumidor", ATOR);
    for (const l of banco.tabelas.followup_flow_pointers!) {
      expect(l.status).toBe("draft");
      expect(l.active_version_id ?? null).toBeNull();
    }
  });

  it("a condição por etapa grava o ID da etapa, nunca o nome", async () => {
    // O motor compara por igualdade contra o stage_id do lead
    // (`lib/followup/node-handlers.ts:294`); nome cairia sempre no ramo "não".
    const banco = bancoFalso();
    await aplicarJornada(ORG, "enoturismo", ATOR);
    const ids = new Set(banco.tabelas.crm_stages!.map((e) => e.id));
    const comCondicao = banco.tabelas.followup_flow_pointers!.filter((f) =>
      JSON.stringify(f.draft_graph).includes("lead_stage"),
    );
    expect(comCondicao.length).toBeGreaterThan(0);
    for (const f of comCondicao) {
      const grafo = JSON.stringify(f.draft_graph);
      const usados = [...grafo.matchAll(/"value":"([^"]+)"/g)].map((m) => m[1]!);
      for (const v of usados) expect(ids.has(v), `valor ${v} não é id de etapa`).toBe(true);
    }
  });

  it("o gatilho de mudança de etapa aponta para o id da etapa desta organização", async () => {
    const banco = bancoFalso();
    await aplicarJornada(ORG, "consumidor", ATOR);
    const ids = new Set(banco.tabelas.crm_stages!.map((e) => e.id));
    for (const f of banco.tabelas.followup_flow_pointers!) {
      const cfg = f.trigger_config as { kind: string; params?: { stage_id?: string } };
      if (cfg.kind !== "stage_change") continue;
      expect(ids.has(cfg.params!.stage_id!)).toBe(true);
    }
  });
});

describe("a ordem obrigatória", () => {
  it("o funil vem antes das etapas, e os modelos antes das cadências", async () => {
    const banco = bancoFalso();
    await aplicarJornada(ORG, "canal", ATOR);
    const primeiro = (t: string) => banco.ordem.indexOf(`insert:${t}`);
    const ultimo = (t: string) => banco.ordem.lastIndexOf(`insert:${t}`);
    expect(primeiro("crm_pipelines")).toBeLessThan(primeiro("crm_stages"));
    // Cadência que aponta para modelo inexistente só falha no ENVIO, em runtime.
    expect(ultimo("message_templates")).toBeLessThan(primeiro("followup_flow_pointers"));
    expect(primeiro("crm_stages")).toBeLessThan(primeiro("followup_flow_pointers"));
  });
});

describe("o ledger", () => {
  it("grava a versão, o carimbo e as chaves das peças, fundindo com as irmãs", async () => {
    const banco = bancoFalso({
      organizations: [{ id: ORG, settings: { onboarding: { passo: 3 } } }],
    });
    await aplicarJornada(ORG, "clube", ATOR);
    const org = banco.tabelas.organizations!.find((o) => o.id === ORG)!;
    const settings = org.settings as Record<string, unknown>;
    // A chave irmã SOBREVIVE — substituir o settings inteiro apagaria o onboarding.
    expect(settings.onboarding).toEqual({ passo: 3 });
    const ledger = (settings.bacco_jornadas as Record<string, { versao_do_pacote: number; pecas: string[] }>).clube;
    expect(ledger.versao_do_pacote).toBe(VERSAO_DO_PACOTE);
    expect(ledger.pecas.length).toBeGreaterThan(0);
    expect(await lerLedger(ORG)).toHaveProperty("clube");
  });
});

describe("reaplicar", () => {
  it("não duplica nada", async () => {
    const banco = bancoFalso();
    await aplicarJornada(ORG, "consumidor", ATOR);
    const antes = Object.fromEntries(Object.entries(banco.tabelas).map(([t, l]) => [t, l.length]));
    const r = await aplicarJornada(ORG, "consumidor", ATOR);
    for (const [t, n] of Object.entries(antes)) expect(banco.tabelas[t]!.length, t).toBe(n);
    expect(r.pecas.every((p) => p.estado !== "criada")).toBe(true);
  });

  it("não sobrescreve o que a vinícola editou", async () => {
    const banco = bancoFalso();
    await aplicarJornada(ORG, "consumidor", ATOR);
    const modelo = banco.tabelas.message_templates![0]!;
    modelo.body = "Texto que a vinícola reescreveu";
    await aplicarJornada(ORG, "consumidor", ATOR);
    expect(modelo.body).toBe("Texto que a vinícola reescreveu");
  });

  it("NÃO recria o que o ledger diz que existiu e sumiu", async () => {
    // A diferença entre respeitar a decisão da vinícola e desfazê-la.
    const banco = bancoFalso();
    await aplicarJornada(ORG, "consumidor", ATOR);
    const apagado = banco.tabelas.message_templates!.pop()!;
    const r = await aplicarJornada(ORG, "consumidor", ATOR);
    expect(banco.tabelas.message_templates!.some((l) => l.shortcut === apagado.shortcut)).toBe(false);
    expect(r.pecas.some((p) => p.estado === "no_ledger_e_apagada")).toBe(true);
  });

  it("a jornada com peça ausente lê como parcial", async () => {
    const banco = bancoFalso();
    await aplicarJornada(ORG, "consumidor", ATOR);
    expect(await estadoDaJornada(ORG, "consumidor")).toBe("aplicada");
    banco.tabelas.calendar_event_types!.pop();
    expect(await estadoDaJornada(ORG, "consumidor")).toBe("parcial");
    expect(await estadoDaJornada(ORG, "clube")).toBe("nao_aplicada");
  });
});

describe("quando algo falha no meio", () => {
  it("devolve relatório parcial e NÃO lança", async () => {
    // Lançar deixaria a tela sem dizer o que entrou e o que não entrou — e
    // metade do pacote no banco, invisível.
    const banco = bancoFalso();
    banco.quebradas.add("calendar_event_types");
    const r = await aplicarJornada(ORG, "enoturismo", ATOR);
    expect(r.completa).toBe(false);
    expect(r.pecas.some((p) => p.estado === "falhou")).toBe(true);
    // O que veio ANTES do passo que falhou entrou.
    expect(banco.tabelas.crm_pipelines).toHaveLength(1);
    // E o erro real do banco viaja para a tela, sem máscara.
    expect(r.pecas.find((p) => p.estado === "falhou")!.erro).toContain("falha proposital");
  });
});

describe("auditoria", () => {
  it("registra a aplicação da jornada, além das peças", async () => {
    bancoFalso();
    await aplicarJornada(ORG, "canal", ATOR);
    const acoes = vi.mocked(audit).mock.calls.map((c) => c[0].action);
    expect(acoes).toContain("vertical.jornada_aplicada");
    expect(acoes).toContain("pipeline.created");
    expect(acoes).toContain("followup_flow.created");
    const linha = vi.mocked(audit).mock.calls.find((c) => c[0].action === "vertical.jornada_aplicada")![0];
    expect(linha.organizationId).toBe(ORG);
    expect(linha.actorUserId).toBe(ATOR);
    expect(linha.metadata).toMatchObject({ jornada: "canal", versao: VERSAO_DO_PACOTE });
  });
});
```

- [ ] **Step 4:** Rodar e VER FALHAR.

```bash
export PATH=/home/lussandro/.nvm/versions/node/v22.23.2/bin:$PATH && cd /home/lussandro/Bacco-Crm && pnpm exec vitest run tests/unit/jornadas-de-vinicola-aplicar.test.ts 2>&1 | tail -12
```
Expected: falha resolvendo `@/lib/vertical/vinicola/aplicar`.

- [ ] **Step 5:** Implementar `lib/vertical/vinicola/aplicar.ts`. O cabeçalho e a espinha:

```ts
/**
 * APLICAR UMA JORNADA — a única peça deste pacote que toca o banco.
 *
 * ⚠️ NÃO USA `POST /api/v1/pipelines`, `POST /pipelines/:id/stages` nem
 * `updatePipelineConfig`, e as três recusas são medidas:
 *  - a rota de funil SEMPRE insere `ETAPAS_INICIAIS` com `is_won`/`is_lost` já
 *    ocupados (`lib/pipelines/pipeline-editing.ts:261-271`), e os uniques
 *    parciais `uniq_crm_stages_pipeline_won`/`_lost` não deixam a jornada nomear
 *    a própria etapa de ganho;
 *  - a rota de etapa aceita só `{ name }` (`app/api/v1/pipelines/[id]/stages/route.ts:39`);
 *  - `updatePipelineConfig` é server action de sessão e não aceita
 *    `organizationId` (`app/actions/settings/updatePipelineConfig.ts:37`) — o
 *    onboarding precisa aplicar numa organização que pode não ser a do cookie.
 *
 * Admin client + filtro MANUAL de `organization_id` em toda query, com o id
 * vindo da sessão ou do contexto do onboarding — nunca do body. Mesmo desenho
 * de `app/actions/onboarding/montarQuadro.ts:214`.
 *
 * ⚠️ A ORDEM É OBRIGATÓRIA, e cada elo tem um modo de falha silencioso:
 *  1. funil + etapas       — sem id de etapa, gatilho e condição não têm alvo
 *  2. vocabulário/campos/motivos — mesmo `settings`, gravado de uma vez
 *  3. tags                 — funil e conversa, por merge
 *  4. respostas rápidas    — cadência que aponta para modelo inexistente só
 *                            falha NO ENVIO, em runtime
 *  5. tipos de compromisso — pré-lê por slug; 23505 é "já existia"
 *  6. cadências            — em rascunho, com os ids REAIS desta organização
 */
```

Regras que a implementação segue, uma a uma:

1. **Ledger antes de tudo.** Ler `organizations.settings` (`select("settings").eq("id", organizationId).maybeSingle()`),
   extrair `bacco_jornadas[chave]`. Peça que **já consta no ledger não é criada**; se ela também não
   existe no banco, o relatório recebe `no_ledger_e_apagada`.
2. **A peça do ledger grava o ID DA LINHA e a chave natural — e quem decide existência é o ID.**
   A entrada é `{ id, chave }`, nunca a string solta:

   ```ts
   export interface PecaDoLedger {
     /** O `id` uuid que o INSERT devolveu. É a identidade. */
     id: string;
     /** `resposta:/canal-tabela-1`, `etapa:novo_contato`, … — rótulo LEGÍVEL. */
     chave: string;
   }
   ```

   **Por que o id manda, e a chave natural não pode mandar.** A existência é decidida por
   `select("id").in("id", idsDoLedger)`: um id é imutável e não é editável por ninguém na tela. A chave
   natural, não — e cada uma das três é editável pela própria vinícola:

   | Peça | Chave natural | O que a vinícola faz com ela |
   |---|---|---|
   | resposta rápida | `shortcut` | edita o atalho na tela de modelos |
   | cadência | `name` | renomeia o fluxo |
   | funil | `name` | renomeia o funil |

   Decidir existência pela chave natural faria **renomear** ler como **apagar**: a peça sumiria da
   conta, a jornada apareceria como *parcial* na tela, e a tela diria à vinícola que ela removeu algo
   que está lá, com outro nome. Pior, no sentido inverso: reaplicar recriaria uma segunda cópia com o
   nome antigo, ao lado da renomeada.

   ⚠️ **Uma correção de medida, porque a versão anterior deste passo citava a evidência errada.** A
   justificativa dizia que *renomear etapa recalcula o slug*, apontando
   `lib/leads/stage-operations.ts:244`. **Medido, é o contrário:** aquela linha é do caminho de
   CRIAÇÃO, e o comentário imediatamente acima dela (`:242-243`) diz textualmente *"Slug nasce com a
   etapa e nunca muda (renomear não o toca)"*. O slug de etapa é estável. A decisão continua de pé —
   ela se sustenta nas três linhas da tabela acima, que são editáveis de verdade —, e a chave natural
   fica no ledger como **rótulo legível**, para a tela poder dizer *o que* falta em vez de listar uuid.
3. **Funil.** Ler os slugs dos funis existentes da organização, derivar o do funil com
   `slugDeNome(j.nomeDoFunil, existentes, "funil")`, `insert` com `is_default: false`,
   `position: 1000`, `vocabulary` e `settings` já montados (passo 2 na **mesma** linha — um insert só).
   `settings` = `{ fields: j.campos, canonical_tags: j.tags, lost_reasons: j.motivosDePerda,
   identity_resolution: { fields_in_priority_order: ["cpf", "phone_e164", "email"] } }` (o mesmo
   default do DDL, `supabase/baseline.sql:1487`). Auditar `pipeline.created`; e `pipeline.config_updated`
   para a configuração.

   ⚠️ **`vocabulary` tem OITO chaves no DDL e a jornada define QUATRO — mescle, nunca substitua.** O
   default da coluna é
   `jsonb_build_object('lead','Cliente','lead_plural','Clientes','deal','Pedido','deal_plural','Pedidos','won','Pago','lost','Cancelado','stage','Etapa','stage_plural','Etapas')`
   (`supabase/baseline.sql:1486`). Gravar só as quatro da jornada **apaga as outras quatro** — os
   plurais e o nome de "Etapa" —, e o que aparece na tela no lugar delas é o que cada consumidor puser
   de fallback, tela a tela. O insert monta o objeto completo:

   ```ts
   const VOCABULARIO_PADRAO = {
     lead: "Cliente", lead_plural: "Clientes",
     deal: "Pedido", deal_plural: "Pedidos",
     won: "Pago", lost: "Cancelado",
     stage: "Etapa", stage_plural: "Etapas",
   } as const;

   // As quatro da jornada POR CIMA das oito do default. O plural fica o do
   // produto até alguém decidir o contrário — e "Etapas" continua "Etapas".
   const vocabulary = { ...VOCABULARIO_PADRAO, ...j.vocabulario };
   ```
4. **Etapas.** `etapasParaGravar({ nome: j.nomeDoFunil, etapas: j.etapas }, slugDeNome)` e um insert
   por linha, com `organization_id` e `pipeline_id`. Guardar `nome → id` num `Map` — é ele que as
   cadências consultam. Auditar `pipeline.stage_created` por etapa.
5. **Tags de conversa.** Merge em `organizations.settings.canonical_conversation_tags` (a chave que o
   produto lê, `lib/operacao/marcadores-e-time.ts:58`), união com o que já está lá, truncada em 50.
6. **Respostas rápidas.** Pré-ler `message_templates` da organização por `shortcut`; criar as que
   faltam com `owner_user_id: null`, `title`, `body`, `shortcut`. Guardar `atalho → id`. Auditar
   `template.created`.
7. **Tipos de compromisso.** Pré-ler `calendar_event_types` por slug; criar com
   `slug: slugDeNome(t.nome, existentes, "tipo")`, `category`, `duration_minutes`, `location_kind`,
   **`reminder_enabled: false`** e, quando houver, `reminder_minutes_before`. `error.code === "23505"`
   é tratado como *já existia*, não como erro. Auditar `agenda.tipo_criado`.
8. **Cadências.** Para cada uma: `insert` em `followup_flow_pointers` com `organization_id`, `name`,
   `trigger_config` (com `params.stage_id` resolvido pelo `Map` quando `stage_change`) e
   `draft_graph` montado por `grafoDaCadencia(cad, idsDeEtapa, idsDeModelo)`. Não passar `status`: o
   default do banco é `'draft'` (`supabase/baseline.sql:7323`) — mas **passar explicitamente
   `status: "draft"`** pela mesma razão do lembrete: o default é do apêndice-vizinho e um clone não é
   auditado por nós. Auditar `followup_flow.created`.
9. **Nada de `update` em linha existente.** Em lugar nenhum. A única escrita em linha que já existia é
   o merge de `organizations.settings`.
10. **Nenhum `throw` sai daqui.** Erro de qualquer peça vira `{ estado: "falhou", erro: error.message }`
    — **com o texto real do banco**, nunca "falha na operação" — e a aplicação segue para a peça
    seguinte, salvo quando o funil falha (sem funil não há onde pendurar nada: aí o relatório volta
    com só essa peça).
11. **Ledger no fim**, por merge, com `versao_do_pacote: VERSAO_DO_PACOTE`,
    `aplicada_em: new Date().toISOString()` e `pecas` = união das peças já constantes com as criadas
    agora (cada uma `{ id, chave }`, regra 2). Depois,
    `audit({ action: "vertical.jornada_aplicada", ... metadata: { jornada, versao, pecas } })`.
12. **A promessa de concorrência é IDEMPOTÊNCIA SEQUENCIAL, e o plano diz isso com todas as letras.**
    Uma aplicação depois da outra não duplica nada. **Duas abas ao mesmo tempo NÃO estão protegidas**, e
    não adianta prometer que estão: não há trava no banco para pendurar a promessa —
    `message_templates` não tem unique por `shortcut` (`supabase/baseline.sql:7598`), o ledger é um
    `jsonb` cujo merge é ler-modificar-gravar (a segunda gravação vence), e esta entrega **não abre
    migration** (Global Constraints). O que existe, e que basta para o uso real:

    - **A tela desabilita o botão enquanto a aplicação corre** (Task 4) — é o que fecha a porta do
      clique duplo, que é a corrida que acontece de verdade;
    - **duas abas simultâneas** podem produzir peça duplicada. Declarado aqui, não escondido. Quem
      quiser a garantia forte paga uma unique parcial numa fase própria, com migration e apêndice.

    ⚠️ **A pré-leitura por chave natural vale SEMPRE, mesmo antes de existir ledger**, e é ela que
    protege o desfecho mais provável de todos: a aplicação que **falha no meio**, depois de criar
    metade das peças e antes de gravar o ledger. Na tentativa seguinte o ledger está vazio para aquela
    jornada — e é a pré-leitura (`select` por `shortcut`, por `slug`, por `name`) que encontra o que já
    entrou e o marca como `ja_existia` em vez de criar a segunda cópia. Ledger e pré-leitura respondem a
    perguntas diferentes: a pré-leitura responde *"isto existe agora?"*, o ledger responde *"isto já
    existiu alguma vez?"* — e só a segunda distingue apagado de nunca-criado.

O construtor do grafo, que é a parte com armadilha:

```ts
/**
 * O grafo de uma cadência: início → [condição] → (espera → mensagem)* → fim.
 *
 * Molde conferido contra `scripts/lib/grafo-de-demonstracao.ts:47-112`, o único
 * grafo do repo que passa pelo `flowGraphSchema` de verdade num teste.
 *
 * Toda mensagem é modo `template` — nunca `text`. Dois efeitos que se sustentam
 * sozinhos: o texto fica editável na tela de respostas rápidas, e o mesmo texto
 * serve ao operador no envio manual, onde o composer resolve `{{nome}}`.
 * (E de quebra `long_wait_needs_template` não se aplica: ele só alcança nó
 * `ai_message` — `lib/followup/validate-publish.ts:216`.)
 *
 * `esperaMs === 0` NÃO vira nó `wait`: o piso do `waitConfigSchema` é 300.000 ms
 * (`lib/followup/graph-schema.ts:88-90`) e um nó de espera zerada seria
 * recusado na validação.
 *
 * ⚠️ IDS ÚNICOS DE NÓ **E DE ARESTA**. O `superRefine` do `flowGraphSchema`
 * (`lib/followup/graph-schema.ts:436-474`) reprova id de nó repetido, id de
 * ARESTA repetido e aresta apontando para nó inexistente. O contador `n` abaixo
 * serve aos dois: nome de nó e nome de aresta saem dele.
 *
 * ⚠️ `priority` é obrigatório na prática: `flowEdgeSchema` o declara com
 * `.default(0)` (`:396`), e como o grafo é gravado como `jsonb` — e não passa
 * pelo parse na gravação — omiti-lo deixaria a aresta sem o campo no banco.
 * Escrevemos `priority: 0` explícito, como faz o único grafo do repo que passa
 * pelo schema num teste (`scripts/lib/grafo-de-demonstracao.ts:93-111`).
 */
function grafoDaCadencia(
  cad: CadenciaDaJornada,
  idDaEtapa: (nome: string) => string,
  idDoModelo: (atalho: string) => string,
): { nodes: unknown[]; edges: unknown[] } {
  const nodes: unknown[] = [];
  const edges: unknown[] = [];
  let n = 0;
  /** Um id por nó, e o mesmo contador nomeia a aresta que chega nele. */
  const proximo = (prefixo: string) => `${prefixo}-${++n}`;
  let x = 0;
  const pos = () => ({ x: (x += 240), y: 0 });

  const ligar = (source: string, target: string, condicao: unknown) => {
    edges.push({ id: `e-${edges.length + 1}`, source, target, priority: 0, condition: condicao });
  };
  const SEMPRE = { type: "always" } as const;

  // ── início ────────────────────────────────────────────────────────────────
  const inicio = proximo("trigger");
  nodes.push({ id: inicio, type: "trigger", label: "Início", position: { x: 0, y: 0 }, config: {} });

  // ── o fim, criado já: toda saída precisa de caminho até ele ───────────────
  const fim = "end-1";
  const fimCedo = "end-2";

  let anterior = inicio;

  // ── a condição por etapa, quando a cadência a declara ─────────────────────
  //
  // ⚠️ MODO `combined`, E É POR ISSO QUE AS DUAS ARESTAS SÃO ESCRITAS À MÃO.
  // `validateFlowForPublish` só cobra cobertura de ramo no modo `per_check`
  // (`lib/followup/validate-publish.ts:343-348`: "É deliberado que o modo
  // combinado fique de fora"). Ou seja: um nó `condition` combinado com apenas
  // a aresta do "sim" PASSA no publish — e o lead que cair no "não" fica parado
  // no nó, para sempre, sem erro em lugar nenhum. O validador não pega; quem
  // pega é escrever as duas, sempre, e o teste do Step 7.
  if (cad.somenteNaEtapa) {
    const cond = proximo("condition");
    nodes.push({
      id: cond,
      type: "condition",
      label: "Ainda está nesta etapa?",
      position: pos(),
      config: {
        combinator: "and",
        checks: [{ field: "lead_stage", op: "eq", value: idDaEtapa(cad.somenteNaEtapa) }],
      },
    });
    ligar(anterior, cond, SEMPRE);
    // Sim: segue a cadência. Não: encerra na hora, sem mandar nada.
    ligar(cond, fimCedo, { type: "cond_result", value: false });
    anterior = cond;
    // A aresta do "sim" sai do `cond` para o primeiro passo, logo abaixo.
  }

  const saidaDaCondicao = cad.somenteNaEtapa
    ? ({ type: "cond_result", value: true } as const)
    : SEMPRE;

  // ── os passos: (espera) → mensagem ────────────────────────────────────────
  cad.passos.forEach((passo, i) => {
    const condicaoDaAresta = i === 0 ? saidaDaCondicao : SEMPRE;

    let origem = anterior;
    if (passo.esperaMs > 0) {
      const espera = proximo("wait");
      nodes.push({
        id: espera,
        type: "wait",
        label: `Espera ${Math.round(passo.esperaMs / 86_400_000)}d`,
        position: pos(),
        config: { mode: "fixed", duration_ms: passo.esperaMs },
      });
      ligar(origem, espera, condicaoDaAresta);
      origem = espera;
    }

    const msg = proximo("action");
    nodes.push({
      id: msg,
      type: "action",
      label: passo.atalho,
      position: pos(),
      // Sempre `template`: o texto fica editável fora do construtor e serve ao
      // operador no envio manual. `template_id` é `z.string().uuid()`
      // (`lib/followup/graph-schema.ts:222`) — o id REAL do modelo desta
      // organização, resolvido agora.
      config: { mode: "template", template_id: idDoModelo(passo.atalho) },
    });
    ligar(origem, msg, passo.esperaMs > 0 ? SEMPRE : condicaoDaAresta);
    anterior = msg;
  });

  // ── o fim ─────────────────────────────────────────────────────────────────
  nodes.push({
    id: fim,
    type: "end",
    label: "Encerra",
    position: pos(),
    config: { outcome: "exhausted" },
  });
  ligar(anterior, fim, SEMPRE);

  if (cad.somenteNaEtapa) {
    nodes.push({
      id: fimCedo,
      type: "end",
      label: "Encerra: mudou de etapa",
      position: { x: 240, y: 200 },
      config: { outcome: "exhausted" },
    });
  }

  return { nodes, edges };
}
```

**O grafo que isso gera para uma cadência real** — *Enoturismo · silêncio antes de marcar a data*
(anexo, cadência **B** da jornada 2: gatilho de silêncio de 3 dias, condição em *Escolhendo data*,
passo 1 imediato `/eno-data-1`, passo 2 com 4 dias `/eno-data-2`). É o caso mais completo do pacote —
o único com nó de condição — e por isso é o que vale escrever por extenso:

```jsonc
{
  "nodes": [
    { "id": "trigger-1",   "type": "trigger",   "label": "Início",                 "position": { "x": 0,    "y": 0 },   "config": {} },
    { "id": "condition-2", "type": "condition", "label": "Ainda está nesta etapa?", "position": { "x": 240,  "y": 0 },
      "config": { "combinator": "and",
                  "checks": [{ "field": "lead_stage", "op": "eq",
                               "value": "9f1c…-id-real-da-etapa-Escolhendo-data" }] } },
    // passo 1 tem esperaMs 0 → NÃO gera nó `wait` (piso de 300.000 ms)
    { "id": "action-3",    "type": "action",    "label": "/eno-data-1",             "position": { "x": 480,  "y": 0 },
      "config": { "mode": "template", "template_id": "3b7a…-id-real-do-modelo" } },
    { "id": "wait-4",      "type": "wait",      "label": "Espera 4d",               "position": { "x": 720,  "y": 0 },
      "config": { "mode": "fixed", "duration_ms": 345600000 } },
    { "id": "action-5",    "type": "action",    "label": "/eno-data-2",             "position": { "x": 960,  "y": 0 },
      "config": { "mode": "template", "template_id": "c012…-id-real-do-modelo" } },
    { "id": "end-1",       "type": "end",       "label": "Encerra",                 "position": { "x": 1200, "y": 0 },
      "config": { "outcome": "exhausted" } },
    { "id": "end-2",       "type": "end",       "label": "Encerra: mudou de etapa", "position": { "x": 240,  "y": 200 },
      "config": { "outcome": "exhausted" } }
  ],
  "edges": [
    { "id": "e-1", "source": "trigger-1",   "target": "condition-2", "priority": 0, "condition": { "type": "always" } },
    // ⚠️ a aresta do "não" — a que o validador NÃO cobra no modo combinado
    { "id": "e-2", "source": "condition-2", "target": "end-2",       "priority": 0, "condition": { "type": "cond_result", "value": false } },
    { "id": "e-3", "source": "condition-2", "target": "action-3",    "priority": 0, "condition": { "type": "cond_result", "value": true } },
    { "id": "e-4", "source": "action-3",    "target": "wait-4",      "priority": 0, "condition": { "type": "always" } },
    { "id": "e-5", "source": "wait-4",      "target": "action-5",    "priority": 0, "condition": { "type": "always" } },
    { "id": "e-6", "source": "action-5",    "target": "end-1",       "priority": 0, "condition": { "type": "always" } }
  ]
}
```

Sete nós, seis arestas, todos os ids únicos, todo nó alcançável a partir do `trigger-1` e todo nó com
caminho até um `end` — que é exatamente o que o Step 7 mede.

- [ ] **Step 6:** Rodar o teste do aplicador e ver **passar**.

```bash
export PATH=/home/lussandro/.nvm/versions/node/v22.23.2/bin:$PATH && cd /home/lussandro/Bacco-Crm && pnpm exec vitest run tests/unit/jornadas-de-vinicola-aplicar.test.ts 2>&1 | tail -12
```
Expected: `Test Files 1 passed`, todos os casos verdes.

- [ ] **Step 7:** Provar que o grafo gerado passa pelo validador REAL, não só pelo dublê. Acrescentar
  ao fim de `tests/unit/jornadas-de-vinicola-aplicar.test.ts`:

⚠️ **`flowGraphSchema` sozinho NÃO basta, e é a diferença entre um grafo bem formado e um grafo que
funciona.** Ele é `strictObject` + um `superRefine` que só cobra ids únicos e aresta apontando para nó
existente (`lib/followup/graph-schema.ts:436-474`). **Nada ali exige trigger único, alcançabilidade,
nem caminho até um `end`** — isso mora em `validateFlowForPublish`
(`lib/followup/validate-publish.ts:271-340`: `no_trigger`, `multiple_triggers`, `unreachable_node`,
`no_end_path`). Um grafo com um nó órfão passaria no `safeParse`, seria gravado como `jsonb` sem
reclamação, e só falharia no dia em que a vinícola clicasse em **Publicar**.

O retorno **não** é uma lista: é `{ ok: true }` ou `{ ok: false; errors }`
(`lib/followup/validate-publish.ts:34-36`) — `.errors` não existe no caso feliz, então a asserção é
contra o objeto inteiro.

```ts
describe("o grafo gerado é aceito pelo schema de verdade", () => {
  it.each(["canal", "enoturismo", "clube", "consumidor"] as const)("%s", async (chave) => {
    const { flowGraphSchema } = await import("@/lib/followup/graph-schema");
    const banco = bancoFalso();
    await aplicarJornada(ORG, chave, ATOR);
    for (const f of banco.tabelas.followup_flow_pointers!) {
      const r = flowGraphSchema.safeParse(f.draft_graph);
      expect(r.success, `${chave}/${String(f.name)}: ${r.success ? "" : JSON.stringify(r.error.flatten())}`).toBe(true);
    }
  });

  it.each(["canal", "enoturismo", "clube", "consumidor"] as const)(
    "%s: e passa nas regras de PUBLICAÇÃO, que são as que o schema não tem",
    async (chave) => {
      const { flowGraphSchema } = await import("@/lib/followup/graph-schema");
      const { validateFlowForPublish } = await import("@/lib/followup/validate-publish");
      const banco = bancoFalso();
      await aplicarJornada(ORG, chave, ATOR);
      for (const f of banco.tabelas.followup_flow_pointers!) {
        const grafo = flowGraphSchema.parse(f.draft_graph);
        expect(validateFlowForPublish(grafo), `${chave}/${String(f.name)}`).toEqual({ ok: true });
      }
    },
  );

  it("o nó de condição tem as DUAS arestas — o publish não cobra isso", async () => {
    // A cadência B do enoturismo é a única com `condition`, e ela é `combined`.
    // `validateFlowForPublish` só cobra cobertura de ramo no modo `per_check`
    // (`lib/followup/validate-publish.ts:343-348`, com o motivo escrito lá: não
    // reprovar fluxos v1 que já rodam). Consequência medida: um `condition`
    // combinado com só a aresta do "sim" PASSA no publish, e o lead que cair no
    // "não" fica parado no nó para sempre, sem erro em lugar nenhum.
    //
    // Por isso a régua é aqui, e não no validador.
    const banco = bancoFalso();
    await aplicarJornada(ORG, "enoturismo", ATOR);
    const comCondicao = banco.tabelas.followup_flow_pointers!.filter((f) =>
      (f.draft_graph as { nodes: { type: string }[] }).nodes.some((n) => n.type === "condition"),
    );
    expect(comCondicao.length, "o enoturismo perdeu o nó de condição").toBeGreaterThan(0);

    for (const f of comCondicao) {
      const g = f.draft_graph as {
        nodes: { id: string; type: string }[];
        edges: { source: string; condition: { type: string; value?: boolean } }[];
      };
      for (const no of g.nodes.filter((x) => x.type === "condition")) {
        const resultados = g.edges
          .filter((e) => e.source === no.id && e.condition.type === "cond_result")
          .map((e) => e.condition.value);
        expect(
          [...resultados].sort(),
          `${String(f.name)}/${no.id}: ramo sem aresta — o lead para aqui em silêncio`,
        ).toEqual([false, true]);
      }
    }
  });

  it.each(["canal", "enoturismo", "clube", "consumidor"] as const)("%s: o gatilho também", async (chave) => {
    const { triggerConfigSchema } = await import("@/lib/followup/api-schemas");
    const banco = bancoFalso();
    await aplicarJornada(ORG, chave, ATOR);
    for (const f of banco.tabelas.followup_flow_pointers!) {
      const r = triggerConfigSchema.safeParse(f.trigger_config);
      expect(r.success, `${chave}/${String(f.name)}`).toBe(true);
    }
  });
});
```

```bash
export PATH=/home/lussandro/.nvm/versions/node/v22.23.2/bin:$PATH && cd /home/lussandro/Bacco-Crm && pnpm exec vitest run tests/unit/jornadas-de-vinicola-aplicar.test.ts 2>&1 | tail -12
```
Expected: exit 0. Recusa do `flowGraphSchema` = conserte o **grafo**, nunca afrouxe o teste: o INSERT
aceitaria o jsonb quebrado sem reclamar, e a falha só apareceria quando alguém abrisse o construtor.

- [ ] **Step 8:** Typecheck e lint.

```bash
export PATH=/home/lussandro/.nvm/versions/node/v22.23.2/bin:$PATH && cd /home/lussandro/Bacco-Crm && NODE_OPTIONS=--max-old-space-size=6144 pnpm typecheck && pnpm lint 2>&1 | tail -5
```
Expected: exit 0 nos dois.

- [ ] **Step 9: Commit**

```bash
cd /home/lussandro/Bacco-Crm && git add lib/vertical/vinicola/aplicar.ts lib/audit/actions.ts tests/unit/jornadas-de-vinicola-aplicar.test.ts && git commit -m "feat(bacco): aplicador das jornadas, com ledger e auditoria

Grava funil, etapas, configuração, tags, respostas rápidas, tipos de
compromisso e cadências em rascunho, na ordem obrigatória, por admin client
com filtro manual de organization_id. O ledger em
organizations.settings.bacco_jornadas é o que faz reaplicar não duplicar e o
que a vinícola apagou não voltar. Ação nova vertical.jornada_aplicada.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3 — Onboarding com seleção múltipla

**Files:**
- Modify: `lib/onboarding/pacotes-de-funil.ts:34-101` (os três pacotes de vinícola saem; entram os quatro derivados das jornadas; `generico` fica)
- Modify: `lib/onboarding/sugerir-funil.ts:44-76` (as pistas passam a apontar para as chaves novas; nasce `sugerirJornadas`)
- Modify: `lib/onboarding/sugerir-funil.test.ts` (reescrito)
- Modify: `app/onboarding/funil/_client.tsx` (seleção múltipla)
- Modify: `app/onboarding/funil/page.tsx` (passa as jornadas sugeridas)
- Modify: `app/actions/onboarding/montarQuadro.ts:190-274` (`aplicarQuadro` ganha os **dois caminhos**)
- Modify: `lib/i18n/dicionario.ts` (o espanhol da interface NOVA do passo do funil — ver Step 7b)
- Modify: `tests/e2e/bacco-evidencia.spec.ts:214` (a medida do nome do funil, que os nomes novos tornam falsa)
- Modify: `app/actions/onboarding/montarQuadro.test.ts` (os quatro casos dos dois caminhos — Step 8b)

**Interfaces:**

Consumes: `JORNADAS`, `CHAVES_DE_JORNADA`, `ehChaveDeJornada`, `aplicarJornada`.

Produces:
```ts
// lib/onboarding/pacotes-de-funil.ts — ids passam a ser as chaves de jornada + "generico"
export const PACOTES: readonly PacoteDeFunil[];
// lib/onboarding/sugerir-funil.ts
export function sugerirJornadas(texto: string): ChaveDeJornada[];
```

- [ ] **Step 1:** Reescrever `lib/onboarding/sugerir-funil.test.ts` com os 13 casos de tabela
  apontando para as chaves novas, mais o fallback. A régua não muda — o que o arquivo vigia é que o
  texto digitado no celular (sem acento, em maiúscula, no plural) chegue à jornada certa, e que o
  desconhecido caia no `generico` em vez de cair em nada:

```ts
describe("escolher a jornada pelo que o dono escreveu", () => {
  // O dono digita no celular: sem acento, em maiúscula, no plural, no feminino.
  it.each([
    ["Vendemos para restaurantes e empórios", "canal"],
    ["distribuidora de vinhos", "canal"],
    ["Venda para hotéis e bares", "canal"],
    ["RESTAURANTES E EMPORIOS", "canal"],
    ["Recebemos turistas para degustação", "enoturismo"],
    ["degustacoes e visitas guiadas", "enoturismo"],
    ["enoturismo", "enoturismo"],
    ["clube de assinatura", "clube"],
    ["assinatura mensal de vinhos", "clube"],
    ["Loja virtual de vinhos para o consumidor", "consumidor"],
    // Só "vinícola"/"vinho", sem público: B2B (decisão do dono, 2026-09-15).
    ["vinícola", "canal"],
    ["VINICOLA", "canal"],
    ["vendemos vinho", "canal"],
  ])("%s → %s", (texto, id) => {
    expect(escolherPacotePorTexto(texto).id).toBe(id);
  });

  it("cai no genérico quando não reconhece — nunca em nada", () => {
    expect(escolherPacotePorTexto("xyzzy").id).toBe(PACOTE_PADRAO.id);
    expect(escolherPacotePorTexto("").id).toBe(PACOTE_PADRAO.id);
    expect(escolherPacotePorTexto("consultório odontológico").id).toBe(PACOTE_PADRAO.id);
  });

  it("sugere VÁRIAS jornadas quando o texto nomeia várias", () => {
    // É o que muda nesta entrega: a vinícola que faz as três coisas marca as três.
    expect(sugerirJornadas("vinícola com visitas, clube de assinatura e loja virtual").sort())
      .toEqual(["clube", "consumidor", "enoturismo"]);
    expect(sugerirJornadas("só vendemos para restaurantes")).toEqual(["canal"]);
  });

  it("não sugere nada quando não reconhece vinícola nenhuma", () => {
    // Não marcar nada é desfecho legítimo: o onboarding segue com o pacote genérico.
    expect(sugerirJornadas("consultório odontológico")).toEqual([]);
  });
});
```
⚠️ Os blocos `describe("o pedido")`, `describe("achar o JSON…")` e `describe("sugerir")` do arquivo
atual (`lib/onboarding/sugerir-funil.test.ts:65-157`) **continuam como estão**, trocando só o id
esperado na linha 118 (`clientes_vinicola` → `canal`). Eles vigiam o caminho da IA, que não muda.

- [ ] **Step 2:** Rodar e ver falhar.

```bash
export PATH=/home/lussandro/.nvm/versions/node/v22.23.2/bin:$PATH && cd /home/lussandro/Bacco-Crm && pnpm exec vitest run lib/onboarding/sugerir-funil.test.ts 2>&1 | tail -12
```
Expected: vermelho — `sugerirJornadas` não existe e os ids antigos ainda são os retornados.

- [ ] **Step 3:** Trocar os três pacotes de vinícola em `lib/onboarding/pacotes-de-funil.ts` pelos
  quatro derivados das jornadas. O pacote passa a ser **projeção** da jornada, não uma segunda cópia:

```ts
import { CHAVES_DE_JORNADA, JORNADAS } from "@/lib/vertical/vinicola";

/**
 * Os quadros prontos. Os de vinícola são PROJEÇÃO das jornadas
 * (`lib/vertical/vinicola/`), não uma segunda lista: o quadro que o wizard
 * mostra e o que a jornada semeia têm de ser o MESMO, e duas listas divergiriam
 * no primeiro ajuste de etapa.
 *
 * ⚠️ Os três pacotes antigos (`clientes_vinicola`, `enoturismo_interesse`,
 * `consumidor_vinho`) saíram. Organizações já instaladas não são alteradas — o
 * pacote só vive no passo do onboarding.
 */
export const PACOTES: readonly PacoteDeFunil[] = [
  ...CHAVES_DE_JORNADA.map((chave) => ({
    id: chave,
    comoSeApresenta: JORNADAS[chave].comoSeApresenta,
    proposta: { nome: JORNADAS[chave].nomeDoFunil, etapas: JORNADAS[chave].etapas },
  })),
  {
    // Último de propósito: quem não se reconhece em nenhum já leu todos.
    id: "generico",
    comoSeApresenta: "Outro tipo de negócio",
    // As sete etapas atuais, copiadas sem uma vírgula de diferença
    // (`lib/onboarding/pacotes-de-funil.ts:88-99`). Elas são o plano B de quem
    // NÃO é vinícola, e nada nesta entrega as toca.
    proposta: {
      nome: "Clientes",
      etapas: [
        { nome: "Novo contato", passo: "new" },
        { nome: "Já respondi", passo: "contacted" },
        { nome: "Entendendo a necessidade", passo: "qualifying" },
        { nome: "Proposta enviada", passo: "qualified" },
        { nome: "Negociando", passo: "negotiating" },
        { nome: "Fechou", passo: "won" },
        { nome: "Não fechou", passo: "lost" },
      ],
    },
  },
] as const;
```

⚠️ **O `as const` do fim do array é preservado** — ele está lá hoje
(`lib/onboarding/pacotes-de-funil.ts:101`) e `PACOTE_PADRAO` depende do array continuar sendo o que é
(`:104-110`, com o `throw` que existe justamente para o caso de o genérico sumir).

- [ ] **Step 4:** Em `lib/onboarding/sugerir-funil.ts`, trocar as chaves de `PISTAS` (`:44-50`) para
  `canal` / `enoturismo` / `clube` / `consumidor`, separando o clube do consumidor (hoje `clube` e
  `assinatura` caem em `consumidor_vinho`, `:47`), e acrescentar `sugerirJornadas`:

```ts
const PISTAS: Record<string, RegExp> = {
  canal: /\b(restaurant|emp[óo]ri|distribuid|revend|atacad|bares\b|bar\b|hot[ée]is|hotel|sommelier|carta de vinho)/i,
  clube: /\b(clube|assinatura|assinante)/i,
  consumidor: /\b(consumidor|cliente final|varej|loja virtual|loja online|e-?commerce|delivery|venda direta)/i,
  enoturismo: /\b(enoturism|visita|degusta[çc]|turist|passeio|tour\b|harmoniza[çc]|vindima)/i,
};

/**
 * TODAS as jornadas que o texto do dono nomeia — não só a primeira.
 *
 * `escolherPacotePorTexto` continua devolvendo UMA, porque o exemplo que vai no
 * pedido à IA é um só. Aqui a pergunta é outra: quais jornadas marcar na tela.
 * Uma vinícola que recebe visita, tem clube e vende na loja faz as três coisas,
 * e obrigá-la a escolher uma seria escolher por ela.
 *
 * Lista vazia é desfecho legítimo: quem não é vinícola não marca nada, e o
 * passo segue com o quadro que ele já monta.
 */
export function sugerirJornadas(texto: string): ChaveDeJornada[] {
  const achadas = CHAVES_DE_JORNADA.filter((c) => PISTAS[c]?.test(texto));
  if (achadas.length > 0) return [...achadas];
  return PISTA_DE_VINICOLA.test(texto) ? ["canal"] : [];
}
```

- [ ] **Step 5:** Rodar os dois arquivos de onboarding e ver **passar**.

```bash
export PATH=/home/lussandro/.nvm/versions/node/v22.23.2/bin:$PATH && cd /home/lussandro/Bacco-Crm && pnpm exec vitest run lib/onboarding 2>&1 | tail -12
```
Expected: exit 0, incluindo `lib/onboarding/proposta-de-funil.test.ts` — que agora itera as quatro
jornadas pelo mesmo gate (validador, cobertura 5/5, jargão, id único). Reprovação ali significa que
uma jornada não cabe no gate; o conserto é no **conteúdo**, não no teste.

- [ ] **Step 6:** `app/onboarding/funil/page.tsx` — passar as jornadas sugeridas ao cliente:

```tsx
  const { atual, sugestao } = await dadosDoPasso(activeOrg.orgId, activeOrg.name);
  const jornadasSugeridas = await jornadasSugeridasDoPasso(activeOrg.orgId, activeOrg.name);
  // …
  <QuadroClient atual={atual} sugestao={sugestao} jornadasSugeridas={jornadasSugeridas} />
```

e, em `app/actions/onboarding/montarQuadro.ts`, a leitura que produz essa lista (reusa o
`o_que_faz` que `dadosDoPasso` já lê, `montarQuadro.ts:132-140`):

```ts
/** As jornadas de vinícola que o texto do dono nomeia — já marcadas na tela. */
export async function jornadasSugeridasDoPasso(orgId: string, negocio: string): Promise<ChaveDeJornada[]> {
  let oQueFaz = "";
  try {
    const { state } = await loadOnboardingState(orgId);
    oQueFaz = state.welcome?.o_que_faz ?? "";
  } catch {
    oQueFaz = "";
  }
  return sugerirJornadas(`${negocio} ${oQueFaz}`);
}
```

- [ ] **Step 7:** `app/onboarding/funil/_client.tsx` — acrescentar a seleção múltipla **acima** do
  editor de colunas, sem tirar nada do que já existe (o editor continua sendo o que grava o quadro
  pela RPC). O bloco novo:

```tsx
      {/*
        As jornadas de vinícola. Marcadas por padrão as que o texto do dono
        nomeia — e desmarcáveis: sugestão não é decisão.

        ⚠️ NÃO MARCAR NADA É DESFECHO VÁLIDO, e é o que acontece com quem não é
        vinícola. O passo segue gravando a proposta pela RPC sobre o funil que a
        organização já tem (`montarQuadro.ts:232-247`); nenhuma jornada é
        aplicada. Nada fica sem funil, e nada de vinícola entra sem escolha.
      */}
      <fieldset className="space-y-3 rounded-lg border bg-background p-6">
        <legend className="text-sm font-medium">{t("O que a sua vinícola faz")}</legend>
        <p className="text-xs text-muted-foreground">
          {t("Marque tudo que se aplica. Cada uma monta um funil próprio, com as mensagens, os campos e os lembretes daquele jeito de vender. Dá para ativar as outras depois, em Configurações › Jornadas.")}
        </p>
        {CHAVES_DE_JORNADA.map((chave) => (
          <label key={chave} className="flex items-start gap-3 rounded-md border p-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={jornadas.includes(chave)}
              onChange={(e) =>
                setJornadas((atuais) =>
                  e.target.checked ? [...atuais, chave] : atuais.filter((c) => c !== chave),
                )
              }
            />
            <span className="min-w-0">
              {/*
                ⚠️ SEM `t()`, e é decisão — não esquecimento.

                Três razões que se somam:

                1. `t(JORNADAS[chave].comoSeApresenta)` é ACESSO DINÂMICO, e a
                   cerca de i18n não o enxerga: ela coleta o argumento de `t()`
                   só quando ele é literal de string
                   (`tests/unit/i18n-espanhol-cobre-a-tela.test.ts:283`). A
                   chave nunca entraria na conta de cobertura — o `t()` daria a
                   APARÊNCIA de estar traduzido sem nada garantir.
                2. Contradiz a restrição desta entrega. "Conteúdo semeado não
                   entra no dicionário" é Global Constraint, e
                   `comoSeApresenta` é conteúdo do pacote: a mesma string vira
                   nome de coisa no banco logo adiante.
                3. O precedente prova o problema, não a solução: o passo já faz
                   `t(p.comoSeApresenta)` nos PACOTES (`_client.tsx:213`), e por
                   isso as três frases dos pacotes antigos foram parar no
                   dicionário na mão (`lib/i18n/dicionario.ts:5250-5255`).
                   Ninguém as colheu; alguém as digitou. É trabalho manual que
                   envelhece calado quando o texto do pacote muda.

                Renderizar cru também passa na cerca de prosa: ela só acusa
                LITERAL de string em posição de filho JSX
                (`i18n-espanhol-cobre-a-tela.test.ts:272-290`), e uma expressão
                não é literal. O que a vinícola lê é o português do pacote, em
                qualquer idioma de interface — que é a decisão nº 3 do anexo.
              */}
              <span className="font-medium">{JORNADAS[chave].comoSeApresenta}</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {JORNADAS[chave].etapas.map((e) => e.nome).join(" → ")}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
```

⚠️ **E o editor de colunas só aparece quando NENHUMA jornada está marcada.** Com jornada marcada quem
cria o funil é o aplicador (Step 8), e deixar na tela um editor cujo resultado é descartado seria a
falha calada clássica: a pessoa renomeia cinco colunas, clica em continuar, e nada do que ela digitou
existe. O bloco do editor e o aviso "Este é o quadro padrão…" (`_client.tsx:192-199`) ficam sob
`{jornadas.length === 0 ? … : …}`, e no lugar deles entra a frase do que vai ser criado:

```tsx
        {jornadas.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("Vou montar um funil para cada jornada marcada, com as colunas, as palavras, os campos e as mensagens daquele jeito de vender. O primeiro vira o seu quadro principal.")}
          </p>
        ) : (
          /* o editor de colunas que já existe, inteiro, sem uma linha de diff */
          null
        )}
```

- [ ] **Step 7b:** O espanhol das frases NOVAS deste passo, em `lib/i18n/dicionario.ts`. São da
  **interface**, então entram; o conteúdo do pacote não entra (acima). As quatro:

```ts
  "O que a sua vinícola faz": { es: "Qué hace su bodega" },
  "Marque tudo que se aplica. Cada uma monta um funil próprio, com as mensagens, os campos e os lembretes daquele jeito de vender. Dá para ativar as outras depois, em Configurações › Jornadas.":
    { es: "Marque todo lo que corresponda. Cada una arma su propio embudo, con los mensajes, los campos y los recordatorios de esa forma de vender. Puede activar las demás después, en Configuración › Recorridos." },
  "Vou montar um funil para cada jornada marcada, com as colunas, as palavras, os campos e as mensagens daquele jeito de vender. O primeiro vira o seu quadro principal.":
    { es: "Voy a armar un embudo para cada recorrido marcado, con las columnas, las palabras, los campos y los mensajes de esa forma de vender. El primero pasa a ser su tablero principal." },
  "Não consegui ativar tudo": { es: "No pude activar todo" },
```

⚠️ **O dicionário é editado NESTA task, não na Task 4.** A cerca de i18n varre o AST de `app/` e
`components/` inteiros e reprova chave usada sem espanhol — ela não sabe que a Task 4 viria depois.
Deixar as quatro para lá deixaria a Task 3 vermelha no próprio commit dela.

e, no envio (`_client.tsx`, dentro do `startTransition` do botão "Usar este quadro"):

```tsx
              fd.set("jornadas", JSON.stringify(jornadas));
```

- [ ] **Step 8:** `app/actions/onboarding/montarQuadro.ts` — **os dois caminhos de `aplicarQuadro`**.

⚠️ **ESTE É O PASSO QUE EVITA DOIS FUNIS COM O MESMO NOME, e é o pior defeito que este plano já teve.**
A medição: hoje o passo do funil grava a proposta pela RPC `fn_aplicar_quadro_do_onboarding` **sobre o
funil que a organização já tem** (`app/actions/onboarding/montarQuadro.ts:232-247`). A Task 3 faz
`PACOTES` virar **projeção da jornada** (Step 3) — ou seja, a proposta que a RPC grava passa a ser,
byte a byte, o funil da jornada. Se `aplicarJornada` rodasse em seguida, ele criaria **um segundo
funil com o mesmo nome**: `uniq_crm_pipelines_org_slug` (`supabase/baseline.sql:2906`) não impede,
porque `slugDeNome` desambigua o slug com sufixo `_2` (`lib/leads/stage-editing.ts:141`) — **o slug
desambigua, o NOME não**. A vinícola terminaria o onboarding com "Visitas e degustações" e "Visitas e
degustações" lado a lado no seletor de funis, indistinguíveis.

**A decisão, e ela é excludente:**

> **Com pelo menos uma jornada marcada, o wizard NÃO chama a RPC.** Quem cria funil é o aplicador, uma
> vez por jornada marcada. **Sem nenhuma marcada, o fluxo de hoje continua inteiro** — RPC sobre o
> funil existente, com o pacote `generico` como sempre fez para quem não é vinícola.

Um caminho ou o outro, nunca os dois. O código completo, substituindo o miolo de `aplicarQuadro`
entre a validação da proposta e o `redirect`:

```ts
  // ── As jornadas marcadas ──────────────────────────────────────────────────
  // Entrada externa, revalidada: o que chega de um formulário é externo mesmo
  // tendo saído daqui há dois minutos. `ehChaveDeJornada` é a guarda única —
  // sem ela, esta action e a da tela inventariam cada uma a sua.
  const marcadas: ChaveDeJornada[] = (() => {
    try {
      const bruto: unknown = JSON.parse(String(formData.get("jornadas") ?? "[]"));
      return Array.isArray(bruto) ? [...new Set(bruto.filter(ehChaveDeJornada))] : [];
    } catch {
      return [];
    }
  })();

  const admin = createAdminClient();
  const atual = await carregarQuadroAtual(admin, ctx.orgId);
  if (!atual) return { ok: false, erro: "Não encontrei o quadro desta empresa." };

  /** O que cada jornada criou. Vazio no caminho A, e é assim que fica. */
  const relatorios: RelatorioDaJornada[] = [];

  if (marcadas.length === 0) {
    // ── CAMINHO A: sem jornada. EXATAMENTE o fluxo de hoje. ─────────────────
    // Nem uma linha de diff daqui até o audit: a RPC grava a proposta sobre o
    // funil que a organização já tem, e o pacote `generico` é o plano B de
    // quem não é vinícola. Quem não marcou nada não pediu nada de vinícola.
    const { data: outros } = await admin
      .from("crm_pipelines")
      .select("slug")
      .eq("organization_id", ctx.orgId)
      .neq("id", atual.pipelineId);
    const slug = slugDeNome(proposta.nome, (outros ?? []).map((p) => String(p.slug ?? "")), "funil");

    const { data: resposta, error } = await admin.rpc("fn_aplicar_quadro_do_onboarding", {
      p_organization_id: ctx.orgId,
      p_pipeline_id: atual.pipelineId,
      p_nome: proposta.nome,
      p_slug: slug,
      p_etapas: etapasParaGravar(proposta, slugDeNome).map((e) => ({
        nome: e.nome, slug: e.slug, position: e.position,
        is_won: e.is_won, is_lost: e.is_lost, agent_stage_hint: e.agent_stage_hint,
      })),
    });
    if (error) return { ok: false, erro: `Não consegui salvar o quadro: ${error.message}` };
    const r = (resposta ?? {}) as { ok?: boolean; motivo?: string; quantos?: number };
    if (!r.ok) return { ok: false, erro: explicarRecusa(r.motivo, r.quantos) };
  } else {
    // ── CAMINHO B: com jornada. A RPC NÃO É CHAMADA. ────────────────────────
    // Chamá-la aqui gravaria a proposta (= a projeção da jornada) sobre o funil
    // existente, e o aplicador criaria o segundo funil de mesmo nome logo
    // abaixo. O editor de colunas da tela também não aparece neste caminho
    // (Step 7), então não há quadro editado sendo descartado em silêncio.
    for (const chave of marcadas) {
      // Uma jornada que falha NÃO derruba o onboarding: a pessoa consegue
      // ativar de novo em Configurações › Jornadas, e o relatório diz o que
      // entrou. O erro real do banco viaja junto, sem máscara.
      relatorios.push(await aplicarJornada(ctx.orgId, chave, ctx.userId));
    }

    // O primeiro funil marcado vira o quadro principal — é o que o passo
    // promete em texto, e com a RPC fora do caminho ninguém mais substitui o
    // quadro de loja online que o gatilho semeou.
    const primeiro = relatorios[0]?.pecas.find((p) => p.tipo === "funil" && p.estado === "criada");
    if (primeiro) await tornarPadrao(ctx.orgId, primeiro.id);
  }

  const relatorios: RelatorioDaJornada[] = [];  // declarado antes do bloco acima
```

e o `patchOnboardingState` passa a registrar `jornadas: marcadas` junto de `funil`, e o `audit` de
`onboarding.quadro_montado` ganha `jornadas: marcadas` no `metadata` — sem isso, a auditoria de uma
instalação que aplicou quatro jornadas fica indistinguível da que não aplicou nenhuma.

- [ ] **Step 8b:** O teste que prende o defeito. Em `app/actions/onboarding/montarQuadro.test.ts`
  (o arquivo existe; acrescentar o `describe`):

```ts
describe("o passo do funil com jornada marcada", () => {
  it("NÃO cria dois funis com o mesmo nome", async () => {
    // O defeito que este teste existe para impedir: a RPC grava a proposta (que
    // é a projeção da jornada) no funil existente E o aplicador cria o funil da
    // jornada — dois funis com o MESMO nome. O slug desambigua com `_2`; o nome
    // não desambigua com nada, e é o nome que a vinícola lê no seletor.
    const banco = bancoDoOnboarding();
    await aplicarQuadro(formulario({ jornadas: ["enoturismo"], quadro: propostaQualquer }));

    const nomes = banco.tabelas.crm_pipelines.map((p) => p.name);
    expect(new Set(nomes).size, `funis com nome repetido: ${nomes.join(", ")}`).toBe(nomes.length);
    expect(nomes).toContain(JORNADAS.enoturismo.nomeDoFunil);
  });

  it("com jornada marcada, a RPC não é chamada", async () => {
    const banco = bancoDoOnboarding();
    await aplicarQuadro(formulario({ jornadas: ["enoturismo"], quadro: propostaQualquer }));
    expect(banco.rpcs, "a RPC reescreveria o funil existente com o nome da jornada").toEqual([]);
  });

  it("SEM jornada marcada, o fluxo de hoje continua inteiro", async () => {
    // A outra metade da decisão, e a que protege quem não é vinícola.
    const banco = bancoDoOnboarding();
    await aplicarQuadro(formulario({ jornadas: [], quadro: propostaQualquer }));
    expect(banco.rpcs.map((r) => r.nome)).toEqual(["fn_aplicar_quadro_do_onboarding"]);
    expect(banco.tabelas.crm_pipelines).toHaveLength(1); // nenhum funil novo
  });

  it("o funil da primeira jornada vira o padrão", async () => {
    const banco = bancoDoOnboarding();
    await aplicarQuadro(formulario({ jornadas: ["enoturismo", "clube"], quadro: propostaQualquer }));
    const padrao = banco.tabelas.crm_pipelines.filter((p) => p.is_default === true);
    expect(padrao, "uniq_crm_pipelines_org_default é parcial: só pode haver um").toHaveLength(1);
    expect(padrao[0]!.name).toBe(JORNADAS.enoturismo.nomeDoFunil);
  });
});
```

- [ ] **Step 9:** Corrigir a medida do e2e de evidência, que os nomes novos tornam falsa.
  `tests/e2e/bacco-evidencia.spec.ts:214` registra hoje:

```ts
      registrar({ funil_mostra_clientes_da_vinicola: nomes.includes("Clientes da vinícola") });
```

"Clientes da vinícola" era o nome do pacote `clientes_vinicola`, que **deixa de existir** no Step 3. A
linha continuaria rodando e registrando `false` para sempre — uma medida que não mede mais nada, no
arquivo de evidência que serve justamente para provar o que a tela mostra. O funil da jornada `canal`
chama-se **"Canal e revenda"**, e é ele que o texto do e2e ("Vendemos vinho para restaurantes e
empórios", `:206`) faz o passo sugerir:

```ts
      registrar({ funil_mostra_canal_e_revenda: nomes.includes("Canal e revenda") });
```

- [ ] **Step 10:** Rodar a suíte de onboarding inteira, as cercas de i18n e os invariantes de unidade
  que esta task toca.

```bash
export PATH=/home/lussandro/.nvm/versions/node/v22.23.2/bin:$PATH && cd /home/lussandro/Bacco-Crm && pnpm exec vitest run lib/onboarding app/actions/onboarding app/onboarding tests/unit/i18n-espanhol-cobre-a-tela.test.ts tests/unit/jornadas-de-vinicola-forma.test.ts tests/unit/jornadas-de-vinicola-aplicar.test.ts 2>&1 | tail -12
```
Expected: exit 0. `i18n-espanhol-cobre-a-tela` entra **aqui** e não na Task 4: as frases novas do passo
do funil são desta task, e a cerca varre `app/` inteiro — ela reprovaria o commit desta task, não o da
seguinte.

- [ ] **Step 11:** Typecheck e lint.

```bash
export PATH=/home/lussandro/.nvm/versions/node/v22.23.2/bin:$PATH && cd /home/lussandro/Bacco-Crm && NODE_OPTIONS=--max-old-space-size=6144 pnpm typecheck && pnpm lint 2>&1 | tail -5
```
Expected: exit 0 nos dois.

- [ ] **Step 12: Commit**

```bash
cd /home/lussandro/Bacco-Crm && git add lib/onboarding lib/i18n/dicionario.ts app/onboarding/funil app/actions/onboarding tests/e2e/bacco-evidencia.spec.ts && git commit -m "feat(bacco): onboarding oferece as quatro jornadas em seleção múltipla

Os três pacotes de vinícola saem; os quatro que entram são projeção das
jornadas, para o quadro do wizard e o que a jornada semeia não divergirem.
Não marcar nada não aplica jornada nenhuma e segue pelo pacote genérico.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 4 — A tela Configurações › Jornadas

**Files:**
- Create: `app/app/settings/tenant/jornadas/page.tsx`
- Create: `app/app/settings/tenant/jornadas/_client.tsx`
- Create: `app/actions/settings/aplicarJornadaDeVinicola.ts`
- Modify: `lib/navigation/catalogo.ts` (entrada nova junto de *Tipos de agendamento*, `:228-249`)
- Modify: `lib/i18n/dicionario.ts` (espanhol de todo texto de interface novo)

**Interfaces:**

Consumes: `requireAuth`, `resolveActiveOrg` (`@/lib/auth/server`), `ROLE_RANK` (`@/lib/auth/types`),
`traduzir` (`@/lib/i18n/dicionario`), `estadoDaJornada`, `aplicarJornada`, `JORNADAS`.

Produces:
```ts
// app/actions/settings/aplicarJornadaDeVinicola.ts
export async function aplicarJornadaDeVinicola(
  formData: FormData,
): Promise<{ ok: true; relatorio: RelatorioDaJornada } | { ok: false; erro: string }>;
```

- [ ] **Step 1:** A server action. É de **sessão** e resolve a organização do cookie — o
  `organizationId` **nunca** vem do body:

```ts
"use server";

/**
 * Ativar uma jornada pela tela.
 *
 * Papel: `admin`. É o papel do aplicador inteiro — não há caminho em que parte
 * do pacote entra com `manager` e o resto falha.
 *
 * A organização sai da SESSÃO. Aceitá-la do body daria a qualquer admin de
 * qualquer tenant a chave para semear o pacote no tenant do vizinho, porque o
 * aplicador roda com admin client e bypassa a RLS.
 */
export async function aplicarJornadaDeVinicola(formData: FormData) {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) return { ok: false as const, erro: "Sua sessão expirou. Entre de novo." };
  const podeAplicar =
    (user.is_platform_admin && !user.support) || ROLE_RANK[activeOrg.role] >= ROLE_RANK.admin;
  if (!podeAplicar) {
    return { ok: false as const, erro: "Só quem administra a empresa pode ativar uma jornada." };
  }

  const chave = String(formData.get("jornada") ?? "");
  if (!ehChaveDeJornada(chave)) return { ok: false as const, erro: "Jornada desconhecida." };

  const relatorio = await aplicarJornada(activeOrg.orgId, chave, user.id);
  revalidatePath("/app/settings/tenant/jornadas");
  return { ok: true as const, relatorio };
}
```

- [ ] **Step 2:** A página, copiando o padrão de papel de `app/app/settings/tenant/pipelines/page.tsx:24-32`:

```tsx
/**
 * ⚠️ A PÁGINA É manager+, A AÇÃO CONTINUA admin.
 *
 * Mesmo desenho de `settings/tenant/pipelines`: quem é gerente VÊ o que cada
 * jornada cria e em que estado ela está — informação que ajuda a operação —, e
 * o botão só é desenhado para quem a ação aceitaria. Esconder o que a ação
 * recusaria é honestidade, não permissão nova.
 */
export default async function JornadasPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (!(user.is_platform_admin && !user.support) && ROLE_RANK[activeOrg.role] < ROLE_RANK.manager) {
    redirect("/403");
  }
  const podeAplicar =
    (user.is_platform_admin && !user.support) || ROLE_RANK[activeOrg.role] >= ROLE_RANK.admin;

  const estados = Object.fromEntries(
    await Promise.all(
      CHAVES_DE_JORNADA.map(async (c) => [c, await estadoDaJornada(activeOrg.orgId, c)] as const),
    ),
  ) as Record<ChaveDeJornada, "nao_aplicada" | "aplicada" | "parcial">;
  // …
}
```

- [ ] **Step 3:** O cliente, `app/app/settings/tenant/jornadas/_client.tsx`. Os três estados vêm do
  ledger e a tela os diz com todas as letras — e o botão **desabilita enquanto a aplicação corre**,
  que é a única proteção de corrida que esta entrega tem (Task 2, regra 12):

```tsx
"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useT } from "@/hooks/i18n/useT";

import { Button } from "@/components/ui/button";
import { aplicarJornadaDeVinicola } from "@/app/actions/settings/aplicarJornadaDeVinicola";
import { CHAVES_DE_JORNADA, JORNADAS, type ChaveDeJornada } from "@/lib/vertical/vinicola";

type Estado = "nao_aplicada" | "aplicada" | "parcial";

export function JornadasClient({
  estados,
  podeAplicar,
}: {
  estados: Record<ChaveDeJornada, Estado>;
  podeAplicar: boolean;
}) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  /**
   * Qual jornada está sendo aplicada AGORA.
   *
   * Não é enfeite de carregamento: é a trava. `pending` sozinho não diz qual
   * botão foi clicado, e sem isso os quatro continuariam clicáveis durante a
   * aplicação — o clique duplo é a corrida que acontece de verdade, e é a única
   * que dá para fechar sem trava no banco (Task 2, regra 12).
   */
  const [correndo, setCorrendo] = useState<ChaveDeJornada | null>(null);

  function ativar(chave: ChaveDeJornada) {
    setCorrendo(chave);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("jornada", chave);
      const r = await aplicarJornadaDeVinicola(fd);
      setCorrendo(null);
      if (!r.ok) {
        // O texto real do erro, sem máscara — quem lê precisa saber o que falhou.
        toast.error(r.erro);
        return;
      }
      const falhas = r.relatorio.pecas.filter((p) => p.estado === "falhou");
      if (falhas.length > 0) {
        toast.warning(`${t("Não consegui ativar tudo")}: ${falhas.map((f) => f.erro).join(" · ")}`);
        return;
      }
      toast.success(t("Jornada ativada"));
    });
  }

  return (
    <div className="space-y-4">
      {/* O aviso que a §4.4 da spec obriga, sempre visível — não é rodapé. */}
      <p className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
        {t("As cadências entram como rascunho. Para elas começarem a mandar mensagem, é preciso um agente de IA publicado, com follow-up ligado, e o WhatsApp conectado.")}
      </p>

      {CHAVES_DE_JORNADA.map((chave) => {
        const j = JORNADAS[chave];
        const estado = estados[chave];
        return (
          <section key={chave} className="rounded-lg border p-4">
            {/* Conteúdo do pacote: sem `t()`, como no passo do onboarding. */}
            <h2 className="font-medium">{j.nomeDoFunil}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{j.comoSeApresenta}</p>

            <p className="mt-3 text-sm">
              {estado === "nao_aplicada" ? t("Não ativada") : null}
              {estado === "aplicada" ? t("Ativada") : null}
              {estado === "parcial" ? t("Ativada, com peças removidas") : null}
            </p>

            {estado === "parcial" ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("Ativar de novo não recria o que você apagou — só cria o que nunca existiu.")}
              </p>
            ) : null}

            {/* O que ela cria, em números, para a decisão não ser às cegas. */}
            <p className="mt-2 text-xs text-muted-foreground">
              {j.etapas.length} {t("colunas")} · {j.campos.length} {t("campos")} ·{" "}
              {j.respostasRapidas.length} {t("respostas rápidas")} ·{" "}
              {j.tiposDeCompromisso.length} {t("tipos de compromisso")} ·{" "}
              {j.cadencias.length} {t("cadências em rascunho")}
            </p>

            {podeAplicar ? (
              <Button
                type="button"
                className="mt-3"
                // ⚠️ DESABILITADO ENQUANTO QUALQUER APLICAÇÃO CORRE. Não só a
                // desta jornada: o aplicador escreve no MESMO
                // `organizations.settings`, e duas aplicações concorrentes
                // perdem uma das gravações do ledger (ler-modificar-gravar).
                disabled={pending}
                onClick={() => ativar(chave)}
              >
                {correndo === chave ? t("Ativando…") : t("Ativar jornada")}
              </Button>
            ) : (
              // Honestidade, não permissão nova: quem é gerente vê o estado e
              // sabe por que não pode agir.
              <p className="mt-3 text-xs text-muted-foreground">
                {t("Só quem administra a empresa pode ativar uma jornada.")}
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
```

| Estado | O que a tela escreve |
|---|---|
| `nao_aplicada` | "Não ativada" + o que ela cria (contagens da jornada) |
| `aplicada` | "Ativada" + a data de `aplicada_em` |
| `parcial` | "Ativada, com peças removidas" + a frase: *"Ativar de novo não recria o que você apagou — só cria o que nunca existiu."* |

- [ ] **Step 4:** A entrada de navegação, em `lib/navigation/catalogo.ts`, imediatamente depois da de
  *Tipos de agendamento* (`:228-249`):

```ts
  {
    // As jornadas de vinícola: o conteúdo que a casa usa para vender, aplicável
    // depois do onboarding. Fica em "Sua empresa" junto de Tipos de agendamento
    // porque é configuração do NEGÓCIO, não da conta de quem está logado.
    //
    // SEM `sidebar`, como as outras entradas de `organizacao`: o grupo tem hub,
    // e se chega às telas dele por "Configurações".
    href: "/app/settings/tenant/jornadas",
    label: "Jornadas",
    description: "Funis, mensagens e lembretes prontos para cada jeito de vender vinho.",
    // ⚠️ `Signpost`, e a escolha é MEDIDA. `icon` é uma string, mas o mapa que a
    // resolve é FECHADO: `ICONS` em `lib/navigation/registry.ts:53-90`, e
    // `NAV_DESTINATIONS` faz `ICONS[d.icon]` (`:94`) sem fallback. Um nome fora
    // do mapa vira `undefined`, o React tenta renderizar um componente que não
    // existe e a tela QUEBRA NO BROWSER — com typecheck, lint e a suíte toda
    // verdes, porque nada disso resolve a string.
    //
    // "Path" não existe: nem no mapa, nem em `lib/ui/icons.ts`. `Signpost` está
    // nos dois — `lib/navigation/registry.ts:84` (dentro do mapa) e
    // `lib/ui/icons.ts:125` — e é a placa que indica caminhos, que é o que uma
    // jornada é. (`FlowArrow`, `:66`, também serviria, mas já é a cara de
    // fluxo/follow-up no produto.)
    icon: "Signpost",
    group: "organizacao",
    section: "Sua empresa",
    // `manager` vê; o botão de ativar é só de `admin`, como em Etapas do funil.
    minRole: "manager",
  },
```

- [ ] **Step 5:** Espanhol de **todo** texto de interface novo em `lib/i18n/dicionario.ts`. O que
  **não** entra: nome de funil, etapa, vocabulário, rótulo de campo, motivo de perda, título e corpo
  de resposta rápida, nome de tipo de compromisso e de cadência — isso é conteúdo semeado, sai do
  pacote em português e vai para o banco, e texto que veio do banco não passa por dicionário.

- [ ] **Step 6:** Rodar as três cercas que esta task tem de satisfazer.

```bash
export PATH=/home/lussandro/.nvm/versions/node/v22.23.2/bin:$PATH && cd /home/lussandro/Bacco-Crm && pnpm exec vitest run tests/unit/navegacao-completude.test.ts tests/unit/navegacao-registry.test.ts tests/unit/i18n-espanhol-cobre-a-tela.test.ts 2>&1 | tail -15
```
Expected: exit 0. `navegacao-completude` reprova tela sem porta; `navegacao-registry` cobra a seção em
grupo com hub; a de i18n reprova chave usada sem espanhol **e** prosa portuguesa fora de `t()`.

- [ ] **Step 7:** Typecheck e lint.

```bash
export PATH=/home/lussandro/.nvm/versions/node/v22.23.2/bin:$PATH && cd /home/lussandro/Bacco-Crm && NODE_OPTIONS=--max-old-space-size=6144 pnpm typecheck && pnpm lint 2>&1 | tail -5
```
Expected: exit 0 nos dois.

- [ ] **Step 8: Commit**

```bash
cd /home/lussandro/Bacco-Crm && git add app/app/settings/tenant/jornadas app/actions/settings/aplicarJornadaDeVinicola.ts lib/navigation/catalogo.ts lib/i18n/dicionario.ts && git commit -m "feat(bacco): tela Configurações › Jornadas

Lista as quatro com o estado lido do ledger (ativada, não ativada, parcial),
o que cada uma cria e o aviso de que cadência precisa de agente publicado e
WhatsApp. Página manager+, ação admin. Entrada no catálogo de navegação e
espanhol de toda a interface nova.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 5 — Fragmento, suíte inteira e CI

**Files:**
- Create: `.changes/bacco-jornadas-de-vinicola.md`

**Interfaces:** Consumes: `pnpm release:conferir` (`scripts/cortar-release.ts`). Produces: a `bacco`
empurrada para a `main` com **todos os checks que aparecerem** verdes — quem aparece é derivado dos
workflows `active` (Global Constraints), não de um número escrito aqui. Este parágrafo já dizia "os
cinco checks", herdando a contagem do upstream: neste fork não há branch protection para definir
cinco, e o `e2e` nem roda.

- [ ] **Step 1:** O fragmento. Declara o **efeito no operador**, nunca o número da versão — o número
  sai do conjunto, e é por isso que duas sessões paralelas não colidem.

```bash
cd /home/lussandro/Bacco-Crm && cat > .changes/bacco-jornadas-de-vinicola.md <<'EOF'
---
impacto: capacidade_nova
secao: adicionado
titulo: Quatro jornadas de vinícola prontas para aplicar
---

Canal e revenda, visitas e degustações, clube de assinatura e vendas ao consumidor entram como
pacotes prontos: cada um monta um funil com as etapas e as palavras daquele jeito de vender, mais
campos, motivos de perda, tags, respostas rápidas com atalho, tipos de compromisso e cadências de
follow-up em rascunho. A vinícola marca as que usa no onboarding e ativa as outras depois, em
Configurações › Jornadas. Quem já tem o sistema instalado não precisa fazer nada.
EOF
pnpm release:conferir 2>&1 | tail -15
```
Expected: exit 0, com o fragmento listado e a forma aceita.

- [ ] **Step 2:** A suíte inteira, sem cortar a saída. **O exit code é a autoridade.**

```bash
export PATH=/home/lussandro/.nvm/versions/node/v22.23.2/bin:$PATH && cd /home/lussandro/Bacco-Crm && pnpm test:unit > /tmp/vt.log 2>&1; echo "exit=$?"
grep -aE "Test Files|Tests |Errors " /tmp/vt.log | tail -3
r=$(grep -aE "^ *Tests " /tmp/vt.log | tail -1 | grep -oE "[0-9]+ failed" | head -1); g=$(grep -acE "^ *FAIL " /tmp/vt.log); echo "rodapé: ${r:-0 failed} | grep contou: $g"
```
Expected: `exit=0`; `Test Files` e `Tests` sem `failed`; **nenhuma** linha `Errors`; as duas contagens
batendo. Se não baterem, a sonda está cega — rode de novo com `--reporter=verbose` em vez de acreditar
no silêncio. Vermelho local conhecido e **que não é seu**: `lib/ai/dispatcher/rate-limit.test.ts`, 5
casos, quando o `.env.local` aponta para um Upstash que não está de pé.

- [ ] **Step 3:** Typecheck, lint e os dois lints próprios.

```bash
export PATH=/home/lussandro/.nvm/versions/node/v22.23.2/bin:$PATH && cd /home/lussandro/Bacco-Crm && NODE_OPTIONS=--max-old-space-size=6144 pnpm typecheck && pnpm lint && pnpm lint:channels && pnpm lint:role-rank 2>&1 | tail -6
```
Expected: exit 0 em todos.

- [ ] **Step 4:** Confirmar que nenhum arquivo de schema foi tocado — a restrição "sem mudança de
  schema" é verificável, não uma promessa.

```bash
cd /home/lussandro/Bacco-Crm && git diff --name-only origin/main...bacco | grep -E 'supabase/(migrations|baseline)' | wc -l
```
Expected: `0`.

- [ ] **Step 5: Commit e push.**

```bash
cd /home/lussandro/Bacco-Crm && git add .changes/bacco-jornadas-de-vinicola.md && git commit -m "chore(bacco): fragmento de release das jornadas de vinícola

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push --no-tags origin bacco:main
SHA=$(git rev-parse bacco); echo "$SHA"
```

- [ ] **Step 6:** Esperar o CI. Repetir até nada ficar `queued`/`in_progress`:

```bash
cd /home/lussandro/Bacco-Crm && SHA=$(git rev-parse bacco) && gh api "repos/lussandro/bacco-adega-crm/commits/$SHA/check-runs?per_page=100" --jq '.check_runs[] | [.name, .status, .conclusion] | @tsv' | sort
```
Expected: **todo check que aparecer está `completed success`** — e quem aparece é derivado dos
workflows `active`, medidos em Global Constraints, não desta lista. Na medição de 2026-09-15 isso dá
`verify`, `invariants` (do `ci`), `build-and-size` (do `perf`) e os jobs do `publish-image`
(`a-tag-veio-da-main`, os três `build-and-push`, `imagem-do-app-sobe`, `imagens-ok`). **O check `e2e`
não aparece porque o workflow está `disabled_manually` neste fork** — ausência esperada, não falta.

Se a lista que voltar for **diferente** da que Global Constraints mediu, é a medição que manda: rode os
dois `gh api` de lá antes de concluir qualquer coisa. Um check novo que apareça vermelho reprova; um
check que sumiu é mudança de configuração do repositório, e precisa ser entendida, não ignorada.

Depois, ler as três linhas do rodapé do `verify`:

```bash
SHA=$(git rev-parse bacco); JOB=$(gh api "repos/lussandro/bacco-adega-crm/commits/$SHA/check-runs?per_page=100" --jq '.check_runs[] | select(.name == "verify") | .id')
gh api "repos/lussandro/bacco-adega-crm/actions/jobs/$JOB/logs" | grep -aE "Test Files |Tests |Errors " | tail -3
```
Expected: sem `failed`, sem `Errors`. Vermelho = causa raiz, commit próprio, novo push, e a espera
recomeça no SHA novo.

---

## Task 6 — Candidata na VPS e prova em tela

⚠️ **ESTA TASK VEM ANTES DA TAG, e a ordem é doutrina, não preferência.** O CLAUDE.md é literal: *"a
experiência de quem instala numa VPS É o produto"*, e prova em tela é **critério de aceite**, não
verificação pós-lançamento. Cortar `v26.9.4` primeiro inverteria isso — um achado na tela viraria
"release nova" (`v26.9.5`) em vez de "conserto antes de lançar", e o número queimado seria o registro
permanente de que a régua foi aplicada tarde. Aqui se prova **a candidata**; só depois se corta a tag.

**O que é a candidata:** o topo da `main`, que o `publish-image` publica como tag `main`
(`type=ref,event=branch`, `.github/workflows/publish-image.yml:150`) no mesmo push da Task 5. É o
MESMO código que a tag vai carregar — a tag não reconstrói nada, ela só nomeia o commit.

**Files:**
- Create: `tests/e2e/bacco-jornadas.spec.ts`
- Create: `evidence/bacco-jornadas/` (PNGs + `revisao.md` + `medidas.jsonl`)
- Modify: `.github/workflows/e2e.yml` (a spec nova entra em `FORA_DO_CI`, **com motivo escrito** — o
  teste `tests/unit/e2e-cobertura-completa.test.ts` reprova spec que não esteja em `SPECS_PARTE_*` nem
  em `FORA_DO_CI`)

**Interfaces:** Consumes: `BASE_URL`, `QA_EMAIL`, `QA_SENHA` (de `/root/.bacco_qa`). Produces:
evidência citada em `evidence/bacco-jornadas/revisao.md`, e o **ok do dono** — sem ele a Task 7 não
começa.

**Volta declarada:** a candidata volta para a `v26.9.3` com o mesmo caminho e `--to v26.9.3`. Como
aqui ainda não há tag nova, um achado **não** custa número de versão: conserta-se na `bacco`, empurra-se
de novo (a Task 5 recomeça no SHA novo), e a candidata é reinstalada.

- [ ] **Step 1:** Subir a candidata na VPS, **pelo caminho do produto** — o mesmo `update.sh` que o
  cliente roda, não um `up -d` à mão. Ele aceita qualquer ref que o git resolva (`--to`,
  `hostgator-setup-kit/update.sh:24` e `:47`), e `gravar_imagens` já trata `main` como **canal móvel**,
  gravando `pull_policy=always` nas três imagens (`hostgator-setup-kit/_common.sh:641`). Nada de editar
  `.env` na mão: a Task 7 reescreve tudo para a tag imutável depois.

⚠️ **Por script em arquivo, NUNCA por heredoc no stdin.** O motivo medido: o `update.sh` tem **um**
`read` (`hostgator-setup-kit/update.sh:123`), e ele só é alcançado quando o **backup preventivo
falha** e a sessão é interativa (`[ -t 0 ]`, `:121`). Nesse caminho ele pede a palavra `CONTINUAR` — e
um heredoc no stdin entrega a ele a **próxima linha do próprio script**, que não é `CONTINUAR`: a
atualização morre com "cancelada pelo operador" e o resto do script some engolido. Não é que o script
consuma o stdin sempre; é que, no único dia em que consome, é o dia em que algo já deu errado. O
`< /dev/null` faz o `read` falhar na hora e o `die` dizer a verdade.

```bash
cat > /tmp/candidata-jornadas.sh <<'SCRIPT'
set -e
cd /opt/bacco-adega-crm
PW="$(grep ^POSTGRES_PASSWORD= /opt/supabase/docker/.env | cut -d= -f2-)"
export SUPABASE_DB_ADMIN_URL="postgresql://postgres.bacco-adega:${PW}@172.17.0.1:5432/postgres"
bash hostgator-setup-kit/update.sh --to main > /root/bacco-candidata-jornadas.log 2>&1
SCRIPT
scp /tmp/candidata-jornadas.sh root@2.25.222.110:/root/candidata-jornadas.sh
ssh root@2.25.222.110 'bash /root/candidata-jornadas.sh < /dev/null; echo "exit=$?"; tail -8 /root/bacco-candidata-jornadas.log; curl -s -o /dev/null -w "raiz %{http_code}\n" https://adega-crm.baccosistemas.com.br/'
```
Expected: `exit=0` e `raiz 307` (redireciona para o login). **`404` é roteamento perdido** — ver
`docs/runbooks/deploy.md` e a volta declarada acima.

- [ ] **Step 2:** Escrever `tests/e2e/bacco-jornadas.spec.ts`, **autocontido** — só importa
  `@playwright/test` e `node:fs`, sem helpers do repo e sem `playwright.config.ts`, porque roda num
  contêiner `mcr.microsoft.com/playwright:v1.63.0-noble` com `/work` montado. O molde é
  `tests/e2e/bacco-evidencia.spec.ts:1-55`. O que ele mede, pela tela, como um leigo faria:

  1. **Configurações › Jornadas** existe e é alcançável **pela navegação** (não digitando a URL):
     abrir `/app`, clicar em Configurações, achar "Jornadas" em *Sua empresa*.
  2. Ativar cada uma das quatro pelo botão, e ver o estado virar "Ativada".
  3. **O funil aparece no quadro, com as etapas na ordem**: abrir `/app/leads`, trocar para o funil
     da jornada, ler os nomes das colunas na ordem e compará-los com a ordem esperada.
  4. **A resposta rápida está disponível no atendimento**: abrir uma conversa, abrir o seletor de
     respostas rápidas, digitar o atalho e ver o título aparecer.
  5. **O tipo de compromisso está na agenda**: `/app/settings/tenant/agenda`, achar o nome — e, para
     *Visita do representante*, ver o complemento do local (`detalhesDoLocal`), que é o que distingue
     "no canal" de "na vinícola".
  6. **A cadência está listada como rascunho**: abrir a lista de fluxos de follow-up e ler o nome
     com o selo de rascunho.
  7. **O quadro principal é o da primeira jornada** — não "Carrinho abandonado". É a promessa do
     Step 8 da Task 3, e é a que some se `tornarPadrao` falhar em silêncio.
  8. Capturas **nos dois temas** (`localStorage` `deskcomm-theme` + reload), com cada medida
     registrada em `/work/out/medidas.jsonl`.

  Medidas por ferramenta (`getBoundingClientRect` / `getComputedStyle`), **nunca a olho**.

- [ ] **Step 3:** Declarar a spec fora do CI, com motivo, em `.github/workflows/e2e.yml` (`FORA_DO_CI`):
  *"roda na VPS contra a produção, com a conta QA real e as jornadas já aplicadas; o CI não tem nem a
  conta nem o banco."*

```bash
export PATH=/home/lussandro/.nvm/versions/node/v22.23.2/bin:$PATH && cd /home/lussandro/Bacco-Crm && pnpm exec vitest run tests/unit/e2e-cobertura-completa.test.ts 2>&1 | tail -8
```
Expected: exit 0. (O workflow está `disabled_manually` neste fork, mas o teste de cobertura lê o
**arquivo**, não o estado do workflow — ele reprova do mesmo jeito.)

- [ ] **Step 4:** Aplicar as quatro jornadas **pela tela** na organização de QA, com a conta QA, e
  rodar a prova.

```bash
scp tests/e2e/bacco-jornadas.spec.ts root@2.25.222.110:/root/bacco-e2e/
ssh root@2.25.222.110 'set -a; . /root/.bacco_qa; set +a; cd /root/bacco-e2e && mkdir -p out && rm -f out/jornadas-*.png out/medidas.jsonl; docker run --rm --network host -e BASE_URL=https://adega-crm.baccosistemas.com.br -e QA_EMAIL -e QA_SENHA -v /root/bacco-e2e:/work -w /work mcr.microsoft.com/playwright:v1.63.0-noble npx playwright test bacco-jornadas.spec.ts --reporter=list 2>&1 | grep -vE "npm notice" | tail -30'
```
Expected: `passed`, sem `failed`. **Falha de medida vira causa raiz, conserto na `bacco` e candidata
nova** — nunca expectativa afrouxada, e nunca uma tag cortada "para consertar depois".

- [ ] **Step 5:** Trazer a evidência.

```bash
cd /home/lussandro/Bacco-Crm && mkdir -p evidence/bacco-jornadas && scp 'root@2.25.222.110:/root/bacco-e2e/out/jornadas-*.png' root@2.25.222.110:/root/bacco-e2e/out/medidas.jsonl evidence/bacco-jornadas/ && ls evidence/bacco-jornadas/*.png | wc -l
```
Expected: uma captura por tela × 2 temas, e o `medidas.jsonl` com uma linha por medida.

- [ ] **Step 6:** Aplicar as quatro jornadas **na organização do dono**, pela tela, com a conta dele
  (decisão do dono, spec §5.3). Registrar no `revisao.md` qual organização recebeu o quê e quando.

- [ ] **Step 7:** Escrever `evidence/bacco-jornadas/revisao.md`, citando **cada PNG pelo caminho
  completo em crase**, com o que foi visto em cada um e as medidas de
  `evidence/bacco-jornadas/medidas.jsonl`. Depois:

```bash
export PATH=/home/lussandro/.nvm/versions/node/v22.23.2/bin:$PATH && cd /home/lussandro/Bacco-Crm && git add evidence/bacco-jornadas && pnpm exec vitest run tests/unit/evidencia-citada.test.ts 2>&1 | tail -8
```
Expected: exit 0. (O teste só enxerga o que o **git entrega** — `git ls-files` —, por isso o `git add`
vem antes.)

- [ ] **Step 8: Aprovação do dono.** Mostrar as capturas e as quatro jornadas aplicadas nas duas
  organizações. **É aqui que a entrega vira "pronta", e não na tag.** Registrar a resposta no
  `revisao.md`. Reprovação = conserto na `bacco` e candidata nova; a Task 7 só começa com o ok.

- [ ] **Step 9: Commit e push.**

```bash
cd /home/lussandro/Bacco-Crm && git add tests/e2e/bacco-jornadas.spec.ts .github/workflows/e2e.yml evidence/bacco-jornadas && git commit -m "test(bacco): prova em tela das jornadas de vinícola na VPS

Spec autocontida que ativa as quatro pela tela e mede o funil no quadro, a
resposta rápida no atendimento, o tipo de compromisso na agenda e a cadência
em rascunho, nos dois temas. Provado na candidata (topo da main), antes da tag.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push --no-tags origin bacco:main
```

---

## Task 7 — Release v26.9.4 e VPS

**Files:** nenhum arquivo do repo. Task de operação.

**Só começa com o ok do dono (Task 6 Step 8) e com os checks verdes no MESMO SHA.** A tag nomeia um
commit já provado em tela; ela não é o momento de descobrir nada.

**Volta declarada:** se o health não vier `26.9.4` ou se a raiz não vier `307`, a VPS volta para a
`v26.9.3` com o mesmo comando e `--to v26.9.3` (bloco no Step 4). A correção sai numa `v26.9.5`, pelo
mesmo caminho — e passa pela Task 6 de novo antes de virar tag.

- [ ] **Step 1:** Tag anotada, com a mensagem do fragmento, só com os checks da Task 5 verdes no mesmo SHA.

```bash
cd /home/lussandro/Bacco-Crm && SHA=$(git rev-parse bacco) && { printf 'Bacco Adega CRM 26.9.4 — jornadas de vinícola\n\n'; cat .changes/bacco-jornadas-de-vinicola.md; } | git tag -a v26.9.4 -F - "$SHA"
git push origin v26.9.4
```

- [ ] **Step 2:** Conferir as três imagens da tag e a `stable`. Repetir as duas consultas `gh api` até
  o run ficar `completed`.

```bash
RUN=$(gh api "repos/lussandro/bacco-adega-crm/actions/workflows/publish-image.yml/runs?event=push&per_page=20" --jq '.workflow_runs[] | select(.head_branch == "v26.9.4") | .id' | head -1)
gh api "repos/lussandro/bacco-adega-crm/actions/runs/$RUN" --jq '[.status, .conclusion] | @tsv'
gh api "repos/lussandro/bacco-adega-crm/actions/runs/$RUN/jobs?per_page=100" --jq '.jobs[] | [.name, .status, .conclusion] | @tsv'
```
Expected: run `completed success`; `build-and-push` (três), `imagem-do-app-sobe`, `promover-stable` e
`imagens-ok` com `success`.

- [ ] **Step 3:** Conferir os digests **pela VPS** (o docker local pode não ter acesso ao GHCR):

```bash
ssh root@2.25.222.110 'for img in deskcommcrm deskcomm-worker deskcomm-scheduler; do
  numero=$(docker buildx imagetools inspect "ghcr.io/lussandro/$img:26.9.4" --format "{{json .Manifest.Digest}}")
  stable=$(docker buildx imagetools inspect "ghcr.io/lussandro/$img:stable" --format "{{json .Manifest.Digest}}")
  [ "$numero" = "$stable" ] && echo "$img stable = 26.9.4" || echo "$img stable DIVERGE: $stable != $numero"
done'
```
Expected: três linhas `stable = 26.9.4`. Divergência = **pare**: a VPS puxaria imagem que não é a
desta release.

- [ ] **Step 4:** Atualizar a VPS para a **tag**. ⚠️ **Por script em arquivo, NUNCA por heredoc no
  stdin** — pelo motivo medido na Task 6 Step 1: o `update.sh` tem um único `read`
  (`hostgator-setup-kit/update.sh:123`), alcançado só quando o backup preventivo falha numa sessão
  interativa, e nesse caminho um heredoc lhe entrega a próxima linha do próprio script no lugar da
  palavra `CONTINUAR`. O `< /dev/null` faz o `read` falhar na hora, e o `die` diz a verdade.

Aqui `gravar_imagens` grava `pull_policy=missing` nas três imagens, porque `26.9.4` é tag **imutável**
(`hostgator-setup-kit/_common.sh:638-642`) — é o que desfaz o `always` que a candidata deixou.

```bash
cat > /tmp/atualizar-26.9.4.sh <<'SCRIPT'
set -e
cd /opt/bacco-adega-crm
PW="$(grep ^POSTGRES_PASSWORD= /opt/supabase/docker/.env | cut -d= -f2-)"
export SUPABASE_DB_ADMIN_URL="postgresql://postgres.bacco-adega:${PW}@172.17.0.1:5432/postgres"
bash hostgator-setup-kit/update.sh --to v26.9.4 > /root/bacco-update-26.9.4.log 2>&1
SCRIPT
scp /tmp/atualizar-26.9.4.sh root@2.25.222.110:/root/atualizar-26.9.4.sh
ssh root@2.25.222.110 'bash /root/atualizar-26.9.4.sh < /dev/null; echo "exit=$?"; tail -8 /root/bacco-update-26.9.4.log; curl -s https://adega-crm.baccosistemas.com.br/api/v1/health | head -c 200; echo; curl -s -o /dev/null -w "raiz %{http_code}\n" https://adega-crm.baccosistemas.com.br/'
```
Expected: `exit=0`; `"version":"26.9.4"` no health; `raiz 307` (redireciona para o login). **`404` é
roteamento perdido** — ver `docs/runbooks/deploy.md`, e a volta declarada acima. Para voltar, o mesmo
script com `--to v26.9.3` e a expectativa `"version":"26.9.3"`.

---

## Task 8 — Living System Checklist e o mapa vivo

**Files:**
- Create: `docs/architecture/jornadas-de-vinicola.architecture.json`
- Modify: `docs/architecture/README.md` (a linha da tabela de mapas)

**Interfaces:** Consumes: o que as Tasks 1-7 construíram. Produces: a resposta do item 13 da Definition
of Done, com **artefato nomeado** em cada linha, e a peça nova no mapa vivo.

Esta task existe porque o item 13 da DoD não é papelada: *"a feature não é ilha"*. E porque a resposta
inválida é a fácil — responder o que a peça **poderia** fazer. Cada linha abaixo nomeia o artefato
concreto, como `docs/doctrine/sistema-vivo.md:107` exige.

- [ ] **Step 1:** Responder o checklist, no `revisao.md` da evidência (é lá que ele fica junto da prova):

```
Living System Checklist — Jornadas de vinícola

[x] Quem me alimenta?
    Duas entradas REAIS, nenhuma inventada:
    · `app/actions/onboarding/montarQuadro.ts` (caminho B do Step 8 da Task 3) — a
      vinícola marca no wizard;
    · `app/actions/settings/aplicarJornadaDeVinicola.ts` — a tela, depois.
    As duas chamam `aplicarJornada()`, que é o único caminho para o banco.

[x] Quem eu alimento?
    Cinco consumidores que JÁ EXISTEM e passam a ter conteúdo:
    · `crm_pipelines`/`crm_stages` → o quadro em `/app/leads`;
    · `message_templates` → o seletor de respostas rápidas do Inbox
      (`components/inbox/Composer.tsx:148`, que resolve `{{nome}}`);
    · `calendar_event_types` → a tela de Agenda e o que o agente oferece ao marcar;
    · `followup_flow_pointers` → o construtor de fluxos;
    · `crm_pipelines.settings.fields`/`lost_reasons` → a ficha do lead e o motivo de perda.

[x] Que atividade/log eu emito?
    `api_audit_log`, por peça (`pipeline.created`, `pipeline.stage_created`,
    `pipeline.config_updated`, `template.created`, `agenda.tipo_criado`,
    `followup_flow.created`) MAIS a linha da aplicação inteira:
    `vertical.jornada_aplicada` (Task 2 Step 1), com jornada, versão do pacote e
    relatório por peça no `metadata`.

[x] Onde eu apareço na tela?
    `/app/settings/tenant/jornadas` — com os três estados lidos do ledger. E o
    painel de auditoria recebe a ação nova sem ninguém mexer nele: a lista é
    derivada de `AUDIT_ACTIONS` (`tests/unit/audit-lista-do-painel-e-derivada.test.tsx`).

[x] Por qual porta se chega até mim?
    `lib/navigation/catalogo.ts`, grupo `organizacao`, seção "Sua empresa",
    `icon: "Signpost"`, `minRole: "manager"`. Vigiado por
    `tests/unit/navegacao-completude.test.ts` — sem allowlist, sem exceção.

[x] Qual meu mecanismo anti-morte?
    As cadências. Cada jornada entra com 3 ou 4 fluxos de follow-up que garantem
    próximo passo a um lead parado — que é o invariante 4 em forma de conteúdo.
    ⚠️ Elas nascem em RASCUNHO: o anti-morte só liga quando a vinícola publicar,
    e a tela diz, em texto fixo, o que falta (agente publicado + follow-up ligado
    + WhatsApp conectado). Prometer anti-morte ativo aqui seria falso.

[x] Onde se CONFIGURA o que eu uso?
    Ver: a própria tela de Jornadas (estado por jornada). Mudar: cada peça na tela
    dela — Etapas do funil, Modelos, Tipos de agendamento, construtor de fluxos.
    Se faltar: a tela mostra "parcial" e LISTA o que não existe mais.

[x] Qual a continuidade IA↔humano?
    N/A justificado nesta entrega: o pacote é conteúdo, não turno de agente. O que
    ele deixa pronto para a fase do agente são as respostas rápidas (que o humano
    manda e o motor de follow-up também) e as FAQs do anexo, que NÃO são semeadas
    aqui (decisão 18).

[x] Qual meu LAÇO DE RETORNO?  (invariante 7 — o que muda quando eu erro)
    Três, e nenhum é silencioso:
    · peça que falha → `{ estado: "falhou", erro: <texto real do banco> }` no
      relatório, que a tela mostra e o `metadata` da auditoria guarda;
    · peça apagada pela vinícola → a jornada lê como PARCIAL na tela, com a lista
      do que sumiu — o sistema aprende que a decisão foi dela e não a desfaz;
    · aplicação que morre no meio → a pré-leitura por chave natural da tentativa
      seguinte encontra o que já entrou e não duplica (Task 2, regra 12).

[x] Atualizei o mapa vivo?
    `docs/architecture/jornadas-de-vinicola.architecture.json` (Step 2).
```

- [ ] **Step 2:** O mapa vivo. **Peça nova entra com ≥2 arestas** — é a doutrina, e desta vez é gate:
  `tests/unit/mapas-de-arquitetura.test.ts` lê todo `*.architecture.json` do diretório, exige `nodes` e
  `edges`, e reprova aresta apontando para nó inexistente. A forma é a dos mapas que já existem
  (`schema_version`, `diagram_type`, `meta`, `lanes`, `mainPath`, `nodes`, `edges` — ver
  `docs/architecture/central-avisos.architecture.json`).

  As peças e as arestas mínimas, que são as do checklist acima:

  | Peça (`id`) | Faixa | Liga-se a |
  |---|---|---|
  | `definicoes` | código | → `aplicador`, → `pacotes` |
  | `pacotes` | código | ← `definicoes`, → `wizard` |
  | `wizard` | app | → `aplicador`, → `tornar_padrao` |
  | `tela_jornadas` | app | → `aplicador`, ← `ledger` |
  | `aplicador` | app | ← `wizard`, ← `tela_jornadas`, → `funil`, → `modelos`, → `tipos`, → `cadencias`, → `ledger`, → `auditoria` |
  | `ledger` | banco | ← `aplicador`, → `tela_jornadas` |
  | `funil` / `modelos` / `tipos` / `cadencias` | banco | ← `aplicador`, → as telas que já os leem |
  | `auditoria` | banco | ← `aplicador`, → `painel_auditoria` |

  ⚠️ **NÃO re-renderize com archify.** Medido no próprio README (`docs/architecture/README.md`, seção
  *"só o `agent-turn.workflow.json` é renderizável hoje"`): os `*.architecture.json` não validam no
  archify 2.11.0. O JSON é a fonte e é o que o gate lê; não existe HTML para este mapa.

  E a linha na tabela de mapas do `docs/architecture/README.md` — o próprio README avisa que ela já
  apodreceu uma vez por mapa novo sem linha.

```bash
export PATH=/home/lussandro/.nvm/versions/node/v22.23.2/bin:$PATH && cd /home/lussandro/Bacco-Crm && pnpm exec vitest run tests/unit/mapas-de-arquitetura.test.ts 2>&1 | tail -8
ls docs/architecture/*.json | wc -l   # o README tem de listar todos
```
Expected: exit 0, e a contagem batendo com a tabela do README.

- [ ] **Step 3: Vault** — escrever em `/home/lussandro/Obsidian/Vault/projetos/bacco-adega-crm/` só o
  que é **durável**:
  · que o `update.sh` tem um `read` (`:123`) alcançado só quando o backup falha em sessão interativa —
    por isso script em arquivo + `< /dev/null`, nunca heredoc;
  · que `calendar_event_types.reminder_enabled` tem default `true` no DDL base e `false` só no
    apêndice, então quem grava passa o valor explícito;
  · que o ledger de jornadas mora em `organizations.settings.bacco_jornadas`, grava **id + chave
    natural**, e decide existência pelo **id** — chave natural é editável e renomear leria como apagar;
  · que `uniq_crm_pipelines_org_default` é parcial, então trocar o funil padrão são duas escritas em
    ordem, com volta se a segunda falhar;
  · que a `main` deste fork **não tem branch protection** (a API responde 403 sem GitHub Pro) e que o
    workflow `e2e` está `disabled_manually` — quem for medir checks mede pelos workflows `active`.
  Atualizar `ultima_revisao`. **Não** escrever log de sessão nem plano com checkbox.

- [ ] **Step 4: Commit e push.**

```bash
cd /home/lussandro/Bacco-Crm && git add docs/architecture evidence/bacco-jornadas && git commit -m "docs(bacco): mapa vivo das jornadas e o checklist do sistema vivo

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push --no-tags origin bacco:main
```

---

## Riscos e o que os evita

| Risco | Evidência de que é real | O que o plano faz |
|---|---|---|
| Alterar o gatilho que semeia os três tipos de compromisso padrão | `tests/invariants/agenda-nasce-com-o-que-marcar.test.ts` exige exatamente `consulta, reuniao, atendimento` | O aplicador só INSERE tipos novos, por organização; o gatilho não é tocado (Global Constraints) |
| Alterar o gatilho do funil padrão | `tests/invariants/quadro-do-onboarding.test.ts` prende 8 etapas da organização recém-criada | O pacote cria funil **novo**; a organização recém-criada não muda |
| Etapa de ganho, de perdido ou dica de passo duplicada | uniques parciais `uniq_crm_stages_pipeline_won` (`baseline.sql:2918`), `_lost` (`:2910`), `_hint` (`:9079`) | Task 1 Steps 2/8: uma `won`, uma `lost`, dicas distintas por funil, antes de qualquer banco |
| Slug do anexo divergir do que o banco recebe | o anexo já tinha um errado (`entendendo_canal` deriva `entendendo_o_canal`) | O slug é **derivado** por `etapasParaGravar` + `slugDeNome`; o teste compara contra o derivado, nunca contra lista digitada |
| Cadência apontando para modelo inexistente | falha só NO ENVIO, em runtime (`lib/agent-engine/agent/followup-turn.ts`) | Ordem obrigatória, medida em Task 2 Step 3 (`ultimo("message_templates") < primeiro("followup_flow_pointers")`) |
| Condição por etapa escrita como nome | o motor compara **id** (`lib/followup/node-handlers.ts:294`); nome cairia sempre no ramo padrão, em silêncio | O aplicador resolve ids na hora; o teste confere que todo `value` de `lead_stage` é id de etapa criada |
| Gatilho de silêncio "filtrando" por etapa | `segments` casa **tags do contato** (`lib/followup/silence-sweep.ts:36-39`) — varreria a organização inteira | Enoturismo B usa nó `condition`, não `segments` |
| Cadência publicada sem motor por trás | gatilho automático só inscreve com agente publicado + follow-up ligado (`lib/followup/agent-followup-gate.ts:45`) | Tudo nasce `draft`, explícito; a tela diz o que falta para publicar |
| Lembrete ligado mandando mensagem ao cliente sem a vinícola pedir | DDL base é `default true` (`baseline.sql:15148`); só o apêndice o vira `false` (`:16330`) | O aplicador grava `reminder_enabled: false` **explícito**, e um teste o mede |
| Reaplicar duplicando resposta rápida | `message_templates` **não tem unique por shortcut** (`baseline.sql:7598`) | Ledger + pré-leitura; caso "reaplica sem duplicar" na Task 2 |
| Ressuscitar o que a vinícola apagou | chave natural ausente não distingue "nunca criei" de "criaram e apagaram" | Ledger: só cria peça que **nunca constou** |
| Substituir o `settings` da organização e perder chave irmã | `organizations.settings` guarda o estado do onboarding | Gravação por **merge**; o teste do ledger afirma que `settings.onboarding` sobrevive |
| Tela nova sem porta na navegação | `tests/unit/navegacao-completude.test.ts` | Entrada no catálogo com grupo, seção e `minRole` (Task 4 Step 4), com a cerca rodada no Task 4 Step 6 |
| Texto de interface sem espanhol | `tests/unit/i18n-espanhol-cobre-a-tela.test.ts` varre o AST de toda tela, e reprova a task que INTRODUZ a string — não a seguinte | As frases do onboarding entram na Task 3 Step 7b (com a cerca rodada no Step 10); as da tela nova, na Task 4 Step 5 (cerca no Step 6) |
| Reprovar `sugerir-funil.test.ts` sem perceber | 13 casos + a asserção da linha 118 usam os ids antigos | Task 3 Step 1 reescreve o arquivo **antes** de trocar os ids, preservando a régua |
| Grafo recusado gravado sem erro | o INSERT só vê `jsonb`; a falha aparece quando alguém abre o construtor | Task 2 Step 7 passa cada grafo pelo `flowGraphSchema` real |
| `update.sh` engolindo o script na VPS | o único `read` do script (`hostgator-setup-kit/update.sh:123`) é alcançado quando o **backup preventivo falha** em sessão interativa; um heredoc lhe entrega a linha seguinte do próprio script no lugar de `CONTINUAR`, e a atualização morre dizendo "cancelada pelo operador" | Task 6 Step 1 e Task 7 Step 4: script em arquivo + `< /dev/null`, para o `read` falhar na hora |
| Medir os checks contra uma lista escrita | a `main` deste fork **não tem branch protection** (a API responde 403 sem GitHub Pro) e o `e2e` está `disabled_manually` | Global Constraints traz os dois `gh api`; a expectativa é **derivada** deles, não afirmada |
| **Dois funis com o mesmo nome** | `PACOTES` vira projeção da jornada, e a RPC grava a proposta no funil existente (`montarQuadro.ts:232-247`); o slug desambigua com `_2`, o **nome não desambigua com nada** | Task 3 Step 8: com jornada marcada o wizard **não** chama a RPC; sem jornada, o fluxo de hoje inteiro. Medido em Task 3 Step 8b |
| Quadro de loja online sobrando como padrão | com a RPC fora do caminho, ninguém substitui o funil que o gatilho semeou — e a tela promete que ele "é substituído" (`_client.tsx:198`) | `tornarPadrao()` promove o funil da primeira jornada, em duas escritas ordenadas (`uniq_crm_pipelines_org_default` é parcial, `baseline.sql:2902`) |
| Editor de colunas descartado em silêncio | com jornada marcada, o que a pessoa digitar no editor não é gravado por ninguém | Task 3 Step 7: o editor só aparece quando nenhuma jornada está marcada |
| Ícone que não existe no mapa fechado | `NAV_DESTINATIONS` faz `ICONS[d.icon]` sem fallback (`lib/navigation/registry.ts:94`): nome fora do mapa vira `undefined` e **quebra a tela no browser**, com typecheck e suíte verdes | `icon: "Signpost"`, que está no mapa (`:84`) e em `lib/ui/icons.ts:125` |
| Ramo de condição sem aresta | `validateFlowForPublish` só cobra cobertura de ramo no modo `per_check` (`lib/followup/validate-publish.ts:343-348`); um `condition` combinado com só a saída "sim" **passa no publish** e o lead para no nó | `grafoDaCadencia` escreve as duas `cond_result`, e o Step 7 da Task 2 as mede |
| Grafo bem formado que não publica | `flowGraphSchema` não exige trigger único, alcançabilidade nem caminho até `end` | Task 2 Step 7 passa cada grafo por `validateFlowForPublish`, esperando `{ ok: true }` |
| Vocabulário perdendo chave | o default do DDL tem **8** chaves (`supabase/baseline.sql:1486`) e a jornada define 4 | O insert mescla as 4 sobre as 8 (Task 2, regra 3) |
| Tag cortada antes da prova em tela | doutrina de QA Visual: a prova é critério de aceite, não verificação posterior | A prova roda na **candidata** (Task 6) e a tag só sai depois do ok do dono (Task 7) |

## Fora deste plano

- **Guardrail de maioridade** (pergunta na conversa, bloqueio do agente, encerramento). Entram só o
  motivo de perda "Menor de 18 anos", o campo "Maioridade confirmada" e a tag `menor-de-18`. O texto
  de encerramento e o comportamento são decisão do dono, pendente (anexo, linhas 942-990).
- **Gatilho "compromisso concluído"** no motor de follow-up. Não existe; criá-lo é mexer no núcleo.
- **Agente de IA por jornada, roteador e base de conhecimento** — dependem de WhatsApp conectado e
  chave de IA. As **perguntas frequentes do anexo** são material dessa fase e **não são semeadas aqui**.
- **Resolver `{{nome}}` no envio automático de follow-up.** O motor só troca `{{volta}}`/`{{voltas}}`;
  fazê-lo resolver contato é mudança no núcleo, com teste e prova próprios.
- **Evento com lotação, ingresso e lista de participantes.** A agenda é compromisso 1:1.
- **Conteúdo em espanhol.** Decisão do dono: pacote só em português; a interface segue bilíngue.
- **Migration de qualquer espécie.** Se uma fase futura exigir coluna nova, ela sai como migration
  idempotente + apêndice do `baseline.sql` + linha no MANIFEST, declarada antes.
- **Garantia forte contra duas abas simultâneas.** Esta entrega promete idempotência **sequencial** e
  fecha o clique duplo pela tela (Task 2, regra 12). A garantia forte custa unique parcial em
  `message_templates` — migration, apêndice e MANIFEST —, e vira fase própria se o dono quiser.

## Conferência final do próprio plano

Antes de dar a execução por encerrada, provar que nenhum step ficou com buraco — plano com
`/* … */` no lugar do código é plano que empurra a decisão para quem executa, às cegas:

```bash
cd /home/lussandro/Bacco-Crm && for f in \
  docs/superpowers/plans/2026-09-15-bacco-jornadas-de-vinicola.md \
  docs/superpowers/specs/2026-09-15-bacco-jornadas-de-vinicola-design.md; do
  # A própria seção sai da varredura: ela CITA os padrões que procura.
  sed '/^## Conferência final/,$d' "$f" \
    | grep -nE 'TODO:|\bTBD\b|FIXME|/\* ?(…|\.\.\.) ?\*/|(similar|igual|análogo|idêntico) à Task' \
    | sed "s|^|$f:|"
done
```
Expected: **nenhuma linha**. Ocorrência = o step não tem código real; escreva-o antes de executar.

⚠️ **Dois falsos positivos previsíveis, e nenhum dos dois é defeito** — a régua é `TODO:` com
dois-pontos justamente por causa do primeiro:

- **`TODO` é palavra portuguesa.** "único em TODO o pacote" aparece duas vezes no plano (no tipo da
  resposta rápida e no teste dos 67 atalhos) e está correto. Um `grep TODO` solto acusa as duas, e
  quem "consertar" a prosa piora o documento.
- **O comando casa a si mesmo.** Ele cita os próprios padrões; o `grep -v` do fim tira a seção.
