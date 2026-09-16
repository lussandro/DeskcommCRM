/**
 * OS QUADROS PRONTOS, POR TIPO DE NEGÓCIO.
 *
 * Existem por duas razões, e a segunda é a que importa mais:
 *
 * 1. São o PLANO B. Quando a chave de IA não está no lugar, não tem saldo, ou o
 *    provedor devolve algo que não vira funil, o passo continua entregando um
 *    quadro que faz sentido — em vez de devolver a pessoa ao funil de
 *    e-commerce que o gatilho semeou. Falhar fechado na ação, aberto na
 *    informação: a tela diz que a sugestão não veio e mostra os prontos.
 *
 * 2. São a RÉGUA. É contra estes exemplos que a sugestão da IA é pedida e
 *    comparada. Sem um alvo concreto, "sugira um funil" devolve cinco colunas
 *    com nomes de manual de vendas ("Prospecção", "MQL", "Fundo de funil") que
 *    não são o que o dono de uma vinícola chama as coisas.
 *
 * ⚠️ TODA ETAPA CARREGA O PASSO. Um pacote que só desse os nomes trocaria um
 * quadro errado por um quadro certo e igualmente parado — ver o cabeçalho de
 * `proposta-de-funil.ts` para a medição.
 */
import type { PropostaDeFunil } from "@/lib/onboarding/proposta-de-funil";
import { CHAVES_DE_JORNADA, JORNADAS } from "@/lib/vertical/vinicola";

export interface PacoteDeFunil {
  id: string;
  /**
   * Como o dono reconhece o próprio negócio nesta lista. Não é o nome do nicho
   * no material de marketing ("vertical de saúde") — é o que ele responderia se
   * alguém perguntasse o que ele faz.
   */
  comoSeApresenta: string;
  proposta: PropostaDeFunil;
}

/**
 * Os quadros prontos. Os de vinícola são PROJEÇÃO das jornadas
 * (`lib/vertical/vinicola/`), não uma segunda lista: o quadro que o wizard
 * mostra e o que a jornada semeia têm de ser o MESMO, e duas listas divergiriam
 * no primeiro ajuste de etapa.
 *
 * ⚠️ Os três pacotes antigos (`clientes_vinicola`, `enoturismo_interesse`,
 * `consumidor_vinho`) saíram. Organizações já instaladas não são alteradas — o
 * pacote só vive no passo do onboarding.
 */
export const PACOTES: readonly PacoteDeFunil[] = [
  ...CHAVES_DE_JORNADA.map((chave) => ({
    id: chave,
    comoSeApresenta: JORNADAS[chave].comoSeApresenta,
    proposta: { nome: JORNADAS[chave].nomeDoFunil, etapas: JORNADAS[chave].etapas },
  })),
  {
    id: "generico",
    // Último de propósito: quem não se reconhece em nenhum dos outros já leu
    // todos antes de chegar aqui.
    comoSeApresenta: "Outro tipo de negócio",
    // As sete etapas atuais, copiadas sem uma vírgula de diferença. Elas são o
    // plano B de quem NÃO é vinícola, e nada nesta entrega as toca.
    proposta: {
      nome: "Clientes",
      etapas: [
        { nome: "Novo contato", passo: "new" },
        { nome: "Já respondi", passo: "contacted" },
        { nome: "Entendendo a necessidade", passo: "qualifying" },
        { nome: "Proposta enviada", passo: "qualified" },
        { nome: "Negociando", passo: "negotiating" },
        { nome: "Fechou", passo: "won" },
        { nome: "Não fechou", passo: "lost" },
      ],
    },
  },
] as const;

/**
 * O pacote de último recurso.
 *
 * Existe como CONSTANTE e não como `PACOTES[0]` porque quem chama precisa de uma
 * garantia de que sempre há um: um índice fixo numa lista editável é a promessa
 * que se quebra na primeira reordenação, e o desfecho seria uma tela de
 * onboarding com `undefined` no lugar do quadro.
 */
export const PACOTE_PADRAO: PacoteDeFunil =
  PACOTES.find((p) => p.id === "generico") ??
  (() => {
    throw new Error("PACOTES sem o pacote genérico — ele é o último recurso do passo do funil");
  })();
