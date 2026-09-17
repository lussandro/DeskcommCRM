import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("./config", () => ({ carregarIntegracaoAsaas: vi.fn(async () => null) }));

import type { EventRow } from "@/lib/event-log/dispatcher";
import { asaasCobrancaHandler } from "./consumidor.handler";

describe("asaasCobrancaHandler", () => {
  it("evento com organization_id sem integração healthy → skipped", async () => {
    const row: EventRow = {
      id: "1",
      organization_id: "org-sem-integracao",
      event_type: "asaas.payment_overdue",
      entity_kind: "asaas_webhook",
      entity_id: null,
      payload: { event: "PAYMENT_OVERDUE", payment: { id: "pay_1", customer: "cus_1", status: "OVERDUE", value: 100, dueDate: "2026-09-20" } },
      metadata: {},
      consumed_by: [],
      attempts: 0,
    };
    const r = await asaasCobrancaHandler.handle(row);
    expect(r.status).toBe("skipped");
    expect(r.detail).toBe("integracao_nao_healthy");
  });
});
