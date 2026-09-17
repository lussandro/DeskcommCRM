/**
 * ALEGAÇÃO DE PAGAMENTO — a decisão sai do modelo e vai para o código.
 *
 * Regra do dono (17/09/2026): "o agente só concorda com cobrança que realmente está
 * paga; só a ferramenta valida; senão não concorda e aciona humano." Três revisões
 * independentes (dois refutadores e o Codex) furaram a versão que tentava garantir
 * isso vigiando o TEXTO do modelo — "não se preocupe, seu pagamento está confirmado"
 * passava. Vigiar o que o modelo escreve não fecha a regra; tirar o modelo da decisão
 * fecha.
 *
 * Como funciona: quando o cliente alega ter pago (ou mandado comprovante) e o agente
 * tem capacidade de cobrança, ESTE código consulta o Asaas pelo titular do contato,
 * cobrança por cobrança. Havendo qualquer cobrança em aberto (vencida ou pendente), ou
 * sem como verificar (sem vínculo, erro do Asaas), o turno NÃO chama o modelo: abre um
 * caso humano e manda uma linha fixa ("ainda não consta; uma pessoa do financeiro
 * confere"). O modelo só fala quando não resta cobrança em aberto — e aí o que ele
 * tem para dizer é o que a ferramenta diz.
 *
 * Aditivo: agente sem capacidade de cobrança, organização sem Asaas ativo, ou cliente
 * que não alegou nada ⇒ `modelo_fala`, comportamento idêntico ao de antes.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { carregarIntegracaoAsaas } from '@/lib/asaas/config';
import { titularDoContato } from '@/lib/asaas/titular';
import { COBRANCA_TOOL_NAMES } from './sinais-de-pagamento';

export type SituacaoDasCobrancas =
  | { kind: 'asaas_inativo' }
  | { kind: 'sem_vinculo' }
  | { kind: 'erro'; detalhe: string }
  | { kind: 'ok'; emAberto: number; vencidas: number };

export type DecisaoDaAlegacao =
  | { acao: 'modelo_fala' }
  | { acao: 'humano'; motivo: 'cobranca_em_aberto' | 'sem_vinculo' | 'sem_verificacao' };

/** O agente tem alguma ferramenta de cobrança publicada? */
export function agenteTemCobranca(toolIds: readonly string[]): boolean {
  return toolIds.some((t) => COBRANCA_TOOL_NAMES.has(t));
}

/**
 * A REGRA, pura. Só chega aqui quem alegou pagamento com um agente de cobrança.
 * "Não consigo verificar" NUNCA vira "modelo fala": errar para o lado do humano é
 * recuperável; deixar o modelo concordar com um pagamento que ninguém viu, não.
 */
export function decidirAlegacaoDePagamento(situacao: SituacaoDasCobrancas): DecisaoDaAlegacao {
  switch (situacao.kind) {
    case 'asaas_inativo':
      return { acao: 'modelo_fala' };
    case 'ok':
      return situacao.emAberto > 0 ? { acao: 'humano', motivo: 'cobranca_em_aberto' } : { acao: 'modelo_fala' };
    case 'sem_vinculo':
      return { acao: 'humano', motivo: 'sem_vinculo' };
    case 'erro':
      return { acao: 'humano', motivo: 'sem_verificacao' };
  }
}

/** Consulta o Asaas pelo titular do contato (empresa ou o próprio). Nunca lança. */
export async function situacaoDasCobrancasDoContato(
  admin: SupabaseClient,
  orgId: string,
  contactId: string,
): Promise<SituacaoDasCobrancas> {
  try {
    const integ = await carregarIntegracaoAsaas(admin, orgId);
    if (!integ) return { kind: 'asaas_inativo' };
    const titular = await titularDoContato(admin, orgId, contactId);
    if (titular.kind === 'sem_vinculo') return { kind: 'sem_vinculo' };
    const [pend, venc] = await Promise.all([
      integ.cliente.payments(titular.customerId, 'PENDING'),
      integ.cliente.payments(titular.customerId, 'OVERDUE'),
    ]);
    return { kind: 'ok', emAberto: pend.data.length + venc.data.length, vencidas: venc.data.length };
  } catch (err) {
    return { kind: 'erro', detalhe: (err instanceof Error ? err.message : String(err)).slice(0, 160) };
  }
}
