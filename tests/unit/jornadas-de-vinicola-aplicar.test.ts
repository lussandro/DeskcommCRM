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

import { audit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { slugDeNome } from "@/lib/leads/stage-editing";
import { JORNADAS, VERSAO_DO_PACOTE, type ChaveDeJornada } from "@/lib/vertical/vinicola";
import {
  aplicarJornada,
  estadoDaJornada,
  lerLedger,
  tornarPadrao,
  type PecaDoLedger,
} from "@/lib/vertical/vinicola/aplicar";

const ORG = "22222222-2222-4222-8222-222222222222";
const OUTRA_ORG = "33333333-3333-4333-8333-333333333333";
const ATOR = "11111111-1111-4111-8111-111111111111";

type Linha = Record<string, unknown> & { id: string };

/** O banco de mentira: tabelas em memória, com os filtros aplicados de verdade. */
function bancoFalso(inicial: Partial<Record<string, Linha[]>> = {}) {
  const tabelas: Record<string, Linha[]> = {
    organizations: [
      { id: ORG, settings: {} },
      { id: OUTRA_ORG, settings: {} },
    ],
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
   * (`lib/followup/graph-schema.ts:225`) e o gatilho `stage_change` pede
   * `params.stage_id: z.string().uuid()` (`lib/followup/api-schemas.ts:32`).
   * Como os casos do fim passam o grafo e o gatilho pelos schemas DE VERDADE,
   * um id sintético faria o teste reprovar **por construção** — e a leitura
   * natural seria "o aplicador está errado", quando o errado era o banco de
   * mentira. `crypto.randomUUID()` é do runtime do Node 22, sem dependência nova.
   */
  const novoId = () => crypto.randomUUID();
  /** Tabelas que devem falhar em TODA escrita, para o caso de relatório parcial. */
  const quebradas = new Set<string>();
  /** Faz a N-ésima escrita numa tabela falhar — para provar o desfaz do `tornarPadrao`. */
  const falharNaEscrita = new Map<string, number>();
  const escritas = new Map<string, number>();

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
    const casa = (l: Linha) => Object.entries(filtros).every(([k, vs]) => vs.includes(l[k]));

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

    /** A escrita falha quando a tabela está quebrada ou quando é a N-ésima marcada. */
    function deveFalhar(): boolean {
      const n = (escritas.get(tabela) ?? 0) + 1;
      escritas.set(tabela, n);
      return quebradas.has(tabela) || falharNaEscrita.get(tabela) === n;
    }

    function resolver(um: boolean) {
      exigirFiltroDeOrganizacao();
      if (op === "insert") {
        ordem.push(`insert:${tabela}`);
        if (deveFalhar()) {
          return { data: null, error: { code: "XX000", message: `falha proposital em ${tabela}` } };
        }
        const nova = { id: novoId(), ...campos } as Linha;
        tabelas[tabela]!.push(nova);
        return { data: nova, error: null };
      }
      if (op === "update") {
        ordem.push(`update:${tabela}`);
        if (deveFalhar()) {
          return { data: null, error: { code: "XX000", message: `falha proposital em ${tabela}` } };
        }
        const alvo = tabelas[tabela]!.filter(casa);
        for (const l of alvo) Object.assign(l, campos);
        return { data: um ? (alvo[0] ?? null) : alvo, error: null };
      }
      const achadas = tabelas[tabela]!.filter(casa);
      return { data: um ? (achadas[0] ?? null) : achadas, error: null };
    }

    const api: Record<string, unknown> = {
      select: () => api,
      insert: (v: Record<string, unknown>) => {
        op = "insert";
        campos = v;
        return api;
      },
      update: (v: Record<string, unknown>) => {
        op = "update";
        campos = v;
        return api;
      },
      eq: (c: string, v: unknown) => {
        filtros[c] = [v];
        return api;
      },
      // `.in()` é CONJUNTO. Um dublê que guardasse só o primeiro valor
      // (`filtros[c] = vs[0]`) devolveria uma peça só na conferência do ledger,
      // e o aplicador recriaria todas as outras: o caso "reaplicar não duplica"
      // mediria o defeito do dublê e passaria assim mesmo.
      in: (c: string, vs: unknown[]) => {
        filtros[c] = [...vs];
        return api;
      },
      single: async () => resolver(true),
      maybeSingle: async () => resolver(true),
      then: (r: (x: unknown) => unknown) => Promise.resolve(resolver(false)).then(r),
    };
    return api;
  }

  vi.mocked(createAdminClient).mockReturnValue({
    from: (tabela: string) => builder(tabela),
  } as unknown as ReturnType<typeof createAdminClient>);

  return { tabelas, ordem, quebradas, falharNaEscrita };
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
  for (const c of j.cadencias) {
    banco.tabelas.followup_flow_pointers!.push({
      id: crypto.randomUUID(),
      organization_id: OUTRA_ORG,
      name: c.nome,
      status: "active",
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
    expect(r.versao).toBe(VERSAO_DO_PACOTE);
  });

  it("toda linha nasce com o organization_id pedido, e nenhuma na outra organização", async () => {
    const banco = bancoFalso();
    await aplicarJornada(ORG, "canal", ATOR);
    for (const t of [
      "crm_pipelines",
      "crm_stages",
      "message_templates",
      "calendar_event_types",
      "followup_flow_pointers",
    ]) {
      for (const l of banco.tabelas[t]!) expect(l.organization_id, t).toBe(ORG);
    }
  });

  it("o funil NÃO nasce padrão — trocar o quadro da organização é outra operação", async () => {
    const banco = bancoFalso();
    await aplicarJornada(ORG, "canal", ATOR);
    expect(banco.tabelas.crm_pipelines![0]!.is_default).toBe(false);
  });

  it("o vocabulário mescla as OITO chaves do DDL, não substitui por quatro", async () => {
    // Gravar só as quatro da jornada apagaria os plurais e o nome de "Etapa",
    // e o que apareceria na tela no lugar deles é o fallback de cada consumidor.
    const banco = bancoFalso();
    await aplicarJornada(ORG, "clube", ATOR);
    const vocab = banco.tabelas.crm_pipelines![0]!.vocabulary as Record<string, string>;
    expect(Object.keys(vocab).sort()).toEqual(
      ["deal", "deal_plural", "lead", "lead_plural", "lost", "stage", "stage_plural", "won"].sort(),
    );
    expect(vocab.lead).toBe(JORNADAS.clube.vocabulario.lead);
    expect(vocab.stage_plural).toBe("Etapas");
  });
});

describe("a organização do vizinho", () => {
  // O caso que um dublê sem filtros não conseguiria medir. A outra organização é
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
    expect(daOrg("followup_flow_pointers")).toHaveLength(j.cadencias.length);
    expect(r.pecas.every((p) => p.estado === "criada")).toBe(true);
  });

  it("não é alterada: nenhuma linha dela muda de conteúdo", async () => {
    const banco = bancoFalso();
    semearOutraOrganizacao(banco, "canal");
    const antes = JSON.stringify(
      Object.values(banco.tabelas)
        .flat()
        .filter((l) => l.organization_id === OUTRA_ORG),
    );

    await aplicarJornada(ORG, "canal", ATOR);

    const depois = JSON.stringify(
      Object.values(banco.tabelas)
        .flat()
        .filter((l) => l.organization_id === OUTRA_ORG),
    );
    expect(depois, "o aplicador tocou a organização do vizinho").toBe(antes);
    // E o `settings` dela também não recebeu ledger nenhum.
    const outra = banco.tabelas.organizations!.find((o) => o.id === OUTRA_ORG)!;
    expect((outra.settings as Record<string, unknown>).bacco_jornadas).toBeUndefined();
  });
});

describe("as peças nascem como o produto espera", () => {
  it("a resposta rápida nasce compartilhada — a cadência aponta para ela", async () => {
    const banco = bancoFalso();
    await aplicarJornada(ORG, "clube", ATOR);
    for (const l of banco.tabelas.message_templates!) expect(l.owner_user_id).toBeNull();
  });

  it("o tipo de compromisso nasce com o lembrete DESLIGADO, explícito", async () => {
    // O DDL base tem default TRUE; só o apêndice o vira false. Herdar o default
    // mandaria mensagem ao cliente num clone atrasado.
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

  it("as tags da conversa entram no settings da organização, sem apagar as que já havia", async () => {
    const banco = bancoFalso({
      organizations: [{ id: ORG, settings: { canonical_conversation_tags: ["ja-existia"] } }],
    });
    await aplicarJornada(ORG, "canal", ATOR);
    const tags = (banco.tabelas.organizations![0]!.settings as Record<string, unknown>)
      .canonical_conversation_tags as string[];
    expect(tags).toContain("ja-existia");
    for (const t of JORNADAS.canal.tags) expect(tags).toContain(t);
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
    expect(ultimo("calendar_event_types")).toBeLessThan(primeiro("followup_flow_pointers"));
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
    const ledger = (
      settings.bacco_jornadas as Record<
        string,
        { versao_do_pacote: number; aplicada_em: string; pecas: PecaDoLedger[] }
      >
    ).clube!;
    expect(ledger.versao_do_pacote).toBe(VERSAO_DO_PACOTE);
    expect(ledger.pecas.length).toBeGreaterThan(0);
    expect(Date.parse(ledger.aplicada_em)).not.toBeNaN();
    expect(await lerLedger(ORG)).toHaveProperty("clube");
  });

  it("a peça guarda o ID da linha, e é por ele que a existência é decidida", async () => {
    // A chave natural é EDITÁVEL (atalho, nome do fluxo, nome do funil):
    // decidir por ela faria renomear ler como apagar.
    const banco = bancoFalso();
    await aplicarJornada(ORG, "consumidor", ATOR);
    const ledger = (await lerLedger(ORG)).consumidor!;
    const idsNoBanco = new Set(
      Object.values(banco.tabelas)
        .flat()
        .map((l) => l.id),
    );
    for (const p of ledger.pecas) expect(idsNoBanco.has(p.id), p.chave).toBe(true);
  });
});

describe("reaplicar", () => {
  it("não duplica nada", async () => {
    const banco = bancoFalso();
    await aplicarJornada(ORG, "consumidor", ATOR);
    const antes = Object.fromEntries(
      Object.entries(banco.tabelas).map(([t, l]) => [t, l.length]),
    );
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
    expect(banco.tabelas.message_templates!.some((l) => l.shortcut === apagado.shortcut)).toBe(
      false,
    );
    expect(r.pecas.some((p) => p.estado === "no_ledger_e_apagada")).toBe(true);
  });

  it("a peça apagada CONTINUA no ledger — senão a terceira aplicação a recriaria", async () => {
    const banco = bancoFalso();
    await aplicarJornada(ORG, "consumidor", ATOR);
    const apagado = banco.tabelas.message_templates!.pop()!;
    await aplicarJornada(ORG, "consumidor", ATOR);
    await aplicarJornada(ORG, "consumidor", ATOR);
    expect(banco.tabelas.message_templates!.some((l) => l.shortcut === apagado.shortcut)).toBe(
      false,
    );
  });

  it("adota o que a chave natural achou, mesmo SEM ledger — a aplicação que falhou no meio", async () => {
    // O desfecho mais provável de todos: criou metade das peças e morreu antes
    // de gravar o ledger. Na tentativa seguinte quem encontra o que já entrou é
    // a pré-leitura por atalho, slug e nome — não o ledger, que está vazio.
    const banco = bancoFalso();
    banco.quebradas.add("calendar_event_types");
    await aplicarJornada(ORG, "consumidor", ATOR);
    const modelosDepoisDaFalha = banco.tabelas.message_templates!.length;
    // O ledger não guardou nada dos tipos de compromisso, que falharam.
    banco.quebradas.clear();

    const r = await aplicarJornada(ORG, "consumidor", ATOR);

    expect(banco.tabelas.message_templates!.length, "duplicou os modelos").toBe(
      modelosDepoisDaFalha,
    );
    expect(r.completa).toBe(true);
    expect(banco.tabelas.calendar_event_types).toHaveLength(
      JORNADAS.consumidor.tiposDeCompromisso.length,
    );
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
    // E o que vem DEPOIS também: uma peça que falhou não cancela as irmãs.
    expect(banco.tabelas.followup_flow_pointers).toHaveLength(JORNADAS.enoturismo.cadencias.length);
    // E o erro real do banco viaja para a tela, sem máscara.
    expect(r.pecas.find((p) => p.estado === "falhou")!.erro).toContain("falha proposital");
  });

  it("funil que não entra encerra a aplicação — não há onde pendurar o resto", async () => {
    const banco = bancoFalso();
    banco.quebradas.add("crm_pipelines");
    const r = await aplicarJornada(ORG, "canal", ATOR);
    expect(r.completa).toBe(false);
    expect(r.pecas).toHaveLength(1);
    expect(r.pecas[0]!.tipo).toBe("funil");
    expect(banco.tabelas.crm_stages).toHaveLength(0);
    expect(banco.tabelas.followup_flow_pointers).toHaveLength(0);
  });
});

describe("auditoria", () => {
  it("registra a aplicação da jornada, além das peças", async () => {
    bancoFalso();
    await aplicarJornada(ORG, "canal", ATOR);
    const acoes = vi.mocked(audit).mock.calls.map((c) => c[0].action);
    expect(acoes).toContain("vertical.jornada_aplicada");
    expect(acoes).toContain("pipeline.created");
    expect(acoes).toContain("pipeline.stage_created");
    expect(acoes).toContain("template.created");
    expect(acoes).toContain("agenda.tipo_criado");
    expect(acoes).toContain("followup_flow.created");
    const linha = vi
      .mocked(audit)
      .mock.calls.find((c) => c[0].action === "vertical.jornada_aplicada")![0];
    expect(linha.organizationId).toBe(ORG);
    expect(linha.actorUserId).toBe(ATOR);
    expect(linha.metadata).toMatchObject({ jornada: "canal", versao: VERSAO_DO_PACOTE });
  });

  it("reaplicar não audita criação nenhuma — não houve efeito", async () => {
    bancoFalso();
    await aplicarJornada(ORG, "canal", ATOR);
    vi.mocked(audit).mockClear();
    await aplicarJornada(ORG, "canal", ATOR);
    const acoes = vi.mocked(audit).mock.calls.map((c) => c[0].action);
    expect(acoes).not.toContain("pipeline.created");
    // A aplicação em si continua auditada: alguém clicou o botão de novo.
    expect(acoes).toContain("vertical.jornada_aplicada");
  });
});

describe("promover o funil a padrão", () => {
  it("apaga a flag do antigo ANTES de acender a do novo", async () => {
    // `uniq_crm_pipelines_org_default` é um índice único PARCIAL sobre
    // `(organization_id) where is_default = true`: acender primeiro colide 23505.
    const antigo = crypto.randomUUID();
    const banco = bancoFalso({
      crm_pipelines: [{ id: antigo, organization_id: ORG, name: "Loja online", is_default: true }],
    });
    await aplicarJornada(ORG, "canal", ATOR);
    const novo = banco.tabelas.crm_pipelines!.find((p) => p.id !== antigo)!;

    expect(await tornarPadrao(ORG, String(novo.id))).toEqual({ ok: true });

    expect(banco.tabelas.crm_pipelines!.find((p) => p.id === antigo)!.is_default).toBe(false);
    expect(novo.is_default).toBe(true);
  });

  it("DEVOLVE a flag ao antigo quando acender o novo falha", async () => {
    // Uma organização sem funil padrão quebra o próprio wizard:
    // `carregarQuadroAtual` filtra por `is_default` e devolve null.
    const antigo = crypto.randomUUID();
    const novo = crypto.randomUUID();
    const banco = bancoFalso({
      crm_pipelines: [
        { id: antigo, organization_id: ORG, name: "Loja online", is_default: true },
        { id: novo, organization_id: ORG, name: "Canal e revenda", is_default: false },
      ],
    });
    // A 2ª escrita é a que acende o novo; a 1ª apaga a do antigo e a 3ª a devolve.
    banco.falharNaEscrita.set("crm_pipelines", 2);

    const r = await tornarPadrao(ORG, novo);

    expect(r.ok).toBe(false);
    expect(r.erro).toContain("falha proposital");
    expect(
      banco.tabelas.crm_pipelines!.find((p) => p.id === antigo)!.is_default,
      "a organização ficou sem funil padrão",
    ).toBe(true);
  });

  it("não alcança o funil padrão da outra organização", async () => {
    const daOutra = crypto.randomUUID();
    const novo = crypto.randomUUID();
    const banco = bancoFalso({
      crm_pipelines: [
        { id: daOutra, organization_id: OUTRA_ORG, name: "Loja online", is_default: true },
        { id: novo, organization_id: ORG, name: "Canal e revenda", is_default: false },
      ],
    });

    expect(await tornarPadrao(ORG, novo)).toEqual({ ok: true });

    expect(banco.tabelas.crm_pipelines!.find((p) => p.id === daOutra)!.is_default).toBe(true);
  });
});

describe("o grafo gerado é aceito pelo schema de verdade", () => {
  it.each(["canal", "enoturismo", "clube", "consumidor"] as const)("%s", async (chave) => {
    const { flowGraphSchema } = await import("@/lib/followup/graph-schema");
    const banco = bancoFalso();
    await aplicarJornada(ORG, chave, ATOR);
    for (const f of banco.tabelas.followup_flow_pointers!) {
      const r = flowGraphSchema.safeParse(f.draft_graph);
      expect(
        r.success,
        `${chave}/${String(f.name)}: ${r.success ? "" : JSON.stringify(r.error.flatten())}`,
      ).toBe(true);
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
    // (`lib/followup/validate-publish.ts`, com o motivo escrito lá: não
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

  it.each(["canal", "enoturismo", "clube", "consumidor"] as const)(
    "%s: o gatilho também",
    async (chave) => {
      const { triggerConfigSchema } = await import("@/lib/followup/api-schemas");
      const banco = bancoFalso();
      await aplicarJornada(ORG, chave, ATOR);
      for (const f of banco.tabelas.followup_flow_pointers!) {
        const r = triggerConfigSchema.safeParse(f.trigger_config);
        expect(r.success, `${chave}/${String(f.name)}`).toBe(true);
      }
    },
  );
});
