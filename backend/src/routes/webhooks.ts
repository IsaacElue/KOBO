import type { Request } from "express";
import { Router } from "express";
import { supabase } from "../lib/supabase";
import { verifyWebhook } from "../lib/transak";
import { verifyWebhook as verifyMoonPayWebhook } from "../lib/moonpay";
import { creditBalance } from "../lib/balances";
import { fundingDb, type FundingRequestDb } from "../lib/funding-repo";
import type { FundingRail } from "../lib/onramp";
import { settleTransfer } from "../lib/settlement";

export const webhooksRouter = Router();

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Correlation ids for funding sessions (POST /funding) are prefixed so this
// handler can tell "top up my own balance" apart from "send to a recipient"
// without an extra lookup — a funding request has no recipient_id and never
// triggers a Solana send from here, it only credits the sender's balance.
const FUNDING_PREFIX = "fund_";

/**
 * Handles a confirmed *funding* webhook: credits the sender's balance.
 * Claims the funding request first (conditional update, status must still be
 * 'pending') before crediting — unlike a Solana send, crediting a balance has
 * no natural idempotency key, so a retried/duplicate webhook call must be
 * blocked from crediting twice by the row's own status transition instead.
 *
 * Phase 1: `opts.expectedRail` must match the row's own `rail` — a webhook
 * arriving on `/webhooks/moonpay` may only settle a funding request that was
 * actually created via the `moonpay` rail, and likewise for `/webhooks/onramp`
 * (Transak). Without this check, a funding request id becoming known/guessable
 * across the wrong webhook route could be settled by the wrong provider's
 * confirmation. `db` defaults to the real Supabase-backed repository; tests
 * inject `FakeFundingDb` to exercise this logic with no network/DB.
 */
export async function handleFundingWebhook(
  fundingRequestId: string,
  opts: {
    /** The provider's own transaction id, stored as `onramp_reference`. */
    reference: string | null;
    /**
     * The USDC actually delivered, when the provider's webhook reports it
     * (MoonPay's `quoteCurrencyAmount`). Preferred over the row's pre-purchase
     * estimate for the credit. Falls back to `amount_usdc` when absent
     * (Transak's payload didn't reliably carry this).
     */
    creditedUsdc?: number | null;
    /** Which rail this webhook route belongs to — must match the row's `rail`. */
    expectedRail: FundingRail;
  },
  db: FundingRequestDb = fundingDb
): Promise<{ status: number; body: unknown }> {
  let fundingRequest;
  try {
    fundingRequest = await db.getById(fundingRequestId);
  } catch (fetchError) {
    return { status: 500, body: { error: (fetchError as Error).message } };
  }
  if (!fundingRequest) {
    return { status: 404, body: { error: "No funding request matches this webhook's partnerOrderId/session" } };
  }
  if (fundingRequest.rail !== opts.expectedRail) {
    return {
      status: 409,
      body: {
        error: `Funding request rail is '${fundingRequest.rail}', but this webhook arrived on the '${opts.expectedRail}' route`,
      },
    };
  }
  if (fundingRequest.status !== "pending") {
    return {
      status: 409,
      body: { error: `Funding request is in status '${fundingRequest.status}', expected 'pending'` },
    };
  }
  if (!fundingRequest.amount_usdc) {
    return { status: 422, body: { error: "Funding request has no amount_usdc set" } };
  }

  let claimed;
  try {
    claimed = await db.claim(fundingRequestId, {
      status: "confirmed",
      onramp_reference: opts.reference,
    });
  } catch (claimError) {
    return { status: 500, body: { error: (claimError as Error).message } };
  }
  if (!claimed) {
    return { status: 409, body: { error: "Funding request already processed (concurrent webhook)" } };
  }

  const amountToCredit =
    typeof opts.creditedUsdc === "number" && opts.creditedUsdc > 0
      ? opts.creditedUsdc
      : fundingRequest.amount_usdc;

  try {
    await creditBalance(fundingRequest.sender_id, amountToCredit);
  } catch (err) {
    // Claimed but the credit itself failed — don't leave it silently stuck
    // 'confirmed' with nothing actually credited. Visible and reported, not
    // swallowed, same principle as a failed transfer.
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Funding request ${fundingRequestId} claimed but balance credit failed: ${message}`);
    await db.markFailed(fundingRequestId, message);
    return { status: 500, body: { error: message } };
  }

  return { status: 200, body: claimed };
}

// Real Transak on-ramp completion callback. The payload's `data` field is a
// JWT signed with our Partner Access Token — verify it before trusting
// anything in it. See docs.transak.com/features/webhooks and
// docs.transak.com/guides/how-to-decrypt-webhook-payload.
webhooksRouter.post("/onramp", async (req, res) => {
  let decoded;
  try {
    decoded = await verifyWebhook(req.body);
  } catch (err) {
    console.error(`Rejected unsigned/invalid Transak webhook: ${(err as Error).message}`);
    return res.status(401).json({ error: "Invalid webhook signature" });
  }

  const { eventID, webhookData } = decoded;

  // Only ORDER_COMPLETED means "payment received and crypto sent" per
  // Transak's docs. Ack other lifecycle events (ORDER_CREATED,
  // ORDER_PROCESSING, ORDER_FAILED, etc.) with 200 so Transak doesn't
  // retry, but don't run the transfer pipeline for them.
  if (eventID !== "ORDER_COMPLETED") {
    return res.status(200).json({ received: true, eventID });
  }

  // partnerOrderId is the transfer/funding id we passed at session-creation
  // time — the most direct correlation. Fall back to matching our stored
  // onramp_session_id against Transak's order id if partnerOrderId wasn't
  // echoed back (unconfirmed against a live payload — see verifyWebhook doc
  // comment in lib/transak.ts).
  const partnerOrderId: string | null = webhookData.partnerOrderId ?? null;
  const onrampSessionId: string | null = webhookData.id ?? null;

  if (!partnerOrderId && !onrampSessionId) {
    return res.status(400).json({ error: "Webhook payload has no partnerOrderId or order id to match against" });
  }

  if (partnerOrderId?.startsWith(FUNDING_PREFIX)) {
    const fundingRequestId = partnerOrderId.slice(FUNDING_PREFIX.length);
    const result = await handleFundingWebhook(fundingRequestId, {
      reference: webhookData.id ?? null,
      expectedRail: "transak",
    });
    return res.status(result.status).json(result.body);
  }

  if (!partnerOrderId) {
    // No partnerOrderId echoed back — check whether this session belongs to
    // a pending funding request before assuming it's a transfer. Collision
    // risk between the two tables' onramp_session_id values is effectively
    // zero: each is a unique Transak session id, generated once, for
    // exactly one purpose.
    const { data: fundingBySession, error: fundingLookupError } = await supabase
      .from("funding_requests")
      .select("id")
      .eq("onramp_session_id", onrampSessionId)
      .maybeSingle();
    if (fundingLookupError) {
      return res.status(500).json({ error: fundingLookupError.message });
    }
    if (fundingBySession) {
      const result = await handleFundingWebhook(fundingBySession.id, {
        reference: webhookData.id ?? null,
        expectedRail: "transak",
      });
      return res.status(result.status).json(result.body);
    }
  }

  const lookupQuery = supabase
    .from("transfers")
    .select("id, recipient_id, amount_usdc, status, solana_tx_signature, retry_count");

  const { data: transfer, error: fetchError } = partnerOrderId
    ? await lookupQuery.eq("id", partnerOrderId).maybeSingle()
    : await lookupQuery.eq("onramp_session_id", onrampSessionId).maybeSingle();

  if (fetchError) {
    return res.status(500).json({ error: fetchError.message });
  }
  if (!transfer) {
    return res.status(404).json({ error: "No transfer matches this webhook's partnerOrderId/session" });
  }
  if (transfer.status !== "pending") {
    return res.status(409).json({
      error: `Transfer is in status '${transfer.status}', expected 'pending'`,
    });
  }
  if (!transfer.amount_usdc) {
    return res.status(422).json({ error: "Transfer has no amount_usdc set" });
  }

  const transferId = transfer.id;

  const { error: onrampUpdateError } = await supabase
    .from("transfers")
    .update({ status: "onramp_complete", onramp_reference: webhookData.id ?? null })
    .eq("id", transferId);

  if (onrampUpdateError) {
    return res.status(500).json({ error: onrampUpdateError.message });
  }

  const result = await settleTransfer(transfer);
  return res.status(result.httpStatus).json(result.body);
});

// Real MoonPay on-ramp completion callback (current provider — see
// lib/onramp.ts). MoonPay → backend only, not called by the frontend.
// Signature is an HMAC over the raw request bytes (Moonpay-Signature-V2) — the
// raw body is captured as req.rawBody in index.ts; verify before trusting
// anything in the payload. MoonPay is only ever used for funding (transfers
// are instant, no on-ramp), so every valid webhook here routes to the funding
// pipeline — no partnerOrderId-style prefix disambiguation needed.
webhooksRouter.post("/moonpay", async (req, res) => {
  const rawBody = (req as Request & { rawBody?: string }).rawBody ?? "";

  let payload;
  try {
    payload = verifyMoonPayWebhook(rawBody, req.header("Moonpay-Signature-V2"));
  } catch (err) {
    console.error(`Rejected unsigned/invalid MoonPay webhook: ${(err as Error).message}`);
    return res.status(401).json({ error: "Invalid webhook signature" });
  }

  const { type, data } = payload;

  // A buy transaction reaching status "completed" is the ORDER_COMPLETED
  // equivalent — payment settled and USDC delivered on-chain. Every other
  // event/status (transaction_created, still pending, waitingAuthorization,
  // etc.) is ack'd 200 so MoonPay stops retrying, but nothing is credited.
  // transaction_failed lands the row in 'failed' with the reason.
  if (type === "transaction_failed" || data.status === "failed") {
    if (data.externalTransactionId && UUID_RE.test(data.externalTransactionId)) {
      await supabase
        .from("funding_requests")
        .update({
          status: "failed",
          failure_reason: data.failureReason ?? "MoonPay reported the purchase failed",
        })
        .eq("id", data.externalTransactionId)
        .eq("status", "pending");
    }
    return res.status(200).json({ received: true, type, status: data.status });
  }

  if (data.status !== "completed") {
    return res.status(200).json({ received: true, type, status: data.status });
  }

  const fundingRequestId = data.externalTransactionId;
  if (!fundingRequestId || !UUID_RE.test(fundingRequestId)) {
    return res.status(400).json({
      error: "Webhook payload has no externalTransactionId matching a funding request",
    });
  }

  const result = await handleFundingWebhook(fundingRequestId, {
    reference: data.id,
    creditedUsdc: data.quoteCurrencyAmount,
    expectedRail: "moonpay",
  });
  return res.status(result.status).json(result.body);
});
