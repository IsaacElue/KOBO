/**
 * Provider-agnostic on-ramp helpers. The backend hands back a single
 * `widgetUrl` (see `POST /funding`) and the frontend decides how to open it;
 * which provider it is can be read from the URL host.
 *
 * Transak-specific bits (postMessage parsing, trusted origins, the
 * width-based redirect/embed threshold) stay in `onramp-transak.ts`.
 */

/**
 * MoonPay's hosted widget must be opened as a **top-level redirect**, never an
 * inline iframe: its sign-in / captcha / 3DS steps are broken or badly
 * degraded when framed, and it loads several times slower embedded (measured
 * ~2s redirect vs ~15s in an iframe, with the Google sign-in option dropping).
 * MoonPay's own guidance is redirect / overlay. Transak's widget embeds fine,
 * so that path keeps its own redirect-vs-embed choice untouched.
 */
export function isMoonPayWidget(widgetUrl: string): boolean {
  try {
    return new URL(widgetUrl).hostname.endsWith("moonpay.com");
  } catch {
    return false;
  }
}

/** Display name of the on-ramp partner behind a widget URL, for handoff copy. */
export function onrampPartnerName(widgetUrl: string): string {
  return isMoonPayWidget(widgetUrl) ? "MoonPay" : "Transak";
}

// ── funding redirect round-trip ────────────────────────────────────────────
// When Add Funds redirects the whole tab out to the provider, we stash just
// enough to resume on the way back. MoonPay returns the user to
// MOONPAY_REDIRECT_URL with `?transactionId=…&transactionStatus=…` appended;
// the real completion signal is still `GET /funding/:id` (webhook-driven),
// never the redirect params.

const FUNDING_KEY = "kobo:funding-redirect";

export interface FundingRedirect {
  fundingId: string;
  amountEur: number;
}

export function saveFundingRedirect(v: FundingRedirect) {
  try {
    sessionStorage.setItem(FUNDING_KEY, JSON.stringify(v));
  } catch {
    // sessionStorage unavailable (private mode, etc.) — the return handler
    // then can't resume the overlay, but the webhook still credits the
    // balance and it shows on the next balance refresh.
  }
}

export function loadFundingRedirect(): FundingRedirect | null {
  try {
    const raw = sessionStorage.getItem(FUNDING_KEY);
    return raw ? (JSON.parse(raw) as FundingRedirect) : null;
  } catch {
    return null;
  }
}

export function clearFundingRedirect() {
  try {
    sessionStorage.removeItem(FUNDING_KEY);
  } catch {
    // ignore
  }
}
