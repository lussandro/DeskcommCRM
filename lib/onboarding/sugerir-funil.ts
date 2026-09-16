/**
 * A SUGESTÃO DO QUADRO — o que se pergunta à IA e o que se faz com a resposta.
 *
 * Sem rede e sem banco: quem chama injeta a geração. É o que permite exercitar
 * aqui os desfechos que só apareceriam em produção — o modelo devolvendo prosa,
 * cercando o JSON em crase, inventando um passo, ou não respondendo.
 *
 * ⚠️ A SUGESTÃO SAI DO MESMO CÉREBRO QUE VAI ATENDER. Quem chama passa o
 * provedor, o modelo e a chave da versão publicada do funcionário — não uma
 * configuração própria deste passo. Duas razões: o dono pediu para a sugestão vir
 * "da chave que ele escolheu", e uma sugestão que funciona com OUTRO modelo
 * esconderia justamente o defeito que ele precisa descobrir agora, no wizard, em
 * vez de no primeiro cliente.
 *
 * ⚠️ FALHA NUNCA DEVOLVE QUADRO VAZIO. Todo desfecho ruim cai num pacote pronto
 * do ramo, e o MOTIVO viaja junto para a tela dizer o que houve. O oposto —
 * devolver erro e deixar o passo sem quadro — largaria a pessoa com o funil de
 * e-commerce que o gatilho semeou, que é exatamente o defeito que este passo
 * existe para consertar.
 */
import {
  normalizarProposta,
  validarProposta,
  type PropostaDeFunil,
} from "@/lib/onboarding/proposta-de-funil";
import { PACOTES, PACOTE_PADRAO, type PacoteDeFunil } from "@/lib/onboarding/pacotes-de-funil";
import { CHAVES_DE_JORNADA, type ChaveDeJornada } from "@/lib/vertical/vinicola";

/** O que se sabe do negócio quando a sugestão é pedida. */
export interface ContextoDoNegocio {
  /** O nome que o dono deu no primeiro passo. */
  nome: string;
  /** O que ele respondeu quando perguntamos o que o negócio faz. */
  oQueFaz: string;
}

/**
 * Palavras que o próprio dono usaria — não nomes de vertical de mercado.
 *
 * Serve a dois fins: escolher o pacote quando a IA não responde, e escolher o
 * EXEMPLO que vai no pedido. Sem exemplo, "sugira um funil" volta com
 * "Prospecção", "Nutrição" e "Fundo de funil" — nomes de manual, não os que
 * estão na cabeça de quem atende no WhatsApp.
 */
const PISTAS: Record<string, RegExp> = {
  canal:
    /\b(restaurant|emp[óo]ri|distribuid|revend|atacad|bares\b|bar\b|hot[ée]is|hotel|sommelier|carta de vinho)/i,
  clube: /\b(clube|assinatura|assinante)/i,
  consumidor:
    /\b(consumidor|cliente final|varej|loja virtual|loja online|e-?commerce|delivery|venda direta)/i,
  enoturismo: /\b(enoturism|visita|degusta[çc]|turist|passeio|tour\b|harmoniza[çc]|vindima)/i,
};

/** Quem só diz que é vinícola, sem nomear o público, recebe o B2B (decisão do dono, 2026-09-15). */
const PISTA_DE_VINICOLA = /\b(vin[íi]col|vinh|adega)/i;

/**
 * O pacote cujo vocabulário mais se parece com o do negócio.
 *
 * Empate resolve pela ordem de `PISTAS`, que é estável — não por sorteio nem
 * por ordem de chave de objeto sobre entrada do usuário. A ordem é de propósito:
 * quem nomeia um CANAL de venda (restaurante, loja virtual, clube) é classificado
 * por ele antes de uma menção a visita — "vinícola com visitas e loja virtual"
 * vende ao consumidor. Só depois vem a pista genérica de vinho.
 */
export function escolherPacotePorTexto(texto: string): PacoteDeFunil {
  for (const [id, pista] of Object.entries(PISTAS)) {
    if (pista.test(texto)) {
      const p = PACOTES.find((x) => x.id === id);
      if (p) return p;
    }
  }
  if (PISTA_DE_VINICOLA.test(texto)) {
    const p = PACOTES.find((x) => x.id === "canal");
    if (p) return p;
  }
  return PACOTE_PADRAO;
}

/**
 * TODAS as jornadas que o texto do dono nomeia — não só a primeira.
 *
 * `escolherPacotePorTexto` continua devolvendo UMA, porque o exemplo que vai no
 * pedido à IA é um só. Aqui a pergunta é outra: quais jornadas marcar na tela.
 * Uma vinícola que recebe visita, tem clube e vende na loja faz as três coisas,
 * e obrigá-la a escolher uma seria escolher por ela.
 *
 * Lista vazia é desfecho legítimo: quem não é vinícola não marca nada, e o
 * passo segue com o quadro que ele já monta.
 */
export function sugerirJornadas(texto: string): ChaveDeJornada[] {
  const achadas = CHAVES_DE_JORNADA.filter((c) => PISTAS[c]?.test(texto));
  if (achadas.length > 0) return [...achadas];
  return PISTA_DE_VINICOLA.test(texto) ? ["canal"] : [];
}

/**
 * O pedido, em duas partes.
 *
 * O exemplo vai INTEIRO no pedido de propósito: descrever o formato em prosa
 * ("um array de objetos com nome e passo") produz JSON válido com conteúdo
 * genérico. Um exemplo concreto do ramo produz nomes que o dono reconhece.
 */
export function pedidoDeSugestao(
  ctx: ContextoDoNegocio,
  exemplo: PacoteDeFunil,
): { system: string; prompt: string } {
  const passos = [
    '"new" — acabou de chamar, ninguém respondeu ainda',
    '"contacted" — já foi respondido',
    '"qualifying" — está entendendo o que a pessoa precisa',
    '"qualified" — já sabe o que oferecer',
    '"negotiating" — está fechando preço, horário ou condições',
    '"won" — fechou (exatamente UMA coluna)',
    '"lost" — não fechou (exatamente UMA coluna)',
    "null — coluna que só uma pessoa move, sem equivalente no atendimento",
  ].join("\n- ");

  return {
    system:
      "Você monta o quadro de clientes de um negócio brasileiro que atende por WhatsApp. " +
      "Escreva do jeito que o DONO fala, não como um manual de vendas: nada de " +
      '"prospecção", "MQL", "nutrição" ou "fundo de funil". ' +
      "Cada coluna é um momento concreto do atendimento dele. " +
      "Responda APENAS com o JSON, sem comentário e sem crases.",
    prompt: [
      `Negócio: ${ctx.nome}`,
      `O que faz: ${ctx.oQueFaz}`,
      "",
      "Monte de 5 a 7 colunas, na ordem em que o cliente passa por elas.",
      'Cada coluna tem "nome" (o que aparece no topo) e "passo", que diz quando o atendente move o cliente para lá:',
      `- ${passos}`,
      "",
      `Exemplo do formato (é de outro negócio — não copie os nomes, adapte ao "${ctx.nome}"):`,
      JSON.stringify({ nome: exemplo.proposta.nome, etapas: exemplo.proposta.etapas }, null, 2),
    ].join("\n"),
  };
}

/**
 * Acha o JSON no que o modelo devolveu.
 *
 * Instrução de formato não é garantia de formato: modelos cercam o objeto em
 * ```json, abrem com "Claro! Aqui está:" e fecham com uma explicação. Recortar
 * do primeiro `{` ao último `}` atravessa os três casos sem depender de o
 * provedor suportar saída estruturada — e a OpenRouter serve 400 modelos com
 * suportes diferentes.
 */
export function extrairJson(texto: string): unknown {
  const inicio = texto.indexOf("{");
  const fim = texto.lastIndexOf("}");
  if (inicio === -1 || fim <= inicio) return null;
  try {
    return JSON.parse(texto.slice(inicio, fim + 1));
  } catch {
    return null;
  }
}

/** De onde veio o quadro que a tela vai mostrar. A tela DIZ isto à pessoa. */
export type Sugestao =
  | { origem: "ia"; proposta: PropostaDeFunil }
  | {
      origem: "pacote";
      pacote: PacoteDeFunil;
      /**
       * Por que não veio da IA. Vai para a tela em português — a pessoa acabou
       * de configurar uma chave e precisa saber se ela está funcionando.
       */
      porque: string;
    };

/** A geração, injetável — é o único ponto que toca a rede. */
export type Gerar = (entrada: { system: string; prompt: string }) => Promise<string>;

/**
 * Pede o quadro à IA e devolve algo aproveitável em TODOS os desfechos.
 *
 * O caminho de erro não distingue "modelo devolveu prosa" de "modelo devolveu
 * um funil sem coluna de fechamento": os dois viram a mesma frase na tela,
 * porque para quem instalou o sistema a diferença não muda nada — o que muda é
 * ter um quadro pronto na frente. O detalhe técnico fica no `porque` para quem
 * for investigar.
 */
export async function sugerirFunil(ctx: ContextoDoNegocio, gerar: Gerar): Promise<Sugestao> {
  const exemplo = escolherPacotePorTexto(`${ctx.nome} ${ctx.oQueFaz}`);

  let texto: string;
  try {
    texto = await gerar(pedidoDeSugestao(ctx, exemplo));
  } catch (err) {
    return {
      origem: "pacote",
      pacote: exemplo,
      porque: err instanceof Error ? err.message : String(err),
    };
  }

  const bruta = extrairJson(texto);
  if (!bruta || typeof bruta !== "object") {
    return { origem: "pacote", pacote: exemplo, porque: "a resposta não veio no formato esperado" };
  }

  const proposta = normalizarProposta(bruta as { nome?: unknown; etapas?: unknown });
  const veredito = validarProposta(proposta);
  if (!veredito.ok) {
    return { origem: "pacote", pacote: exemplo, porque: veredito.erros.join(" ") };
  }

  return { origem: "ia", proposta: veredito.proposta };
}
