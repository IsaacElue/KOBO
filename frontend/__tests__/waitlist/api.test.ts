import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const { isMockMode } = vi.hoisted(() => ({ isMockMode: vi.fn() }));
vi.mock("@/lib/kobo/config", () => ({
  isMockMode,
  API_URL: "http://api.test",
  ROOT_REDIRECT_TARGET: "/waitlist",
}));

import {
  getRememberedSignup,
  getWaitlistCount,
  isValidEmail,
  joinWaitlist,
  resetWaitlist,
  WaitlistError,
} from "@/lib/waitlist/api";

beforeEach(() => {
  isMockMode.mockReturnValue(true);
  resetWaitlist();
});
afterEach(() => {
  resetWaitlist();
  vi.restoreAllMocks();
});

describe("isValidEmail", () => {
  test("accepts / rejects the obvious cases", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("  spaced@example.com  ")).toBe(true);
    expect(isValidEmail("nope")).toBe(false);
    expect(isValidEmail("no@domain")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });
});

describe("joinWaitlist — mock mode", () => {
  test("returns a stable, positive signup_number for an email", async () => {
    const a = await joinWaitlist("Demo@Kobo.com");
    expect(a.signup_number).toBeGreaterThan(0);
    resetWaitlist();
    const b = await joinWaitlist("demo@kobo.com"); // normalised → same
    expect(b.signup_number).toBe(a.signup_number);
  });

  test("is idempotent for the same browser + email", async () => {
    const first = await joinWaitlist("same@example.com");
    const second = await joinWaitlist("  SAME@example.com  ");
    expect(second.signup_number).toBe(first.signup_number);
  });

  test("persists the signup so a returning visitor is remembered", async () => {
    expect(getRememberedSignup()).toBeNull();
    const { signup_number } = await joinWaitlist("remember@me.com");
    expect(getRememberedSignup()).toEqual({ email: "remember@me.com", signup_number });
  });

  test("resetWaitlist clears the remembered signup", async () => {
    await joinWaitlist("x@y.co");
    resetWaitlist();
    expect(getRememberedSignup()).toBeNull();
  });

  test("rejects a malformed email before doing anything", async () => {
    await expect(joinWaitlist("not-an-email")).rejects.toBeInstanceOf(WaitlistError);
    expect(getRememberedSignup()).toBeNull();
  });

  test("getWaitlistCount is null with no backend", async () => {
    expect(await getWaitlistCount()).toBeNull();
  });
});

describe("joinWaitlist — real backend", () => {
  beforeEach(() => isMockMode.mockReturnValue(false));

  test("POSTs the normalised email and returns the server's signup_number", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ signup_number: 42 }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        })
      );

    const res = await joinWaitlist("  Person@Example.COM ");
    expect(res).toEqual({ signup_number: 42 });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("http://api.test/waitlist/signup");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init!.body as string)).toEqual({ email: "person@example.com" });
    // remembered for a reload
    expect(getRememberedSignup()).toEqual({ email: "person@example.com", signup_number: 42 });
  });

  test("an already-signed-up email (200) is treated as success, same number", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ signup_number: 7 }), { status: 200 })
    );
    expect(await joinWaitlist("returning@example.com")).toEqual({ signup_number: 7 });
  });

  test("a 429 surfaces a friendly rate-limit message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 429 }));
    await expect(joinWaitlist("spammy@example.com")).rejects.toThrow(/too many/i);
  });

  test("a 5xx / malformed response throws, and does NOT fall back to a fake number", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "boom" }), { status: 500 })
    );
    await expect(joinWaitlist("err@example.com")).rejects.toThrow(/boom/);
    expect(getRememberedSignup()).toBeNull();
  });

  test("a network failure throws a WaitlistError (no silent fallback)", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("network"));
    await expect(joinWaitlist("offline@example.com")).rejects.toBeInstanceOf(WaitlistError);
    expect(getRememberedSignup()).toBeNull();
  });

  test("getWaitlistCount returns the server total", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ total: 128 }), { status: 200 })
    );
    expect(await getWaitlistCount()).toBe(128);
  });
});
