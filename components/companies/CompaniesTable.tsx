"use client";

import Link from "next/link";
import { useT } from "@/hooks/i18n/useT";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatarCnpj } from "@/lib/companies/cnpj";
import type { Company } from "@/lib/types/companies";

interface Props {
  companies: Company[];
  /** Coluna "Asaas" só aparece com o módulo ativo (spec §5.2a) — aditivo. */
  asaasAtivo: boolean;
}

export function CompaniesTable({ companies, asaasAtivo }: Props) {
  const t = useT();
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("Nome")}</TableHead>
          <TableHead>{t("Nome fantasia")}</TableHead>
          <TableHead>CNPJ</TableHead>
          <TableHead>{t("Contatos")}</TableHead>
          {asaasAtivo && <TableHead>Asaas</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {companies.map((c) => (
          <TableRow key={c.id}>
            <TableCell className="font-medium">
              <Link href={`/app/companies/${c.id}`} className="hover:underline">
                {c.name}
              </Link>
            </TableCell>
            <TableCell className="text-muted-foreground">{c.trade_name ?? "—"}</TableCell>
            <TableCell className="text-muted-foreground">
              {c.cnpj ? formatarCnpj(c.cnpj) : "—"}
            </TableCell>
            <TableCell className="text-muted-foreground">{c.contacts_count ?? 0}</TableCell>
            {asaasAtivo && (
              <TableCell className="text-muted-foreground">
                {c.asaas_customer_id ? t("Vinculado") : "—"}
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
