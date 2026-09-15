import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ler = (f: string) => fs.readFileSync(path.join(process.cwd(), f), "utf8");

describe("inbox no padrão editorial do kit", () => {
  it("o centro sem conversa usa o EmptyState editorial com gravura e citação", () => {
    const fonte = ler("components/inbox/InboxLayout.tsx");
    expect(fonte).toMatch(/<EmptyState[\s\S]*?editorial[\s\S]*?ilustracao="vinhedo"[\s\S]*?citacao=/);
    expect(fonte).toMatch(/text-text-muted">\{t\("Ou navegue com J e K"\)\}/);
  });

  it("o painel do contato vazio fala só do que existe e desenha a imagem em CSS", () => {
    const fonte = ler("components/inbox/CRMSidePanel.tsx");
    expect(fonte).toContain("Selecione um contato");
    expect(fonte).toContain("/ilustracoes/citacao-claro.webp");
    expect(fonte).not.toContain("Selecione uma conversa para ver detalhes do contato.");
    expect(fonte).not.toMatch(/Compras e hist|Clube e assinaturas|Prefer.ncias de vinho/);
  });

  it("conversa selecionada e contador de aba usam os tokens do kit", () => {
    const item = ler("components/inbox/ConversationListItem.tsx");
    expect(item).toContain("border border-transparent border-b-border/70");
    expect(item).toMatch(/isSelected && "bg-accent-soft hover:bg-accent-soft dark:border-accent-800 dark:border-b-accent-800"/);
    expect(ler("components/inbox/InboxFilters.tsx")).toMatch(/rounded-full bg-accent-soft[^"]*text-accent-text/);
  });
});
