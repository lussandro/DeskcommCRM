"use client";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
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
import { Textarea } from "@/components/ui/textarea";
import { companyPatchSchema, type CompanyPatch } from "@/lib/schemas/companies";
import { useUpdateCompany } from "@/hooks/companies/useUpdateCompany";
import type { Company } from "@/lib/types/companies";

interface FormShape {
  name: string;
  trade_name?: string;
  cnpj?: string;
  notes?: string;
}

interface Props {
  company: Company;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function EditCompanyDialog({ company, open, onOpenChange }: Props) {
  const t = useT();
  const update = useUpdateCompany(company.id);
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<FormShape>({
    defaultValues: {
      name: company.name,
      trade_name: company.trade_name ?? "",
      cnpj: company.cnpj ?? "",
      notes: company.notes ?? "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        name: company.name,
        trade_name: company.trade_name ?? "",
        cnpj: company.cnpj ?? "",
        notes: company.notes ?? "",
      });
    }
  }, [open, company, form]);

  async function onSubmit(values: FormShape) {
    setServerError(null);
    const payload: Record<string, unknown> = { name: values.name.trim() };
    payload.trade_name = values.trade_name?.trim() || null;
    payload.cnpj = values.cnpj?.trim() || null;
    payload.notes = values.notes?.trim() || null;

    const parsed = companyPatchSchema.safeParse(payload);
    if (!parsed.success) {
      setServerError(parsed.error.issues[0]?.message ?? t("Dados inválidos"));
      return;
    }
    try {
      await update.mutateAsync(parsed.data as CompanyPatch);
      toast.success(t("Empresa atualizada"));
      onOpenChange(false);
    } catch {
      // hook handles toast
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Editar empresa")}</DialogTitle>
          <DialogDescription>{t("Atualize os dados desta empresa.")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ec-co-name">{t("Nome")}</Label>
            <Input id="ec-co-name" {...form.register("name", { required: true })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ec-co-trade-name">{t("Nome fantasia")}</Label>
            <Input id="ec-co-trade-name" {...form.register("trade_name")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ec-co-cnpj">CNPJ</Label>
            <Input id="ec-co-cnpj" {...form.register("cnpj")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ec-co-notes">{t("Observações")}</Label>
            <Textarea id="ec-co-notes" {...form.register("notes")} />
          </div>
          {serverError && <p className="text-sm text-error-fg">{serverError}</p>}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={update.isPending}
            >
              {t("Cancelar")}
            </Button>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? t("Salvando…") : t("Salvar")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
