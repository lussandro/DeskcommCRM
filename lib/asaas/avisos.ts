/**
 * `ref_id` de `agent_inbox_items` é `uuid` (baseline.sql:6459), mas as chaves de
 * dedup do consumidor Asaas são texto (`customer_id` do Asaas, ou a data local
 * da org) — `resourceId` de audit e `ref_id` nunca recebem `pay_…`/`cus_…`
 * (ruling do controller). `chaveDeAviso` faz o texto virar um uuid v5
 * determinístico: mesmo `(kind, semente)` sempre produz o mesmo id, então
 * "existe aviso aberto com este ref_id" é dedup real, sem guardar o texto cru.
 */
import { createHash } from "node:crypto";

/** Namespace fixo do módulo — qualquer UUID serve, desde que nunca mude. */
const NAMESPACE_ASAAS = "6ba7b811-9dad-11d1-80b4-00c04fd430c8";

function bytesDoUuid(uuid: string): Buffer {
  return Buffer.from(uuid.replace(/-/g, ""), "hex");
}

/** UUID v5 (RFC 4122) determinístico sobre `NAMESPACE_ASAAS + kind + ":" + semente`. */
export function chaveDeAviso(kind: string, semente: string): string {
  const hash = createHash("sha1")
    .update(bytesDoUuid(NAMESPACE_ASAAS))
    .update(`${kind}:${semente}`, "utf8")
    .digest();
  const bytes = hash.subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50; // versão 5
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variante RFC 4122
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
