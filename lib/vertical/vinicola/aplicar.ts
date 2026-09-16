/**
 * APLICAR UMA JORNADA — a única peça deste pacote que toca o banco.
 *
 * ⚠️ NÃO USA `POST /api/v1/pipelines`, `POST /pipelines/:id/stages` nem
 * `updatePipelineConfig`, e as três recusas são medidas:
 *  - a rota de funil SEMPRE insere `ETAPAS_INICIAIS` com `is_won`/`is_lost` já
 *    ocupados (`lib/pipelines/pipeline-editing.ts`), e os uniques parciais
 *    `uniq_crm_stages_pipeline_won`/`_lost` não deixam a jornada nomear a
 *    própria etapa de ganho;
 *  - a rota de etapa aceita só `{ name }` (`app/api/v1/pipelines/[id]/stages/route.ts`);
 *  - `updatePipelineConfig` é server action de sessão e não aceita
 *    `organizationId` (`app/actions/settings/updatePipelineConfig.ts`) — o
 *    onboarding precisa aplicar numa organização que pode não ser a do cookie.
 *
 * Admin client + filtro MANUAL de `organization_id` em toda query, com o id
 * vindo da sessão ou do contexto do onboarding — nunca do body. Mesmo desenho
 * de `app/actions/onboarding/montarQuadro.ts`.
 *
 * ⚠️ A ORDEM É OBRIGATÓRIA, e cada elo tem um modo de falha silencioso:
 *  1. funil + etapas       — sem id de etapa, gatilho e condição não têm alvo
 *  2. vocabulário/campos/motivos — mesmo `settings`, gravado no MESMO insert
 *  3. tags                 — funil e conversa, por merge
 *  4. respostas rápidas    — cadência que aponta para modelo inexistente só
 *                            falha NO ENVIO, em runtime
 *  5. tipos de compromisso — pré-lê por nome, e o slug sai da lista dos slugs
 *                            já ocupados, então não há colisão a tratar
 *  6. cadências            — em rascunho, com os ids REAIS desta organização
 *
 * ⚠️ A PROMESSA DE CONCORRÊNCIA É IDEMPOTÊNCIA SEQUENCIAL, e só ela. Uma
 * aplicação depois da outra não duplica nada. DUAS ABAS AO MESMO TEMPO NÃO
 * ESTÃO PROTEGIDAS, e não adianta prometer que estão: não há trava no banco
 * para pendurar a promessa — `message_templates` não tem unique por `shortcut`,
 * o ledger é um `jsonb` cujo merge é ler-modificar-gravar (a segunda gravação
 * vence), e esta entrega não abre migration. O que fecha a porta do clique
 * duplo — que é a corrida que acontece de verdade — é a tela desabilitar o
 * botão enquanto a aplicação corre. Quem quiser a garantia forte paga uma
 * unique parcial numa fase própria, com migration e apêndice.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { audit } from "@/lib/audit";
import type { AuditAction } from "@/lib/audit/actions";
import type { TriggerConfig } from "@/lib/followup/api-schemas";
import type { FlowEdge, FlowEdgeCondition, FlowGraph, FlowNode } from "@/lib/followup/graph-schema";
import { slugDeNome } from "@/lib/leads/stage-editing";
import { etapasParaGravar } from "@/lib/onboarding/proposta-de-funil";
import { createAdminClient } from "@/lib/supabase/admin";

import { JORNADAS, VERSAO_DO_PACOTE, ehChaveDeJornada, type ChaveDeJornada } from "./index";
import type { CadenciaDaJornada, GatilhoDaCadencia } from "./tipos";

export type EstadoDaPeca = "criada" | "ja_existia" | "no_ledger_e_apagada" | "falhou";

export type TipoDaPeca =
  | "funil"
  | "etapa"
  | "config"
  | "tag"
  | "resposta_rapida"
  | "tipo_de_compromisso"
  | "cadencia";

export interface PecaDoRelatorio {
  tipo: TipoDaPeca;
  /** `resposta_rapida:/eno-ola`, `etapa:Novo interessado` — rótulo LEGÍVEL. */
  chave: string;
  estado: EstadoDaPeca;
  /** O texto REAL do banco quando `falhou`. Nunca "falha na operação". */
  erro?: string;
}

export interface RelatorioDaJornada {
  chave: ChaveDeJornada;
  versao: number;
  pecas: PecaDoRelatorio[];
  completa: boolean;
}

/**
 * Uma peça registrada no ledger — e QUEM DECIDE EXISTÊNCIA É O `id`.
 *
 * Um id é imutável e ninguém o edita na tela. A chave natural, não: o `shortcut`
 * da resposta rápida, o `name` da cadência e o `name` do funil são todos
 * editáveis pela própria vinícola. Decidir existência pela chave natural faria
 * **renomear** ler como **apagar** — a peça sumiria da conta, a jornada
 * apareceria como *parcial* na tela, e a tela diria à vinícola que ela removeu
 * algo que está lá, com outro nome. Pior no sentido inverso: reaplicar criaria
 * uma segunda cópia com o nome antigo, ao lado da renomeada.
 *
 * A chave natural fica aqui como RÓTULO, para a tela dizer *o que* falta em vez
 * de listar uuid.
 */
export interface PecaDoLedger {
  id: string;
  chave: string;
}

export interface EntradaDoLedger {
  versao_do_pacote: number;
  aplicada_em: string;
  pecas: PecaDoLedger[];
}

/** A chave de `organizations.settings` onde o ledger mora. */
const CHAVE_DO_LEDGER = "bacco_jornadas";

/**
 * Em que tabela a peça vive — é o que transforma o ledger numa pergunta que o
 * banco sabe responder ("estes ids ainda existem?").
 *
 * `config` e `tag` não têm linha própria: a configuração mora no `settings` do
 * funil (gravada no mesmo insert) e as tags no `settings` da organização. Cada
 * uma aponta para a linha que a carrega, então "a peça sumiu" tem o único
 * significado possível — o funil foi apagado, a organização foi apagada.
 */
const TABELA_DA_PECA: Record<TipoDaPeca, string> = {
  funil: "crm_pipelines",
  config: "crm_pipelines",
  etapa: "crm_stages",
  tag: "organizations",
  resposta_rapida: "message_templates",
  tipo_de_compromisso: "calendar_event_types",
  cadencia: "followup_flow_pointers",
};

/** A ação de auditoria de cada peça criada. `tag` reescreve o `settings` da org. */
const ACAO_DA_PECA: Record<TipoDaPeca, AuditAction> = {
  funil: "pipeline.created",
  config: "pipeline.config_updated",
  etapa: "pipeline.stage_created",
  tag: "org.updated",
  resposta_rapida: "template.created",
  tipo_de_compromisso: "agenda.tipo_criado",
  cadencia: "followup_flow.created",
};

/**
 * As OITO chaves do default do DDL (`crm_pipelines.vocabulary`).
 *
 * A jornada define QUATRO. Gravar só as quatro APAGA as outras quatro — os
 * plurais e o nome de "Etapa" —, e o que aparece na tela no lugar delas é o que
 * cada consumidor puser de fallback, tela a tela. Por isso o insert mescla.
 */
const VOCABULARIO_PADRAO = {
  lead: "Cliente",
  lead_plural: "Clientes",
  deal: "Pedido",
  deal_plural: "Pedidos",
  won: "Pago",
  lost: "Cancelado",
  stage: "Etapa",
  stage_plural: "Etapas",
} as const;

/** O mesmo default do DDL — copiado porque o insert não o herda ao passar `settings`. */
const RESOLUCAO_DE_IDENTIDADE = { fields_in_priority_order: ["cpf", "phone_e164", "email"] };

/** O teto de `organizations.settings.canonical_conversation_tags` (`canonicalConversationTagsSchema`). */
const MAX_TAGS_DE_CONVERSA = 50;

/** A faixa que a rota de agenda aceita — mais estreita que o CHECK do banco, de propósito. */
const LEMBRETE_MINIMO = 15;
const LEMBRETE_MAXIMO = 10_080;

// ─────────────────────────────────────────────────────────────────────────────
// O grafo
// ─────────────────────────────────────────────────────────────────────────────

/**
 * O grafo de uma cadência: início → [condição] → (espera → mensagem)* → fim.
 *
 * Molde conferido contra `scripts/lib/grafo-de-demonstracao.ts`, o único grafo
 * do repo que passa pelo `flowGraphSchema` de verdade num teste.
 *
 * Toda mensagem é modo `template` — nunca `text`. Dois efeitos que se sustentam
 * sozinhos: o texto fica editável na tela de respostas rápidas, e o mesmo texto
 * serve ao operador no envio manual, onde o composer resolve `{{nome}}`.
 * (E de quebra `long_wait_needs_template` não se aplica: ele só alcança nó
 * `ai_message` — `lib/followup/validate-publish.ts`.)
 *
 * `esperaMs === 0` NÃO vira nó `wait`: o piso do `waitConfigSchema` é 300.000 ms
 * e um nó de espera zerada seria recusado na validação.
 *
 * ⚠️ IDS ÚNICOS DE NÓ **E DE ARESTA**. O `superRefine` do `flowGraphSchema`
 * reprova id de nó repetido, id de ARESTA repetido e aresta apontando para nó
 * inexistente. O contador `n` serve aos dois.
 *
 * ⚠️ `priority` é escrito explícito. `flowEdgeSchema` o declara com
 * `.default(0)`, e como o grafo é gravado como `jsonb` — e não passa pelo parse
 * na gravação — omiti-lo deixaria a aresta sem o campo no banco.
 */
function grafoDaCadencia(
  cad: CadenciaDaJornada,
  idDaEtapa: (nome: string) => string,
  idDoModelo: (atalho: string) => string,
): FlowGraph {
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];
  let n = 0;
  /** Um id por nó, e o mesmo contador nomeia a aresta que chega nele. */
  const proximo = (prefixo: string) => `${prefixo}-${++n}`;
  let x = 0;
  const pos = () => ({ x: (x += 240), y: 0 });

  const ligar = (source: string, target: string, condicao: FlowEdgeCondition) => {
    edges.push({ id: `e-${edges.length + 1}`, source, target, priority: 0, condition: condicao });
  };
  const SEMPRE: FlowEdgeCondition = { type: "always" };

  // ── início ────────────────────────────────────────────────────────────────
  const inicio = proximo("trigger");
  nodes.push({ id: inicio, type: "trigger", label: "Início", position: { x: 0, y: 0 }, config: {} });

  // ── os dois fins, nomeados já: toda saída precisa de caminho até um deles ──
  const fim = "end-1";
  const fimCedo = "end-2";

  let anterior = inicio;

  // ── a condição por etapa, quando a cadência a declara ─────────────────────
  //
  // ⚠️ MODO `combined`, E É POR ISSO QUE AS DUAS ARESTAS SÃO ESCRITAS À MÃO.
  // `validateFlowForPublish` só cobra cobertura de ramo no modo `per_check`
  // ("É deliberado que o modo combinado fique de fora"). Ou seja: um nó
  // `condition` combinado com apenas a aresta do "sim" PASSA no publish — e o
  // lead que cair no "não" fica parado no nó, para sempre, sem erro em lugar
  // nenhum. O validador não pega; quem pega é escrever as duas, sempre.
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

  const saidaDaCondicao: FlowEdgeCondition = cad.somenteNaEtapa
    ? { type: "cond_result", value: true }
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
      // operador no envio manual. `template_id` é `z.string().uuid()` — o id
      // REAL do modelo desta organização, resolvido agora.
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

/** O gatilho da cadência com os ids REAIS desta organização. */
function gatilhoParaGravar(
  gatilho: GatilhoDaCadencia,
  idDaEtapa: (nome: string) => string,
): TriggerConfig {
  switch (gatilho.kind) {
    case "manual":
      return { kind: "manual" };
    case "appointment_no_show":
      return { kind: "appointment_no_show" };
    case "silence":
      return { kind: "silence", params: { threshold_minutes: gatilho.minutos } };
    case "stage_change":
      return { kind: "stage_change", params: { stage_id: idDaEtapa(gatilho.nomeDaEtapa) } };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// O ledger
// ─────────────────────────────────────────────────────────────────────────────

/** `organizations.settings` é jsonb sem CHECK: o que volta de lá é entrada externa. */
function lerEntrada(bruto: unknown): EntradaDoLedger | null {
  if (typeof bruto !== "object" || bruto === null) return null;
  const e = bruto as Record<string, unknown>;
  if (!Array.isArray(e.pecas)) return null;
  const pecas = e.pecas.flatMap((p): PecaDoLedger[] => {
    if (typeof p !== "object" || p === null) return [];
    const { id, chave } = p as Record<string, unknown>;
    return typeof id === "string" && typeof chave === "string" ? [{ id, chave }] : [];
  });
  return {
    versao_do_pacote: typeof e.versao_do_pacote === "number" ? e.versao_do_pacote : 0,
    aplicada_em: typeof e.aplicada_em === "string" ? e.aplicada_em : "",
    pecas,
  };
}

async function lerSettings(
  admin: SupabaseClient,
  organizationId: string,
): Promise<Record<string, unknown>> {
  const { data, error } = await admin
    .from("organizations")
    .select("settings")
    .eq("id", organizationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const settings = (data as { settings?: unknown } | null)?.settings;
  return typeof settings === "object" && settings !== null
    ? (settings as Record<string, unknown>)
    : {};
}

export async function lerLedger(
  organizationId: string,
): Promise<Partial<Record<ChaveDeJornada, EntradaDoLedger>>> {
  const settings = await lerSettings(createAdminClient(), organizationId);
  const bruto = settings[CHAVE_DO_LEDGER];
  if (typeof bruto !== "object" || bruto === null) return {};

  const ledger: Partial<Record<ChaveDeJornada, EntradaDoLedger>> = {};
  for (const [chave, valor] of Object.entries(bruto as Record<string, unknown>)) {
    if (!ehChaveDeJornada(chave)) continue;
    const entrada = lerEntrada(valor);
    if (entrada) ledger[chave] = entrada;
  }
  return ledger;
}

/**
 * Quais ids do ledger ainda existem no banco, uma query por tabela.
 *
 * É a pergunta que só o id sabe responder: a linha renomeada volta daqui, e é
 * o que impede "renomear" de ler como "apagar".
 */
async function idsQueAindaExistem(
  admin: SupabaseClient,
  organizationId: string,
  pecas: PecaDoLedger[],
): Promise<Set<string>> {
  const porTabela = new Map<string, string[]>();
  for (const p of pecas) {
    const tipo = p.chave.split(":")[0] as TipoDaPeca;
    const tabela = TABELA_DA_PECA[tipo];
    if (!tabela) continue;
    const lista = porTabela.get(tabela);
    if (lista) lista.push(p.id);
    else porTabela.set(tabela, [p.id]);
  }

  const vivos = new Set<string>();
  for (const [tabela, ids] of porTabela) {
    // `organizations` é filtrada por `id`, e o id da peça É o da organização:
    // um `.in("id", …)` ao lado de um `.eq("id", …)` seria o mesmo filtro duas
    // vezes, com a segunda vencendo.
    const { data, error } =
      tabela === "organizations"
        ? await admin.from(tabela).select("id").eq("id", organizationId)
        : await admin
            .from(tabela)
            .select("id")
            .eq("organization_id", organizationId)
            .in("id", ids);
    if (error) throw new Error(error.message);
    for (const linha of (data ?? []) as Array<{ id: string }>) {
      if (ids.includes(linha.id)) vivos.add(linha.id);
    }
  }
  return vivos;
}

export async function estadoDaJornada(
  organizationId: string,
  chave: ChaveDeJornada,
): Promise<"nao_aplicada" | "aplicada" | "parcial"> {
  const entrada = (await lerLedger(organizationId))[chave];
  if (!entrada || entrada.pecas.length === 0) return "nao_aplicada";
  const vivos = await idsQueAindaExistem(createAdminClient(), organizationId, entrada.pecas);
  return entrada.pecas.every((p) => vivos.has(p.id)) ? "aplicada" : "parcial";
}

// ─────────────────────────────────────────────────────────────────────────────
// A aplicação
// ─────────────────────────────────────────────────────────────────────────────

/** O insert que devolve o id — e que lança com o TEXTO REAL do banco. */
async function inserir(
  admin: SupabaseClient,
  tabela: string,
  linha: Record<string, unknown>,
): Promise<string> {
  const { data, error } = await admin.from(tabela).insert(linha).select("id").single();
  if (error) throw new Error(error.message);
  const id = (data as { id?: string } | null)?.id;
  if (!id) throw new Error(`o banco não devolveu o id da linha criada em ${tabela}`);
  return id;
}

async function lerTabela(
  admin: SupabaseClient,
  tabela: string,
  colunas: string,
  filtros: Record<string, string>,
): Promise<Array<Record<string, unknown>>> {
  let q = admin.from(tabela).select(colunas);
  for (const [coluna, valor] of Object.entries(filtros)) q = q.eq(coluna, valor);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  // Via `unknown`: com `select(colunas)` dinâmico o PostgREST tipa o retorno
  // como união com `GenericStringError[]`, que não se sobrepõe ao nosso mapa.
  return (data ?? []) as unknown as Array<Record<string, unknown>>;
}

const texto = (v: unknown): string => (typeof v === "string" ? v : "");

/**
 * Aplica uma jornada nesta organização, sem lançar.
 *
 * ⚠️ NENHUM `throw` SAI DAQUI. Erro de qualquer peça vira
 * `{ estado: "falhou", erro }` — com o texto real do banco — e a aplicação
 * segue para a peça seguinte, salvo quando o FUNIL falha: sem funil não há onde
 * pendurar nada, e aí o relatório volta só com essa peça.
 */
export async function aplicarJornada(
  organizationId: string,
  chave: ChaveDeJornada,
  atorUserId: string | null,
): Promise<RelatorioDaJornada> {
  const admin = createAdminClient();
  const j = JORNADAS[chave];
  const pecas: PecaDoRelatorio[] = [];

  /** As peças que o ledger vai carregar depois desta rodada. */
  const doLedger: PecaDoLedger[] = [];

  let anterior: EntradaDoLedger | undefined;
  let vivos = new Set<string>();
  try {
    anterior = (await lerLedger(organizationId))[chave];
    vivos = await idsQueAindaExistem(admin, organizationId, anterior?.pecas ?? []);
  } catch (err) {
    return {
      chave,
      versao: VERSAO_DO_PACOTE,
      pecas: [
        {
          tipo: "funil",
          chave: `funil:${j.nomeDoFunil}`,
          estado: "falhou",
          erro: err instanceof Error ? err.message : String(err),
        },
      ],
      completa: false,
    };
  }
  const registradas = new Map((anterior?.pecas ?? []).map((p) => [p.chave, p]));

  /**
   * Um desfecho por peça, e a ordem das perguntas é a decisão do arquivo.
   *
   * O ledger responde *"isto já existiu alguma vez?"* e a pré-leitura por chave
   * natural responde *"isto existe agora?"*. Só a primeira distingue apagado de
   * nunca-criado — e só a segunda protege o desfecho mais provável de todos: a
   * aplicação que falha no meio, depois de criar metade das peças e ANTES de
   * gravar o ledger. Por isso a pré-leitura vale SEMPRE, inclusive sem ledger.
   */
  async function aplicarPeca(
    tipo: TipoDaPeca,
    rotulo: string,
    idNatural: string | null,
    criar: () => Promise<string>,
  ): Promise<string | null> {
    const k = `${tipo}:${rotulo}`;

    const registrada = registradas.get(k);
    if (registrada) {
      if (vivos.has(registrada.id)) {
        pecas.push({ tipo, chave: k, estado: "ja_existia" });
        doLedger.push(registrada);
        return registrada.id;
      }
      // Apagada pela vinícola. NÃO recriar é respeitar a decisão dela — e a
      // peça CONTINUA no ledger, senão a aplicação seguinte a traria de volta.
      pecas.push({ tipo, chave: k, estado: "no_ledger_e_apagada" });
      doLedger.push(registrada);
      return null;
    }

    if (idNatural) {
      pecas.push({ tipo, chave: k, estado: "ja_existia" });
      doLedger.push({ id: idNatural, chave: k });
      return idNatural;
    }

    try {
      const id = await criar();
      pecas.push({ tipo, chave: k, estado: "criada" });
      doLedger.push({ id, chave: k });
      await audit({
        action: ACAO_DA_PECA[tipo],
        organizationId,
        actorUserId: atorUserId,
        resourceType: TABELA_DA_PECA[tipo],
        resourceId: id,
        metadata: { jornada: chave, versao: VERSAO_DO_PACOTE, peca: k },
      });
      return id;
    } catch (err) {
      pecas.push({
        tipo,
        chave: k,
        estado: "falhou",
        erro: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  // ── 1. o funil ────────────────────────────────────────────────────────────
  const funis = await lerTabela(admin, "crm_pipelines", "id, name, slug", {
    organization_id: organizationId,
  });
  const funilExistente = funis.find((p) => texto(p.name) === j.nomeDoFunil);
  const slugDoFunil = slugDeNome(j.nomeDoFunil, funis.map((p) => texto(p.slug)), "funil");

  const pipelineId = await aplicarPeca(
    "funil",
    j.nomeDoFunil,
    funilExistente ? texto(funilExistente.id) : null,
    () =>
      inserir(admin, "crm_pipelines", {
        organization_id: organizationId,
        name: j.nomeDoFunil,
        slug: slugDoFunil,
        // Trocar o quadro padrão da organização é outra operação, com nome
        // próprio e duas escritas na ordem certa: `tornarPadrao`.
        is_default: false,
        is_archived: false,
        position: 1000,
        vocabulary: { ...VOCABULARIO_PADRAO, ...j.vocabulario },
        settings: {
          fields: j.campos,
          canonical_tags: j.tags,
          lost_reasons: j.motivosDePerda,
          identity_resolution: RESOLUCAO_DE_IDENTIDADE,
        },
      }),
  );

  if (!pipelineId) {
    // Sem funil não há onde pendurar etapa, configuração nem cadência, e
    // metade do pacote solto no banco é pior que nada. Nada de ledger e nada
    // de auditoria da jornada: não houve efeito nenhum a registrar.
    return { chave, versao: VERSAO_DO_PACOTE, pecas, completa: false };
  }

  // ── 2. a configuração do funil ────────────────────────────────────────────
  // Vocabulário, campos, motivos e tags canônicas foram no MESMO insert acima —
  // um funil que nasce sem eles fica meio configurado se o segundo write falha.
  // A peça existe no relatório e no ledger porque é ela que a tela lista.
  await aplicarPeca("config", j.nomeDoFunil, funilExistente ? pipelineId : null, async () =>
    pipelineId,
  );

  // ── 3. as etapas ──────────────────────────────────────────────────────────
  const etapasNoBanco = await lerTabela(admin, "crm_stages", "id, name", {
    organization_id: organizationId,
    pipeline_id: pipelineId,
  });
  const idDeEtapa = new Map<string, string>();
  for (const linha of etapasParaGravar({ nome: j.nomeDoFunil, etapas: j.etapas }, slugDeNome)) {
    const existente = etapasNoBanco.find((e) => texto(e.name) === linha.nome);
    const id = await aplicarPeca(
      "etapa",
      linha.nome,
      existente ? texto(existente.id) : null,
      () =>
        inserir(admin, "crm_stages", {
          organization_id: organizationId,
          pipeline_id: pipelineId,
          name: linha.nome,
          slug: linha.slug,
          position: linha.position,
          is_won: linha.is_won,
          is_lost: linha.is_lost,
          agent_stage_hint: linha.agent_stage_hint,
        }),
    );
    if (id) idDeEtapa.set(linha.nome, id);
  }

  // ── 4. as tags da conversa ────────────────────────────────────────────────
  // União com o que já está lá: a organização pode ter marcadores próprios, e
  // substituir a lista os apagaria.
  await aplicarPeca("tag", "conversa", null, async () => {
    const settings = await lerSettings(admin, organizationId);
    const atuais = Array.isArray(settings.canonical_conversation_tags)
      ? settings.canonical_conversation_tags.filter((t): t is string => typeof t === "string")
      : [];
    const unidas = [...new Set([...atuais, ...j.tags])].slice(0, MAX_TAGS_DE_CONVERSA);
    const { error } = await admin
      .from("organizations")
      .update({ settings: { ...settings, canonical_conversation_tags: unidas } })
      .eq("id", organizationId);
    if (error) throw new Error(error.message);
    return organizationId;
  });

  // ── 5. as respostas rápidas ───────────────────────────────────────────────
  const modelosNoBanco = await lerTabela(admin, "message_templates", "id, shortcut", {
    organization_id: organizationId,
  });
  const idDeModelo = new Map<string, string>();
  for (const r of j.respostasRapidas) {
    const existente = modelosNoBanco.find((m) => texto(m.shortcut) === r.atalho);
    const id = await aplicarPeca(
      "resposta_rapida",
      r.atalho,
      existente ? texto(existente.id) : null,
      () =>
        inserir(admin, "message_templates", {
          organization_id: organizationId,
          title: r.titulo,
          body: r.corpo,
          shortcut: r.atalho,
          // Compartilhado: a cadência aponta para ele, e um modelo com dono não
          // serviria a mais ninguém da equipe.
          owner_user_id: null,
          created_by_user_id: atorUserId,
        }),
    );
    if (id) idDeModelo.set(r.atalho, id);
  }

  // ── 6. os tipos de compromisso ────────────────────────────────────────────
  const tiposNoBanco = await lerTabela(admin, "calendar_event_types", "id, name, slug", {
    organization_id: organizationId,
  });
  const slugsDeTipo = tiposNoBanco.map((t) => texto(t.slug));
  for (const t of j.tiposDeCompromisso) {
    const existente = tiposNoBanco.find((x) => texto(x.name) === t.nome);
    const slug = slugDeNome(t.nome, slugsDeTipo, "tipo");
    if (!existente) slugsDeTipo.push(slug);
    await aplicarPeca("tipo_de_compromisso", t.nome, existente ? texto(existente.id) : null, () => {
      const lembrete = t.lembreteMinutosAntes;
      if (lembrete !== undefined && (lembrete < LEMBRETE_MINIMO || lembrete > LEMBRETE_MAXIMO)) {
        // Recusar, nunca aproximar: um lembrete fora da faixa é erro de
        // cadastro do pacote, e "quase certo" aqui vira mensagem no telefone
        // do cliente na hora errada — efeito irreversível.
        throw new Error(
          `o tipo «${t.nome}» pede lembrete de ${lembrete} min, fora da faixa de ` +
            `${LEMBRETE_MINIMO} a ${LEMBRETE_MAXIMO} minutos`,
        );
      }
      return inserir(admin, "calendar_event_types", {
        organization_id: organizationId,
        name: t.nome,
        slug,
        category: t.categoria,
        duration_minutes: t.duracaoMinutos,
        location_kind: t.local,
        ...(t.detalhesDoLocal ? { location_details: t.detalhesDoLocal } : {}),
        // ⚠️ EXPLÍCITO. O DDL base nasceu com default TRUE e só o apêndice o
        // virou false: herdar o default mandaria mensagem ao cliente num clone
        // que ainda não aplicou a 0194. Ligar o lembrete é da vinícola.
        reminder_enabled: false,
        ...(lembrete !== undefined ? { reminder_minutes_before: lembrete } : {}),
      });
    });
  }

  // ── 7. as cadências ───────────────────────────────────────────────────────
  const idDaEtapa = (nome: string): string => {
    const id = idDeEtapa.get(nome);
    if (!id) throw new Error(`a etapa «${nome}» não está neste funil — a cadência ficaria sem alvo`);
    return id;
  };
  const idDoModelo = (atalho: string): string => {
    const id = idDeModelo.get(atalho);
    if (!id) throw new Error(`a resposta rápida «${atalho}» não existe — a cadência não teria o que enviar`);
    return id;
  };

  const cadenciasNoBanco = await lerTabela(admin, "followup_flow_pointers", "id, name", {
    organization_id: organizationId,
  });
  for (const cad of j.cadencias) {
    const existente = cadenciasNoBanco.find((c) => texto(c.name) === cad.nome);
    await aplicarPeca("cadencia", cad.nome, existente ? texto(existente.id) : null, () =>
      inserir(admin, "followup_flow_pointers", {
        organization_id: organizationId,
        name: cad.nome,
        // Explícito pela mesma razão do lembrete: o default é do banco, e um
        // clone atrasado não é auditado por nós. Publicar é da vinícola.
        status: "draft",
        trigger_config: gatilhoParaGravar(cad.gatilho, idDaEtapa),
        draft_graph: grafoDaCadencia(cad, idDaEtapa, idDoModelo),
      }),
    );
  }

  // ── 8. o ledger, por merge ────────────────────────────────────────────────
  const completa = pecas.every((p) => p.estado !== "falhou");
  try {
    const settings = await lerSettings(admin, organizationId);
    const ledger =
      typeof settings[CHAVE_DO_LEDGER] === "object" && settings[CHAVE_DO_LEDGER] !== null
        ? (settings[CHAVE_DO_LEDGER] as Record<string, unknown>)
        : {};
    const entrada: EntradaDoLedger = {
      versao_do_pacote: VERSAO_DO_PACOTE,
      aplicada_em: new Date().toISOString(),
      pecas: doLedger,
    };
    const { error } = await admin
      .from("organizations")
      .update({ settings: { ...settings, [CHAVE_DO_LEDGER]: { ...ledger, [chave]: entrada } } })
      .eq("id", organizationId);
    if (error) throw new Error(error.message);
  } catch (err) {
    pecas.push({
      tipo: "config",
      chave: `config:${CHAVE_DO_LEDGER}`,
      estado: "falhou",
      erro: err instanceof Error ? err.message : String(err),
    });
    return { chave, versao: VERSAO_DO_PACOTE, pecas, completa: false };
  }

  await audit({
    action: "vertical.jornada_aplicada",
    organizationId,
    actorUserId: atorUserId,
    resourceType: "organizations",
    resourceId: organizationId,
    metadata: {
      jornada: chave,
      versao: VERSAO_DO_PACOTE,
      completa,
      pecas: pecas.map((p) => ({ chave: p.chave, estado: p.estado })),
    },
  });

  return { chave, versao: VERSAO_DO_PACOTE, pecas, completa };
}

/**
 * Promove o funil da jornada a padrão da organização. Só o ONBOARDING chama.
 *
 * Existe porque o passo do funil do wizard promete, em texto, que o quadro de
 * loja online "é substituído" — e com jornada marcada o wizard não chama mais a
 * RPC que o substituía. Sem isto, a vinícola termina o onboarding com "Carrinho
 * abandonado" como quadro padrão e o funil dela ao lado, e a tela terá mentido.
 *
 * ⚠️ DUAS ESCRITAS, NESTA ORDEM, E NÃO DÁ PARA FAZER EM UMA.
 * `uniq_crm_pipelines_org_default` é um índice único PARCIAL sobre
 * `(organization_id) where is_default = true`: marcar o novo antes de desmarcar
 * o velho colide com 23505. Primeiro apaga a flag do atual, depois acende a do
 * novo — e, se a segunda falhar, DEVOLVE a flag ao antigo, porque uma
 * organização sem funil padrão quebra o próprio wizard (`carregarQuadroAtual`
 * filtra por `is_default` e devolve null).
 *
 * É a ÚNICA escrita do pacote sobre linha que já existia, fora o merge de
 * `organizations.settings` — e por isso está aqui, nomeada, e não escondida
 * dentro de `aplicarJornada`.
 */
export async function tornarPadrao(
  organizationId: string,
  pipelineId: string,
): Promise<{ ok: boolean; erro?: string }> {
  const admin = createAdminClient();

  const { data, error: erroDeLeitura } = await admin
    .from("crm_pipelines")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("is_default", true)
    .maybeSingle();
  if (erroDeLeitura) return { ok: false, erro: erroDeLeitura.message };

  const atual = (data as { id?: string } | null)?.id ?? null;
  if (atual === pipelineId) return { ok: true };

  if (atual) {
    const { error } = await admin
      .from("crm_pipelines")
      .update({ is_default: false })
      .eq("organization_id", organizationId)
      .eq("id", atual);
    if (error) return { ok: false, erro: error.message };
  }

  const { error } = await admin
    .from("crm_pipelines")
    .update({ is_default: true })
    .eq("organization_id", organizationId)
    .eq("id", pipelineId);
  if (error) {
    if (atual) {
      await admin
        .from("crm_pipelines")
        .update({ is_default: true })
        .eq("organization_id", organizationId)
        .eq("id", atual);
    }
    return { ok: false, erro: error.message };
  }

  return { ok: true };
}
