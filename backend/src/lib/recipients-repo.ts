/**
 * The recipients repository — the seam between recipient resolution and the
 * database.
 *
 * Sprint 1A motivation: `POST /users` (role: "recipient") previously inlined
 * its Supabase call and had no `email` column to key a recipient by. Now a
 * recipient can be added by email alone (Crossmint resolves the wallet — see
 * `lib/crossmint.ts`), and every lookup/create for that email must go through
 * one place so the route handlers can be driven by an injected in-memory fake
 * in tests instead of a live database.
 *
 * ⚠️ The Supabase client is imported lazily inside each method on purpose:
 * this module is imported (transitively) by tests that run with no real env,
 * and `lib/supabase.ts` throws at module import time when
 * SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are missing. Nothing here may
 * touch supabase before a method is actually called — the throw for a bad
 * env happens at first use, never at import.
 *
 * Keep these methods thin: all conditionals (find-then-create, dedupe,
 * wallet-vs-address selection) live in the route layer, which is where the
 * tests hang. Errors are thrown upward and wrapped by the caller.
 */

export interface RecipientUser {
  id: string;
  name: string;
  role: string;
  country: string;
  wallet_address: string;
  email: string | null;
  created_at: string;
}

export interface RecipientUserRepository {
  create(input: {
    name: string;
    country: string;
    wallet_address: string;
    email: string | null;
  }): Promise<RecipientUser>;
  findByEmail(email: string): Promise<RecipientUser | null>;
}

// Single source of truth for the exact column set both methods must return:
// the full `users` shape including `email` (the POST /users route separately
// selects its own narrower response shape — never change the repo's shape to
// match that).
const RECIPIENT_COLUMNS =
  "id, name, role, country, wallet_address, email, created_at" as const;

export const supabaseRecipients: RecipientUserRepository = {
  async create(input) {
    // Lazy import — see the header comment: otherwise importing this module
    // (e.g. from vitest tests with no env) would throw at load time.
    const { supabase } = await import("./supabase");
    const { data, error } = await supabase
      .from("users")
      .insert({
        name: input.name,
        role: "recipient",
        country: input.country,
        wallet_address: input.wallet_address,
        email: input.email || null,
      })
      .select(RECIPIENT_COLUMNS)
      .single();

    if (error) throw error;
    return data as RecipientUser;
  },

  async findByEmail(email) {
    const { supabase } = await import("./supabase");
    const { data, error } = await supabase
      .from("users")
      .select(RECIPIENT_COLUMNS)
      .eq("email", email)
      .maybeSingle();

    if (error) throw error;
    return (data as RecipientUser | null) ?? null;
  },
};