"use client";

import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";
import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  useAgentInbox,
  useResolveAllInboxItems,
  useUpdateInboxItem,
  type AgentInboxItem,
} from "@/hooks/ai/useAgentInbox";
import { useCompanyList } from "@/hooks/companies/useCompanyList";
import { useContactList } from "@/hooks/contacts/useContactList";
import { apiClient } from "@/lib/api/client";
import { kindLabel, SEVERITY_LABEL, type AgentInboxSeverity } from "@/lib/ai/agent-inbox-copy";
import { Bell, Check } from "@/lib/ui/icons";
import { useT } from "@/hooks/i18n/useT";
import { ApiError } from "@/lib/api/types";

/** `cus_...` do Asaas escrito no `body` do aviso `charge_unmatched` (Task 7). Ausente = botão some. */
const CUSTOMER_ID_REGEX = /\bcus_[A-Za-z0-9]+\b/;
function customerIdDoAviso(body: string | null): string | null {
  return body?.match(CUSTOMER_ID_REGEX)?.[0] ?? null;
}

const SEVERITY_VARIANT: Record<AgentInboxSeverity, "info" | "warning" | "error"> = {
  info: "info",
  warn: "warning",
  critical: "error",
};

export function AgentInboxList({ canResolve }: { canResolve: boolean }) {
  const t = useT();
  const [tab, setTab] = useState<"open" | "resolved">("open");
  const { data: cachedData, error, isLoading, isError, refetch, isFetching } = useAgentInbox(tab);
  const acessoNegado = error instanceof ApiError && (error.status === 401 || error.status === 403);
  const data = acessoNegado ? undefined : cachedData;
  const update = useUpdateInboxItem();
  const resolveAll = useResolveAllInboxItems();
  const [vincularItem, setVincularItem] = useState<AgentInboxItem | null>(null);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "open" | "resolved")}>
          <TabsList>
            <TabsTrigger value="open">
              {t("Abertos")}{data ? ` (${data.open_count})` : ""}
            </TabsTrigger>
            <TabsTrigger value="resolved">{t("Resolvidos")}</TabsTrigger>
          </TabsList>
        </Tabs>
        {canResolve && tab === "open" && data && data.items.length > 0 ? (
          <Button
            size="sm"
            variant="outline"
            disabled={resolveAll.isPending}
            onClick={() => resolveAll.mutate()}
          >
            <Check size={14} aria-hidden />
            {t("Marcar todos resolvidos")}
          </Button>
        ) : null}
      </div>

      {isError ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-4 text-sm">
          <p className="min-w-0 flex-1">{t(acessoNegado ? "Seu acesso aos avisos não está disponível. Confira sua sessão e tente novamente." : data ? "Não foi possível atualizar os avisos. A lista abaixo pode estar desatualizada." : "Não foi possível carregar os avisos. Tente novamente.")}</p>
          <Button variant="outline" size="sm" disabled={isFetching} onClick={() => void refetch()}>{t("Tentar novamente")}</Button>
        </div>
      ) : null}
      {update.isError ? <p role="alert" className="text-sm text-destructive">{t("Não foi possível atualizar este aviso. Tente novamente.")}</p> : null}
      {/* O lote pode falhar depois de resolver PARTE dos avisos: a mensagem manda
          conferir a lista em vez de afirmar que nada mudou. Sem isto o clique em
          "Marcar todos resolvidos" não deixaria rastro nenhum quando errasse. */}
      {resolveAll.isError ? <p role="alert" className="text-sm text-destructive">{t("Não foi possível resolver todos os avisos. Confira a lista e tente novamente.")}</p> : null}

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : isError && !data ? null : !data || data.items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center">
          <Bell size={28} className="text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium">
            {tab === "open" ? t("Nenhum aviso em aberto") : t("Nenhum aviso resolvido")}
          </p>
          <p className="text-xs text-muted-foreground">
            {tab === "open"
              ? t("Quando o assistente precisar de você, o aviso aparece aqui.")
              : t("Avisos que você marcar como resolvidos ficam aqui.")}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {data.items.map((item) => (
            <InboxRow
              key={item.id}
              item={item}
              canResolve={canResolve}
              pending={update.isPending}
              onToggle={(status) => update.mutate({ id: item.id, status })}
              onVincular={canResolve ? () => setVincularItem(item) : undefined}
            />
          ))}
        </ul>
      )}

      {vincularItem && (
        <VincularAsaasDialog
          open
          onOpenChange={(v) => !v && setVincularItem(null)}
          customerId={customerIdDoAviso(vincularItem.body) ?? ""}
          onLinked={() => {
            update.mutate({ id: vincularItem.id, status: "resolved" });
            setVincularItem(null);
          }}
        />
      )}
    </div>
  );
}

function InboxRow({
  item,
  canResolve,
  pending,
  onToggle,
  onVincular,
}: {
  item: AgentInboxItem;
  canResolve: boolean;
  pending: boolean;
  onToggle: (status: "open" | "resolved") => void;
  onVincular?: () => void;
}) {
  const localeDaData = useLocaleDeData();
  const t = useT();
  const podeVincular =
    item.kind === "charge_unmatched" && item.status === "open" && !!onVincular && !!customerIdDoAviso(item.body);
  const when = formatDistanceToNowStrict(new Date(item.created_at), {
    addSuffix: true,
    locale: localeDaData,
  });
  return (
    <li className="flex flex-wrap items-start gap-3 px-4 py-3" data-testid="inbox-item">
      <Badge variant={SEVERITY_VARIANT[item.severity]} className="mt-0.5 shrink-0">
        {t(SEVERITY_LABEL[item.severity])}
      </Badge>
      <div className="min-w-0 flex-1 basis-48 break-words">
        {/* TÍTULO E CORPO SAEM COMO VIERAM — nunca por t().
            São LINHAS de `agent_inbox_items`, escritas pelo runtime no momento do
            evento e recheadas com dado de gente: nome do cliente, número, motivo do
            handoff, o que o operador cadastrou. É a mesma regra que já vale para nome
            de funil, rótulo de etapa e conteúdo de mensagem — e a mesma que o PR #600
            aplicou à Agenda. Passar isso pelo dicionário não traduz nada (a chave é a
            frase inteira, que nunca casa) e, quando casa, troca a palavra que a pessoa
            cadastrou por outra que ela não sabe procurar.
            O que continua traduzido é o que é NOSSO: severidade, rótulo do kind,
            orientação e rótulo do destino. */}
        <p className="text-sm font-medium">{item.title}</p>
        <p className="text-xs text-muted-foreground">
          {kindLabel(item.kind, t)} · {when}
        </p>
        {item.body ? <p className="mt-1 text-xs text-muted-foreground">{item.body}</p> : null}
        {item.destination.orientacao ? <p className="mt-2 text-xs text-muted-foreground">{t(item.destination.orientacao)}</p> : null}
        {item.destination.estado === "disponivel" ? (
          <Button asChild size="sm" variant="link" className="mt-1 h-auto whitespace-normal px-0 text-left">
            <Link href={item.destination.href}>{t(item.destination.rotulo)}</Link>
          </Button>
        ) : null}
        {podeVincular ? (
          <div>
            <Button size="sm" variant="outline" className="mt-1" onClick={onVincular}>
              {t("Vincular")}
            </Button>
          </div>
        ) : null}
      </div>
      {canResolve ? (
        item.status === "resolved" ? (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => onToggle("open")}>
            {t("Reabrir")}
          </Button>
        ) : (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => onToggle("resolved")}>
            <Check size={14} aria-hidden />
            {t("Marcar resolvido")}
          </Button>
        )
      ) : null}
    </li>
  );
}

type TipoDeAlvo = "company" | "contact";

/**
 * Dialogo do botão "Vincular" de `charge_unmatched` (spec §10): busca empresa OU
 * contato e grava o `customer_id` do Asaas já extraído do corpo do aviso pela
 * rota de vínculo do operador — nunca pelo PATCH genérico.
 */
function VincularAsaasDialog({
  open,
  onOpenChange,
  customerId,
  onLinked,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customerId: string;
  onLinked: () => void;
}) {
  const t = useT();
  const [tipo, setTipo] = useState<TipoDeAlvo>("company");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const companies = useCompanyList({ search, limit: 20 }, { enabled: tipo === "company" });
  const contacts = useContactList({ search, limit: 20 });
  const companyResultados = (companies.data?.pages.flatMap((p) => p.data) ?? []).map((c) => ({ id: c.id, label: c.name }));
  const contactResultados = (contacts.data?.pages.flatMap((p) => p.data) ?? []).map((c) => ({
    id: c.id,
    label: c.display_name ?? c.name ?? c.phone_number ?? c.id,
  }));
  const resultados = tipo === "company" ? companyResultados : contactResultados;

  async function vincular(alvoId: string) {
    setErro(null);
    setPendingId(alvoId);
    try {
      const rota = tipo === "company" ? `/api/v1/companies/${alvoId}/asaas-link` : `/api/v1/contacts/${alvoId}/asaas-link`;
      await apiClient.post(rota, { customer_id: customerId });
      onLinked();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : t("Não foi possível vincular. Tente novamente."));
      setPendingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Vincular cobrança")}</DialogTitle>
          <DialogDescription>{t("Encontre a empresa ou o contato dono desta cobrança no Asaas.")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Tabs value={tipo} onValueChange={(v) => setTipo(v as TipoDeAlvo)}>
            <TabsList>
              <TabsTrigger value="company">{t("Empresa")}</TabsTrigger>
              <TabsTrigger value="contact">{t("Contato")}</TabsTrigger>
            </TabsList>
          </Tabs>
          <Input
            placeholder={t("Buscar por nome…")}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          {erro && <p role="alert" className="text-sm text-error-fg">{erro}</p>}
          <ul className="max-h-64 divide-y overflow-y-auto rounded-md border border-border">
            {resultados.length === 0 ? (
              <li className="p-3 text-sm text-muted-foreground">{t("Nenhum resultado")}</li>
            ) : (
              resultados.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    disabled={pendingId !== null}
                    onClick={() => vincular(r.id)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-50"
                  >
                    <span>{r.label}</span>
                    {pendingId === r.id && <span className="text-xs text-muted-foreground">{t("Vinculando…")}</span>}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
