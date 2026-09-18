/**
 * O DESEMPENHO de uma campanha — a régua que decide se a lista presta.
 *
 * Quatro números, nesta ordem, porque é um funil e cada degrau tem uma causa
 * diferente:
 *
 *   enviadas → entregues → lidas → responderam
 *
 * - caiu de enviada para entregue: número inválido ou WhatsApp inexistente → a
 *   lista está suja;
 * - caiu de entregue para lida: a primeira linha não interessou → a cópia está
 *   errada;
 * - caiu de lida para respondida: a mensagem foi lida e ignorada → a oferta
 *   está errada, ou o público não é esse.
 *
 * Misturar tudo num "taxa de sucesso" apagaria exatamente a distinção que diz o
 * que consertar. Por isso não existe número único aqui.
 *
 * `pulados` fica FORA do funil de propósito: quem foi pulado nunca entrou na
 * corrida, e somá-lo ao denominador faria uma lista cheia de bloqueados parecer
 * uma campanha de baixa entrega — dois problemas diferentes, um número só.
 */

export interface LinhaDeDestinatario {
  status: string;
  skip_reason: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  responded_at: string | null;
}

export interface FunilDaCampanha {
  enviadas: number;
  entregues: number;
  lidas: number;
  responderam: number;
  /** Fora do funil — ver o cabeçalho. */
  pulados: number;
  falharam: number;
  naFila: number;
}

export function funilDaCampanha(linhas: LinhaDeDestinatario[]): FunilDaCampanha {
  const f: FunilDaCampanha = {
    enviadas: 0,
    entregues: 0,
    lidas: 0,
    responderam: 0,
    pulados: 0,
    falharam: 0,
    naFila: 0,
  };
  for (const l of linhas) {
    if (l.status === "skipped") f.pulados += 1;
    else if (l.status === "failed") f.falharam += 1;
    else if (l.status === "pending") f.naFila += 1;
    else if (l.status === "sent") {
      f.enviadas += 1;
      // Cada degrau é INDEPENDENTE do anterior no dado: o WhatsApp pode entregar
      // sem confirmar leitura, e alguém pode responder sem que o ACK de leitura
      // tenha chegado. Contar em cascata ("só conta lida se entregue") esconderia
      // resposta real atrás de um ACK que nunca veio.
      if (l.delivered_at) f.entregues += 1;
      if (l.read_at) f.lidas += 1;
      if (l.responded_at) f.responderam += 1;
    }
  }
  return f;
}

/** Percentual sobre as ENVIADAS. `null` quando nada saiu — divisão por zero não vira 0%. */
export function taxa(parte: number, enviadas: number): number | null {
  if (enviadas <= 0) return null;
  return Math.round((parte / enviadas) * 1000) / 10;
}

/**
 * Por que cada pulo aconteceu, do mais frequente ao menos.
 *
 * É o dado que muda a PRÓXIMA campanha: "30 pediram para não receber" e "30 sem
 * telefone" pedem ações opostas.
 */
export function motivosDePulo(linhas: LinhaDeDestinatario[]): Array<{ motivo: string; quantos: number }> {
  const conta = new Map<string, number>();
  for (const l of linhas) {
    if (l.status !== "skipped") continue;
    const motivo = l.skip_reason?.trim() || "Sem motivo registrado";
    conta.set(motivo, (conta.get(motivo) ?? 0) + 1);
  }
  return [...conta.entries()]
    .map(([motivo, quantos]) => ({ motivo, quantos }))
    .sort((a, b) => b.quantos - a.quantos);
}

/** Envios por dia, para o gráfico de ritmo — mostra a campanha respirando. */
export function enviosPorDia(linhas: LinhaDeDestinatario[]): Array<{ dia: string; enviadas: number; responderam: number }> {
  const porDia = new Map<string, { enviadas: number; responderam: number }>();
  for (const l of linhas) {
    if (!l.sent_at) continue;
    const dia = l.sent_at.slice(0, 10);
    const atual = porDia.get(dia) ?? { enviadas: 0, responderam: 0 };
    atual.enviadas += 1;
    if (l.responded_at) atual.responderam += 1;
    porDia.set(dia, atual);
  }
  return [...porDia.entries()]
    .map(([dia, v]) => ({ dia, ...v }))
    .sort((a, b) => a.dia.localeCompare(b.dia));
}
