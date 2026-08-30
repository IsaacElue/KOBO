import { Router } from "express";
import { supabase } from "../lib/supabase";
import { isPlausibleSolanaAddress } from "../lib/validation";
import { resolveRecipientWallet } from "../lib/crossmint";

export const usersRouter = Router();

// "sender" is deliberately excluded here now — real senders go through
// POST /auth/signup, which creates the linked Supabase Auth account this
// route has no way to. This route is recipient-only: recipients are payees,
// not logged-in accounts, and still don't need one.
const VALID_ROLES = ["recipient"] as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

usersRouter.post("/", async (req, res) => {
  const { name, role, country, wallet_address, email } = req.body ?? {};

  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "name is required" });
  }
  if (!role || typeof role !== "string" || !VALID_ROLES.includes(role as any)) {
    return res.status(400).json({
      error:
        role === "sender"
          ? "sender accounts are created via POST /auth/signup, not this endpoint"
          : `role must be one of: ${VALID_ROLES.join(", ")}`,
    });
  }
  if (!country || typeof country !== "string") {
    return res.status(400).json({ error: "country is required" });
  }

  // Two ways to arrive at a wallet_address: pasted directly (unchanged
  // behavior), or resolved from an email via Crossmint (new — see
  // lib/crossmint.ts). wallet_address wins if both are somehow sent; email
  // is only consulted when wallet_address is absent.
  let resolvedWalletAddress: string;

  if (wallet_address) {
    if (typeof wallet_address !== "string" || !isPlausibleSolanaAddress(wallet_address)) {
      return res.status(400).json({
        error: "wallet_address does not look like a valid Solana address",
      });
    }
    resolvedWalletAddress = wallet_address;
  } else if (email) {
    if (typeof email !== "string" || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: "email does not look like a valid email address" });
    }
    try {
      resolvedWalletAddress = await resolveRecipientWallet(email);
    } catch (err) {
      return res.status(502).json({
        error: `Failed to provision a wallet for this email: ${(err as Error).message}`,
      });
    }
  } else {
    return res.status(400).json({ error: "wallet_address or email is required" });
  }

  const { data, error } = await supabase
    .from("users")
    .insert({ name, role, country, wallet_address: resolvedWalletAddress })
    .select("id, name, role, country, wallet_address, created_at")
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(201).json(data);
});
