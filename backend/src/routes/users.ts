import { Router } from "express";
import { PublicKey } from "@solana/web3.js";
import { supabase } from "../lib/supabase";

export const usersRouter = Router();

const VALID_ROLES = ["sender", "recipient"] as const;

function isPlausibleSolanaAddress(address: unknown): boolean {
  if (typeof address !== "string") return false;
  try {
    // Validates base58 charset and correct 32-byte length — not an
    // on-chain existence check, just a format check.
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

usersRouter.post("/", async (req, res) => {
  const { name, role, country, wallet_address } = req.body ?? {};

  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "name is required" });
  }
  if (!role || typeof role !== "string" || !VALID_ROLES.includes(role as any)) {
    return res.status(400).json({
      error: `role must be one of: ${VALID_ROLES.join(", ")}`,
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
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(201).json(data);
});
