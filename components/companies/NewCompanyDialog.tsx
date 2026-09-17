"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useT } from "@/hooks/i18n/useT";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { companyCreateSchema } from "@/lib/schemas/companies";
import type { CompanyCreate } from "@/lib/schemas/companies";
import { useCreateCompany } from "@/hooks/companies/useCreateCompany";
import type { Company } from "@/lib/types/companies";

interface FormShape {
  name: string;
  trade_name?: string;
  cnpj?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Quando informado, a empresa criada volta aqui em vez de navegar até ela. */
  onCreated?: (company: Company) => void;
}

export function NewCompanyDialog({ open, onOpenChange, onCreated }: Props) {
  const t = useT();
  const router = useRouter();
  const create = useCreateCompany();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<FormShape>({
    defaultValues: { name: "", trade_name: "", cnpj: "" },
  });

  async function onSubmit(values: FormShape) {
    setServerError(null);
    const payload: Record<string, unknown> = { name: values.name.trim() };
    if (values.trade_name?.trim()) payload.trade_name = values.trade_name.trim();
    if (values.cnpj?.trim()) payload.cnpj = values.cnpj.trim();

    const parsed = companyCreateSchema.safeParse(payload);
    if (!parsed.success) {
      setServerError(parsed.error.issues[0]?.message ?? t("Dados inválidos"));
      return;
    }

    try {
      const resposta = await create.mutateAsync(parsed.data as CompanyCreate);
      toast.success(t("Empresa criada"));
      form.reset();
      onOpenChange(false);
      if (resposta?.data && onCreated) onCreated(resposta.data);
      else if (resposta?.data?.id) router.push(`/app/companies/${resposta.data.id}`);
    } catch {
      // hook handles toast
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Nova empresa")}</DialogTitle>
          <DialogDescription>{t("Cadastre a empresa para agrupar os contatos deste cliente.")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="co-name">{t("Nome")}</Label>
            <Input id="co-name" {...form.register("name", { required: true })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="co-trade-name">{t("Nome fantasia")}</Label>
            <Input id="co-trade-name" {...form.register("trade_name")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="co-cnpj">CNPJ</Label>
            <Input id="co-cnpj" placeholder="00000000000000" {...form.register("cnpj")} />
          </div>
          {serverError && <p className="text-sm text-error-fg">{serverError}</p>}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={create.isPending}
            >
              {t("Cancelar")}
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? t("Criando…") : t("Criar empresa")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
