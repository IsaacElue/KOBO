import { Router } from "express";
import bcrypt from "bcryptjs";
import { supabase } from "../lib/supabase";
import { requireAuth, resolveKoboUser } from "../lib/auth";
import { isPlausibleSolanaAddress } from "../lib/validation";

export const authRouter = Router();

const PIN_RE = /^\d{4,6}$/;

function sessionBody(session: { access_token: string; refresh_token: string; expires_at?: number }) {
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
  };
}

/**
 * Real signup: creates the Supabase Auth account (auth.users) and the
 * linked `users` profile row together, atomically enough that a failure on
 * either side doesn't leave an orphan. Replaces the old
 * NEXT_PUBLIC_KOBO_SENDER_ID hardcoded-demo-sender scheme entirely — every
 * sender is now a real account. `email_confirm: true` skips email
 * verification since no email-sending integration exists yet (see
 * KOBO_BUILD_PLAN.md) — not a security shortcut we'd take with a real
 * mailer available.
 */
authRouter.post("/signup", async (req, res) => {
  const { email, password, name, country, wallet_address } = req.body ?? {};

  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "email is required" });
  }
  if (!password || typeof password !== "string" || password.length < 8) {
    return res.status(400).json({ error: "password is required and must be at least 8 characters" });
  }
  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "name is required" });
  }
  if (!country || typeof country !== "string") {
    return res.status(400).json({ error: "country is required" });
  }
  if (!wallet_address || typeof wallet_address !== "string" || !isPlausibleSolanaAddress(wallet_address)) {
    return res.status(400).json({ error: "wallet_address is required and must be a valid Solana address" });
  }

  const created = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) {
    return res.status(400).json({ error: created.error?.message ?? "Signup failed" });
  }
  const authUserId = created.data.user.id;

  const { data: userRow, error: insertError } = await supabase
    .from("users")
    .insert({ auth_user_id: authUserId, name, role: "sender", country, wallet_address })
    .select("id, name, role, country, wallet_address, created_at")
    .single();

  if (insertError) {
    // Nothing else references this auth user yet — roll it back rather than
    // leaving a login with no profile behind it.
    await supabase.auth.admin.deleteUser(authUserId);
    return res.status(500).json({ error: insertError.message });
  }

  const signedIn = await supabase.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session) {
    return res.status(500).json({ error: signedIn.error?.message ?? "Signed up but failed to start a session" });
  }

  return res.status(201).json({ user: userRow, session: sessionBody(signedIn.data.session) });
});

/** Returning-user login — a thin proxy over Supabase's own password grant, no custom token scheme. */
authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || typeof email !== "string" || !password || typeof password !== "string") {
    return res.status(400).json({ error: "email and password are required" });
  }

  const signedIn = await supabase.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session) {
    // Deliberately generic — same response whether the email doesn't exist or the password is wrong.
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const koboUser = await resolveKoboUser(signedIn.data.user.id);

  return res.json({ user: koboUser, session: sessionBody(signedIn.data.session) });
});

/**
 * Exchanges a refresh token for a fresh session — how a returning visit stays
 * signed in past the access token's ~1h expiry without re-entering a
 * password. A thin proxy over Supabase's own refresh grant, same as
 * login/signup; no separate token store or custom expiry logic here.
 */
authRouter.post("/refresh", async (req, res) => {
  const { refresh_token } = req.body ?? {};
  if (!refresh_token || typeof refresh_token !== "string") {
    return res.status(400).json({ error: "refresh_token is required" });
  }

  const refreshed = await supabase.auth.refreshSession({ refresh_token });
  if (refreshed.error || !refreshed.data.session) {
    return res.status(401).json({ error: "Invalid or expired refresh token" });
  }

  return res.json({ session: sessionBody(refreshed.data.session) });
});

/**
 * Revokes the session server-side (not just a client-side "forget the
 * token") — `admin.signOut` with `"global"` scope invalidates the refresh
 * token too, so a copy of it left in old storage can't be replayed after
 * logout.
 */
authRouter.post("/logout", requireAuth, async (req, res) => {
  const { error } = await supabase.auth.admin.signOut(req.authToken!, "global");
  if (error) {
    return res.status(500).json({ error: error.message });
  }
  return res.status(200).json({ success: true });
});

/**
 * Sets (or replaces) the caller's PIN. Not the account credential — a
 * fast-unlock layer on top of an already-authenticated session, so this
 * itself requires a valid session, same as pin/verify below. One PIN per
 * user: calling this again overwrites the previous one (this is normal
 * authenticated PIN management, not the password-reset flow explicitly
 * out of scope).
 */
authRouter.post("/pin", requireAuth, async (req, res) => {
  const { pin } = req.body ?? {};
  if (typeof pin !== "string" || !PIN_RE.test(pin)) {
    return res.status(400).json({ error: "pin must be 4-6 digits" });
  }

  const koboUser = await resolveKoboUser(req.authUser!.id);
  if (!koboUser) {
    return res.status(403).json({ error: "No account linked to this session" });
  }

  const pin_hash = await bcrypt.hash(pin, 10);
  const { error } = await supabase.from("users").update({ pin_hash }).eq("id", koboUser.id);
  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({ success: true });
});

/**
 * Verifies a PIN against the authenticated session's stored hash.
 * Success/failure only, always `200` — never a distinct status or message
 * for "no PIN set yet" vs. "wrong PIN" vs. anything else, so failure never
 * leaks which case it was.
 */
authRouter.post("/pin/verify", requireAuth, async (req, res) => {
  const { pin } = req.body ?? {};
  if (typeof pin !== "string") {
    return res.status(400).json({ error: "pin is required" });
  }

  const { data, error } = await supabase
    .from("users")
    .select("pin_hash")
    .eq("auth_user_id", req.authUser!.id)
    .maybeSingle();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  if (!data?.pin_hash) {
    return res.status(200).json({ success: false });
  }

  const success = await bcrypt.compare(pin, data.pin_hash);
  return res.status(200).json({ success });
});
