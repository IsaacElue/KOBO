import type { Request } from "express";
import { Router } from "express";
import { supabase } from "../lib/supabase";
import { getMarketRate } from "../lib/transak";
import { createOnrampSession } from "../lib/onramp";
import { backendWallet } from "../lib/solana";
import { getBalance } from "../lib/balances";
import { requireAuth, resolveKoboUser } from "../lib/auth";

export const fundingRouter = Router();

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The end user's public IP, for MoonPay's `allowedIpAddress` requirement.
 * `req.ip` already resolves through Express's `trust proxy` setting
 * (`app.set("trust proxy", …)` in index.ts) — the leftmost client entry of
 * `X-Forwarded-For` on a PaaS/CDN, the socket address locally. We only strip
 * the IPv4-mapped-IPv6 prefix and fall back to the raw first XFF hop if `req.ip`
 * somehow comes back empty; anything loopback/private is handled downstream in
 * `lib/moonpay.ts` (which requires the override env for local dev).
 */
function resolveClientIp(req: Request): string {
  const stripV6 = (ip: string) => ip.replace(/^::ffff:/, "").trim();
  const direct = stripV6(req.ip ?? "");
  if (direct) return direct;
  const xff = String(req.headers["x-forwarded-for"] ?? "").split(",")[0];
  return stripV6(xff);
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

  const koboUser = await resolveKoboUser(req.authUser!.id);
  if (!koboUser) {
    return res.status(403).json({ error: "No sender account linked to this session" });
  }
  if (koboUser.id !== sender_id) {
    return res.status(403).json({ error: "sender_id does not match the authenticated user" });
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

  const { data: fundingRequest, error: insertError } = await supabase
    .from("funding_requests")
    .insert({ sender_id, amount_eur, amount_usdc, status: "pending" })
    .select()
    .single();

  if (insertError) {
    return res.status(500).json({ error: insertError.message });
  }

  let onramp: { sessionId: string | null; widgetUrl: string };
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
    });
  } catch (err) {
    // Session creation failed — don't leave a funding request row with no
    // way to ever fund it. Roll back rather than leaving orphaned 'pending' state.
    await supabase.from("funding_requests").delete().eq("id", fundingRequest.id);
    return res.status(502).json({
      error: `Failed to create on-ramp widget session: ${(err as Error).message}`,
    });
  }

  const { data: updated, error: updateError } = await supabase
    .from("funding_requests")
    .update({ onramp_session_id: onramp.sessionId })
    .eq("id", fundingRequest.id)
    .select()
    .single();

  if (updateError) {
    return res.status(500).json({ error: updateError.message });
  }

  return res.status(201).json({
    ...updated,
    onramp: {
      sessionId: onramp.sessionId,
      widgetUrl: onramp.widgetUrl,
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

  const { data, error } = await supabase
    .from("funding_requests")
    .select(
      "id, sender_id, amount_eur, amount_usdc, status, onramp_session_id, onramp_reference, failure_reason, created_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return res.status(500).json({ error: error.message });
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
