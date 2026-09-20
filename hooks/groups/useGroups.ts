"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import type { ModoDeGrupo, PapelDeMembro } from "@/lib/grupos/tipos";

export interface GroupRow {
  id: string;
  wa_group_id: string;
  subject: string | null;
  size: number;
  modo: ModoDeGrupo;
  somos_admin: boolean;
  announce: boolean;
  last_synced_at: string | null;
}

export interface GroupDetail extends GroupRow {
  description: string | null;
  owner_pn: string | null;
  created_at_wa: string | null;
  restrict_info: boolean;
  member_add_mode: string | null;
  join_approval_mode: string | null;
  settings: Record<string, unknown> | null;
}

export interface GroupMemberRow {
  id: string;
  wa_lid: string;
  wa_pn: string | null;
  push_name: string | null;
  role: PapelDeMembro;
  contact_id: string | null;
  strikes: number;
  silenciado_ate: string | null;
  entrou_em: string | null;
}

export interface AvailableGroupRow {
  wa_group_id: string;
  subject: string | null;
  size: number;
  somos_admin: boolean;
  ja_cadastrado: boolean;
  channel_session_id: string;
}

export interface GroupActionResult {
  action_id: string;
  status: "concluida" | "falhou";
  pos_condicao_ok: boolean;
  erro_texto: string | null;
  waha_status_participante: number | null;
}

const GROUPS_KEY = ["groups"];
const groupDetailKey = (id: string) => ["groups", id];
const groupMembersKey = (id: string) => ["groups", id, "members"];

export function useGroupList() {
  return useQuery({
    queryKey: GROUPS_KEY,
    queryFn: async () => apiClient.get<{ data: GroupRow[] }>("/api/v1/groups"),
    staleTime: 15_000,
  });
}

export function useAvailableGroups(enabled: boolean) {
  return useQuery({
    queryKey: ["groups", "disponiveis"],
    queryFn: async () => apiClient.get<{ data: AvailableGroupRow[] }>("/api/v1/groups/disponiveis"),
    enabled,
  });
}

export function useRegisterGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { wa_group_id: string; channel_session_id: string }) =>
      apiClient.post<{ data: { id: string } }>("/api/v1/groups/cadastrar", input),
    onError: showApiError,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: GROUPS_KEY });
    },
  });
}

export function useGroupDetail(id: string) {
  return useQuery({
    queryKey: groupDetailKey(id),
    queryFn: async () => apiClient.get<{ data: GroupDetail }>(`/api/v1/groups/${id}`),
  });
}

export function useUpdateGroupMode(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (modo: ModoDeGrupo) =>
      apiClient.patch<{ data: { id: string; modo: ModoDeGrupo } }>(`/api/v1/groups/${id}`, { modo }),
    onError: showApiError,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: groupDetailKey(id) });
    },
  });
}

export function useGroupMembers(id: string) {
  return useQuery({
    queryKey: groupMembersKey(id),
    queryFn: async () => apiClient.get<{ data: GroupMemberRow[] }>(`/api/v1/groups/${id}/members`),
  });
}

/**
 * A ação pode "ter sucesso na chamada" (200) e ainda assim ter FALHADO no
 * WhatsApp — `pos_condicao_ok: false`. Por isso não usa `onError` genérico:
 * o resultado, com `erro_texto` e `waha_status_participante` crus, é o que a
 * tela precisa mostrar (Regra Nº 1), sucesso HTTP não é sucesso da ação.
 */
export function useGroupAction(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { member_id: string; acao: "remover" | "promover" | "rebaixar" | "silenciar"; silenciar_ate?: string }) =>
      apiClient.post<{ data: GroupActionResult }>(`/api/v1/groups/${id}/actions`, input),
    onError: showApiError,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: groupMembersKey(id) });
    },
  });
}
