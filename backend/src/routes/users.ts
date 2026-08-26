import { Router } from "express";
import { supabase } from "../lib/supabase";
import { isPlausibleSolanaAddress } from "../lib/validation";

export const usersRouter = Router();

// "sender" is deliberately excluded here now — real senders go through
// POST /auth/signup, which creates the linked Supabase Auth account this
// route has no way to. This route is recipient-only: recipients are payees,
// not logged-in accounts, and still don't need one.
const VALID_ROLES = ["recipient"] as const;

usersRouter.post("/", async (req, res) => {
  const { name, role, country, wallet_address } = req.body ?? {};

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
  if (!wallet_address || typeof wallet_address !== "string") {
    return res.status(400).json({ error: "wallet_address is required" });
  }
  if (!isPlausibleSolanaAddress(wallet_address)) {
    return res.status(400).json({
      error: "wallet_address does not look like a valid Solana address",
    });
  }

  const { data, error } = await supabase
    .from("users")
    .insert({ name, role, country, wallet_address })
    .select("id, name, role, country, wallet_address, created_at")
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(201).json(data);
});
