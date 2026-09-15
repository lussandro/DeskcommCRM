/**
 * A cor de uma etiqueta é CALCULADA do nome (DIRC: Calcular) — sem coluna nova e sem
 * cadastro. Mesmo nome normalizado → mesma trilha → mesmos tokens
 * `--color-etiqueta-N-bg/-fg` (app/globals.css, medidos a 4,5:1 nos dois temas).
 * FNV-1a 32 bits: estável entre execuções e plataformas, sem dependência.
 */
export type TrilhaDeEtiqueta = 1 | 2 | 3 | 4 | 5 | 6;

export function trilhaDaEtiqueta(nome: string): TrilhaDeEtiqueta {
  const chave = nome.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();
  if (!chave) return 1;
  let h = 0x811c9dc5;
  for (let i = 0; i < chave.length; i++) {
    h ^= chave.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return ((h % 6) + 1) as TrilhaDeEtiqueta;
}
