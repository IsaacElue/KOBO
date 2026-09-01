import { Router } from "express";
import { isPlausibleSolanaAddress } from "../lib/validation";
import {
  normalizeRecipientEmail,
  RecipientWalletProvider,
  crossmintRecipientWalletProvider,
} from "../lib/wallet-provider";
import {
  supabaseRecipients,
  RecipientUserRepository,
  RecipientUser,
} from "../lib/recipients-repo";

// "sender" is deliberately excluded here now — real senders go through
// POST /auth/signup, which creates the linked Supabase Auth account this
// route has no way to. This route is recipient-only: recipients are payees,
// not logged-in accounts, and still don't need one.
const VALID_ROLES = ["recipient"] as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The `CreateUserResponse` shape — the exact column set POST /users returns.
 * Deliberately narrower than the repo's full `users` row (which includes
 * `email`): recipients added by pasted address have no email to expose, and
 * the frontend contract only knows these fields. Never leak extra columns
 * from the repo's `RecipientUser` into the response.
 */
interface CreateUserResponse {
  id: string;
  name: string;
  role: string;
  country: string;
  wallet_address: string;
  created_at: string;
}

function toCreateUserResponse(user: RecipientUser): CreateUserResponse {
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    country: user.country,
    wallet_address: user.wallet_address,
    created_at: user.created_at,
  };
}

/**
 * Recipient route factory — Sprint 1A. All database reads/writes go through
 * the injected `RecipientUserRepository`, and all wallet provisioning
 * through the injected `RecipientWalletProvider`, so tests can pass in-memory
 * fakes (no live Supabase, no Crossmint) while the default wiring uses
 * `supabaseRecipients` + `crossmintRecipientWalletProvider`.
 */
export function createUsersRouter(deps?: {
  recipients?: RecipientUserRepository;
  provider?: RecipientWalletProvider;
}): Router {
  const recipients = deps?.recipients ?? supabaseRecipients;
  const provider = deps?.provider ?? crossmintRecipientWalletProvider;

  const router = Router();

  router.post("/", async (req, res) => {
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
    // is only consulted when wallet_address is absent. Address mode keeps
    // creating a row with a NULL email; email mode normalizes first, then
    // dedupes on the normalized value so the same recipient is never stored
    // twice under case/whitespace variants of the same address.
    if (wallet_address) {
      if (
        typeof wallet_address !== "string" ||
        !isPlausibleSolanaAddress(wallet_address)
      ) {
        return res.status(400).json({
          error: "wallet_address does not look like a valid Solana address",
        });
      }

      let created: RecipientUser;
      try {
        created = await recipients.create({
          name,
          country,
          wallet_address,
          email: null, // address-only recipient has no email — repo stores NULL
        });
      } catch (err) {
        return res.status(500).json({ error: (err as Error).message });
      }
      return res.status(201).json(toCreateUserResponse(created));
    }

    if (email) {
      if (typeof email !== "string") {
        return res.status(400).json({ error: "email does not look like a valid email address" });
      }
      const normalized = normalizeRecipientEmail(email);
      if (!EMAIL_RE.test(normalized)) {
        return res.status(400).json({ error: "email does not look like a valid email address" });
      }

      // Idempotency: an existing row for this normalized email means the
      // wallet was already provisioned (or the recipient was created by
      // address with the same email) — return it exactly as-is, never call
      // Crossmint again, never create a duplicate row.
      let existing: RecipientUser | null = null;
      try {
        existing = await recipients.findByEmail(normalized);
      } catch (err) {
        return res.status(500).json({ error: (err as Error).message });
      }
      if (existing && existing.wallet_address) {
        return res.status(201).json(toCreateUserResponse(existing));
      }

      // Provision the wallet, then persist exactly one row keyed by the
      // normalized email. `address` is the raw provider output — it is
      // already a Solana address (Crossmint returns base58), and it is
      // trusted as-is; validation happens on the pasted-address path only.
      let address: string;
      try {
        address = await provider.resolveOrCreateByEmail(normalized);
      } catch (err) {
        return res.status(502).json({
          error: `Failed to provision a wallet for this email: ${(err as Error).message}`,
        });
      }

      let created: RecipientUser;
      try {
        created = await recipients.create({
          name,
          country,
          wallet_address: address,
          email: normalized,
        });
      } catch (err) {
        // Unique-violation on users.email (partial index): another request
        // raced us and inserted the same normalized email first. Fall back
        // to the row that won rather than failing — but only if it actually
        // has a wallet; otherwise something is inconsistent and 500 is right.
        if (/duplicate|unique/i.test((err as Error).message ?? "")) {
          try {
            const winner = await recipients.findByEmail(normalized);
            if (winner && winner.wallet_address) {
              return res.status(201).json(toCreateUserResponse(winner));
            }
          } catch {
            // fall through to 500 below — the duplicate row is unrecoverable here
          }
        }
        return res.status(500).json({ error: (err as Error).message });
      }
      return res.status(201).json(toCreateUserResponse(created));
    }

    return res.status(400).json({ error: "wallet_address or email is required" });
  });

  // GET /users?email=<raw> — public recipient lookup by email (no auth, no
  // provisioning). The sender's client uses this to recover a recipient's
  // profile before sending; row existence is the source of truth, not
  // Crossmint. Normalized exactly like the POST path so lookups and inserts
  // always agree on the key.
  router.get("/", async (req, res) => {
    const { email } = req.query;
    if (typeof email !== "string" || email.trim() === "") {
      return res.status(400).json({ error: "email query parameter is required" });
    }
    const normalized = normalizeRecipientEmail(email);
    let user: RecipientUser | null = null;
    try {
      user = await recipients.findByEmail(normalized);
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message });
    }
    if (!user) {
      return res.status(404).json({ error: "Recipient not found" });
    }
    return res.json({ user });
  });

  return router;
}

export const usersRouter = createUsersRouter();