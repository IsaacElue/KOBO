import { supabase } from "./supabase";

/**
 * Data access for `waitlist_signups`. Injected into `createWaitlistRouter` so
 * route tests can pass an in-memory fake (same DI pattern as
 * `createUsersRouter` / `createTransfersRouter`); the default calls the
 * `waitlist_signup` SQL function.
 */
export interface WaitlistSignupResult {
  /**
   * The caller's immutable 1-indexed signup ordinal — assigned once by the DB
   * (`waitlist_counter`) when their row was first inserted, and never
   * recomputed. A deleted row leaves a gap; nobody else's number moves.
   */
  signup_number: number;
  /** true if this call added the row, false if the email was already on the list. */
  created: boolean;
}

export interface WaitlistRepository {
  /**
   * Idempotent: joins `email` to the list and returns its position with
   * `created: true`; if the email is already present, returns its (unchanged)
   * position with `created: false` and adds nothing. `email` is expected
   * already trimmed + lower-cased by the caller (the SQL function normalises
   * again defensively).
   */
  signup(email: string): Promise<WaitlistSignupResult>;
  /** Total rows in `waitlist_signups`. */
  count(): Promise<number>;
}

export const supabaseWaitlist: WaitlistRepository = {
  async signup(email: string): Promise<WaitlistSignupResult> {
    // One advisory-locked transaction inside Postgres: dedupe, and on a genuine
    // new signup take the next number off `waitlist_counter` and insert. A
    // duplicate returns its stored number and consumes nothing. See
    // migrations/20260904000000_waitlist_immutable_signup_number.sql.
    const { data, error } = await supabase
      .rpc("waitlist_signup", { p_email: email })
      .single();

    if (error) throw new Error(error.message);
    const row = data as { signup_number: number; created: boolean } | null;
    if (!row || typeof row.signup_number !== "number") {
      throw new Error("waitlist_signup returned no position");
    }
    return { signup_number: row.signup_number, created: !!row.created };
  },

  async count(): Promise<number> {
    const { count, error } = await supabase
      .from("waitlist_signups")
      .select("*", { count: "exact", head: true });
    if (error) throw new Error(error.message);
    return count ?? 0;
  },
};
