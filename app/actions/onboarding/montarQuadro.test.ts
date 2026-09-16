/**
 * O PASSO DO FUNIL COM JORNADA MARCADA — e o defeito que ele não pode ter.
 *
 * Desde que `PACOTES` virou projeção das jornadas, a proposta que o wizard
 * manda de volta é, byte a byte, o funil da jornada. Se a RPC
 * `fn_aplicar_quadro_do_onboarding` gravasse essa proposta sobre o funil
 * existente E o aplicador criasse o funil da jornada, a vinícola terminaria o
 * onboarding com DOIS funis de mesmo nome: `uniq_crm_pipelines_org_slug` não
 * impede, porque `slugDeNome` desambigua o slug com sufixo `_2` — o slug
 * desambigua, o NOME não, e é o nome que ela lê no seletor de funis.
 *
 * O aplicador de verdade é medido em `tests/unit/jornadas-de-vinicola-aplicar.test.ts`.
 * Aqui ele é dublê de propósito: o que está sob teste é a ESCOLHA do caminho.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/vertical/vinicola/aplicar", () => ({
  aplicarJornada: vi.fn(),
  lerLedger: vi.fn(),
  tornarPadrao: vi.fn(),
}));

vi.mock("./_shared", () => ({
  // A classe nasce DENTRO da fábrica: `vi.mock` é içado para o topo do arquivo,
  // e uma variável de nível superior ainda não existe quando ele roda.
  OnboardingError: class OnboardingError extends Error {},
  requireOnboardingCtx: vi.fn(async () => ({
    userId: "11111111-1111-4111-8111-111111111111",
    orgId: "22222222-2222-4222-8222-222222222222",
    orgName: "Vinícola Serra Alta",
    role: "admin",
    fullName: null,
    email: "dono@exemplo.com",
  })),
  patchOnboardingState: vi.fn(async () => undefined),
  loadOnboardingState: vi.fn(async () => ({ state: {}, onboardedAt: null })),
}));

import { createAdminClient } from "@/lib/supabase/admin";
import { PACOTES } from "@/lib/onboarding/pacotes-de-funil";
import { JORNADAS, type ChaveDeJornada } from "@/lib/vertical/vinicola";
import {
  aplicarJornada,
  lerLedger,
  tornarPadrao,
  type EntradaDoLedger,
} from "@/lib/vertical/vinicola/aplicar";

import { aplicarQuadro } from "./montarQuadro";

const ORG = "22222222-2222-4222-8222-222222222222";
const FUNIL_SEMEADO = "44444444-4444-4444-8444-444444444444";

type Linha = Record<string, unknown> & { id: string };

/**
 * O banco do passo: o funil de loja online que o gatilho semeia, mais o registro
 * de toda RPC chamada — que é o que separa um caminho do outro.
 */
function bancoDoOnboarding() {
  const rpcs: { nome: string; args: Record<string, unknown> }[] = [];
  const tabelas: Record<string, Linha[]> = {
    crm_pipelines: [
      {
        id: FUNIL_SEMEADO,
        organization_id: ORG,
        name: "Loja online",
        slug: "loja-online",
        is_default: true,
        is_archived: false,
      },
    ],
    crm_stages: [],
  };
  const ledger: Partial<Record<ChaveDeJornada, EntradaDoLedger>> = {};

  function builder(tabela: string) {
    const iguais: Record<string, unknown> = {};
    const diferentes: Record<string, unknown> = {};
    const casa = (l: Linha) =>
      Object.entries(iguais).every(([k, v]) => l[k] === v) &&
      Object.entries(diferentes).every(([k, v]) => l[k] !== v);
    const achadas = () => (tabelas[tabela] ?? []).filter(casa);

    const api: Record<string, unknown> = {
      select: () => api,
      order: () => api,
      eq: (c: string, v: unknown) => {
        iguais[c] = v;
        return api;
      },
      neq: (c: string, v: unknown) => {
        diferentes[c] = v;
        return api;
      },
      maybeSingle: async () => ({ data: achadas()[0] ?? null, error: null }),
      then: (r: (x: unknown) => unknown) =>
        Promise.resolve({ data: achadas(), error: null }).then(r),
    };
    return api;
  }

  vi.mocked(createAdminClient).mockReturnValue({
    from: (tabela: string) => builder(tabela),
    /**
     * A RPC de verdade RENOMEIA o funil existente para o nome da proposta. É
     * justamente esse efeito que produziria o nome repetido se os dois caminhos
     * rodassem — um dublê que só registrasse a chamada esconderia o defeito.
     */
    rpc: async (nome: string, args: Record<string, unknown>) => {
      rpcs.push({ nome, args });
      const alvo = tabelas.crm_pipelines!.find((p) => p.id === args.p_pipeline_id);
      if (alvo) alvo.name = String(args.p_nome ?? "");
      return { data: { ok: true }, error: null };
    },
  } as unknown as ReturnType<typeof createAdminClient>);

  vi.mocked(aplicarJornada).mockImplementation(async (orgId, chave) => {
    const id = crypto.randomUUID();
    const j = JORNADAS[chave];
    tabelas.crm_pipelines!.push({
      id,
      organization_id: orgId,
      name: j.nomeDoFunil,
      slug: `funil-${chave}`,
      is_default: false,
      is_archived: false,
    });
    ledger[chave] = {
      versao_do_pacote: 1,
      aplicada_em: new Date().toISOString(),
      pecas: [{ id, chave: `funil:${j.nomeDoFunil}` }],
    };
    return {
      chave,
      versao: 1,
      pecas: [{ tipo: "funil", chave: `funil:${j.nomeDoFunil}`, estado: "criada" }],
      completa: true,
    };
  });

  vi.mocked(lerLedger).mockImplementation(async () => ledger);

  vi.mocked(tornarPadrao).mockImplementation(async (orgId, pipelineId) => {
    for (const p of tabelas.crm_pipelines!) {
      if (p.organization_id === orgId) p.is_default = p.id === pipelineId;
    }
    return { ok: true };
  });

  return { tabelas, rpcs, ledger };
}

/** O que a tela manda: a proposta que ela está mostrando e o que foi marcado. */
function formulario({ jornadas }: { jornadas: ChaveDeJornada[] }): FormData {
  // A proposta É a projeção da jornada de enoturismo — é o que a tela mostra
  // quando o texto do dono fala em visitas, e é o que torna o nome repetido
  // possível.
  const proposta = PACOTES.find((p) => p.id === "enoturismo")!.proposta;
  const fd = new FormData();
  fd.set("quadro", JSON.stringify(proposta));
  fd.set("origem", "pacote");
  fd.set("jornadas", JSON.stringify(jornadas));
  return fd;
}

beforeEach(() => vi.clearAllMocks());

describe("o passo do funil com jornada marcada", () => {
  it("NÃO cria dois funis com o mesmo nome", async () => {
    const banco = bancoDoOnboarding();
    await aplicarQuadro(formulario({ jornadas: ["enoturismo"] }));

    const nomes = banco.tabelas.crm_pipelines!.map((p) => String(p.name));
    expect(new Set(nomes).size, `funis com nome repetido: ${nomes.join(", ")}`).toBe(nomes.length);
    expect(nomes).toContain(JORNADAS.enoturismo.nomeDoFunil);
  });

  it("com jornada marcada, a RPC não é chamada", async () => {
    const banco = bancoDoOnboarding();
    await aplicarQuadro(formulario({ jornadas: ["enoturismo"] }));
    expect(banco.rpcs, "a RPC reescreveria o funil existente com o nome da jornada").toEqual([]);
  });

  it("SEM jornada marcada, o fluxo de hoje continua inteiro", async () => {
    // A outra metade da decisão, e a que protege quem não é vinícola.
    const banco = bancoDoOnboarding();
    await aplicarQuadro(formulario({ jornadas: [] }));
    expect(banco.rpcs.map((r) => r.nome)).toEqual(["fn_aplicar_quadro_do_onboarding"]);
    expect(banco.tabelas.crm_pipelines).toHaveLength(1); // nenhum funil novo
    expect(aplicarJornada).not.toHaveBeenCalled();
  });

  it("o funil da primeira jornada vira o padrão", async () => {
    const banco = bancoDoOnboarding();
    await aplicarQuadro(formulario({ jornadas: ["enoturismo", "clube"] }));
    const padrao = banco.tabelas.crm_pipelines!.filter((p) => p.is_default === true);
    expect(padrao, "uniq_crm_pipelines_org_default é parcial: só pode haver um").toHaveLength(1);
    expect(padrao[0]!.name).toBe(JORNADAS.enoturismo.nomeDoFunil);
  });

  it("promoção que falha vira erro na tela, com o texto real do banco", async () => {
    // `tornarPadrao` NÃO lança: devolve `{ ok: false, erro }`. Descartar isso
    // deixaria a vinícola terminando o onboarding com "Loja online" como quadro
    // padrão, depois de a tela ter prometido o contrário e sem uma palavra.
    bancoDoOnboarding();
    vi.mocked(tornarPadrao).mockResolvedValue({
      ok: false,
      erro: 'permission denied for table "crm_pipelines"',
    });

    const res = await aplicarQuadro(formulario({ jornadas: ["enoturismo"] }));

    expect(res?.ok).toBe(false);
    expect(res && !res.ok && res.erro).toContain('permission denied for table "crm_pipelines"');
    expect(res && !res.ok && res.erro).toContain(JORNADAS.enoturismo.nomeDoFunil);
  });

  it("id de peça APAGADA não é promovido — isso deixaria a org sem funil padrão", async () => {
    // A peça que a vinícola apagou CONTINUA no ledger de propósito. Promover
    // esse id desmarcaria o default vigente e apontaria a flag para uma linha
    // que não existe: `carregarQuadroAtual` passa a devolver null e o wizard
    // quebra. O ledger tem o id; o relatório é quem sabe que ela está morta.
    const banco = bancoDoOnboarding();
    const idMorto = crypto.randomUUID();
    vi.mocked(aplicarJornada).mockImplementation(async (_orgId, chave) => {
      banco.ledger[chave] = {
        versao_do_pacote: 1,
        aplicada_em: new Date().toISOString(),
        pecas: [{ id: idMorto, chave: `funil:${JORNADAS[chave].nomeDoFunil}` }],
      };
      return {
        chave,
        versao: 1,
        pecas: [
          {
            tipo: "funil",
            chave: `funil:${JORNADAS[chave].nomeDoFunil}`,
            estado: "no_ledger_e_apagada",
          },
        ],
        completa: false,
      };
    });

    const res = await aplicarQuadro(formulario({ jornadas: ["enoturismo"] }));

    expect(tornarPadrao, "promoveria um funil que não existe mais").not.toHaveBeenCalled();
    expect(res?.ok).toBe(false);
    expect(banco.tabelas.crm_pipelines!.filter((p) => p.is_default === true)).toHaveLength(1);
  });

  it("chave inventada no formulário não vira jornada", async () => {
    // O que chega do formulário é entrada externa. Sem `ehChaveDeJornada`, um
    // `"admin"` no lugar da chave viraria `JORNADAS["admin"]` indefinido.
    const banco = bancoDoOnboarding();
    const fd = formulario({ jornadas: [] });
    fd.set("jornadas", JSON.stringify(["xyzzy", { chave: "canal" }]));
    await aplicarQuadro(fd);

    expect(aplicarJornada).not.toHaveBeenCalled();
    expect(banco.rpcs.map((r) => r.nome)).toEqual(["fn_aplicar_quadro_do_onboarding"]);
  });
});
