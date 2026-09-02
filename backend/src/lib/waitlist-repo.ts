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

/**
 * A developer test signup. Lives in the SEPARATE `waitlist_test_signups`
 * table — never in `waitlist_signups`, never numbered, never counted by
 * `GET /waitlist/count`. `is_test` is always `true` (the table IS the marker;
 * the field is here so callers/logs can identify a row at a glance).
 */
export interface WaitlistTestSignup {
  id: string;
  email: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
  is_test: true;
}

export interface WaitlistStats {
  /** Genuine signups (`waitlist_signups`) — the same number `count()` returns. */
  real: number;
  /** Developer test signups (`waitlist_test_signups`). */
  test: number;
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
  /** Total GENUINE signups — rows in `waitlist_signups`. Excludes test rows (they are in another table). */
  count(): Promise<number>;
  /**
   * Developer-only: record a throwaway test signup in `waitlist_test_signups`.
   * Never assigns a `signup_number`, never touches `waitlist_counter` or
   * `waitlist_signups`. Idempotent per normalised email (get-or-create).
   */
  testSignup(email: string, meta?: { createdBy?: string | null; note?: string | null }): Promise<WaitlistTestSignup>;
  /** Developer-only: delete every row in `waitlist_test_signups`. Returns the count removed. Idempotent, safe to repeat. */
  testCleanup(): Promise<{ deleted: number }>;
  /** Developer-only: genuine vs test counts, for a developer dashboard. */
  stats(): Promise<WaitlistStats>;
}

/** Postgres unique-violation SQLSTATE — a concurrent test-signup of the same email. */
const UNIQUE_VIOLATION = "23505";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
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

  async testSignup(email, meta = {}): Promise<WaitlistTestSignup> {
    const normalized = normalizeEmail(email);

    // Insert first; on the unique-email conflict, return the existing row —
    // same get-or-create shape as the real signup, but entirely within
    // `waitlist_test_signups`. No counter, no `signup_number`, ever.
    const inserted = await supabase
      .from("waitlist_test_signups")
      .insert({ email: normalized, created_by: meta.createdBy ?? null, note: meta.note ?? null })
      .select("id, email, note, created_by, created_at")
      .single();

    if (!inserted.error) {
      return { ...inserted.data, is_test: true };
    }
    if (inserted.error.code !== UNIQUE_VIOLATION) {
      throw new Error(inserted.error.message);
    }

    const existing = await supabase
      .from("waitlist_test_signups")
      .select("id, email, note, created_by, created_at")
      .eq("email", normalized)
      .single();
    if (existing.error) throw new Error(existing.error.message);
    return { ...existing.data, is_test: true };
  },

  async testCleanup(): Promise<{ deleted: number }> {
    // Deletes ONLY `waitlist_test_signups` rows. `waitlist_signups`,
    // `waitlist_counter`, and every real `signup_number` are in other objects
    // and are not referenced here. `neq id null` = "all rows" (PostgREST
    // requires a filter on DELETE).
    const { data, error } = await supabase
      .from("waitlist_test_signups")
      .delete()
      .not("id", "is", null)
      .select("id");
    if (error) throw new Error(error.message);
    return { deleted: data?.length ?? 0 };
  },

  async stats(): Promise<WaitlistStats> {
    const [real, test] = await Promise.all([
      supabase.from("waitlist_signups").select("*", { count: "exact", head: true }),
      supabase.from("waitlist_test_signups").select("*", { count: "exact", head: true }),
    ]);
    if (real.error) throw new Error(real.error.message);
    if (test.error) throw new Error(test.error.message);
    return { real: real.count ?? 0, test: test.count ?? 0 };
  },
};
