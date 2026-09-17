/**
 * Campo "Empresa" só aparece quando a org tem empresa cadastrada, e escolher
 * uma manda `company_id` no PATCH. Molde: NewContactDialog.criado.test.tsx.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EditContactDialog } from "@/components/contacts/EditContactDialog";
import type { Contact } from "@/lib/types/contacts";
import type { Company } from "@/lib/types/companies";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
// CompanyPicker sempre monta NewCompanyDialog (mesmo fechado), que chama useRouter.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const mutateAsync = vi.fn();
vi.mock("@/hooks/contacts/useUpdateContact", () => ({
  useUpdateContact: () => ({ mutateAsync, isPending: false }),
}));

const useCompanyListMock = vi.fn();
vi.mock("@/hooks/companies/useCompanyList", () => ({
  useCompanyList: (filters: unknown) => useCompanyListMock(filters),
}));

const CONTACT: Contact = {
  id: "ct-1",
  organization_id: "org-1",
  name: "Joana Prado",
  display_name: null,
  email: null,
  email_normalized: null,
  phone_number: "+5511999998888",
  cpf_hash: null,
  birthdate: null,
  is_blocked: false,
  blocked_reason: null,
  is_anonymized: false,
  anonymized_at: null,
  is_merged_into: null,
  merged_at: null,
  consent: {},
  tags: [],
  source: "manual",
  source_metadata: {},
  custom_fields: {},
  created_at: "2026-09-14T10:00:00.000Z",
  updated_at: "2026-09-14T10:00:00.000Z",
  last_activity_at: null,
  company_id: null,
};

const EMPRESA: Company = {
  id: "11111111-1111-4111-8111-111111111111",
  organization_id: "org-1",
  name: "Adega Bacco",
  trade_name: null,
  cnpj: null,
  asaas_customer_id: null,
  billing_contact_id: null,
  notes: null,
  created_at: "2026-09-14T10:00:00.000Z",
  updated_at: "2026-09-14T10:00:00.000Z",
};

function vazio() {
  return { data: { pages: [{ data: [] }] }, fetchNextPage: vi.fn(), hasNextPage: false };
}

function comEmpresa() {
  return { data: { pages: [{ data: [EMPRESA] }] }, fetchNextPage: vi.fn(), hasNextPage: false };
}

function envolver(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  mutateAsync.mockResolvedValue({ data: CONTACT });
  // jsdom não implementa estas APIs de ponteiro; Radix Select as chama ao abrir/fechar.
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture ?? (() => false);
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture ?? (() => {});
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture ?? (() => {});
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("EditContactDialog · campo Empresa", () => {
  it("sem empresa cadastrada na organização, o campo não aparece", () => {
    useCompanyListMock.mockReturnValue(vazio());
    envolver(<EditContactDialog contact={CONTACT} open onOpenChange={vi.fn()} />);
    expect(screen.queryByText("Empresa")).not.toBeInTheDocument();
  });

  it("com pelo menos uma empresa, o campo aparece", () => {
    useCompanyListMock.mockReturnValue(comEmpresa());
    envolver(<EditContactDialog contact={CONTACT} open onOpenChange={vi.fn()} />);
    expect(screen.getByText("Empresa")).toBeInTheDocument();
  });

  it("escolher a empresa e salvar chama a mutação com company_id", async () => {
    useCompanyListMock.mockReturnValue(comEmpresa());
    const user = userEvent.setup();
    envolver(<EditContactDialog contact={CONTACT} open onOpenChange={vi.fn()} />);

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Adega Bacco" }));
    // Radix deixa `pointer-events: none` no body enquanto o popup do Select
    // fecha; user-event respeita isso e nunca clica. O Dialog em volta continua
    // aberto e funcional — fireEvent ignora o CSS que jsdom não está de fato aplicando.
    fireEvent.click(screen.getByRole("button", { name: /Salvar/i }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync.mock.calls[0]?.[0]).toMatchObject({ company_id: EMPRESA.id });
  });
});
