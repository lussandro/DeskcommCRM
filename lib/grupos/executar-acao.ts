/**
 * Execução de ação de grupo, com VERIFICAÇÃO DE PÓS-CONDIÇÃO.
 *
 * ⚠️ A razão de este módulo existir, medida em produção (2026-09-20):
 * `POST /groups` devolveu **201** listando dois participantes; o
 * `participants/v2` seguinte mostrou **um**. O membro nunca entrou.
 *
 * Então: nenhuma ação é dada por concluída pela resposta. Depois de
 * chamar, relemos a lista de participantes e comparamos com o estado
 * esperado. `posCondicaoOk` é o único campo que autoriza `concluida`.
 */
import { interpretarRespostaDeParticipantes } from "@/lib/grupos/waha-resposta";
import type { AcaoDeGrupo, PapelDeMembro } from "@/lib/grupos/tipos";
import type { ParticipanteWaha, RotaDeParticipante } from "@/lib/waha/client-grupos";

export interface ResultadoDaAcao {
  httpStatus: number;
  statusParticipante: string | null;
  respostaCrua: unknown;
  posCondicaoOk: boolean;
  erroTexto: string | null;
}

export interface EntradaDaAcao {
  acao: AcaoDeGrupo;
  waGroupId: string;
  sessao: string;
  alvoLid: string;
  alvoJid: string;
  papelAtual: PapelDeMembro;
}

export interface DepsDaAcao {
  chamarAcao: (
    sessao: string,
    waGroupId: string,
    rota: RotaDeParticipante,
    jids: string[],
  ) => Promise<{ httpStatus: number; corpo: unknown }>;
  lerParticipantes: (sessao: string, waGroupId: string) => Promise<ParticipanteWaha[]>;
}

const ROTA_POR_ACAO: Partial<Record<AcaoDeGrupo, RotaDeParticipante>> = {
  remover: "participants/remove",
  promover: "admin/promote",
  rebaixar: "admin/demote",
};

/** O que a lista de participantes deve mostrar se a ação funcionou. */
export function esperadoDepoisDe(
  acao: AcaoDeGrupo,
  papelAtual: PapelDeMembro,
): { presente: boolean; papel?: PapelDeMembro } {
  switch (acao) {
    case "remover":
      return { presente: false };
    case "promover":
      return { presente: true, papel: "admin" };
    case "rebaixar":
      return { presente: true, papel: "participant" };
    default:
      return { presente: true, papel: papelAtual };
  }
}

export async function executarAcaoDeGrupo(
  deps: DepsDaAcao,
  entrada: EntradaDaAcao,
): Promise<ResultadoDaAcao> {
  const rota = ROTA_POR_ACAO[entrada.acao];

  // `silenciar`, `avisar` e `advertir` não existem na API do WhatsApp: são
  // estado do CRM. Silêncio individual NÃO tem efeito no grupo — a pessoa
  // continua podendo falar; o que muda é o agente ignorá-la. A tela precisa
  // dizer isso ao operador em vez de fingir um poder que não existe.
  if (!rota) {
    return { httpStatus: 0, statusParticipante: null, respostaCrua: null, posCondicaoOk: true, erroTexto: null };
  }

  const { httpStatus, corpo } = await deps.chamarAcao(entrada.sessao, entrada.waGroupId, rota, [entrada.alvoJid]);
  const linhas = interpretarRespostaDeParticipantes(corpo);
  const minha = linhas.find((l) => l.jid.includes(entrada.alvoJid.split("@")[0]!)) ?? linhas[0] ?? null;

  const depois = await deps.lerParticipantes(entrada.sessao, entrada.waGroupId);
  const achado = depois.find((p) => p.id === entrada.alvoLid) ?? null;
  const esperado = esperadoDepoisDe(entrada.acao, entrada.papelAtual);

  let posCondicaoOk: boolean;
  let erroTexto: string | null = null;

  if (!esperado.presente) {
    posCondicaoOk = achado === null;
    if (!posCondicaoOk) erroTexto = "o WhatsApp respondeu, mas o membro continua no grupo";
  } else {
    posCondicaoOk = achado !== null && achado.role === esperado.papel;
    if (!posCondicaoOk) {
      erroTexto = achado
        ? `o papel continua "${achado.role}", era esperado "${esperado.papel}"`
        : "o membro não está mais no grupo";
    }
  }

  // O motivo do WAHA explica melhor a falha do que a nossa comparação.
  if (!posCondicaoOk && minha && !minha.ok && minha.motivo) {
    erroTexto = minha.motivo;
  }

  return {
    httpStatus,
    statusParticipante: minha ? minha.status : null,
    respostaCrua: corpo,
    posCondicaoOk,
    erroTexto,
  };
}
