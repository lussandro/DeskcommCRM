import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { trilhaDaEtiqueta, type TrilhaDeEtiqueta } from "@/lib/etiquetas/cor";
import { cn } from "@/lib/utils";

// Classes LITERAIS: o Tailwind só gera utilitário para o que aparece escrito no fonte.
const CLASSES: Record<TrilhaDeEtiqueta, string> = {
  1: "bg-etiqueta-1-bg text-etiqueta-1-fg",
  2: "bg-etiqueta-2-bg text-etiqueta-2-fg",
  3: "bg-etiqueta-3-bg text-etiqueta-3-fg",
  4: "bg-etiqueta-4-bg text-etiqueta-4-fg",
  5: "bg-etiqueta-5-bg text-etiqueta-5-fg",
  6: "bg-etiqueta-6-bg text-etiqueta-6-fg",
};

/** Tag de contato/conversa com a cor da trilha calculada pelo nome. */
export function Etiqueta({ nome, className, children }: { nome: string; className?: string; children?: ReactNode }) {
  return (
    <Badge variant="outline" className={cn("border-transparent", CLASSES[trilhaDaEtiqueta(nome)], className)}>
      {nome}
      {children}
    </Badge>
  );
}
