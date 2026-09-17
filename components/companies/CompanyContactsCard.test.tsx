import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CompanyContactsCard } from "@/components/companies/CompanyContactsCard";
import type { Company, CompanyContact } from "@/lib/types/companies";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));

const COMPANY: Company = {
  id: "co-1",
  organization_id: "org-1",
  name: "Vinhos Bacco Ltda",
  trade_name: null,
  cnpj: null,
  asaas_customer_id: null,
  billing_contact_id: "ct-1",
  notes: null,
  created_at: "2026-09-14T10:00:00.000Z",
  updated_at: "2026-09-14T10:00:00.000Z",
};

const CONTATOS: CompanyContact[] = [
  {
    id: "ct-1",
    name: "Ana Souza",
    display_name: null,
    phone_number: "+5511999998888",
    email: null,
    is_billing_contact: true,
  },
  {
    id: "ct-2",
    name: "Beto Lima",
    display_name: null,
    phone_number: "+5511999997777",
    email: null,
    is_billing_contact: false,
  },
];

function envolver(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ data: {} }), { status: 200, headers: { "content-type": "application/json" } })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("CompanyContactsCard", () => {
  it("mostra exatamente um badge de principal, e o outro contato ganha o botão de tornar principal", () => {
    envolver(<CompanyContactsCard company={COMPANY} contacts={CONTATOS} canWrite />);

    expect(screen.getAllByTestId("principal")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Tornar principal" })).toBeInTheDocument();
  });

  it("com canWrite=false, nenhum botão de escrita aparece", () => {
    envolver(<CompanyContactsCard company={COMPANY} contacts={CONTATOS} canWrite={false} />);

    expect(screen.getAllByTestId("principal")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Tornar principal" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Desvincular" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Vincular contato" })).not.toBeInTheDocument();
  });

  it("estado vazio mostra a mensagem de nenhum contato vinculado", () => {
    envolver(<CompanyContactsCard company={COMPANY} contacts={[]} canWrite />);

    expect(screen.getByText("Nenhum contato vinculado. Vincule quem fala por esta empresa.")).toBeInTheDocument();
    expect(screen.queryByTestId("principal")).not.toBeInTheDocument();
  });
});
