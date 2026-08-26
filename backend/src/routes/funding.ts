import { Router } from "express";
import { supabase } from "../lib/supabase";
import { createWidgetSession, getMarketRate } from "../lib/transak";
import { backendWallet } from "../lib/solana";
import { getBalance } from "../lib/balances";

export const fundingRouter = Router();

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Same pattern as POST /transfers' session creation, reused as-is
// (createWidgetSession) — the only difference is the destination wallet:
// Kobo's own pooled backend wallet instead of a recipient's, and the
// partnerOrderId is prefixed ("fund_...") so POST /webhooks/onramp can tell
// a top-up apart from a send without an extra lookup.
fundingRouter.post("/", async (req, res) => {
  const { sender_id, amount_eur } = req.body ?? {};

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

  const { data: sender, error: senderError } = await supabase
    .from("users")
    .select("id")
    .eq("id", sender_id)
    .maybeSingle();

  if (senderError) {
    return res.status(500).json({ error: senderError.message });
  }
  if (!sender) {
    return res.status(400).json({ error: "Sender not found" });
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
    onramp = await createWidgetSession({
      amountEur: amount_eur,
      recipientWalletAddress: backendWallet.publicKey.toBase58(),
      partnerOrderId: `fund_${fundingRequest.id}`,
      userIp: req.ip || "127.0.0.1",
    });
  } catch (err) {
    // Session creation failed — don't leave a funding request row with no
    // way to ever fund it. Roll back rather than leaving orphaned 'pending' state.
    await supabase.from("funding_requests").delete().eq("id", fundingRequest.id);
    return res.status(502).json({
      error: `Failed to create Transak widget session: ${(err as Error).message}`,
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
fundingRouter.get("/:id", async (req, res) => {
  const { id } = req.params;

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

  let balance: number;
  try {
    balance = await getBalance(data.sender_id);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }

  return res.json({ ...data, balance });
});
