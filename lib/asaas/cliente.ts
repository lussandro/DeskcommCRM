/**
 * O ÚNICO lugar que fala HTTP com o Asaas. Ferramentas, webhook e cron importam daqui.
 * Erro 4xx vira AsaasErro com `code`/`descricao` do Asaas — o texto vai inteiro ao usuário
 * (Regra nº 1). `nossoErro` separa erro de contrato (invalid_value/invalid_object/invalid_api_key)
 * de recusa legítima (invalid_action), que é resposta ao cliente e não alerta ao operador.
 */
import { ASAAS_BASE_URLS, type AsaasAmbiente, type AsaasCustomer, type AsaasList, type AsaasPayment, type AsaasWebhook } from "./tipos";

const CODIGOS_NOSSOS = new Set(["invalid_value", "invalid_object", "invalid_api_key"]);

export class AsaasErro extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string | null,
    public readonly descricao: string,
  ) {
    super(`Asaas ${status}${code ? ` ${code}` : ""}: ${descricao}`);
    this.name = "AsaasErro";
  }
  get nossoErro(): boolean {
    return this.status === 0 || this.status >= 500 || (this.code !== null && CODIGOS_NOSSOS.has(this.code));
  }
}

type Metodo = "GET" | "POST" | "PUT" | "DELETE";

export class AsaasCliente {
  private readonly base: string;
  private readonly timeoutMs: number;
  constructor(private readonly apiKey: string, ambiente: AsaasAmbiente, opts: { timeoutMs?: number } = {}) {
    this.base = ASAAS_BASE_URLS[ambiente];
    this.timeoutMs = opts.timeoutMs ?? 10_000;
  }

  async request<T>(method: Metodo, path: string, opts: { query?: Record<string, string | number>; body?: unknown } = {}): Promise<T> {
    const url = new URL(`${this.base}${path}`);
    for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, String(v));
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: { access_token: this.apiKey, "content-type": "application/json", accept: "application/json" },
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        signal: ctrl.signal,
      });
    } catch (err) {
      throw new AsaasErro(0, null, err instanceof Error && err.name === "AbortError" ? "O Asaas não respondeu em 10 segundos." : "Não foi possível falar com o Asaas.");
    } finally {
      clearTimeout(timer);
    }
    const texto = await res.text();
    let json: unknown = null;
    try { json = texto ? JSON.parse(texto) : null; } catch { json = null; }
    if (!res.ok) {
      const erros = (json as { errors?: Array<{ code?: string; description?: string }> } | null)?.errors ?? [];
      const primeiro = erros[0];
      throw new AsaasErro(res.status, primeiro?.code ?? null, primeiro?.description ?? `HTTP ${res.status}`);
    }
    return json as T;
  }

  customerPorDocumento(cpfCnpj: string) {
    return this.request<AsaasList<AsaasCustomer>>("GET", "/customers", { query: { cpfCnpj: cpfCnpj.replace(/\D/g, "") } });
  }
  customer(id: string) { return this.request<AsaasCustomer>("GET", `/customers/${encodeURIComponent(id)}`); }
  payments(customerId: string, status: string, offset = 0) {
    return this.request<AsaasList<AsaasPayment>>("GET", "/payments", { query: { customer: customerId, status, limit: 100, offset } });
  }
  /** Varredura por status em toda a conta (reconcile), não por cliente. `extra` carrega `paymentDate[ge]` etc — medido no sandbox. */
  paymentsPorStatus(status: string, offset = 0, extra: Record<string, string> = {}) {
    return this.request<AsaasList<AsaasPayment>>("GET", "/payments", { query: { status, limit: 100, offset, ...extra } });
  }
  payment(id: string) { return this.request<AsaasPayment>("GET", `/payments/${encodeURIComponent(id)}`); }
  /** Só BOLETO devolve linha digitável; em PIX o Asaas responde 400 `invalid_action` — medido no sandbox. */
  identificationField(id: string) { return this.request<{ identificationField: string; barCode?: string }>("GET", `/payments/${encodeURIComponent(id)}/identificationField`); }
  /** Funciona tanto para BOLETO (o boleto também tem Pix) quanto para PIX — medido no sandbox. */
  pixQrCode(id: string) { return this.request<{ payload: string; encodedImage?: string; expirationDate?: string }>("GET", `/payments/${encodeURIComponent(id)}/pixQrCode`); }
  alterarVencimento(id: string, dueDate: string) { return this.request<AsaasPayment>("PUT", `/payments/${encodeURIComponent(id)}`, { body: { dueDate } }); }
  balance() { return this.request<{ balance: number }>("GET", "/finance/balance"); }
  /** `limit=100` explícito: sem query, o Asaas pagina com o default dele — pouco demais para achar o webhook desta instalação numa conta com muitos cadastrados. */
  webhooks(limit = 100) { return this.request<AsaasList<AsaasWebhook>>("GET", "/webhooks", { query: { limit } }); }
  religarWebhook(id: string) { return this.request<AsaasWebhook>("PUT", `/webhooks/${encodeURIComponent(id)}`, { body: { interrupted: false } }); }
}
