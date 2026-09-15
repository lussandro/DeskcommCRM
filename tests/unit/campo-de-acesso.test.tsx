import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CampoDeAcesso } from "@/components/auth/CampoDeAcesso";

describe("CampoDeAcesso", () => {
  afterEach(() => cleanup());

  it("campo de e-mail repassa id, type e autoComplete, e o ícone é decorativo", () => {
    const { container } = render(<CampoDeAcesso icone="email" id="email" type="email" autoComplete="email" placeholder="seu@email.com" />);
    const input = container.querySelector("input#email");
    expect(input?.getAttribute("type")).toBe("email");
    expect(input?.getAttribute("autocomplete")).toBe("email");
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("campo de senha alterna mostrar/ocultar sem perder o id", () => {
    const { container } = render(<CampoDeAcesso icone="senha" id="password" autoComplete="current-password" />);
    const input = () => container.querySelector("input#password");
    expect(input()?.getAttribute("type")).toBe("password");

    // Nome sem "senha": `getByLabel("Senha")`/`/senha/i` dos e2e casaria o botão junto com o campo.
    const botao = screen.getByRole("button", { name: "Mostrar" });
    expect(botao.getAttribute("aria-pressed")).toBe("false");
    expect(botao.getAttribute("aria-controls")).toBe("password");
    fireEvent.click(botao);

    expect(input()?.getAttribute("type")).toBe("text");
    const ocultar = screen.getByRole("button", { name: "Ocultar" });
    expect(ocultar.getAttribute("aria-pressed")).toBe("true");
    expect(ocultar.getAttribute("type")).toBe("button");
  });
});
