import * as moonpay from "./moonpay";
import * as transak from "./transak";

/**
 * Active on-ramp provider selector. MoonPay is current; Transak is kept intact
 * and reachable by flipping one env var (`ONRAMP_PROVIDER=transak`), in case
 * Ramp Network comes back with Ireland/SEPA confirmed and we swap again before
 * Demo Day. Provider-specific detail lives in the `moonpay` / `transak`
 * modules; `POST /funding` only ever calls through here.
 *
 * Webhook verification is NOT routed through this module — each provider has
 * its own webhook route (`POST /webhooks/moonpay`, `POST /webhooks/onramp`),
 * both mounted at once, since a provider swap is a dashboard change on their
 * side and there's no harm in the other route staying live.
 */

export type OnrampProvider = "moonpay" | "transak";

export const ONRAMP_PROVIDER: OnrampProvider =
  process.env.ONRAMP_PROVIDER === "transak" ? "transak" : "moonpay";

/**
 * The explicit rail for a funding attempt. `ONRAMP_PROVIDER` remains the
 * server-wide default; a request may select a rail explicitly (Phase 1: the
 * API accepts `rail`, the UX later maps human-friendly funding methods to
 * rails). Only hosted-session rails are implemented today — `coinbase`
 * /`sepa`/`stripe` are reserved values validated by the migration but rejected
 * here until their phases land.
 */
export type FundingRail =
  | "moonpay"
  | "transak"
  | "coinbase"
  | "sepa"
  | "stripe";

export const FUNDING_RAILS: readonly FundingRail[] = [
  "moonpay",
  "transak",
  "coinbase",
  "sepa",
  "stripe",
] as const;

/**
 * Rails with a real, working implementation behind them. `FUNDING_RAILS` is
 * the full, known set (what the type system and the DB constraint accept);
 * this is the subset `POST /funding` may actually use today. Checking this
 * *before* doing any work (rate quote, DB insert) is what lets the route
 * return a clean `501` for `coinbase`/`sepa`/`stripe` instead of creating a
 * `funding_requests` row it already knows can never succeed.
 */
export const IMPLEMENTED_RAILS: readonly FundingRail[] = ["moonpay", "transak"];

export function isImplementedRail(rail: FundingRail): boolean {
  return IMPLEMENTED_RAILS.includes(rail);
}

export interface OnrampSessionParams {
  amountEur: number;
  /** Destination wallet — for funding this is Kobo's pooled backend wallet. */
  walletAddress: string;
  /** Correlation id echoed back on the provider's webhook — a `funding_requests.id`. */
  reference: string;
  /** End user's public IP as this server sees it (resolveClientIp in the funding route). */
  userIp: string;
  /**
   * The IP MoonPay observed from the browser (from the frontend's own
   * `/v4/ip_address` call). MoonPay-only; Transak ignores it. Null when the
   * browser lookup failed.
   */
  clientObservedIp?: string | null;
  /** Explicit rail for this request. Defaults to the ONRAMP_PROVIDER env. */
  rail?: FundingRail;
}

export interface OnrampSessionResult {
  widgetUrl: string;
  sessionId: string | null;
}

/**
 * Builds a provider widget URL/session for a funding top-up. Same return shape
 * regardless of provider: `{ widgetUrl, sessionId }`, the exact shape the
 * frontend already consumes from `POST /funding`.
 *
 * Phase 1: the rail is now the explicit selector — `params.rail` wins, else
 * the `ONRAMP_PROVIDER` env default (preserves pre-refactor behavior exactly).
 * `coinbase`/`sepa`/`stripe` are valid reserved values but not implemented
 * yet; if explicitly requested, this throws (the funding route 502s rather
 * than silently falling back to a different provider).
 */
export async function createOnrampSession(
  params: OnrampSessionParams
): Promise<OnrampSessionResult> {
  const rail = params.rail ?? ONRAMP_PROVIDER;

  if (rail === "transak") {
    return transak.createWidgetSession({
      amountEur: params.amountEur,
      recipientWalletAddress: params.walletAddress,
      partnerOrderId: `fund_${params.reference}`,
      userIp: params.userIp,
    });
  }

  if (rail === "moonpay") {
    return moonpay.createOnrampSession({
      amountEur: params.amountEur,
      walletAddress: params.walletAddress,
      reference: params.reference,
      userIp: params.userIp,
      clientObservedIp: params.clientObservedIp ?? null,
    });
  }

  throw new Error(
    `Funding rail '${rail}' is reserved but not implemented yet ` +
      `(Phase 1 implements only moonpay and transak)`
  );
}
