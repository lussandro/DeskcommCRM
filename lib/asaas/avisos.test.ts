import { describe, expect, it } from "vitest";
import { chaveDeAviso } from "./avisos";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("chaveDeAviso", () => {
  it("é um uuid v5 válido", () => {
    expect(chaveDeAviso("charge_unmatched", "cus_123")).toMatch(UUID_RE);
  });

  it("é determinístico — mesma entrada, mesma saída", () => {
    expect(chaveDeAviso("charge_unmatched", "cus_123")).toBe(chaveDeAviso("charge_unmatched", "cus_123"));
  });

  it("kinds diferentes produzem ids diferentes para a mesma semente", () => {
    expect(chaveDeAviso("charge_unmatched", "cus_123")).not.toBe(chaveDeAviso("charge_overdue_no_flow", "cus_123"));
  });

  it("sementes diferentes produzem ids diferentes", () => {
    expect(chaveDeAviso("charge_unmatched", "cus_123")).not.toBe(chaveDeAviso("charge_unmatched", "cus_456"));
  });
});
