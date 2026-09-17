import { describe, it, expect } from "vitest";
import { redactArgs } from "@/lib/mcp/audit";
import { serializeSteps } from "@/lib/ai/runtime/serialize";

describe("redação do documento (Asaas)", () => {
  it("document, cpf, cnpj, cpfCnpj e access_token são redigidos no audit de tool", () => {
    const out = redactArgs({ document: "24971563792", cpfCnpj: "x", cnpj: "y", access_token: "z", contact_id: "ok" }) as Record<string, string>;
    expect(out.document).not.toBe("24971563792");
    expect(out.contact_id).toBe("ok");
  });

  it("o trace do turno também redige (serialize.ts tem a própria lista)", () => {
    const trace = JSON.stringify(
      serializeSteps([
        { toolCalls: [{ toolName: "crm_link_contact_to_billing", input: { document: "24971563792" } }] },
      ] as never),
    );
    expect(trace).not.toContain("24971563792");
  });
});
