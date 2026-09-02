import { describe, it, expect, beforeEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { proxy, config } from "@/proxy";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";

/**
 * Server-side launch-access gate (frontend/proxy.ts). Direct-navigation and
 * cookie cases across waitlist / live mode.
 */

const SECRET = "proxy-test-grant-secret-16chars+";
const ORIGIN = "https://www.kobopayments.com";

function b64url(s: string | Buffer) {
  return Buffer.from(s).toString("base64url");
}
function signGrant(role: "developer" | "admin" = "developer", opts: { exp?: number; secret?: string } = {}) {
  const payload = {
    v: 1,
    sub: "dev-1",
    role,
    iat: Math.floor(Date.now() / 1000),
    exp: opts.exp ?? Math.floor(Date.now() / 1000) + 3600,
  };
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(createHmac("sha256", opts.secret ?? SECRET).update(body).digest());
  return `${body}.${sig}`;
}

function req(path: string, cookie?: string) {
  return new NextRequest(`${ORIGIN}${path}`, cookie ? { headers: { cookie } } : undefined);
}

/** null => the proxy let the request through (NextResponse.next). */
function redirectLocation(res: Awaited<ReturnType<typeof proxy>>): string | null {
  const loc = res.headers.get("location");
  if (!loc) return null;
  return new URL(loc, ORIGIN).pathname;
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("KOBO_ACCESS_GRANT_SECRET", SECRET);
});

describe("proxy — waitlist mode (public)", () => {
  beforeEach(() => vi.stubEnv("NEXT_PUBLIC_KOBO_ACCESS_MODE", "waitlist"));

  it.each(["/", "/landing", "/app", "/app/send", "/transfers/abc/return", "/settings", "/anything"])(
    "redirects %s to /waitlist with no cookie",
    async (path) => {
      const res = await proxy(req(path));
      expect(res.status).toBe(307);
      expect(redirectLocation(res)).toBe("/waitlist");
    }
  );

  it("allows /waitlist and its subpaths", async () => {
    expect(redirectLocation(await proxy(req("/waitlist")))).toBeNull();
    expect(redirectLocation(await proxy(req("/waitlist/thanks")))).toBeNull();
  });

  it("allows the developer sign-in entry /?auth=login", async () => {
    expect(redirectLocation(await proxy(req("/?auth=login")))).toBeNull();
  });

  it("does NOT open /?auth=signup", async () => {
    expect(redirectLocation(await proxy(req("/?auth=signup")))).toBe("/waitlist");
  });

  it("strips the query string on redirect (no ?auth= leak to /waitlist)", async () => {
    const res = await proxy(req("/landing?auth=login&x=1"));
    expect(res.headers.get("location")).toBe(`${ORIGIN}/waitlist`);
  });
});

describe("proxy — waitlist mode (developer grant cookie)", () => {
  beforeEach(() => vi.stubEnv("NEXT_PUBLIC_KOBO_ACCESS_MODE", "waitlist"));

  it.each(["/", "/landing", "/app/send", "/transfers/x/return"])("allows %s with a valid grant", async (path) => {
    expect(redirectLocation(await proxy(req(path, `kobo_access=${signGrant()}`)))).toBeNull();
  });

  it("still redirects with an expired grant", async () => {
    const expired = signGrant("developer", { exp: Math.floor(Date.now() / 1000) - 10 });
    expect(redirectLocation(await proxy(req("/landing", `kobo_access=${expired}`)))).toBe("/waitlist");
  });

  it("still redirects with a grant signed by the wrong secret", async () => {
    const bad = signGrant("developer", { secret: "wrong-secret-16-characters" });
    expect(redirectLocation(await proxy(req("/landing", `kobo_access=${bad}`)))).toBe("/waitlist");
  });

  it("still redirects with a garbage cookie", async () => {
    expect(redirectLocation(await proxy(req("/landing", "kobo_access=not-a-real-token")))).toBe("/waitlist");
  });

  it("redirects when no grant secret is configured, even with an otherwise-valid cookie", async () => {
    vi.stubEnv("KOBO_ACCESS_GRANT_SECRET", "");
    expect(redirectLocation(await proxy(req("/landing", `kobo_access=${signGrant()}`)))).toBe("/waitlist");
  });
});

describe("proxy — live mode", () => {
  beforeEach(() => vi.stubEnv("NEXT_PUBLIC_KOBO_ACCESS_MODE", "live"));

  it.each(["/", "/landing", "/app/send", "/waitlist", "/transfers/x/return"])(
    "lets %s through with no cookie",
    async (path) => {
      expect(redirectLocation(await proxy(req(path)))).toBeNull();
    }
  );
});

describe("proxy — matcher", () => {
  it("runs on page routes", () => {
    for (const url of ["/", "/landing", "/app", "/waitlist"]) {
      expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true);
    }
  });

  it("skips Next internals and static assets", () => {
    for (const url of ["/_next/static/chunk.js", "/favicon.ico", "/meta.json", "/logo.png", "/robots.txt"]) {
      expect(unstable_doesMiddlewareMatch({ config, url })).toBe(false);
    }
  });
});
