/**
 * A máquina de estados da campanha (Spec 12 §7.3) — pura, e a ÚNICA autoridade
 * sobre o que pode virar o quê.
 *
 * Por que não vive no banco: uma matriz de transição em CHECK exigiria trigger,
 * e trigger que decide fluxo é lógica de produto num lugar onde ninguém a testa
 * isoladamente. O CHECK do banco guarda o VOCABULÁRIO (o estado existe), esta
 * tabela guarda a ORDEM (o estado pode vir daquele).
 *
 * Cada rota de ação chama `podeTransitar` antes de escrever. Quem escrever
 * `status` sem passar por aqui vai, um dia, ressuscitar campanha cancelada.
 */
import { STATUS_DA_CAMPANHA, type StatusDaCampanha } from "./tipos";

const PERMITIDO: Record<StatusDaCampanha, readonly StatusDaCampanha[]> = {
  draft: ["preparing"],
  preparing: ["ready", "failed"],
  // Voltar a `draft` é o caminho de editar: invalida o snapshot. Só vale
  // enquanto NADA saiu — quem já enviou não pode reescrever a mensagem que a
  // pessoa recebeu (o guarda de "já enviou" é do chamador, que vê os envios).
  ready: ["draft", "scheduled", "running"],
  scheduled: ["running", "paused", "cancelled"],
  running: ["paused", "completed", "cancelled", "failed"],
  paused: ["running", "scheduled", "cancelled"],
  // Terminais de verdade: nada sai daqui. Para mandar de novo, duplica-se.
  completed: [],
  cancelled: [],
  // `failed` é falha SISTÊMICA da campanha (snapshot corrompido, configuração
  // que sumiu), não falha de destinatário. Volta a rascunho para conserto —
  // nunca retoma execução parcial em silêncio.
  failed: ["draft"],
};

export type ResultadoDaTransicao =
  | { pode: true }
  | { pode: false; motivo: string };

/** Uma string qualquer é um estado conhecido? (o banco pode ter valor legado) */
export function ehStatusDaCampanha(valor: string): valor is StatusDaCampanha {
  return (STATUS_DA_CAMPANHA as readonly string[]).includes(valor);
}

export function podeTransitar(de: StatusDaCampanha, para: StatusDaCampanha): ResultadoDaTransicao {
  if (de === para) {
    // Repetir a ação não é erro de estado — é clique duplo, e quem chama decide
    // se responde 200 (idempotente) ou 409. A máquina só diz que não é avanço.
    return { pode: false, motivo: `A campanha já está em "${de}".` };
  }
  if (PERMITIDO[de].includes(para)) return { pode: true };
  return { pode: false, motivo: `Uma campanha em "${de}" não pode passar para "${para}".` };
}

/** Os estados em que editar conteúdo/audiência é permitido. */
export function ehEditavel(status: StatusDaCampanha): boolean {
  return status === "draft";
}

/** Estados dos quais nenhuma ação tira a campanha. */
export function ehTerminal(status: StatusDaCampanha): boolean {
  return PERMITIDO[status].length === 0;
}

/** Só para teste e para a tela: o que sai de cada estado. */
export function destinosDe(status: StatusDaCampanha): readonly StatusDaCampanha[] {
  return PERMITIDO[status];
}
