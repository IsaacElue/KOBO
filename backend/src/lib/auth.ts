import type { RequestHandler } from "express";
import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

declare global {
  namespace Express {
    interface Request {
      /** The verified Supabase Auth user for this request — set by requireAuth. */
      authUser?: User;
      /** The raw bearer token that verified as authUser — set by requireAuth, so routes needing the literal token (e.g. POST /auth/logout) don't re-parse the header. */
      authToken?: string;
    }
  }
}

/**
 * Verifies the bearer token via Supabase's own `auth.getUser(token)` — the
 * standard server-side session check (round-trips to Supabase Auth to
 * confirm the token is real and unexpired), not a custom JWT scheme. 401s
 * with no further detail on any failure; never distinguishes "missing
 * header" from "expired token" from "malformed token" in the response body.
 */
export const requireAuth: RequestHandler = async (req, res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return res.status(401).json({ error: "Invalid or expired session" });
  }

  req.authUser = data.user;
  req.authToken = token;
  next();
};

/** The `users` row linked to an authenticated Supabase Auth account, or null if signup never completed the link. */
export async function resolveKoboUser(authUserId: string) {
  const { data, error } = await supabase
    .from("users")
    .select("id, name, role, country, wallet_address, auth_user_id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (error) throw error;
  return data;
}
