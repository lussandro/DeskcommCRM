"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";

export interface AsaasCharge {
  payment_id: string;
  status: string;
  billing_type: string;
  value_cents: number;
  due_date: string;
  invoice_url: string | null;
}

export type AsaasVinculo =
  | { linked: false; charges: [] }
  | { linked: true; charges: AsaasCharge[] };

/** Pendências ao vivo da empresa. Sem retry automático em 409 (módulo desligado é estado, não falha transitória). */
export function useCompanyAsaas(companyId: string, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["company-asaas", companyId],
    enabled: (opts.enabled ?? true) && !!companyId,
    retry: false,
    queryFn: () => apiClient.get<{ data: AsaasVinculo }>(`/api/v1/companies/${companyId}/asaas`).then((r) => r.data),
  });
}

/** Vincular pelo CNPJ digitado pelo operador (cartão da tela da empresa). */
export function useLinkCompanyAsaas(companyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cnpj: string) => apiClient.post(`/api/v1/companies/${companyId}/asaas`, { cnpj }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-asaas", companyId] });
      qc.invalidateQueries({ queryKey: ["companies"] });
    },
  });
}
