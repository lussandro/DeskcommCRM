"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";

export function useDeleteCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (companyId: string) =>
      apiClient.delete<unknown>(`/api/v1/companies/${companyId}`),
    onError: showApiError,
    onSuccess: (_data, deletedId) => {
      qc.invalidateQueries({ queryKey: ["company", deletedId] });
      qc.invalidateQueries({ queryKey: ["companies"] });
    },
  });
}
