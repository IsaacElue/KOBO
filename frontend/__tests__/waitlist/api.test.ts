import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// The waitlist client talks only to the real backend; point it at a fake URL
// and drive `fetch` directly.
vi.mock("@/lib/kobo/config", () => ({
  API_URL: "http://api.test",
  isMockMode: () => false,
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => resetWaitlist());
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
    expect(isValidEmail("a b@example.com")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });
});

describe("joinWaitlist", () => {
  test("POSTs the trimmed + lower-cased email and returns the server's signup_number (201)", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ signup_number: 42 }, 201));

    const res = await joinWaitlist("  Person@Example.COM ");
    expect(res).toEqual({ signup_number: 42 });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("http://api.test/waitlist/signup");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init!.body as string)).toEqual({ email: "person@example.com" });
  });

  test("an already-signed-up email (200) is treated as success with the same number", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ signup_number: 7 }, 200));
    expect(await joinWaitlist("returning@example.com")).toEqual({ signup_number: 7 });
  });

  test("persists the server number so a returning visitor is remembered", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ signup_number: 99 }, 201));
    expect(getRememberedSignup()).toBeNull();

    await joinWaitlist("Remember@Me.com");
    expect(getRememberedSignup()).toEqual({ email: "remember@me.com", signup_number: 99 });

    resetWaitlist();
    expect(getRememberedSignup()).toBeNull();
  });

  test("rejects a malformed email before calling the backend", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(joinWaitlist("not-an-email")).rejects.toBeInstanceOf(WaitlistError);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getRememberedSignup()).toBeNull();
  });

  test("a 429 surfaces a friendly rate-limit message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ error: "Too many requests" }, 429));
    await expect(joinWaitlist("spammy@example.com")).rejects.toThrow(/too many/i);
  });

  test("a 5xx / malformed response throws — never falls back to a fabricated number", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ error: "boom" }, 500));
    await expect(joinWaitlist("err@example.com")).rejects.toThrow(/boom/);
    expect(getRememberedSignup()).toBeNull();
  });

  test("a 2xx with no numeric signup_number throws rather than inventing one", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ signup_number: "nope" }, 201));
    await expect(joinWaitlist("weird@example.com")).rejects.toBeInstanceOf(WaitlistError);
    expect(getRememberedSignup()).toBeNull();
  });

  test("a network failure throws a WaitlistError (no silent fallback)", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("network"));
    await expect(joinWaitlist("offline@example.com")).rejects.toBeInstanceOf(WaitlistError);
    expect(getRememberedSignup()).toBeNull();
  });
});

describe("getWaitlistCount", () => {
  test("returns the server total", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ total: 128 }));
    expect(await getWaitlistCount()).toBe(128);
  });

  test("returns null when the request fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ error: "nope" }, 500));
    expect(await getWaitlistCount()).toBeNull();
  });
});
