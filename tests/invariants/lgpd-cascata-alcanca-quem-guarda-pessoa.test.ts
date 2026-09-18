import { describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

/**
 * TODA TABELA QUE GUARDA DADO DE PESSOA ESTÁ NA CASCATA DE ANONIMIZAÇÃO.
 *
 * ─── O defeito que este arquivo existe para impedir ────────────────────────
 *
 * `fn_lgpd_cascade_redact_contact` percorre uma lista escrita À MÃO. Quando
 * `calendar_appointments` nasceu — guardando `title` e `notes` do compromisso de
 * uma pessoa real — ninguém acrescentou a linha. E o modo de falha é o pior que
 * existe para uma obrigação legal: a rota devolve SUCESSO, a contagem por tabela
 * fecha, o SLA D+15 é marcado como cumprido, e a anotação com o nome de quem
 * exerceu o direito de apagamento continua legível. Nada erra, nada loga.
 *
 * Uma lista à mão vigiada por outra lista à mão seria o mesmo defeito com uma
 * camada a mais. Por isso o escopo aqui é derivado do CATÁLOGO.
 *
 * ─── O mecanismo, e por que é a interseção e não um dos dois ───────────────
 *
 * Está no escopo a tabela que satisfaz as DUAS condições:
 *
 *   (1) tem FK para `contacts` — é sobre uma pessoa identificável nossa; e
 *   (2) tem coluna cujo NOME carrega conteúdo pessoal.
 *
 * Só (1) é largo demais: `job_queue` e `cron_jobs` referenciam o contato e
 * guardam payload de execução, não o dado dele — cobrá-las encheria o gate de
 * ruído até alguém desligá-lo. Só (2) é largo do outro lado: `ai_agents.name` é
 * o nome do agente, não de gente. A interseção é o que o cascade de fato
 * precisa alcançar: o que é DA pessoa e é LEGÍVEL.
 *
 * `_hash` fica FORA (irreversível — `send_ledger.body_hash` não reidentifica
 * ninguém) e `_encrypted` fica DENTRO (`contacts.cpf_encrypted` é reversível,
 * logo é dado pessoal). A distinção é essa, não o nome bonito da coluna.
 *
 * ─── Por que a dívida é congelada em vez de reprovar hoje ──────────────────
 *
 * Um invariante que nasce vermelho por dívida legada não entra: ou é ignorado,
 * ou é desligado. As três entradas abaixo são o retrato de 2026-08-26, cada uma
 * com a razão escrita. A catraca é o teste do fim: entrada NOVA sem
 * justificativa não passa, e tabela que sai da dívida nunca volta.
 */

/** Colunas cujo nome indica conteúdo DA pessoa. `_hash` fora; `_encrypted` dentro. */
const PADRAO_PII =
  "(^|_)(name|full_name|phone|whatsapp|email|address|street|cpf|cnpj|birth|notes|note|body|content|title|subject)($|_)";

/**
 * Dívida congelada — retrato de 2026-08-26. Cada entrada precisa de razão, e a
 * razão precisa dizer QUANDO sai, não só por que está.
 */
const DIVIDA_LGPD_CONHECIDA: Record<string, string> = {
  lead_notes:
    "Anotação livre do atendente SOBRE o contato (coluna body). Dívida anterior à agenda; " +
    "nenhum commit a declarou. Sai quando o cascade — ou um trigger de anonimização em " +
    "`contacts`, que agora conta — a alcançar. É a ÚNICA entrada que sobrou depois de o " +
    "instrumento passar a enxergar trigger: as outras quatro estavam protegidas e só " +
    "pareciam dívida porque o gate lia uma lista de nomes de função.",
};

// O que saiu desta lista em 2026-09-18: `crm_companies`, `calendar_appointments`,
// `crm_tasks` e `webhook_lead_captures`. As quatro SEMPRE estiveram protegidas por
// trigger de anonimização em `contacts`, cada uma com prova de efeito própria —
// estavam na dívida porque o instrumento lia uma lista de nomes de função e não
// enxergava trigger, não porque o dado estivesse exposto. As razões congeladas de
// cada uma estão no git, neste arquivo, até este commit.
/** Tabelas no escopo: FK para contacts E coluna de conteúdo pessoal. */
function tabelasComDadoDePessoa(): string[] {
  return sql(`
    with fk as (
      select c.conrelid::regclass::text t
        from pg_constraint c
       where c.contype = 'f' and c.confrelid = 'public.contacts'::regclass
    ),
    pii as (
      select table_name t
        from information_schema.columns
       where table_schema = 'public'
         and column_name ~ '${PADRAO_PII}'
         and column_name !~ '_hash$'
       group by table_name
    )
    select fk.t from fk join pii on pii.t = fk.t order by 1;
  `)
    .trim()
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Tabelas tocadas pela cascata E por QUALQUER trigger de anonimização instalado
 * em `contacts` — não mais por uma lista de nomes de função.
 *
 * ─── Por que deixou de ser lista ────────────────────────────────────────────
 *
 * O instrumento lia UMA função (`fn_lgpd_cascade_redact_contact`) mais UM nome
 * (`fn_reply_redact`). Só que o repositório já tinha decidido, desde a 0174, que
 * tabela nova se protege por TRIGGER na transição `is_anonymized false → true` e
 * não por um passo a mais naquela função de 180 linhas (duas cópias dela — dump e
 * apêndice — divergiriam no primeiro conserto). O resultado é que toda tabela
 * protegida do jeito certo caía na dívida, e a dívida virava o caminho normal:
 * quatro entradas, três delas com trigger funcionando e prova de efeito própria.
 *
 * A condição de saída estava escrita na própria entrada de `crm_tasks`: "sai no
 * dia em que `tabelasNaCascata()` passar a derivar do catálogo também os triggers
 * de `contacts`". É este commit. A forma exigida é a mesma que o caso
 * `fn_reply_redact` já cobrava — AFTER UPDATE FOR EACH ROW com `is_anonymized`
 * entre as colunas vigiadas —, então nenhum trigger frouxo passa a contar: um
 * BEFORE, um por STATEMENT ou um que não vigie a coluna continua invisível.
 *
 * A cobertura do trigger vem do corpo REAL no banco, nunca de uma isenção da tabela.
 * Prova de efeito: autonomia-authority.test.ts, "redação limpa todos os corpos...".
 * A integração da RPC canônica e o controle de vizinho vivem em
 * comunidade-integracao.test.ts, "mutex e cascata0229 alcançam drafts0227...".
 * Outros triggers legados permanecem sujeitos ao censo e à catraca existentes.
 */
function tabelasNaCascata(): string[] {
  return sql(`
    select distinct m[1]
      from pg_proc p,
           lateral regexp_matches(
             pg_get_functiondef(p.oid),
             '(?:update|delete from)\\s+(?:public\\.)?"?([a-z_]+)"?', 'gi') m
     where p.proname = 'fn_lgpd_cascade_redact_contact'
        or (
          p.pronamespace = 'public'::regnamespace
          and exists (
            select 1 from pg_trigger t
             where t.tgfoid = p.oid
               and t.tgrelid = 'public.contacts'::regclass
               and not t.tgisinternal
               and t.tgenabled in ('O', 'A')
               and t.tgtype = 17 -- AFTER UPDATE FOR EACH ROW
               and (select attnum from pg_attribute
                     where attrelid = t.tgrelid and attname = 'is_anonymized') = any(t.tgattr)
          )
        )
     order by 1;
  `)
    .trim()
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

describe("LGPD: a cascata alcança toda tabela que guarda dado de pessoa", () => {
  it("CONTROLE: o mecanismo enxerga `contacts` — se não enxergar, o verde não vale nada", () => {
    // `contacts` satisfaz as duas condições por construção. Se ela sumir do
    // escopo, o regex quebrou ou a FK mudou de nome, e QUALQUER resultado abaixo
    // seria vazio por instrumento morto — indistinguível de cobertura completa.
    expect(tabelasComDadoDePessoa()).toContain("contacts");
  });

  it("CONTROLE: a cascata foi lida do banco e tem corpo", () => {
    // Uma regex que não casa nada devolve lista vazia, e lista vazia faria TODA
    // tabela do escopo virar infratora — vermelho por instrumento, não por defeito.
    const naCascata = tabelasNaCascata();
    expect(naCascata.length).toBeGreaterThanOrEqual(5);
    expect(naCascata).toContain("contacts");
  });

  it("CONTROLE: o redator0227 ativo alcança ai_reply_drafts pelo corpo instalado", () => {
    expect(tabelasNaCascata()).toContain("ai_reply_drafts");
  });

  it("nenhuma tabela NOVA guarda dado de pessoa fora da cascata", () => {
    const escopo = tabelasComDadoDePessoa();
    const cobertas = new Set(tabelasNaCascata());
    const foraDaCascata = escopo.filter((t) => !cobertas.has(t));
    const novas = foraDaCascata.filter((t) => !(t in DIVIDA_LGPD_CONHECIDA));

    expect(
      novas,
      "Tabela com FK para `contacts` e coluna de conteúdo pessoal, fora de " +
        "`fn_lgpd_cascade_redact_contact`. Anonimizar devolve SUCESSO e o dado " +
        "continua legível — a falha é muda e o SLA é marcado como cumprido. " +
        "Acrescente a tabela à cascata (migration + apêndice do baseline), ou " +
        "declare a dívida em DIVIDA_LGPD_CONHECIDA com a razão e o quando-sai.",
    ).toEqual([]);
  });

  it("CATRACA: a dívida não guarda tabela que já foi consertada nem que não existe", () => {
    // Sem isto, uma entrada esquecida cobre o futuro por acidente: a tabela é
    // acrescentada à cascata, ninguém tira da lista, e o dia em que ela SAIR da
    // cascata de novo passa despercebido.
    const escopo = new Set(tabelasComDadoDePessoa());
    const cobertas = new Set(tabelasNaCascata());
    const obsoletas = Object.keys(DIVIDA_LGPD_CONHECIDA).filter(
      (t) => !escopo.has(t) || cobertas.has(t),
    );
    expect(
      obsoletas,
      "Entrada da dívida que já não se aplica — ou a tabela saiu do escopo, ou já " +
        "está na cascata. Remova a entrada: dívida paga que fica na lista vira " +
        "permissão silenciosa para o defeito voltar.",
    ).toEqual([]);
  });

  it("CATRACA: toda entrada da dívida tem razão escrita", () => {
    const semRazao = Object.entries(DIVIDA_LGPD_CONHECIDA)
      .filter(([, razao]) => razao.trim().length < 40)
      .map(([t]) => t);
    expect(semRazao, "Entrada sem justificativa — lista à mão sem razão é o defeito de novo.").toEqual([]);
  });
});
