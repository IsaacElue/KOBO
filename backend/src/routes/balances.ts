import { Router } from "express";
import { supabase } from "../lib/supabase";

export const balancesRouter = Router();

balancesRouter.get("/:userId", async (req, res) => {
  const { userId } = req.params;

  const { data, error } = await supabase
    .from("balances")
    .select("usdc_balance, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  if (!data) {
    return res.json({ usdc_balance: 0, updated_at: null });
  }

  return res.json(data);
});
