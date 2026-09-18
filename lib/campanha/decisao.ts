/**
 * A DECISÃO de uma rodada de campanha — pura, sem banco e sem rede.
 *
 * ═══ Por que campanha não anda sobre follow-up ═══
 *
 * `idx_followup_enrollments_one_live` é único por `(organization_id, contact_id)`,
 * não por fluxo: contato que já está em QUALQUER follow-up vivo recebe 409
 * (`lib/followup/enroll.ts:145`). Numa lista de 518 prospects, a campanha
 * perderia destinatários em silêncio — e perder em silêncio é o pior modo de
 * falha possível para quem contratou uma prospecção.
 *
 * ═══ Por que UM destinatário por rodada permitida ═══
 *
 * O ritmo é o produto. Quem dispara 518 de uma vez queima o número, e o número
 * queimado não volta: leva semanas de warm-up e o cliente fica sem canal. Então
 * a rodada do cron pergunta ao motor de pacing (o MESMO do agente, não o espelho
 * da automação) se pode enviar AGORA, envia um, registra no `pacing_ledger`, e
 * acabou. Cadência real = a do cron × a do throttle, o que for mais lento.
 *
 * ═══ Por que os vetos são função pura aqui, e não `if` no worker ═══
 *
 * Cada veto é uma decisão sobre uma PESSOA — bloqueada, anonimizada, sem base
 * legal. Espalhados no worker viram condições que ninguém testa isoladamente; e
 * o veto que ninguém testa é o que um refactor apaga sem que nada fique
 * vermelho. Aqui cada um tem nome, motivo legível e teste.
 */

/** O que se sabe do destinatário na hora de decidir. Nada além disto importa. */
export interface DestinatarioDaCampanha {
  contactId: string;
  telefone: string | null;
  bloqueado: boolean;
  anonimizado: boolean;
  /** `consent.marketing.declined_at` — recusa REGISTRADA, diferente de ausência. */
  recusouMarketing: boolean;
}

export type MotivoDePulo =
  | "sem_telefone"
  | "opt_out"
  | "anonimizado"
  | "recusou_marketing";

export const TEXTO_DO_PULO: Record<MotivoDePulo, string> = {
  sem_telefone: "Sem telefone no cadastro",
  opt_out: "Pediu para não receber mensagens",
  anonimizado: "Contato anonimizado (LGPD)",
  recusou_marketing: "Recusou receber contato comercial",
};

/**
 * Este contato pode receber? `null` = pode.
 *
 * A ordem importa para o motivo que o operador lê: opt-out vem antes de tudo
 * porque é o veto irrevogável — quem pediu para parar não é "sem telefone", é
 * alguém que pediu para parar.
 */
export function motivoParaPular(d: DestinatarioDaCampanha): MotivoDePulo | null {
  if (d.bloqueado) return "opt_out";
  if (d.anonimizado) return "anonimizado";
  if (d.recusouMarketing) return "recusou_marketing";
  if (!d.telefone || d.telefone.trim() === "") return "sem_telefone";
  return null;
}

/** A base legal declarada na campanha basta para um primeiro toque frio? */
export function baseLegalValida(input: { baseLegal: string; liaRef: string | null }): boolean {
  if (input.baseLegal === "consent") return true;
  if (input.baseLegal === "legitimate_interest") return !!input.liaRef && input.liaRef.trim() !== "";
  return false;
}

/**
 * O texto que vai para a pessoa.
 *
 * `{{nome}}` e `{{primeiro_nome}}` são as MESMAS variáveis de
 * `lib/inbox/template-vars.ts` — não se inventa vocabulário novo para campanha.
 * Variável sem valor deixa o literal, nunca gera "Olá , tudo bem?": frase
 * quebrada num primeiro toque frio denuncia disparo automático na primeira
 * linha, que é justamente o que queima a lista.
 *
 * Por isso `nome` vazio devolve `null`: não se manda mensagem com buraco.
 */
export function corpoParaODestinatario(
  template: string,
  contato: { nome: string | null },
): string | null {
  const nome = (contato.nome ?? "").trim();
  const precisaDeNome = /\{\{\s*(nome|primeiro_nome)\s*\}\}/.test(template);
  if (precisaDeNome && nome === "") return null;
  return template
    .replace(/\{\{\s*nome\s*\}\}/g, nome)
    .replace(/\{\{\s*primeiro_nome\s*\}\}/g, nome.split(/\s+/)[0] ?? "");
}
