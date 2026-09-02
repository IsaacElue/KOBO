import { Router } from "express";
import type { User } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import { supabase } from "../lib/supabase";
import {
  requireAuth,
  resolveKoboUser,
  withAuthTimeout,
  AuthServiceTimeoutError,
  AUTH_SERVICE_UNAVAILABLE,
} from "../lib/auth";
import { isPlausibleSolanaAddress } from "../lib/validation";
import { isWaitlistMode } from "../lib/access-mode";
import { signGrant, isPrivilegedRole, GRANT_TTL_SECONDS } from "../lib/access-grant";

export const authRouter = Router();

const PIN_RE = /^\d{4,6}$/;

/**
 * The caller's full own profile — the linked `users` row plus the email,
 * which lives on the Supabase Auth account (`auth.users`), not the profile
 * row. Shared by `GET /auth/me` and the `PATCH /auth/profile` response so
 * both return exactly the same shape. `null` if signup never linked a
 * `users` row to this auth account (shouldn't happen post-`/signup`).
 */
async function ownProfile(authUser: User) {
  const { data, error } = await supabase
    .from("users")
    .select("id, name, role, country, wallet_address, created_at")
    .eq("auth_user_id", authUser.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { ...data, email: authUser.email ?? null };
}

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
  // Pre-launch: the product is closed to the public, so is account creation.
  // Developer accounts are provisioned directly in the DB, never through this
  // endpoint, so they are unaffected. Login stays open. Flip with
  // KOBO_ACCESS_MODE=live on Railway (see lib/access-mode.ts).
  if (isWaitlistMode()) {
    return res.status(403).json({ error: "Kobo isn't open for new accounts yet — join the waitlist at /waitlist" });
  }

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

  let created;
  try {
    created = await withAuthTimeout(
      supabase.auth.admin.createUser({ email, password, email_confirm: true })
    );
  } catch (err) {
    if (err instanceof AuthServiceTimeoutError) {
      return res.status(503).json({ error: AUTH_SERVICE_UNAVAILABLE });
    }
    throw err;
  }
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

  let signedIn;
  try {
    signedIn = await withAuthTimeout(supabase.auth.signInWithPassword({ email, password }));
  } catch (err) {
    if (err instanceof AuthServiceTimeoutError) {
      return res.status(503).json({ error: AUTH_SERVICE_UNAVAILABLE });
    }
    throw err;
  }
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

  let signedIn;
  try {
    signedIn = await withAuthTimeout(supabase.auth.signInWithPassword({ email, password }));
  } catch (err) {
    if (err instanceof AuthServiceTimeoutError) {
      return res.status(503).json({ error: AUTH_SERVICE_UNAVAILABLE });
    }
    throw err;
  }
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

  let refreshed;
  try {
    refreshed = await withAuthTimeout(supabase.auth.refreshSession({ refresh_token }));
  } catch (err) {
    if (err instanceof AuthServiceTimeoutError) {
      return res.status(503).json({ error: AUTH_SERVICE_UNAVAILABLE });
    }
    throw err;
  }
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

/**
 * The authenticated caller's own full profile — name, country,
 * wallet_address, role, member-since (`created_at`), and the email from
 * their Supabase Auth account. There was no existing endpoint that returned
 * a sender their own email or `created_at`: `POST /auth/login`'s `user` is
 * `resolveKoboUser`'s column set (no `email`, no `created_at`) and
 * `requireAuth` only attaches the raw Supabase Auth user. The Settings page
 * needs both, so this exists. Own resource only — the profile is always
 * resolved from the verified session, never from a client-supplied id.
 */
authRouter.get("/me", requireAuth, async (req, res) => {
  let profile;
  try {
    profile = await ownProfile(req.authUser!);
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
  if (!profile) {
    return res.status(403).json({ error: "No account linked to this session" });
  }
  return res.json({ user: profile });
});

/**
 * The caller's launch-access role plus, for a developer/admin, a short-lived
 * signed "access grant" the Next.js proxy verifies offline to let them past
 * `KOBO_ACCESS_MODE=waitlist` route gating (see backend/src/lib/access-grant.ts,
 * frontend/proxy.ts). `access_role` is read only from the `users` row keyed by
 * the verified session — never from the request.
 *
 *   { access_role: "user" | "developer" | "admin",
 *     grant: string | null,        // signed token, only when privileged
 *     grant_ttl_seconds: number }   // how long `grant` is valid — the client
 *                                    // re-mints before this elapses
 *
 * `grant` is null (with a 200, not an error) when the caller is a normal user,
 * or when the server has no `KOBO_ACCESS_GRANT_SECRET` configured — the proxy
 * then simply keeps everyone on /waitlist (fail closed).
 */
authRouter.get("/access", requireAuth, async (req, res) => {
  let koboUser;
  try {
    koboUser = await resolveKoboUser(req.authUser!.id);
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }

  const accessRole = koboUser?.access_role ?? "user";
  const grant = isPrivilegedRole(accessRole) && koboUser
    ? signGrant(koboUser.id, accessRole)
    : null;

  return res.json({
    access_role: accessRole,
    grant,
    grant_ttl_seconds: GRANT_TTL_SECONDS,
  });
});

/**
 * Updates the authenticated caller's own `name` and/or `country`. Same
 * ownership pattern as `POST /auth/pin` and every sender-facing endpoint:
 * the row updated is the one linked to the verified session
 * (`resolveKoboUser` -> `.eq("id", koboUser.id)`), never a client-supplied
 * id. `email` is deliberately not editable here — changing it needs a
 * confirmation-email round trip Kobo has no mailer for yet (see
 * KOBO_BUILD_PLAN.md); `wallet_address` and `role` aren't editable either
 * (a sender's wallet_address is a never-read placeholder, and role isn't a
 * user-facing concept).
 */
authRouter.patch("/profile", requireAuth, async (req, res) => {
  const { name, country } = req.body ?? {};
  const updates: { name?: string; country?: string } = {};

  if (name !== undefined) {
    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "name must be a non-empty string" });
    }
    updates.name = name.trim();
  }
  if (country !== undefined) {
    if (typeof country !== "string" || !country.trim()) {
      return res.status(400).json({ error: "country must be a non-empty string" });
    }
    updates.country = country.trim();
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "provide at least one of: name, country" });
  }

  const koboUser = await resolveKoboUser(req.authUser!.id);
  if (!koboUser) {
    return res.status(403).json({ error: "No account linked to this session" });
  }

  const { error } = await supabase.from("users").update(updates).eq("id", koboUser.id);
  if (error) {
    return res.status(500).json({ error: error.message });
  }

  try {
    return res.json({ user: await ownProfile(req.authUser!) });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * Changes the authenticated caller's account password via Supabase Auth's
 * own admin update — no custom credential scheme, same principle as the
 * rest of `/auth/*`. Requires the current password as a re-entry check
 * first (Supabase's `admin.updateUserById` does not itself ask for it): a
 * fresh `signInWithPassword` is the real verification, not a locally stored
 * hash. On success the current session is revoked server-side too, so a
 * password change always means "log back in with the new one" everywhere —
 * the frontend then sends the user to the login screen.
 */
authRouter.post("/password", requireAuth, async (req, res) => {
  const { current_password, new_password } = req.body ?? {};

  if (typeof current_password !== "string" || !current_password) {
    return res.status(400).json({ error: "current_password is required" });
  }
  if (typeof new_password !== "string" || new_password.length < 8) {
    return res.status(400).json({ error: "new_password is required and must be at least 8 characters" });
  }
  if (new_password === current_password) {
    return res.status(400).json({ error: "new_password must be different from your current password" });
  }

  const email = req.authUser!.email;
  if (!email) {
    return res.status(400).json({ error: "This account has no email address to re-verify against" });
  }

  let recheck;
  try {
    recheck = await withAuthTimeout(
      supabase.auth.signInWithPassword({ email, password: current_password })
    );
  } catch (err) {
    if (err instanceof AuthServiceTimeoutError) {
      return res.status(503).json({ error: AUTH_SERVICE_UNAVAILABLE });
    }
    throw err;
  }
  if (recheck.error || !recheck.data.session) {
    return res.status(400).json({ error: "Current password is incorrect" });
  }

  const updated = await supabase.auth.admin.updateUserById(req.authUser!.id, { password: new_password });
  if (updated.error) {
    return res.status(500).json({ error: updated.error.message });
  }

  // Best-effort: the password already changed successfully, so a failure to
  // revoke here shouldn't fail the request — the frontend logs out locally
  // regardless.
  await supabase.auth.admin.signOut(req.authToken!, "global").catch(() => {});

  return res.status(200).json({ success: true });
});
