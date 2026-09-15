import { LOGOTIPO, SIMBOLO, type Desenho } from "@/lib/branding/desenho";
import { cn } from "@/lib/utils";

/**
 * A marca do PRODUTO desenhada em SVG inline — o que a tela mostra quando
 * ninguém configurou marca própria (`marcaEhADoProduto`, em `lib/branding.ts`).
 *
 * Inline, e não `<img src="/algo.svg">`, por três motivos:
 *  - as cores seguem o TEMA: borgonha e ouro no claro, creme e ouro no escuro
 *    (`CORES_DA_MARCA`) — um arquivo estático teria uma cor só;
 *  - nada em `public/`: um `.svg` fixo ali seria servido na instalação de um
 *    revendedor que configurou a marca dele (ver `lib/branding/desenho.ts`);
 *  - a barra lateral já usa `<img>` para o logo CONFIGURADO, e o e2e
 *    `marca-logo.spec.ts` mede "barra sem `<img>`" como "sem logo do
 *    revendedor". Um `<img>` do produto ali faria a spec medir a coisa errada.
 *
 * O texto alternativo é o `nome` que a tela já resolveu — nunca uma string
 * fixa, para que a catraca de marca (`tests/unit/branding.test.ts`) continue
 * contando ZERO ocorrências fora de `lib/branding.ts`.
 */

type Props = {
  readonly nome: string;
  readonly className?: string;
  /** `true` quando o texto ao lado já nomeia a marca — evita ler duas vezes. */
  readonly decorativo?: boolean;
};

const CORPO_CLARO_ESCURO = "fill-[#4a0e1f] dark:fill-[#f5f0e6]";
const UVAS_CLARO_ESCURO = "fill-[#c49a4a] dark:fill-[#c49a4a]";
const NOME_CLARO_ESCURO = "fill-[#4a0e1f] dark:fill-[#f5f0e6]";
const SUFIXO_CLARO_ESCURO = "fill-[#c49a4a] dark:fill-[#c49a4a]";

// As classes acima repetem os hexes de `CORES_DA_MARCA` porque o Tailwind só
// gera utilitário para valor LITERAL no fonte. Quem impede os dois de divergirem
// é `tests/unit/marca-do-produto.test.tsx`, que compara as classes à paleta —
// e não uma asserção em runtime: um throw aqui derrubaria a casca inteira.
export const CLASSES_DE_COR = {
  corpo: CORPO_CLARO_ESCURO,
  uvas: UVAS_CLARO_ESCURO,
  nome: NOME_CLARO_ESCURO,
  sufixo: SUFIXO_CLARO_ESCURO,
} as const;

function acessibilidade(nome: string, decorativo: boolean) {
  return decorativo
    ? ({ "aria-hidden": true } as const)
    : ({ role: "img", "aria-label": nome } as const);
}

/** As duas cores do desenho: corpo (B e folha) e uvas. */
function Partes({ desenho }: { readonly desenho: Desenho }) {
  return (
    <>
      <g className={CORPO_CLARO_ESCURO}>
        {desenho.corpo.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      <g className={UVAS_CLARO_ESCURO}>
        {desenho.uvas.map((u, i) => (
          <circle key={i} cx={u.cx} cy={u.cy} r={u.r} />
        ))}
      </g>
    </>
  );
}

/** O símbolo sozinho — para a barra recolhida, avatar e cantos apertados. */
export function SimboloDoProduto({ nome, className, decorativo = false }: Props) {
  return (
    <svg
      viewBox={SIMBOLO.viewBox}
      className={cn("shrink-0", className)}
      {...acessibilidade(nome, decorativo)}
    >
      <Partes desenho={SIMBOLO} />
    </svg>
  );
}

/** Símbolo + nome — para a barra aberta e a fachada de entrada. */
export function LogotipoDoProduto({ nome, className, decorativo = false }: Props) {
  return (
    <svg
      viewBox={LOGOTIPO.viewBox}
      className={cn("shrink-0", className)}
      {...acessibilidade(nome, decorativo)}
    >
      <Partes desenho={LOGOTIPO.simbolo} />
      <g className={NOME_CLARO_ESCURO}>
        {LOGOTIPO.nome.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      <g className={SUFIXO_CLARO_ESCURO}>
        {LOGOTIPO.sufixo.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </svg>
  );
}
