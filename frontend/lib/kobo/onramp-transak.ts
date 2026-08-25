import { isMockMode } from "./api";

/**
 * Origins Transak's widget is allowed to postMessage from.
 *
 * TODO(backend): confirm the exact origin(s) for the Transak environment actually
 * wired up (these are Transak's publicly documented staging/production hosts, not
 * yet verified against this integration). Never widen this to accept messages from
 * an unverified origin.
 */
const TRANSAK_ORIGINS = ["https://global.transak.com", "https://global-stg.transak.com"];

/** In mock mode only, our own same-origin stand-in widget page is also trusted. */
export function allowedOnrampOrigins(): string[] {
  if (isMockMode() && typeof window !== "undefined") {
    return [...TRANSAK_ORIGINS, window.location.origin];
  }
  return TRANSAK_ORIGINS;
}

export type TransakBridgeEvent =
  | { kind: "order-created" }
  | { kind: "order-successful" }
  | { kind: "order-failed" }
  | { kind: "widget-closed" };

/**
 * Maps a raw Transak postMessage payload to a bridge event.
 *
 * TODO(backend/Transak docs): confirm these are the exact event_id values and
 * payload envelope Transak sends for the integration mode actually configured
 * (their SDK has shipped slightly different shapes across versions).
 */
export function parseTransakMessage(raw: unknown): TransakBridgeEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const eventId = (raw as Record<string, unknown>).event_id ?? (raw as Record<string, unknown>).eventId;
  switch (eventId) {
    case "TRANSAK_ORDER_CREATED":
      return { kind: "order-created" };
    case "TRANSAK_ORDER_SUCCESSFUL":
      return { kind: "order-successful" };
    case "TRANSAK_ORDER_FAILED":
      return { kind: "order-failed" };
    case "TRANSAK_WIDGET_CLOSE":
      return { kind: "widget-closed" };
    default:
      return null;
  }
}
