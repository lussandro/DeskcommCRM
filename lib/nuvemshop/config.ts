/**
 * Nuvemshop integration — static configuration + env-derived credentials.
 *
 * Env vars `NUVEMSHOP_APP_ID`, `NUVEMSHOP_CLIENT_ID`, `NUVEMSHOP_CLIENT_SECRET`
 * are intentionally optional at build time. `getConfig()` returns null when any
 * of them is missing — callers must surface a `not_configured` error and the UI
 * shows a "configure env" card. Once Rafael drops in real keys, the integration
 * activates without code changes.
 */

export const NUVEMSHOP_AUTH_BASE = "https://www.tiendanube.com";
export const NUVEMSHOP_API_BASE = "https://api.tiendanube.com/v1";
export const APP_USER_AGENT = "DeskcommCRM (rafael@maudibrasil.com.br)";

export interface NuvemshopConfig {
  appId: string;
  clientId: string;
  clientSecret: string;
}

export function getConfig(): NuvemshopConfig | null {
  const appId = process.env.NUVEMSHOP_APP_ID || "";
  const clientId = process.env.NUVEMSHOP_CLIENT_ID || "";
  const clientSecret = process.env.NUVEMSHOP_CLIENT_SECRET || "";
  if (!appId || !clientId || !clientSecret) return null;
  return { appId, clientId, clientSecret };
}

export function isConfigured(): boolean {
  return getConfig() !== null;
}

/**
 * Mandatory webhook events to subscribe at OAuth callback time. LGPD-specific
 * events (`store/redact`, `customers/redact`, `customers/data_request`) are
 * deferred to EPIC-08.
 */
/**
 * Os webhooks que a loja assina ao conectar (Sub-PRD 06 §3.4, Spec §4.6).
 *
 * ⚠️ ASSINAR E CONSUMIR SÃO LISTAS QUE PRECISAM CONCORDAR. `order/fulfilled` e
 * `cart/abandoned` estavam na spec e FORA desta lista: o consumidor os trata e
 * eles nunca chegariam — evento tratado que a loja não manda é código morto que
 * parece funcionalidade. O par é medido por `lib/nuvemshop/config.test.ts`.
 *
 * `product/*` e `app/uninstalled` não entram: nenhum consumidor os lê hoje, e
 * webhook assinado sem consumidor é o inverso do mesmo defeito — ruído no
 * `event_log` que ninguém processa.
 */
export const SUBSCRIBED_EVENTS = [
  "order/created",
  "order/paid",
  "order/cancelled",
  "order/fulfilled",
  "cart/abandoned",
] as const;

export type NuvemshopEvent = (typeof SUBSCRIBED_EVENTS)[number];

/**
 * URL-safe slug used in the catch-all webhook route segment. Nuvemshop allows
 * arbitrary URLs per webhook, but we want one route per event for legibility
 * and per-event observability. Slashes -> hyphens.
 */
export function eventToSlug(event: NuvemshopEvent): string {
  return event.replace("/", "-");
}

const SLUG_TO_EVENT: Record<string, NuvemshopEvent> = Object.fromEntries(
  SUBSCRIBED_EVENTS.map((e) => [eventToSlug(e), e]),
);

export function slugToEvent(slug: string): NuvemshopEvent | null {
  return SLUG_TO_EVENT[slug] ?? null;
}
