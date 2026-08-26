import { supabase } from "./supabase";
import { creditBalance } from "./balances";
import { NonRetryableTransferError, pollConfirmation, sendUsdcTransfer, sleep } from "./solana";

const MAX_SEND_ATTEMPTS = 3;

export interface SettlementResult {
  httpStatus: number;
  body: unknown;
}

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

/**
 * Executes the Solana send -> confirm -> recipient-balance-credit pipeline
 * for a transfer that's already known to be funded — either Transak's real
 * ORDER_COMPLETED webhook fired (the original flow), or the sender's real
 * internal balance covered it (instant send, `routes/transfers.ts`). The
 * settlement mechanics — retry/idempotency/confirmation/failure handling —
 * are identical either way; only how the transfer got funded differs. This
 * is the exact logic `routes/webhooks.ts` used to run inline; extracted here
 * so both callers reuse it rather than forking a second copy.
 *
 * Never throws for an ordinary send failure — a failed send still returns a
 * normal result with the `failed` transfer row in the body, same as any
 * other outcome, so a failure is always visible/reported, never swallowed.
 * Only rethrows on unexpected Supabase errors (a bug, not a send failure).
 */
export async function settleTransfer(transfer: {
  id: string;
  recipient_id: string;
  amount_usdc: number;
  solana_tx_signature: string | null;
}): Promise<SettlementResult> {
  const transferId = transfer.id;

  const { data: recipient, error: recipientError } = await supabase
    .from("users")
    .select("id, wallet_address")
    .eq("id", transfer.recipient_id)
    .maybeSingle();

  if (recipientError) {
    return { httpStatus: 500, body: { error: recipientError.message } };
  }
  if (!recipient) {
    return { httpStatus: 404, body: { error: "Recipient not found" } };
  }

  // Idempotency guard — the critical piece against double-sends. If a
  // signature is already on the row (e.g. a prior attempt broadcast the
  // transaction but a later step failed), don't send again, just proceed to
  // confirm/finalize.
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
          return { httpStatus: 422, body: failed };
        }

        lastError = err instanceof Error ? err : new Error(String(err));

        const { error: retryCountError } = await supabase
          .from("transfers")
          .update({ retry_count: attempt })
          .eq("id", transferId);
        if (retryCountError) {
          return { httpStatus: 500, body: { error: retryCountError.message } };
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
      return { httpStatus: 502, body: failed };
    }
  }

  const { error: sentUpdateError } = await supabase
    .from("transfers")
    .update({ status: "sent", solana_tx_signature: signature })
    .eq("id", transferId);

  if (sentUpdateError) {
    return { httpStatus: 500, body: { error: sentUpdateError.message } };
  }

  let confirmResult: "confirmed" | "timeout";
  try {
    confirmResult = await pollConfirmation(signature, 45000);
  } catch (err) {
    const message = err instanceof Error ? err.message : `Confirmation failed: ${err}`;
    const failed = await markFailed(transferId, message);
    return { httpStatus: 502, body: failed };
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
      return { httpStatus: 500, body: { error: sentFetchError.message } };
    }
    return { httpStatus: 202, body: sent };
  }

  const { data: confirmed, error: confirmUpdateError } = await supabase
    .from("transfers")
    .update({ status: "confirmed" })
    .eq("id", transferId)
    .select()
    .single();

  if (confirmUpdateError) {
    return { httpStatus: 500, body: { error: confirmUpdateError.message } };
  }

  // Chain is confirmed at this point — balances table is our display layer
  // from here, not re-derived from Solana on every read.
  try {
    await creditBalance(transfer.recipient_id, transfer.amount_usdc);
  } catch (err) {
    return { httpStatus: 500, body: { error: err instanceof Error ? err.message : String(err) } };
  }

  return { httpStatus: 200, body: confirmed };
}
