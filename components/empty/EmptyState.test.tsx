import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ChatCircle } from "@/lib/ui/icons";

import { EmptyState } from "./EmptyState";

describe("EmptyState editorial", () => {
  afterEach(() => cleanup());

  it("sem os campos novos, nada muda: ícone, título comum, sem imagem", () => {
    const { container } = render(<EmptyState icon={ChatCircle} headline="Quadro vazio" />);
    expect(screen.getByRole("heading", { name: "Quadro vazio" }).className).not.toContain("font-display");
    expect(container.querySelector("[data-ilustracao]")).toBeNull();
    expect(container.querySelector("figure")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("editorial: título serifado, gravura decorativa em CSS e citação", () => {
    const { container } = render(
      <EmptyState icon={ChatCircle} headline="Selecione uma conversa" editorial ilustracao="vinhedo" citacao="Mais que clientes, apreciadores de boas histórias." />,
    );
    expect(screen.getByRole("heading", { name: "Selecione uma conversa" }).className).toContain("font-display");
    const ilustracao = container.querySelector("[data-ilustracao='vinhedo']");
    expect(ilustracao).not.toBeNull();
    expect(ilustracao?.getAttribute("aria-hidden")).toBe("true");
    expect(ilustracao?.className).toContain("/ilustracoes/vinhedo-claro.webp");
    expect(ilustracao?.className).toContain("/ilustracoes/vinhedo-escuro.webp");
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("figure blockquote")?.textContent).toBe("“Mais que clientes, apreciadores de boas histórias.”");
  });
});
