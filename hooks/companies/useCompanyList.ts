"use client";
import { useInfiniteQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import type { Company } from "@/lib/types/companies";

interface ListResponse {
  data: Company[];
  meta?: { cursor?: string; has_more?: boolean };
}

export interface CompanyListFilters {
  search?: string;
  limit?: number;
}

export function useCompanyList(filters: CompanyListFilters) {
  return useInfiniteQuery({
    queryKey: ["companies", filters],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const qs = new URLSearchParams();
      if (filters.search) qs.set("search", filters.search);
      if (filters.limit) qs.set("limit", String(filters.limit));
      if (pageParam) qs.set("cursor", pageParam);
      try {
        return await apiClient.get<ListResponse>(`/api/v1/companies?${qs.toString()}`);
      } catch (err) {
        showApiError(err);
        throw err;
      }
    },
    getNextPageParam: (lastPage) =>
      lastPage.meta?.has_more ? lastPage.meta.cursor : undefined,
  });
}
