"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";

export function useLinkCompanyContact(companyId: string) {
  const qc = useQueryClient();
  const invalida = () => {
    qc.invalidateQueries({ queryKey: ["company", companyId] });
    qc.invalidateQueries({ queryKey: ["companies"] });
    qc.invalidateQueries({ queryKey: ["contacts"] });
    qc.invalidateQueries({ queryKey: ["contact"] });
  };
  const link = useMutation({
    mutationFn: (contactId: string) =>
      apiClient.post(`/api/v1/companies/${companyId}/contacts`, { contact_id: contactId }),
    onError: showApiError,
    onSuccess: invalida,
  });
  const unlink = useMutation({
    mutationFn: (contactId: string) =>
      apiClient.delete(`/api/v1/companies/${companyId}/contacts`, { contact_id: contactId }),
    onError: showApiError,
    onSuccess: invalida,
  });
  return { link, unlink };
}
