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
const MEIO = '(?:pagamento|pix|transferencia|deposito|ted|boleto|mensalidade|fatura|parcela)';
const ALEGACOES: readonly RegExp[] = [
  // verbo de pagar em 1ª pessoa, passado
  /\b(?:paguei|pagamos|quitei|quitamos|transferi|transferimos|depositei|depositamos|acab(?:ei|amos) de pagar)\b/,
  // "fiz/efetuei/realizei/mandei/enviei/passei (o) pagamento|pix|…", "acabei de fazer o pix",
  // e a forma com preposição: "mandei por pix", "paguei via boleto".
  new RegExp(`\\b(?:fiz|fizemos|efetuei|efetuamos|realizei|realizamos|mandei|mandamos|enviei|enviamos|passei|passamos|acab(?:ei|amos) de fazer)\\s+(?:o |a |um |uma |por |via |pelo |pela )?${MEIO}\\b`),
  // "pagamento já realizado/feito" — o advérbio no meio.
  new RegExp(`\\b${MEIO}\\s+ja\\s+(?:foi\\s+)?(?:feit[oa]|realizad[oa]|efetuad[oa]|pag[oa]|quitad[oa])\\b`),
  // terceiro que pagou: "meu marido pagou", "o financeiro daqui pagou", "minha esposa fez o pix"
  new RegExp(`\\b(?:meu|minha|o|a)\\s+\\w+\\s+(?:ja\\s+)?(?:pagou|quitou|transferiu|depositou|fez\\s+(?:o |a )?${MEIO})\\b`),
  /\bfoi\s+pag[oa]\s+(?:pel[oa]|por)\b/,
  // abreviação e erro de digitação comuns no WhatsApp
  /\b(?:pguei|paguei ja|ja pg|pgto (?:feito|ok|realizado)|pagto (?:feito|ok|realizado))\b/,
  // "pagamento feito/realizado/ok", "pix enviado"
  new RegExp(`\\b${MEIO}\\s+(?:feit[oa]|realizad[oa]|efetuad[oa]|enviad[oa]|conclu[ií]d[oa]|quitad[oa]|ok)\\b`),
  // "ta pago", "esta tudo pago", "ja foi pago", "ta quitado", "o pagamento ja foi", "ja caiu"
  /\b(?:ta|esta|estao|foi|ja foi|ficou|tudo)\s+(?:tudo\s+)?(?:pago|pagos|quitad[oa]s?)\b/,
  /\b(?:o\s+)?pagamento\s+ja\s+foi\b|\bja\s+caiu\b/,
  // comprovante mandado
  /\b(?:segue|mandei|enviei|anexei|ta ai|aqui esta|aqui vai)\b[^\n]{0,25}\bcomprovante\b|\bcomprovante\b[^\n]{0,20}\b(?:em anexo|anexado|enviado|segue)\b/,
];
/** Antes da alegação, na mesma oração: negação, futuro, condição, pergunta ⇒ não é alegação. */
const DESARMA_ANTES = /\b(?:nao|nunca|nem|ainda nao|se|se eu|caso|quando|quanto|como|porque|por que|vou|vamos|preciso|quero|posso|tenho que|tenho de|ir|antes de)\s+(?:eu\s+|ja\s+)?$/;
/** Depois da alegação, colado: "paguei não", "paguei caro", "paguei da última vez", "paguei quanto". */
const DESARMA_DEPOIS = /^\s*(?:nao|caro|barato|quanto|da ultima|no mes passado|ano passado|na epoca|errado)\b/;

function semAcentoMinusculo(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Oração por oração (vírgula, ponto, quebra de linha): a negação ou a condição só
 * desarmam a alegação que está na MESMA oração — "não paguei ainda" não é alegação;
 * "não consegui ontem, mas hoje paguei" é. Falso negativo aqui custa o modelo concordar
 * com pagamento que não existe (caro e invisível); falso positivo custa um caso humano
 * (caro, mas visível) — a lista erra para o lado do humano.
 */
export function clienteAlegaPagamento(texto: string): boolean {
  const oracoes = semAcentoMinusculo(texto).split(/[.!?\n,;]+/);
  for (const oracao of oracoes) {
    for (const padrao of ALEGACOES) {
      const m = padrao.exec(oracao);
      if (m === null) continue;
      const antes = oracao.slice(0, m.index);
      const depois = oracao.slice(m.index + m[0].length);
      if (DESARMA_ANTES.test(antes)) continue;
      if (DESARMA_DEPOIS.test(depois)) continue;
      return true;
    }
  }
  return false;
}
