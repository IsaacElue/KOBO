import { Router } from "express";
import { supabase } from "../lib/supabase";
import { createWidgetSession } from "../lib/transak";

export const transfersRouter = Router();

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// PLACEHOLDER conversion rate — Person A's on-ramp integration will supply
// the real quoted rate per transfer. Swap this out before launch.
const PLACEHOLDER_EUR_TO_USDC_RATE = 1.08;

transfersRouter.post("/", async (req, res) => {
  const { sender_id, recipient_id, amount_eur } = req.body ?? {};

  if (!sender_id || !recipient_id || typeof amount_eur !== "number") {
    return res.status(400).json({
      error: "sender_id, recipient_id, and numeric amount_eur are required",
    });
  }

  if (!UUID_RE.test(sender_id)) {
    return res.status(400).json({ error: "sender_id must be a valid UUID" });
  }
  if (!UUID_RE.test(recipient_id)) {
    return res.status(400).json({ error: "recipient_id must be a valid UUID" });
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

  const { data: recipient, error: recipientError } = await supabase
    .from("users")
    .select("id, wallet_address")
    .eq("id", recipient_id)
    .maybeSingle();

  if (recipientError) {
    return res.status(500).json({ error: recipientError.message });
  }
  if (!recipient) {
    return res.status(400).json({ error: "Recipient not found" });
  }

  const amount_usdc = Number(
    (amount_eur * PLACEHOLDER_EUR_TO_USDC_RATE).toFixed(6)
  );

  const { data: transfer, error: insertError } = await supabase
    .from("transfers")
    .insert({
      sender_id,
      recipient_id,
      amount_eur,
      amount_usdc,
      status: "pending",
    })
    .select()
    .single();

  if (insertError) {
    return res.status(500).json({ error: insertError.message });
  }

  let onramp: { sessionId: string | null; widgetUrl: string };
  try {
    onramp = await createWidgetSession({
      amountEur: amount_eur,
      recipientWalletAddress: recipient.wallet_address,
      partnerOrderId: transfer.id,
      userIp: req.ip || "127.0.0.1",
    });
  } catch (err) {
    // Session creation failed — don't leave a transfer row with no way to
    // ever fund it. Roll back rather than leaving orphaned 'pending' state.
    await supabase.from("transfers").delete().eq("id", transfer.id);
    return res.status(502).json({
      error: `Failed to create Transak widget session: ${(err as Error).message}`,
    });
  }

  const { data: updated, error: updateError } = await supabase
    .from("transfers")
    .update({ onramp_session_id: onramp.sessionId })
    .eq("id", transfer.id)
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

transfersRouter.get("/:id", async (req, res) => {
  const { id } = req.params;

  if (!UUID_RE.test(id)) {
    return res.status(400).json({ error: "id must be a valid UUID" });
  }

  const { data, error } = await supabase
    .from("transfers")
    .select(
      "id, status, solana_tx_signature, amount_eur, amount_usdc, failure_reason, retry_count, onramp_session_id, onramp_reference, created_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  if (!data) {
    return res.status(404).json({ error: "Transfer not found" });
  }

  return res.json(data);
});
