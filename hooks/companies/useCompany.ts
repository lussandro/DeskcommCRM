"use client";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import type { Company, CompanyContact } from "@/lib/types/companies";

interface CompanyResponse {
  data: Company & { contacts?: CompanyContact[] };
  meta?: Record<string, unknown>;
}

export function useCompany(id: string) {
  return useQuery({
    queryKey: ["company", id],
    enabled: !!id,
    queryFn: async () => {
      try {
        return await apiClient.get<CompanyResponse>(`/api/v1/companies/${id}`);
      } catch (err) {
        showApiError(err);
        throw err;
      }
    },
  });
}
