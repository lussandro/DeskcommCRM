"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { useT } from "@/hooks/i18n/useT";
import { Envelope, Eye, EyeSlash, Lock } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

type Props = React.ComponentProps<"input"> & { icone: "email" | "senha" };

/**
 * Campo das telas de acesso (spec Bacco §4.2): ícone à esquerda e, em senha, um botão REAL
 * de mostrar/ocultar (troca o `type`). Todas as outras props — `id`, `autoComplete`,
 * `aria-invalid`, o `ref`/`onChange` do `register` — passam intactas ao `Input`.
 */
export const CampoDeAcesso = React.forwardRef<HTMLInputElement, Props>(function CampoDeAcesso(
  { icone, className, type, ...props },
  ref,
) {
  const t = useT();
  const [visivel, setVisivel] = React.useState(false);
  const ehSenha = icone === "senha";
  const Icone = ehSenha ? Lock : Envelope;

  return (
    <div className="relative">
      <Icone
        aria-hidden
        size={18}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle"
      />
      <Input
        ref={ref}
        type={ehSenha ? (visivel ? "text" : "password") : type}
        className={cn("pl-10", ehSenha && "pr-11", className)}
        {...props}
      />
      {ehSenha && (
        <button
          type="button"
          onClick={() => setVisivel((v) => !v)}
          aria-label={visivel ? t("Ocultar") : t("Mostrar")}
          aria-controls={props.id}
          aria-pressed={visivel}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1.5 text-text-subtle hover:text-text focus-visible:outline-2 focus-visible:outline-accent-text"
        >
          {visivel ? <EyeSlash aria-hidden size={18} /> : <Eye aria-hidden size={18} />}
        </button>
      )}
    </div>
  );
});
