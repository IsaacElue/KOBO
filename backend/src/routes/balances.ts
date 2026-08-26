import { Router } from "express";
import { supabase } from "../lib/supabase";
import { requireAuth, resolveKoboUser } from "../lib/auth";

export const balancesRouter = Router();

balancesRouter.get("/:userId", requireAuth, async (req, res) => {
  const { userId } = req.params;

  const koboUser = await resolveKoboUser(req.authUser!.id);
  if (!koboUser || koboUser.id !== userId) {
    return res.status(403).json({ error: "This balance does not belong to the authenticated user" });
  }

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
