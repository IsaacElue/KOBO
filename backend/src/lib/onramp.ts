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

export interface OnrampSessionParams {
  amountEur: number;
  /** Destination wallet — for funding this is Kobo's pooled backend wallet. */
  walletAddress: string;
  /** Correlation id echoed back on the provider's webhook — a `funding_requests.id`. */
  reference: string;
  /** End user's public IP (see resolveClientIp in the funding route). */
  userIp: string;
}

export interface OnrampSessionResult {
  widgetUrl: string;
  sessionId: string | null;
}

/**
 * Builds a provider widget URL/session for a funding top-up. Same return shape
 * regardless of provider: `{ widgetUrl, sessionId }`, the exact shape the
 * frontend already consumes from `POST /funding`.
 */
export async function createOnrampSession(
  params: OnrampSessionParams
): Promise<OnrampSessionResult> {
  if (ONRAMP_PROVIDER === "transak") {
    return transak.createWidgetSession({
      amountEur: params.amountEur,
      recipientWalletAddress: params.walletAddress,
      partnerOrderId: `fund_${params.reference}`,
      userIp: params.userIp,
    });
  }
  return moonpay.createOnrampSession({
    amountEur: params.amountEur,
    walletAddress: params.walletAddress,
    reference: params.reference,
    userIp: params.userIp,
  });
}
