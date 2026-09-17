/**
 * A REGRA do fallback humano quando o turno termina sem enviar nada por veto.
 *
 * ## O defeito medido (17/09/2026, org do dono)
 *
 * Quando a cadeia `before_send` veta TODAS as tentativas do modelo, o turno fecha com
 * `messages_sent: 0` e o cliente fica esperando uma resposta que nunca vem — o guardrail
 * cumpre o dever dele (não deixa sair frase errada) e produz exatamente o silêncio que o
 * invariante 4 do Sistema Vivo proíbe. Os gates novos de pagamento aumentam a chance disso
 * acontecer: eles não têm fail-safe de N tentativas, de propósito.
 *
 * A saída não é soltar o envio — é chamar uma PESSOA.
 *
 * ## Por que quatro gates ficam de fora
 *
 * `stop` (o contato pediu para sair), `lgpd` (base legal ausente), `pacing` (cap/warm-up)
 * e `messaging_window` (janela de 24h fechada) não são erro do modelo e já têm dono e
 * desfecho próprios — o cap reagenda o job, o stop é irrevogável. Abrir caso humano ali
 * seria ruído na Central sobre algo que ninguém pode resolver abrindo a conversa.
 *
 * A função é PURA porque o encanamento (abrir caso, avisar o lead) é caro de testar e a
 * REGRA é o que precisa de vigia.
 */

/** Gates cujo veto NÃO é erro de redação do modelo — ver o cabeçalho. */
const VETOS_QUE_NAO_SAO_DE_ENSINO: ReadonlySet<string> = new Set([
  'stop',
  'lgpd',
  'pacing',
  'messaging_window',
]);

export interface VetoDoTurno {
  gate: string;
  code: string;
}

export type DecisaoDeFallback = { fallback: false } | { fallback: true; code: string };

export function decidirFallbackHumano(args: {
  vetos: readonly VetoDoTurno[];
  mensagensEnviadas: number;
}): DecisaoDeFallback {
  if (args.mensagensEnviadas > 0) return { fallback: false };
  const deEnsino = args.vetos.filter((v) => !VETOS_QUE_NAO_SAO_DE_ENSINO.has(v.gate));
  const ultimo = deEnsino[deEnsino.length - 1];
  return ultimo === undefined ? { fallback: false } : { fallback: true, code: ultimo.code };
}
