import type { Request } from "express";
import { Router } from "express";
import { supabase } from "../lib/supabase";
import { verifyWebhook } from "../lib/transak";
import { verifyWebhook as verifyMoonPayWebhook } from "../lib/moonpay";
import {
  verifyCrossmintWebhookSignature,
  CrossmintWebhookUnconfiguredError,
  parseCrossmintWebhookEnvelope,
  extractSettledUsdcAmount,
  extractRecipientWallet,
  type CrossmintWebhookHeaders,
} from "../lib/crossmint-onramp";
import { creditBalance } from "../lib/balances";
import { fundingDb, type FundingRequestDb } from "../lib/funding-repo";
import type { FundingRail } from "../lib/onramp";
import { settleTransfer } from "../lib/settlement";
import { backendWallet } from "../lib/solana";

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

// One single-line, compact (no pretty-print newlines) console.log call per
// received event — Railway's log ingestion splits on newlines into separate
// log records regardless of how many console.log calls produced them, so a
// pretty-printed multi-line JSON.stringify becomes many separate records
// that can interleave with another concurrent delivery's records and
// corrupt on reconstruction (observed empirically during the earlier
// observation-only phase). Compact JSON has zero embedded newlines, so it
// is always exactly one record, immune to interleaving.
function logCrossmintWebhook(payload: unknown, svixId: string | undefined): void {
  console.log(`CROSSMINT WEBHOOK [svix-id=${svixId ?? "none"}]: ${JSON.stringify(payload)}`);
}

const CROSSMINT_FAILURE_TYPES = new Set(["orders.payment.failed", "orders.delivery.failed"]);
const CROSSMINT_SUCCESS_TYPES = new Set(["orders.payment.succeeded", "orders.delivery.completed"]);

/**
 * Real Crossmint Onramp webhook handler (KOBO — CROSSMINT FRONTEND
 * INTEGRATION, Step 1). Verifies the Svix signature (the one piece of the
 * contract confirmed from docs), validates the envelope shape (known from
 * real captured deliveries — see lib/crossmint-onramp.ts), then:
 *
 *   - orders.payment.failed / orders.delivery.failed → atomically claim
 *     pending -> failed, store the real failureReason, never credit.
 *   - orders.payment.succeeded / orders.delivery.completed → defensive,
 *     gated. Recipient wallet must match Kobo's pooled wallet. A settled
 *     amount is extracted (see extractSettledUsdcAmount — best-effort,
 *     unverified) and crediting only happens when BOTH a sane amount was
 *     found AND CROSSMINT_ENABLE_CREDIT=true. Otherwise: pending ->
 *     manual_review, zero credit, never invents a number.
 *   - anything else (orders.quote.created, etc.) → 200 ack, no state change.
 *
 * Any type in the failure/success sets that can't be correlated to a
 * pending 'crossmint'-rail row 404s/409s exactly like handleFundingWebhook,
 * whose claim-once semantics this reuses directly for the credit path.
 */
export async function handleCrossmintWebhook(
  rawBody: string,
  headers: CrossmintWebhookHeaders,
  db: FundingRequestDb = fundingDb
): Promise<{ status: number; body: unknown }> {
  try {
    verifyCrossmintWebhookSignature(rawBody, headers);
  } catch (err) {
    if (err instanceof CrossmintWebhookUnconfiguredError) {
      console.error(
        "Crossmint webhook received but CROSSMINT_WEBHOOK_SECRET is not set yet " +
          "— cannot verify, rejecting."
      );
      return { status: 503, body: { error: "Webhook receiver not yet configured" } };
    }
    console.error(`Rejected unsigned/invalid Crossmint webhook: ${(err as Error).message}`);
    return { status: 401, body: { error: "Invalid webhook signature" } };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(rawBody);
  } catch {
    console.error(`Crossmint webhook signature valid but body is not valid JSON, ${rawBody.length} bytes`);
    return { status: 400, body: { error: "Malformed JSON payload" } };
  }

  logCrossmintWebhook(raw, headers.svixId);

  const envelope = parseCrossmintWebhookEnvelope(raw);
  if (!envelope) {
    console.error("Crossmint webhook: signature valid but payload doesn't match the known envelope shape (missing type or data.orderId)");
    return { status: 400, body: { error: "Payload missing required fields (type, data.orderId)" } };
  }

  const { type, data } = envelope;
  const orderId = data.orderId;

  if (!CROSSMINT_FAILURE_TYPES.has(type) && !CROSSMINT_SUCCESS_TYPES.has(type)) {
    return { status: 200, body: { received: true, type, handled: false } };
  }

  let fundingRequest;
  try {
    fundingRequest = await db.getBySessionId(orderId);
  } catch (err) {
    return { status: 500, body: { error: (err as Error).message } };
  }
  if (!fundingRequest) {
    return { status: 404, body: { error: "No funding request matches this webhook's orderId" } };
  }
  if (fundingRequest.rail !== "crossmint") {
    return {
      status: 409,
      body: { error: `Funding request rail is '${fundingRequest.rail}', but this webhook is Crossmint's` },
    };
  }
  if (fundingRequest.status !== "pending") {
    return { status: 409, body: { error: `Funding request already processed (status '${fundingRequest.status}')` } };
  }

  if (CROSSMINT_FAILURE_TYPES.has(type)) {
    const fr = data.payment?.failureReason;
    const reason = fr
      ? `Crossmint ${fr.category ?? "unknown-category"}/${fr.code ?? "unknown-code"}: ${fr.message ?? "no message"}`
      : `Crossmint reported ${type} with no failureReason detail`;
    const claimed = await db.claim(fundingRequest.id, { status: "failed", failure_reason: reason });
    if (!claimed) {
      return { status: 409, body: { error: "Funding request already processed (concurrent webhook)" } };
    }
    return { status: 200, body: claimed };
  }

  // SUCCESS path — defensive, gated (see module + function doc comments).
  const recipientWallet = extractRecipientWallet(data);
  const pooledWallet = backendWallet.publicKey.toBase58();
  if (recipientWallet !== pooledWallet) {
    console.error(
      `Crossmint success webhook for order ${orderId}: recipient wallet ` +
        `${recipientWallet ?? "(missing)"} does not match pooled wallet ${pooledWallet}`
    );
    return { status: 409, body: { error: "Recipient wallet on the webhook payload does not match Kobo's pooled wallet" } };
  }

  const settledUsdc = extractSettledUsdcAmount(data);
  const creditEnabled = process.env.CROSSMINT_ENABLE_CREDIT === "true";

  if (!settledUsdc || !creditEnabled) {
    const reasonNote = !settledUsdc
      ? "no confidently-identified settled amount in the payload"
      : "CROSSMINT_ENABLE_CREDIT is false";
    console.warn(`Crossmint success webhook for order ${orderId}: NOT crediting (${reasonNote}) — routing to manual_review.`);
    const claimed = await db.claim(fundingRequest.id, {
      status: "manual_review",
      failure_reason: `Crossmint reported ${type} but ${reasonNote} — needs manual review, not auto-credited.`,
    });
    if (!claimed) {
      return { status: 409, body: { error: "Funding request already processed (concurrent webhook)" } };
    }
    return { status: 200, body: claimed };
  }

  // Flag on + a sane settled amount — reuse the exact MoonPay claim/credit
  // pattern (atomic claim-once, then credit; claim failure still 409s).
  return handleFundingWebhook(
    fundingRequest.id,
    { reference: orderId, creditedUsdc: settledUsdc, expectedRail: "crossmint" },
    db
  );
}

webhooksRouter.post("/crossmint", async (req, res) => {
  const rawBody = (req as Request & { rawBody?: string }).rawBody ?? "";
  const result = await handleCrossmintWebhook(rawBody, {
    svixId: req.header("svix-id") ?? undefined,
    svixTimestamp: req.header("svix-timestamp") ?? undefined,
    svixSignature: req.header("svix-signature") ?? undefined,
  });
  return res.status(result.status).json(result.body);
});
