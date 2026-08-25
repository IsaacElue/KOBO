import { Router } from "express";
import { supabase } from "../lib/supabase";
import { verifyWebhook } from "../lib/transak";
import {
  NonRetryableTransferError,
  pollConfirmation,
  sendUsdcTransfer,
  sleep,
} from "../lib/solana";

export const webhooksRouter = Router();

const MAX_SEND_ATTEMPTS = 3;

async function markFailed(transferId: string, failureReason: string) {
  console.error(`Transfer ${transferId} marked failed: ${failureReason}`);
  const { data, error } = await supabase
    .from("transfers")
    .update({ status: "failed", failure_reason: failureReason })
    .eq("id", transferId)
    .select()
    .single();
  if (error) throw error;
  return data;
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

  // partnerOrderId is the transfer id we passed at session-creation time —
  // the most direct correlation. Fall back to matching our stored
  // onramp_session_id against Transak's order id if partnerOrderId wasn't
  // echoed back (unconfirmed against a live payload — see verifyWebhook doc
  // comment in lib/transak.ts).
  const transfer_id = webhookData.partnerOrderId ?? null;
  const onramp_session_id = webhookData.id ?? null;

  if (!transfer_id && !onramp_session_id) {
    return res.status(400).json({ error: "Webhook payload has no partnerOrderId or order id to match against" });
  }

  const lookupQuery = supabase
    .from("transfers")
    .select("id, recipient_id, amount_usdc, status, solana_tx_signature, retry_count");

  const { data: transfer, error: fetchError } = transfer_id
    ? await lookupQuery.eq("id", transfer_id).maybeSingle()
    : await lookupQuery.eq("onramp_session_id", onramp_session_id).maybeSingle();

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

  const { data: recipient, error: recipientError } = await supabase
    .from("users")
    .select("id, wallet_address")
    .eq("id", transfer.recipient_id)
    .maybeSingle();

  if (recipientError) {
    return res.status(500).json({ error: recipientError.message });
  }
  if (!recipient) {
    return res.status(404).json({ error: "Recipient not found" });
  }

  const { error: onrampUpdateError } = await supabase
    .from("transfers")
    .update({ status: "onramp_complete", onramp_reference: webhookData.id ?? null })
    .eq("id", transferId);

  if (onrampUpdateError) {
    return res.status(500).json({ error: onrampUpdateError.message });
  }

  // Idempotency guard — the critical piece against double-sends. If a
  // signature is already on the row (e.g. a prior attempt broadcast the
  // transaction but a later step in this handler failed), don't send
  // again, just proceed to confirm/finalize.
  let signature = transfer.solana_tx_signature ?? null;

  if (!signature) {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt++) {
      try {
        signature = await sendUsdcTransfer(recipient.wallet_address, transfer.amount_usdc);
        break;
      } catch (err) {
        if (err instanceof NonRetryableTransferError) {
          const failed = await markFailed(transferId, err.message);
          return res.status(422).json(failed);
        }

        lastError = err instanceof Error ? err : new Error(String(err));

        const { error: retryCountError } = await supabase
          .from("transfers")
          .update({ retry_count: attempt })
          .eq("id", transferId);
        if (retryCountError) {
          return res.status(500).json({ error: retryCountError.message });
        }

        if (attempt < MAX_SEND_ATTEMPTS) {
          const backoffMs = 1000 * 2 ** (attempt - 1); // 1s, 2s
          console.warn(
            `Transient Solana send error on attempt ${attempt}/${MAX_SEND_ATTEMPTS} for transfer ${transferId}: ${lastError.message}. Retrying in ${backoffMs}ms.`
          );
          await sleep(backoffMs);
        }
      }
    }

    if (!signature) {
      const failed = await markFailed(
        transferId,
        `Transient Solana error, exhausted ${MAX_SEND_ATTEMPTS} attempts: ${lastError?.message}`
      );
      return res.status(502).json(failed);
    }
  }

  const { error: sentUpdateError } = await supabase
    .from("transfers")
    .update({ status: "sent", solana_tx_signature: signature })
    .eq("id", transferId);

  if (sentUpdateError) {
    return res.status(500).json({ error: sentUpdateError.message });
  }

  let confirmResult: "confirmed" | "timeout";
  try {
    confirmResult = await pollConfirmation(signature, 45000);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : `Confirmation failed: ${err}`;
    const failed = await markFailed(transferId, message);
    return res.status(502).json(failed);
  }

  if (confirmResult === "timeout") {
    console.warn(
      `Transfer ${transferId} signature ${signature} not confirmed within timeout. ` +
        "Leaving status 'sent' — the transaction may still land; check explorer.solana.com/?cluster=devnet."
    );
    const { data: sent, error: sentFetchError } = await supabase
      .from("transfers")
      .select()
      .eq("id", transferId)
      .single();
    if (sentFetchError) {
      return res.status(500).json({ error: sentFetchError.message });
    }
    return res.status(202).json(sent);
  }

  const { data: confirmed, error: confirmUpdateError } = await supabase
    .from("transfers")
    .update({ status: "confirmed" })
    .eq("id", transferId)
    .select()
    .single();

  if (confirmUpdateError) {
    return res.status(500).json({ error: confirmUpdateError.message });
  }

  // Chain is confirmed at this point — balances table is our display layer
  // from here, not re-derived from Solana on every read.
  const { data: existingBalance, error: balanceFetchError } = await supabase
    .from("balances")
    .select("id, usdc_balance")
    .eq("user_id", transfer.recipient_id)
    .maybeSingle();

  if (balanceFetchError) {
    return res.status(500).json({ error: balanceFetchError.message });
  }

  const newBalance = (existingBalance?.usdc_balance ?? 0) + transfer.amount_usdc;

  const { error: balanceUpsertError } = await supabase.from("balances").upsert(
    {
      ...(existingBalance ? { id: existingBalance.id } : {}),
      user_id: transfer.recipient_id,
      usdc_balance: newBalance,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (balanceUpsertError) {
    return res.status(500).json({ error: balanceUpsertError.message });
  }

  return res.json(confirmed);
});
