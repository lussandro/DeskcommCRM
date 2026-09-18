/**
 * A AUDIÊNCIA de uma campanha — quem recebe, escolhido por filtro sobre os
 * contatos que a organização já tem.
 *
 * ═══ Por que filtro, e não lista colada ═══
 *
 * A primeira versão desta feature pedia os telefones num campo de texto, e a
 * lista do piloto foi montada por script. Isso é lista colada com CRM em volta:
 * o operador não consegue conferir o recorte, não consegue repetir amanhã, e a
 * decisão de "quem recebe" acaba morando fora do sistema — numa planilha, na
 * cabeça de alguém, ou num script que ninguém mais roda.
 *
 * O filtro mora aqui porque ele é a MESMA regra em dois lugares: a prévia que o
 * operador vê antes de apertar e a materialização que grava os destinatários.
 * Duas implementações divergiriam no dia em que alguém mexesse numa só — e a
 * divergência apareceria como "a prévia dizia 30 e foram 47".
 *
 * ═══ O que NÃO entra ═══
 *
 * Não existe "todos os contatos". Audiência sem recorte é o pedido que ninguém
 * revisa antes de apertar, e é assim que a organização inteira recebe por
 * engano. Pelo menos um critério é obrigatório.
 */
import { z } from "zod";

export const filtroDeAudienciaSchema = z
  .strictObject({
    /** Contato precisa ter TODAS estas etiquetas. */
    com_tags: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
    /** Contato não pode ter NENHUMA destas. */
    sem_tags: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
    /** DDD do telefone (dois dígitos), qualquer um da lista. */
    ddds: z.array(z.string().regex(/^\d{2}$/)).max(30).optional(),
    /** Teto do lote. O mesmo 500 do import de CSV — uma régua só para "quanta gente de uma vez". */
    limite: z.number().int().min(1).max(500),
  })
  .refine(
    (f) => (f.com_tags?.length ?? 0) > 0 || (f.sem_tags?.length ?? 0) > 0 || (f.ddds?.length ?? 0) > 0,
    { message: "Escolha pelo menos um critério — audiência sem recorte não se confere." },
  );

export type FiltroDeAudiencia = z.infer<typeof filtroDeAudienciaSchema>;

/** Uma linha de contato, como o filtro precisa vê-la. */
export interface ContatoParaFiltrar {
  id: string;
  phone_number: string | null;
  tags: string[] | null;
  is_blocked: boolean;
  is_anonymized: boolean;
}

/**
 * Quem JÁ está em alguma campanha desta organização não entra em outra.
 *
 * Sem isto, o teste de variantes que o produto convida a fazer — três textos,
 * três campanhas — mandaria as TRÊS mensagens para a mesma pessoa. Além de
 * queimar o contato, invalidaria a medição: a segunda mensagem não mede a
 * segunda copy, mede alguém que já foi abordado.
 *
 * A exclusão é por CONTATO e vale para campanha em qualquer estado, inclusive
 * rascunho: um rascunho é uma intenção de mandar, e duas intenções sobre a
 * mesma pessoa é o mesmo erro só que adiado.
 */
export interface UniversoDaAudiencia {
  contatos: ContatoParaFiltrar[];
  /** Contatos já comprometidos com alguma campanha — entram nesta lista e saem do filtro. */
  jaEmCampanha: Set<string>;
}

/**
 * O DDD de um telefone E.164 brasileiro: `+55` + 2 dígitos.
 *
 * `null` para número estrangeiro ou malformado — e `null` nunca casa com filtro
 * de DDD, em vez de casar com todos. Um filtro que aceita o que não entendeu é
 * como um número da Argentina entra numa campanha do interior de São Paulo.
 */
export function dddDoTelefone(telefone: string | null): string | null {
  if (!telefone) return null;
  const digitos = telefone.replace(/\D/g, "");
  if (!digitos.startsWith("55") || digitos.length < 12) return null;
  return digitos.slice(2, 4);
}

/**
 * Aplica o filtro. Puro: a prévia e a materialização chamam ESTA função.
 *
 * Bloqueado e anonimizado saem aqui, e não só no envio: deixá-los entrar
 * inflaria a prévia com gente que nunca receberia, e o operador decidiria o
 * tamanho do lote com um número que não é verdade.
 */
export function aplicarFiltro(
  universo: ContatoParaFiltrar[] | UniversoDaAudiencia,
  filtro: FiltroDeAudiencia,
): ContatoParaFiltrar[] {
  const contatos = Array.isArray(universo) ? universo : universo.contatos;
  const jaEmCampanha = Array.isArray(universo) ? new Set<string>() : universo.jaEmCampanha;
  const com = filtro.com_tags ?? [];
  const sem = filtro.sem_tags ?? [];
  const ddds = filtro.ddds ?? [];
  const escolhidos: ContatoParaFiltrar[] = [];
  for (const c of contatos) {
    if (jaEmCampanha.has(c.id)) continue;
    if (c.is_blocked || c.is_anonymized) continue;
    if (!c.phone_number) continue;
    const tags = c.tags ?? [];
    if (com.length > 0 && !com.every((t) => tags.includes(t))) continue;
    if (sem.length > 0 && sem.some((t) => tags.includes(t))) continue;
    if (ddds.length > 0) {
      const ddd = dddDoTelefone(c.phone_number);
      if (!ddd || !ddds.includes(ddd)) continue;
    }
    escolhidos.push(c);
    if (escolhidos.length >= filtro.limite) break;
  }
  return escolhidos;
}

/** Quantos o filtro alcança ANTES do teto — para a tela dizer "1.866 alcançados, 30 neste lote". */
export function quantosAlcanca(
  universo: ContatoParaFiltrar[] | UniversoDaAudiencia,
  filtro: FiltroDeAudiencia,
): number {
  return aplicarFiltro(universo, { ...filtro, limite: Number.MAX_SAFE_INTEGER }).length;
}
