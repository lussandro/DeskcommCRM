/**
 * O ritmo PRÓPRIO da campanha, por cima do ritmo do canal.
 *
 * O canal protege o número no dia a dia (throttle de 1,2 s, janela, warm-up).
 * Isso basta para atendimento, onde cada mensagem responde alguém que escreveu.
 * Não basta para lista FRIA: 30 mensagens em 30 minutos, do mesmo número, para
 * quem nunca falou com a empresa, é o padrão que o WhatsApp bane — e número
 * banido não volta em dias, volta em semanas de warm-up.
 *
 * Por isso a campanha tem intervalo, janela e teto próprios. Todos opcionais:
 * `null` herda o do canal, e quem não configurar nada segue como hoje.
 *
 * Puro de propósito: a decisão de "pode mandar agora?" é a coisa mais fácil de
 * errar em silêncio, e a mais cara quando erra.
 */

export interface RitmoDaCampanha {
  intervaloSegundos: number | null;
  janelaInicioHora: number | null;
  janelaFimHora: number | null;
  tetoDiario: number | null;
}

export interface EstadoDoEnvio {
  /** Quando a ÚLTIMA mensagem desta campanha saiu. `null` = nenhuma ainda. */
  ultimoEnvio: Date | null;
  /** Quantas desta campanha já saíram no dia local de hoje. */
  enviadasHoje: number;
}

export type VetoDeRitmo =
  | { pode: true }
  | { pode: false; motivo: "intervalo" | "fora_da_janela" | "teto_diario"; detalhe: string };

/** A hora local (0-23) do instante, no fuso dado. */
export function horaLocal(agora: Date, fuso: string): number {
  return Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hour12: false, timeZone: fuso }).format(agora));
}

/**
 * Pode mandar agora?
 *
 * A ordem dos vetos é a do mais barato para o mais caro de descobrir, mas
 * também a da mensagem mais útil: "ainda faltam 4 min" é diferente de "hoje
 * acabou" e de "fora do horário".
 */
export function podeMandarAgora(
  ritmo: RitmoDaCampanha,
  estado: EstadoDoEnvio,
  agora: Date,
  fuso: string,
): VetoDeRitmo {
  if (ritmo.tetoDiario !== null && estado.enviadasHoje >= ritmo.tetoDiario) {
    return {
      pode: false,
      motivo: "teto_diario",
      detalhe: `A campanha já mandou ${estado.enviadasHoje} hoje, que é o teto dela.`,
    };
  }

  if (ritmo.janelaInicioHora !== null && ritmo.janelaFimHora !== null) {
    const hora = horaLocal(agora, fuso);
    if (hora < ritmo.janelaInicioHora || hora >= ritmo.janelaFimHora) {
      return {
        pode: false,
        motivo: "fora_da_janela",
        detalhe: `Fora do horário da campanha (${ritmo.janelaInicioHora}h-${ritmo.janelaFimHora}h).`,
      };
    }
  }

  if (ritmo.intervaloSegundos !== null && estado.ultimoEnvio) {
    const decorrido = (agora.getTime() - estado.ultimoEnvio.getTime()) / 1000;
    if (decorrido < ritmo.intervaloSegundos) {
      const faltam = Math.ceil(ritmo.intervaloSegundos - decorrido);
      return { pode: false, motivo: "intervalo", detalhe: `Faltam ${faltam}s para o próximo envio.` };
    }
  }

  return { pode: true };
}
