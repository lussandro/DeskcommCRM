/** Formata dígitos de CNPJ como `00.000.000/0000-00`. Sem dígitos válidos, devolve como veio. */
export function formatarCnpj(digits: string | null | undefined): string {
  const d = (digits ?? "").replace(/\D/g, "");
  if (d.length !== 14) return digits ?? "";
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`;
}
