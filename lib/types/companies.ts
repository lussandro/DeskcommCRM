export interface Company {
  id: string;
  organization_id: string;
  name: string;
  trade_name: string | null;
  cnpj: string | null;
  asaas_customer_id: string | null;
  billing_contact_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  /** Derivado no GET de lista/detalhe. */
  contacts_count?: number;
}

export interface CompanyContact {
  id: string;
  name: string | null;
  display_name: string | null;
  phone_number: string | null;
  email: string | null;
  is_billing_contact: boolean;
}
