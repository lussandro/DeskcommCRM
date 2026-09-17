/**
 * CÓDIGO DE PAGAMENTO SAI SOZINHO NA BOLHA.
 *
 * Medido em produção (17/09/2026): o agente mandou o Pix copia-e-cola no meio da
 * frase — "segue o Pix copia e cola para pagar agora: 000201…6304XXXX Se preferir,
 * também pode pagar pelo link: …". No WhatsApp isso é inútil: para copiar, a pessoa
 * tem de selecionar caractere a caractere dentro do parágrafo. Tocar na mensagem só
 * copia a mensagem INTEIRA — por isso o código precisa ser a mensagem inteira.
 *
 * Não é assunto de prompt. O payload EMV **contém espaços** (o nome do recebedor:
 * "5919BACCO SISTEMAS LTDA"), então nem o modelo nem a pessoa sabem onde ele termina;
 * quem sabe é o formato. Aqui o código é reconhecido pela estrutura e separado do
 * texto, valendo para qualquer agente, com ou sem divisão em bolhas ligada.
 *
 * Dois formatos, os dois fechados:
 *   - **Pix copia-e-cola (BR Code / EMV)**: começa em `000201` e termina no CRC
 *     `6304` + 4 hexadecimais, que é sempre o ÚLTIMO campo do payload.
 *   - **Linha digitável de boleto**: 47 dígitos em 5 blocos, com ou sem os pontos e
 *     espaços da máscara.
 */

/** BR Code: do `000201` inicial até o CRC final (`6304` + 4 hex). Não-guloso. */
const PIX_EMV = /000201[\s\S]{30,600}?6304[0-9A-Fa-f]{4}/g;

/**
 * Linha digitável (47 dígitos): `AAAAA.AAAAA BBBBB.BBBBBB CCCCC.CCCCCC D EEEEEEEEEEEEEE`,
 * com os separadores opcionais — é assim que o Asaas devolve e assim que o banco aceita.
 */
const LINHA_DIGITAVEL = /\b\d{5}\.?\d{5}\s?\d{5}\.?\d{6}\s?\d{5}\.?\d{6}\s?\d\s?\d{14}\b/g;

/**
 * Quebra o texto em pedaços, com cada código de pagamento em um pedaço só dele.
 * Sem código ⇒ um pedaço só (o texto inteiro), e o chamador segue como antes.
 */
export function separarCodigosDePagamento(texto: string): string[] {
  const achados: Array<{ inicio: number; fim: number }> = [];
  for (const padrao of [PIX_EMV, LINHA_DIGITAVEL]) {
    padrao.lastIndex = 0;
    for (const m of texto.matchAll(padrao)) {
      if (m.index === undefined) continue;
      achados.push({ inicio: m.index, fim: m.index + m[0].length });
    }
  }
  if (achados.length === 0) return [texto];
  achados.sort((a, b) => a.inicio - b.inicio);

  const pedacos: string[] = [];
  let cursor = 0;
  for (const { inicio, fim } of achados) {
    // Achados que se sobrepõem (um dentro do outro): fica o primeiro.
    if (inicio < cursor) continue;
    const antes = texto.slice(cursor, inicio).trim();
    if (antes !== '') pedacos.push(antes);
    pedacos.push(texto.slice(inicio, fim).trim());
    cursor = fim;
  }
  const depois = texto.slice(cursor).trim();
  if (depois !== '') pedacos.push(depois);
  return pedacos.filter((p) => p !== '');
}

/** Há código de pagamento no texto? (para o log e para decidir forçar as bolhas) */
export function temCodigoDePagamento(texto: string): boolean {
  return separarCodigosDePagamento(texto).length > 1;
}
