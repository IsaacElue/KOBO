import type { Request } from "express";
import { Router } from "express";
import { getMarketRate } from "../lib/rates";
import {
  createOnrampSession,
  FUNDING_RAILS,
  isImplementedRail,
  ONRAMP_PROVIDER,
  type FundingRail,
} from "../lib/onramp";
import { backendWallet } from "../lib/solana";
import { getBalance } from "../lib/balances";
import { fundingDb } from "../lib/funding-repo";
import { requireAuth, resolveKoboUser } from "../lib/auth";

export const fundingRouter = Router();

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The end user's public IP, for MoonPay's `allowedIpAddress` requirement
 * (hashed before use — see lib/moonpay.ts's hashAllowedIp).
 *
 * Precedence (Phase 2, explicit per founder spec): X-Forwarded-For first hop
 * → CF-Connecting-IP → req.ip. Deployment assumptions, stated plainly:
 *   - Local dev: no proxy headers are set at all, so this always falls
 *     through to `req.ip`, which is loopback — MOONPAY_ALLOWED_IP_OVERRIDE
 *     exists precisely for this case (still hashed downstream).
 *   - Railway (current deploy target): sets X-Forwarded-For, not
 *     CF-Connecting-IP — this resolves from the first branch. `req.ip` would
 *     also work here (Express's `trust proxy` in index.ts is configured for
 *     Railway's proxy range), kept only as a final fallback.
 *   - A Cloudflare-fronted deploy (not current, included for
 *     forward-compatibility per founder spec): CF-Connecting-IP is Cloudflare's
 *     own resolved client IP, generally more trustworthy than a possibly
 *     multi-hop X-Forwarded-For — checked second in case a future deploy adds
 *     Cloudflare in front of Railway.
 * Not a general-purpose header-parsing utility — three fixed sources, in a
 * fixed order, documented here because that order is a real, debuggable
 * assumption, not because this needs to be reusable elsewhere.
 */
function resolveClientIp(req: Request): string {
  const stripV6 = (ip: string) => ip.replace(/^::ffff:/, "").trim();
  const xff = String(req.headers["x-forwarded-for"] ?? "").split(",")[0];
  if (stripV6(xff)) return stripV6(xff);
  const cfConnectingIp = String(req.headers["cf-connecting-ip"] ?? "");
  if (stripV6(cfConnectingIp)) return stripV6(cfConnectingIp);
  return stripV6(req.ip ?? "");
}

/**
 * Validates an explicit rail from the request body. Returns the parsed rail
 * or null when absent (caller defaults to ONRAMP_PROVIDER). Throws a
 * user-facing error string for an invalid value so the route can 400 cleanly.
 */
export function parseRail(raw: unknown): FundingRail | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") throw "rail must be a string";
  const normalized = raw.trim().toLowerCase() as FundingRail;
  if (!FUNDING_RAILS.includes(normalized)) {
    throw `rail must be one of: ${FUNDING_RAILS.join(", ")}`;
  }
  return normalized;
}

// Builds an on-ramp widget session (MoonPay by default — see lib/onramp.ts)
// whose destination is Kobo's own pooled backend wallet, not a recipient's.
// The funding request's own id is passed as the provider correlation
// reference so the completion webhook (POST /webhooks/moonpay) can match the
// row back without an extra lookup.
// A dotted-quad IPv4 or a colon-y IPv6 — just enough to reject junk before it
// reaches the widget-URL builder; not a strict validator.
const IP_RE = /^[0-9a-fA-F.:]{3,45}$/;

fundingRouter.post("/", requireAuth, async (req, res) => {
  const { sender_id, amount_eur, client_observed_ip } = req.body ?? {};

  if (!sender_id || typeof amount_eur !== "number") {
    return res.status(400).json({
      error: "sender_id and numeric amount_eur are required",
    });
  }
  if (amount_eur <= 0) {
    return res.status(400).json({ error: "amount_eur must be positive" });
  }
  if (!UUID_RE.test(sender_id)) {
    return res.status(400).json({ error: "sender_id must be a valid UUID" });
  }

  // Phase 1: the API accepts an explicit rail. Absent → the server-wide
  // ONRAMP_PROVIDER default (behavior unchanged for existing clients; the
  // frontend sends no rail today, and the UX will map human-friendly funding
  // methods → rails in a later phase — never exposing provider names).
  let rail: FundingRail | null;
  try {
    rail = parseRail(req.body?.rail);
  } catch (errorMessage) {
    return res.status(400).json({ error: errorMessage });
  }

  const koboUser = await resolveKoboUser(req.authUser!.id);
  if (!koboUser) {
    return res.status(403).json({ error: "No sender account linked to this session" });
  }
  if (koboUser.id !== sender_id) {
    return res.status(403).json({ error: "sender_id does not match the authenticated user" });
  }

  // Fail fast on a recognized-but-unimplemented rail (coinbase/sepa/stripe) —
  // before quoting a rate or writing a funding_requests row this attempt can
  // never actually complete. A clean 501, distinct from a genuine provider
  // failure (502, below) once session creation is actually attempted.
  const requestedRail = rail ?? ONRAMP_PROVIDER;
  if (!isImplementedRail(requestedRail)) {
    return res.status(501).json({
      error: `Funding rail '${requestedRail}' is recognized but not implemented yet`,
    });
  }

  let rate: number;
  try {
    rate = await getMarketRate("EUR");
  } catch (err) {
    return res.status(502).json({
      error: `Failed to fetch conversion rate: ${(err as Error).message}`,
    });
  }
  const amount_usdc = Number((amount_eur * rate).toFixed(6));

  // One resolved value, computed once above (requestedRail) and reused for
  // both the row and the session call below — they can never disagree about
  // which rail this is. (An earlier draft resolved this twice, independently,
  // and the two calls could disagree if ONRAMP_PROVIDER ever changed — fixed
  // before this reached main.)
  const resolvedRail: FundingRail = requestedRail;

  let fundingRequest;
  try {
    fundingRequest = await fundingDb.insert({
      sender_id,
      amount_eur,
      amount_usdc,
      status: "pending",
      rail: resolvedRail,
    });
  } catch (insertError) {
    return res.status(500).json({ error: (insertError as Error).message });
  }

  let onramp: Awaited<ReturnType<typeof createOnrampSession>>;
  try {
    onramp = await createOnrampSession({
      amountEur: amount_eur,
      walletAddress: backendWallet.publicKey.toBase58(),
      reference: fundingRequest.id,
      userIp: resolveClientIp(req),
      clientObservedIp:
        typeof client_observed_ip === "string" && IP_RE.test(client_observed_ip)
          ? client_observed_ip
          : null,
      // The exact rail already committed to the row above — not re-resolved,
      // so the session and the row can never disagree about which rail this is.
      rail: resolvedRail,
      // Crossmint-only (see lib/onramp.ts) — ignored by moonpay/transak.
      amountUsdc: amount_usdc,
      payerEmail: req.authUser?.email,
    });
  } catch (err) {
    // Session creation failed — don't leave a funding request row with no
    // way to ever fund it. Roll back rather than leaving orphaned 'pending' state.
    await fundingDb.markFailed(fundingRequest.id, (err as Error).message);
    return res.status(502).json({
      error: `Failed to create on-ramp widget session: ${(err as Error).message}`,
    });
  }

  let updated;
  try {
    updated = await fundingDb.updateSession(fundingRequest.id, onramp.sessionId);
  } catch (updateError) {
    return res.status(500).json({ error: (updateError as Error).message });
  }
  if (!updated) {
    return res.status(500).json({ error: "Funding request disappeared during session creation" });
  }

  return res.status(201).json({
    ...updated,
    onramp: {
      sessionId: onramp.sessionId,
      widgetUrl: onramp.widgetUrl,
      // Crossmint-only fields — undefined for moonpay/transak.
      checkoutClientSecret: onramp.checkoutClientSecret,
      paymentStatus: onramp.paymentStatus,
      kycInquiryId: onramp.kycInquiryId,
    },
  });
});

// Same pattern as GET /transfers/:id — poll this for live status. Also
// returns the sender's current real balance so the frontend doesn't need a
// second round-trip to GET /balances/:userId just to see the credited
// amount once `status` flips to 'confirmed'.
fundingRouter.get("/:id", requireAuth, async (req, res) => {
  const id = req.params.id as string;

  if (!UUID_RE.test(id)) {
    return res.status(400).json({ error: "id must be a valid UUID" });
  }

  let data;
  try {
    data = await fundingDb.getById(id);
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }

  if (!data) {
    return res.status(404).json({ error: "Funding request not found" });
  }

  const koboUser = await resolveKoboUser(req.authUser!.id);
  if (!koboUser || data.sender_id !== koboUser.id) {
    return res.status(403).json({ error: "This funding request does not belong to the authenticated user" });
  }

  let balance: number;
  try {
    balance = await getBalance(data.sender_id);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }

  return res.json({ ...data, balance });
});