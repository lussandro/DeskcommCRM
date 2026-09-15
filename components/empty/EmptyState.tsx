"use client";

import Link from "next/link";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";

export interface EmptyStateAction {
  label: string;
  onClick?: () => void;
  href?: string;
}

export interface EmptyStateProps {
  icon: PhosphorIcon;
  headline: string;
  subcopy?: string;
  primary?: EmptyStateAction;
  secondary?: EmptyStateAction;
  /** Modo editorial (kit Bacco): título Playfair, gravura e citação. */
  editorial?: boolean;
  ilustracao?: "vinhedo";
  citacao?: string;
}

function ActionButton({
  action,
  variant,
}: {
  action: EmptyStateAction;
  variant?: "default" | "outline";
}) {
  if (action.href) {
    return (
      <Button asChild variant={variant}>
        <Link href={action.href}>{action.label}</Link>
      </Button>
    );
  }
  return (
    <Button type="button" onClick={action.onClick} variant={variant}>
      {action.label}
    </Button>
  );
}

export function EmptyState({
  icon: Icon,
  headline,
  subcopy,
  primary,
  secondary,
  editorial,
  ilustracao,
  citacao,
}: EmptyStateProps) {
  // A tradução mora AQUI, no ponto de render, e não em `variants.tsx`: as
  // variantes são chamadas de função com texto literal, e envolvê-las uma a uma
  // deixaria a próxima variante nova sem tradução por esquecimento. Aqui todas
  // passam pelo mesmo lugar — e `t()` devolve a chave intacta para as que ainda
  // não têm entrada, então nenhuma variante piora.
  const t = useT();
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {ilustracao === "vinhedo" ? (
        <div
          data-ilustracao="vinhedo"
          aria-hidden="true"
          className="mb-2 aspect-[625/305] w-full max-w-[34rem] bg-[url('/ilustracoes/vinhedo-claro.webp')] bg-contain bg-center bg-no-repeat dark:bg-[url('/ilustracoes/vinhedo-escuro.webp')]"
        />
      ) : (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon size={24} weight="duotone" />
        </div>
      )}
      <h3 className={editorial ? "font-display text-2xl font-semibold text-text" : "text-base font-semibold"}>
        {t(headline)}
      </h3>
      {subcopy ? (
        <p className={editorial ? "mt-2 max-w-md text-sm text-text-muted" : "mt-1 max-w-sm text-sm text-muted-foreground"}>
          {t(subcopy)}
        </p>
      ) : null}
      {(primary || secondary) && (
        <div className="mt-4 flex gap-2">
          {secondary ? <ActionButton action={secondary} variant="outline" /> : null}
          {primary ? <ActionButton action={primary} variant="default" /> : null}
        </div>
      )}
      {citacao ? (
        <figure className="mt-8">
          <blockquote className="font-display text-base italic text-gold-text">“{t(citacao)}”</blockquote>
          <span aria-hidden="true" className="mx-auto mt-3 block h-px w-12 bg-gold" />
        </figure>
      ) : null}
    </div>
  );
}
