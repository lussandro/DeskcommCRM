"use client";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
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
import { contactPatchSchema, type ContactPatch } from "@/lib/schemas/contacts";
import { useUpdateContact } from "@/hooks/contacts/useUpdateContact";
import { CustomFieldsEditor, type CustomFieldDef } from "@/components/contacts/CustomFieldsEditor";
import { CompanyPicker, useTemEmpresas } from "@/components/companies/CompanyPicker";
import type { Contact } from "@/lib/types/contacts";
import { phoneForDisplay } from "@/lib/channels/phone-variants";

interface FormShape {
  name?: string;
  email?: string;
  phone_number?: string;
  tagsRaw?: string;
  custom_fields?: Record<string, unknown>;
  company_id?: string | null;
}

interface Props {
  contact: Contact;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Definições vindas de `crm_pipelines.settings.fields[]`. Vazio = a seção some. */
  customFieldDefs?: CustomFieldDef[];
}

export function EditContactDialog({ contact, open, onOpenChange, customFieldDefs = [] }: Props) {
  const t = useT();
  const update = useUpdateContact(contact.id);
  const temEmpresas = useTemEmpresas(open);
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<FormShape>({
    defaultValues: {
      name: contact.name ?? "",
      email: contact.email ?? "",
      phone_number: contact.phone_number ? phoneForDisplay(contact.phone_number) : "",
      tagsRaw: contact.tags.join(", "),
      custom_fields: contact.custom_fields ?? {},
      company_id: contact.company_id ?? null,
    },
  });

  const customFields = useWatch({ control: form.control, name: "custom_fields" });
  const companyId = useWatch({ control: form.control, name: "company_id" });

  useEffect(() => {
    if (open) {
      form.reset({
        name: contact.name ?? "",
        email: contact.email ?? "",
        phone_number: contact.phone_number ? phoneForDisplay(contact.phone_number) : "",
        tagsRaw: contact.tags.join(", "),
        custom_fields: contact.custom_fields ?? {},
        company_id: contact.company_id ?? null,
      });
    }
  }, [open, contact, form]);

  async function onSubmit(values: FormShape) {
    setServerError(null);
    const tags = (values.tagsRaw ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const payload: Record<string, unknown> = {};
    if (values.name?.trim()) payload.name = values.name.trim();
    if (values.email?.trim()) payload.email = values.email.trim();
    if (values.phone_number?.trim()) payload.phone_number = values.phone_number.trim();
    payload.tags = tags;
    // Sempre no payload, mesmo vazio: o PATCH SUBSTITUI, e é assim que apagar um
    // campo pela tela chega ao banco.
    payload.custom_fields = values.custom_fields ?? {};
    // company_id só entra se mudou: evita PATCH desnecessário quando a org não
    // usa empresas (campo nem renderiza) ou quando o usuário não tocou nele.
    if ((values.company_id ?? null) !== (contact.company_id ?? null)) {
      payload.company_id = values.company_id ?? null;
    }

    const parsed = contactPatchSchema.safeParse(payload);
    if (!parsed.success) {
      setServerError(parsed.error.issues[0]?.message ?? t("Dados inválidos"));
      return;
    }
    try {
      await update.mutateAsync(parsed.data as ContactPatch);
      toast.success(t("Contato atualizado"));
      onOpenChange(false);
    } catch {
      // hook handles toast
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Editar contato")}</DialogTitle>
          <DialogDescription>{t("Atualize os dados deste contato.")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ec-name">{t("Nome")}</Label>
            <Input id="ec-name" {...form.register("name")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ec-email">Email</Label>
            <Input id="ec-email" type="email" {...form.register("email")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ec-phone">{t("Telefone (E.164)")}</Label>
            <Input id="ec-phone" {...form.register("phone_number")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ec-tags">Tags</Label>
            <Input id="ec-tags" {...form.register("tagsRaw")} />
          </div>
          {temEmpresas && (
            <div className="space-y-2">
              <Label htmlFor="ec-company">{t("Empresa")}</Label>
              <CompanyPicker
                value={companyId ?? null}
                onChange={(v) => form.setValue("company_id", v, { shouldDirty: true })}
              />
            </div>
          )}
          {customFieldDefs.length > 0 && (
            <div className="space-y-3 rounded-md border border-border p-3">
              <div>
                <h3 className="text-sm font-medium">{t("Campos personalizados")}</h3>
                <p className="text-xs text-muted-foreground">
                  {t("Campos definidos no funil padrão da organização.")}
                </p>
              </div>
              <CustomFieldsEditor
                fields={customFieldDefs}
                mode="contact"
                value={customFields ?? {}}
                onChange={(next) => form.setValue("custom_fields", next, { shouldDirty: true })}
              />
            </div>
          )}
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
