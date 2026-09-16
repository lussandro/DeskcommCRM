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
