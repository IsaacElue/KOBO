import { supabase } from "./supabase";

/**
 * Data access for `waitlist_signups`. Injected into `createWaitlistRouter` so
 * route tests can pass an in-memory fake (same DI pattern as
 * `createUsersRouter` / `createTransfersRouter`); the default is the real
 * Supabase-backed implementation below.
 */
export interface WaitlistSignupResult {
  /** The IDENTITY value the DB assigned this email (existing or brand-new). */
  signup_number: number;
  /** true if this call inserted the row, false if the email was already on the list. */
  created: boolean;
}

export interface WaitlistRepository {
  /**
   * Idempotent: inserts `email` and returns its DB-assigned `signup_number`
   * with `created: true`; if the email is already present, returns the
   * existing number with `created: false`. `email` is expected already
   * trimmed + lower-cased by the caller.
   */
  signup(email: string): Promise<WaitlistSignupResult>;
  /** Total rows in `waitlist_signups`. */
  count(): Promise<number>;
}

/** Postgres unique-violation SQLSTATE — raised when the same email races two inserts. */
const UNIQUE_VIOLATION = "23505";

export const supabaseWaitlist: WaitlistRepository = {
  async signup(email: string): Promise<WaitlistSignupResult> {
    // Attempt the insert first. `signup_number` is a GENERATED IDENTITY, so the
    // sequence value is drawn atomically inside this INSERT — concurrent
    // signups of *different* emails never collide on it.
    const inserted = await supabase
      .from("waitlist_signups")
      .insert({ email })
      .select("signup_number")
      .single();

    if (!inserted.error) {
      return { signup_number: inserted.data.signup_number as number, created: true };
    }

    // Same email already on the list (or lost an insert race for it) — look up
    // the winning row and return it. This is the idempotent path, not an error.
    if (inserted.error.code === UNIQUE_VIOLATION) {
      const existing = await supabase
        .from("waitlist_signups")
        .select("signup_number")
        .eq("email", email)
        .single();
      if (existing.error) throw new Error(existing.error.message);
      return { signup_number: existing.data.signup_number as number, created: false };
    }

    throw new Error(inserted.error.message);
  },

  async count(): Promise<number> {
    const { count, error } = await supabase
      .from("waitlist_signups")
      .select("*", { count: "exact", head: true });
    if (error) throw new Error(error.message);
    return count ?? 0;
  },
};
