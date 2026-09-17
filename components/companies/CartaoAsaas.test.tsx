import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CartaoAsaas } from "@/components/companies/CartaoAsaas";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));

const COMPANY_ID = "co-1";

function envolver(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

function stubFetch(resposta: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(resposta), { status, headers: { "content-type": "application/json" } })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("CartaoAsaas", () => {
  it("empresa não vinculada mostra o formulário de CNPJ", async () => {
    stubFetch({ data: { linked: false, charges: [] } });
    envolver(<CartaoAsaas companyId={COMPANY_ID} canWrite />);

    expect(await screen.findByText("Esta empresa ainda não está vinculada a um cliente do Asaas.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Vincular pelo CNPJ" })).toBeInTheDocument();
  });

  it("empresa vinculada mostra as pendências", async () => {
    stubFetch({
      data: {
        linked: true,
        charges: [
          { payment_id: "pay_1", status: "OVERDUE", billing_type: "BOLETO", value_cents: 24990, due_date: "2026-09-01", invoice_url: "https://x/1" },
        ],
      },
    });
    envolver(<CartaoAsaas companyId={COMPANY_ID} canWrite />);

    expect(await screen.findByText("Cliente do Asaas vinculado")).toBeInTheDocument();
    expect(screen.getByText("OVERDUE")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Abrir boleto/fatura" })).toHaveAttribute("href", "https://x/1");
  });

  it("erro do servidor aparece com o texto real", async () => {
    stubFetch({ error: { code: "asaas_error", message: "O Asaas não respondeu em 10 segundos." } }, 502);
    envolver(<CartaoAsaas companyId={COMPANY_ID} canWrite />);

    expect(await screen.findByText("O Asaas não respondeu em 10 segundos.")).toBeInTheDocument();
  });

  it("com canWrite=false, o formulário de vínculo não aparece", async () => {
    stubFetch({ data: { linked: false, charges: [] } });
    envolver(<CartaoAsaas companyId={COMPANY_ID} canWrite={false} />);

    await waitFor(() => expect(screen.getByText("Esta empresa ainda não está vinculada a um cliente do Asaas.")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Vincular pelo CNPJ" })).not.toBeInTheDocument();
  });
});
