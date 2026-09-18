/**
 * A porta da integração: fechada por default, e fechada TAMBÉM quando a linha
 * existe mas está quebrada. Cada caso aqui é uma porta que precisa continuar
 * fechada — um `null` a menos é a integração ligando sozinha com dado adivinhado.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/webhooks/secrets", () => ({
  decryptWebhookSecret: vi.fn(async (_admin: unknown, cifrado: string) =>
    cifrado === "\\xquebrado" ? null : "chave_em_claro",
  ),
}));

import type { SupabaseClient } from "@supabase/supabase-js";

import { CONSULTAS_DO_ERP, capacidadeDaConsulta, carregarIntegracaoErpMcp } from "./config";
import { catalogEntry } from "@/lib/mcp/tools/catalog";
import { carregarCapacidadesDeIntegracao } from "@/lib/asaas/config";

const ORG = "aaaaaaaa-1111-4111-8111-111111111111";
const URL_OK = "https://erp.exemplo.com/api/mcp";

interface Linha {
  id: string;
  status: string;
  store_metadata: unknown;
  oauth_access_token_encrypted: string | null;
  provider?: string;
}

/** Supabase de mentira que registra os filtros — é assim que o `provider='mcp'` fica provado. */
function fakeSupabase(linha: Linha | null, filtros: Record<string, string> = {}) {
  const q = {
    select: () => q,
    eq: (col: string, val: string) => {
      filtros[col] = val;
      return q;
    },
    maybeSingle: async () => ({ data: linha, error: null }),
    then: undefined,
  };
  return { from: () => q } as unknown as SupabaseClient;
}

/** Para `carregarCapacidadesDeIntegracao`: a query termina no `.eq`, sem `maybeSingle`. */
function fakeSupabaseLista(linhas: Array<{ provider: string; store_metadata: unknown }>) {
  const q = {
    select: () => q,
    eq: () => q,
    then: (resolve: (r: { data: unknown }) => void) => resolve({ data: linhas }),
  };
  return { from: () => q } as unknown as SupabaseClient;
}

const META_OK = { url: URL_OK, catalogo: ["customer.status"], falhas_consecutivas: 0 };

describe("carregarIntegracaoErpMcp", () => {
  it("sem linha → null", async () => {
    expect(await carregarIntegracaoErpMcp(fakeSupabase(null), ORG)).toBeNull();
  });

  it("filtra organization_id E provider='mcp'", async () => {
    const filtros: Record<string, string> = {};
    await carregarIntegracaoErpMcp(
      fakeSupabase({ id: "i1", status: "healthy", store_metadata: META_OK, oauth_access_token_encrypted: "\\xok" }, filtros),
      ORG,
    );
    expect(filtros).toEqual({ organization_id: ORG, provider: "mcp" });
  });

  it("linha healthy → url, chave decifrada e catálogo", async () => {
    const integ = await carregarIntegracaoErpMcp(
      fakeSupabase({ id: "i1", status: "healthy", store_metadata: META_OK, oauth_access_token_encrypted: "\\xok" }),
      ORG,
    );
    expect(integ).toEqual({ id: "i1", url: URL_OK, chave: "chave_em_claro", catalogo: ["customer.status"], falhasConsecutivas: 0 });
  });

  it("status 'error' → null com exigirHealthy (o default), e a linha com exigirHealthy:false", async () => {
    const linha = { id: "i1", status: "error", store_metadata: META_OK, oauth_access_token_encrypted: "\\xok" };
    expect(await carregarIntegracaoErpMcp(fakeSupabase(linha), ORG)).toBeNull();
    expect(await carregarIntegracaoErpMcp(fakeSupabase(linha), ORG, { exigirHealthy: false })).not.toBeNull();
  });

  it("store_metadata inválido → null (fail-closed), nunca URL adivinhada", async () => {
    for (const meta of [{}, { url: "não é url" }, { url: URL_OK, catalogo: "customer.status" }]) {
      const r = await carregarIntegracaoErpMcp(
        fakeSupabase({ id: "i1", status: "healthy", store_metadata: meta, oauth_access_token_encrypted: "\\xok" }),
        ORG,
      );
      expect(r).toBeNull();
    }
  });

  it("catálogo e contador ausentes têm default; chave que não decifra → null", async () => {
    const semOpcionais = await carregarIntegracaoErpMcp(
      fakeSupabase({ id: "i1", status: "healthy", store_metadata: { url: URL_OK }, oauth_access_token_encrypted: "\\xok" }),
      ORG,
    );
    expect(semOpcionais).toMatchObject({ catalogo: [], falhasConsecutivas: 0 });

    expect(
      await carregarIntegracaoErpMcp(
        fakeSupabase({ id: "i1", status: "healthy", store_metadata: META_OK, oauth_access_token_encrypted: "\\xquebrado" }),
        ORG,
      ),
    ).toBeNull();

    expect(
      await carregarIntegracaoErpMcp(
        fakeSupabase({ id: "i1", status: "healthy", store_metadata: META_OK, oauth_access_token_encrypted: null }),
        ORG,
      ),
    ).toBeNull();
  });
});

describe("carregarCapacidadesDeIntegracao", () => {
  it('devolve "mcp" para a linha de provider mcp (a query já filtra healthy)', async () => {
    const caps = await carregarCapacidadesDeIntegracao(fakeSupabaseLista([{ provider: "mcp", store_metadata: META_OK }]), ORG);
    expect(caps.has("mcp")).toBe(true);
    expect(caps.has("asaas")).toBe(false);
  });

  it("sem linha nenhuma, nenhuma capacidade — as cinco consultas não são montadas", async () => {
    const caps = await carregarCapacidadesDeIntegracao(fakeSupabaseLista([]), ORG);
    expect(caps.size).toBe(0);
  });

  /**
   * A TELA MEDE E O RUNTIME OBEDECE.
   *
   * `"mcp"` sozinho era concedido a qualquer integração saudável, sem olhar o
   * catálogo que o `tools/list` descobriu: a tela dizia "Não encontrada no
   * servidor" e o agente montava a ferramenta assim mesmo, para falhar na
   * conversa. A capacidade por consulta é a mesma medição, agora com efeito.
   */
  it("concede só as consultas que o servidor daquele cliente expõe", async () => {
    const caps = await carregarCapacidadesDeIntegracao(
      fakeSupabaseLista([{ provider: "mcp", store_metadata: { ...META_OK, catalogo: ["customer.status", "customer.find"] } }]),
      ORG,
    );
    expect(caps.has("mcp")).toBe(true);
    expect(caps.has(capacidadeDaConsulta("customer.status"))).toBe(true);
    // O servidor não expõe estas: as ferramentas que dependem delas não são montadas.
    expect(caps.has(capacidadeDaConsulta("invoice.list"))).toBe(false);
    expect(caps.has(capacidadeDaConsulta("contract.get"))).toBe(false);
  });

  it("catálogo VAZIO (linha salva antes desta mudança) degrada para conceder as cinco", async () => {
    // Fail-closed aqui deixaria sem ferramenta nenhuma quem já está no ar e
    // nunca mudou nada. Um "Testar conexão" preenche o catálogo e a medição
    // passa a valer.
    const caps = await carregarCapacidadesDeIntegracao(
      fakeSupabaseLista([{ provider: "mcp", store_metadata: { ...META_OK, catalogo: [] } }]),
      ORG,
    );
    for (const c of CONSULTAS_DO_ERP) expect(caps.has(capacidadeDaConsulta(c.metodo))).toBe(true);
  });

  it("cada uma das cinco declara no catálogo a capacidade do método que ela chama", () => {
    // O elo que impede a divergência: a tela compara `catalogo.includes(metodo)`,
    // o runtime compara `caps.has("mcp:" + metodo)`, e a entrada do catálogo
    // escreve a string à mão (o arquivo é client-safe e não importa daqui).
    for (const c of CONSULTAS_DO_ERP) {
      expect(catalogEntry(c.ferramenta)?.requerIntegracao, c.ferramenta).toBe(capacidadeDaConsulta(c.metodo));
    }
  });
});
