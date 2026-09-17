/**
 * Os SINAIS que os gates de pagamento leem — puros, testáveis, sem banco.
 *
 * Regra do dono (17/09/2026), acima de tudo: **o agente só concorda com cobrança que
 * REALMENTE está paga, e só a ferramenta valida.** Não vale a palavra do cliente, não vale
 * o comprovante, não vale o "deve ter caído". Se a ferramenta de cobranças não devolveu a
 * cobrança como paga NESTE turno, o agente não concorda — e chama uma pessoa.
 *
 * Por que aqui e não dentro do gate: o gate recebe um booleano já decidido, e quem decide é
 * o turno, que é quem vê o resultado da tool. Separar mantém o gate síncrono e puro, e
 * deixa a leitura do resultado da ferramenta medível sem subir o motor inteiro.
 */
import { STATUS_PAGO } from '@/lib/asaas/tipos';

/**
 * As tools de leitura de cobrança. `crm_list_contact_charges` hoje só devolve PENDING e
 * OVERDUE (ver `lib/mcp/tools/cobranca.ts`), então na prática quem confirma pagamento é
 * `crm_get_charge_payment_info` — mas as duas são lidas do mesmo jeito, para que o dia em
 * que a listagem passar a trazer pagas não precise de um segundo lugar para lembrar disso.
 */
export const COBRANCA_TOOL_NAMES: ReadonlySet<string> = new Set([
  'crm_list_contact_charges',
  'crm_get_charge_payment_info',
]);

/**
 * O resultado da tool mostra ALGUMA cobrança paga? Varre os campos `status` do objeto
 * devolvido (`{ status }` de uma cobrança, `{ charges: [{ status }] }` de uma lista) e
 * compara com `STATUS_PAGO` — a MESMA constante que o resto do módulo Asaas usa, nunca uma
 * segunda lista de strings que envelheceria calada.
 *
 * Varredura genérica e rasa (profundidade 4) de propósito: a projeção da tool pode ganhar
 * um nível amanhã, e um caminho fixo (`r.charges[i].status`) falharia em silêncio — e falhar
 * em silêncio AQUI significa o gate achar que nada está pago, que é a direção segura, mas
 * também significa o agente nunca mais conseguir confirmar um pagamento de verdade.
 */
export function resultadoMostraCobrancaPaga(resultado: unknown, profundidade = 4): boolean {
  if (profundidade < 0 || resultado === null || typeof resultado !== 'object') return false;
  if (Array.isArray(resultado))
    return resultado.some((item) => resultadoMostraCobrancaPaga(item, profundidade - 1));
  for (const [chave, valor] of Object.entries(resultado as Record<string, unknown>)) {
    if (chave === 'status' && typeof valor === 'string' && STATUS_PAGO.has(valor as never))
      return true;
    if (typeof valor === 'object' && resultadoMostraCobrancaPaga(valor, profundidade - 1))
      return true;
  }
  return false;
}

/**
 * O cliente ALEGOU ter pago? Conservadora e ancorada no que se diz no WhatsApp, não uma
 * gramática geral: a consequência de casar é o agente ser obrigado a abrir caso humano,
 * então um falso positivo custa um atendimento humano desnecessário (caro, mas visível), e
 * um falso negativo custa o agente concordar com pagamento que não existe (caro e invisível).
 *
 * O texto chega já cru da inbound; a normalização de acento mora aqui, junto da lista. O
 * lookbehind de negação é o que separa "paguei" de "ainda não paguei" — a segunda é a fala
 * de quem VAI pagar, e tratá-la como alegação abriria caso humano a cada cobrança normal.
 */
const ALEGACAO_DE_PAGAMENTO =
  /(?<!\b(?:nao|nunca|ainda nao)\s)\b(?:paguei|ja paguei|acabei de pagar|ta pago|esta pago|quitei|fiz o pix|ja fiz o pix|fiz a transferencia|transferi|depositei|(?:mandei|enviei) o comprovante|(?:mandei|enviei) comprovante)\b/i;

export function clienteAlegaPagamento(texto: string): boolean {
  return ALEGACAO_DE_PAGAMENTO.test(texto.normalize('NFD').replace(/[̀-ͯ]/g, ''));
}
