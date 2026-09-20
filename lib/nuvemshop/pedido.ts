/**
 * O PAYLOAD DA LOJA VIRA PEDIDO — regra pura, sem banco e sem rede.
 *
 * Fica separada do handler porque é a parte que erra em silêncio: total em
 * centavos, moeda, e o id do cliente vindo em formatos diferentes conforme o
 * evento. Testar isso exigindo Postgres faria ninguém testar.
 *
 * ⚠️ NADA AQUI INVENTA VALOR. Payload sem total, sem id ou sem data não vira
 * pedido "com o que dava": devolve o motivo, e quem chama registra a recusa.
 * Um total default seria um pedido de R$ 0,00 no funil de alguém — o pior tipo
 * de bug, porque parece certo até a hora de somar.
 */

export interface PedidoDaLoja {
  externalId: string;
  customerExternalId: string | null;
  totalCents: number;
  currency: string;
  paymentMethod: string | null;
  orderedAt: string;
  updatedAtRemote: string | null;
  /** Nome/telefone/e-mail que a loja mandou, para resolver o contato. */
  clienteNome: string | null;
  clienteEmail: string | null;
  clienteTelefone: string | null;
}

export type LeituraDePedido =
  | { ok: true; pedido: PedidoDaLoja }
  | { ok: false; motivo: string };

function texto(v: unknown): string | null {
  if (typeof v === "string") {
    const t = v.trim();
    return t === "" ? null : t;
  }
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

/**
 * "1234.56" (string, como a Nuvemshop manda) → 123456 centavos.
 *
 * Centavos por arredondamento do decimal, nunca por `* 100` em float: 19.99 em
 * ponto flutuante é 1998.9999... e truncar daria R$ 19,98 em todo pedido que
 * termina em 9. Medido: `Math.trunc(19.99 * 100) === 1998`.
 */
export function centavosDeDecimal(v: unknown): number | null {
  const s = texto(v);
  if (s === null) return null;
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function lerPedido(data: unknown): LeituraDePedido {
  if (typeof data !== "object" || data === null) return { ok: false, motivo: "payload_nao_e_objeto" };
  const d = data as Record<string, unknown>;

  const externalId = texto(d.id);
  if (externalId === null) return { ok: false, motivo: "sem_id_do_pedido" };

  const totalCents = centavosDeDecimal(d.total);
  if (totalCents === null) return { ok: false, motivo: "sem_total_valido" };

  const orderedAt = texto(d.created_at);
  if (orderedAt === null) return { ok: false, motivo: "sem_data_do_pedido" };

  const currency = (texto(d.currency) ?? "BRL").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return { ok: false, motivo: "moeda_invalida" };

  const cliente = (typeof d.customer === "object" && d.customer !== null
    ? (d.customer as Record<string, unknown>)
    : {}) as Record<string, unknown>;

  return {
    ok: true,
    pedido: {
      externalId,
      customerExternalId: texto(cliente.id),
      totalCents,
      currency,
      paymentMethod: texto(d.payment_details && typeof d.payment_details === "object"
        ? (d.payment_details as Record<string, unknown>).method
        : d.gateway),
      orderedAt,
      updatedAtRemote: texto(d.updated_at),
      clienteNome: texto(cliente.name),
      clienteEmail: texto(cliente.email),
      clienteTelefone: texto(cliente.phone),
    },
  };
}

/**
 * O CARRINHO — parecido com o pedido, e deliberadamente mais frouxo.
 *
 * Carrinho abandonado não tem total fechado nem data de compra: tem o que a
 * pessoa botou dentro e parou. Exigir `total` aqui faria o evento mais valioso
 * da recuperação ser descartado justamente quando o carrinho está incompleto —
 * que é sempre.
 *
 * O que NÃO é frouxo: sem id não há o que recuperar, e sem nenhuma forma de
 * falar com a pessoa (telefone ou e-mail) o card nasceria sem próximo passo
 * possível — um lead que ninguém consegue contatar é ruído no funil.
 */
export interface CarrinhoDaLoja {
  externalId: string;
  customerExternalId: string | null;
  totalCents: number | null;
  currency: string;
  clienteNome: string | null;
  clienteEmail: string | null;
  clienteTelefone: string | null;
  /** Link que a loja gera para a pessoa retomar a compra, quando manda. */
  urlDeRetomada: string | null;
}

export type LeituraDeCarrinho =
  | { ok: true; carrinho: CarrinhoDaLoja }
  | { ok: false; motivo: string };

export function lerCarrinho(data: unknown): LeituraDeCarrinho {
  if (typeof data !== "object" || data === null) return { ok: false, motivo: "payload_nao_e_objeto" };
  const d = data as Record<string, unknown>;

  const externalId = texto(d.id);
  if (externalId === null) return { ok: false, motivo: "sem_id_do_carrinho" };

  const cliente = (typeof d.customer === "object" && d.customer !== null
    ? (d.customer as Record<string, unknown>)
    : {}) as Record<string, unknown>;

  const email = texto(cliente.email) ?? texto(d.contact_email);
  const telefone = texto(cliente.phone) ?? texto(d.contact_phone);
  if (email === null && telefone === null) {
    return { ok: false, motivo: "sem_forma_de_contato" };
  }

  const currency = (texto(d.currency) ?? "BRL").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return { ok: false, motivo: "moeda_invalida" };

  return {
    ok: true,
    carrinho: {
      externalId,
      customerExternalId: texto(cliente.id),
      // Opcional de propósito — ver o cabeçalho acima.
      totalCents: centavosDeDecimal(d.total),
      currency,
      clienteNome: texto(cliente.name) ?? texto(d.contact_name),
      clienteEmail: email,
      clienteTelefone: telefone,
      urlDeRetomada: texto(d.abandoned_checkout_url) ?? texto(d.checkout_url),
    },
  };
}
