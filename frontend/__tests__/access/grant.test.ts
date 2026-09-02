import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyGrant } from "@/lib/access/grant";

/**
 * Proxy-side (verify-only) half of the access-grant scheme. The API signs;
 * this checks. Tokens here are produced by a local mirror of the signer.
 */

const SECRET = "frontend-grant-test-secret-16ch+";

function b64url(s: string | Buffer) {
  return Buffer.from(s).toString("base64url");
}

function sign(
  payload: Record<string, unknown>,
  secret = SECRET
): string {
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(createHmac("sha256", secret).update(body).digest());
  return `${body}.${sig}`;
}

const future = () => Math.floor(Date.now() / 1000) + 3600;

describe("verifyGrant (proxy side)", () => {
  it("accepts a well-formed, unexpired developer grant", () => {
    const token = sign({ v: 1, sub: "dev-1", role: "developer", iat: 0, exp: future() });
    expect(verifyGrant(token, { secret: SECRET })).toEqual({ sub: "dev-1", role: "developer" });
  });

  it("accepts admin", () => {
    const token = sign({ v: 1, sub: "a", role: "admin", iat: 0, exp: future() });
    expect(verifyGrant(token, { secret: SECRET })).toEqual({ sub: "a", role: "admin" });
  });

  it("rejects wrong secret", () => {
    const token = sign({ v: 1, sub: "d", role: "developer", iat: 0, exp: future() }, "some-other-secret-16chars");
    expect(verifyGrant(token, { secret: SECRET })).toBeNull();
  });

  it("rejects expired", () => {
    const token = sign({ v: 1, sub: "d", role: "developer", iat: 0, exp: Math.floor(Date.now() / 1000) - 1 });
    expect(verifyGrant(token, { secret: SECRET })).toBeNull();
  });

  it("rejects an unknown role and an unknown version", () => {
    expect(verifyGrant(sign({ v: 1, sub: "d", role: "user", iat: 0, exp: future() }), { secret: SECRET })).toBeNull();
    expect(verifyGrant(sign({ v: 2, sub: "d", role: "developer", iat: 0, exp: future() }), { secret: SECRET })).toBeNull();
  });

  it("rejects a tampered role (signature no longer matches)", () => {
    const good = sign({ v: 1, sub: "d", role: "developer", iat: 0, exp: future() });
    const [, sig] = good.split(".");
    const forged = `${b64url(JSON.stringify({ v: 1, sub: "d", role: "admin", iat: 0, exp: future() }))}.${sig}`;
    expect(verifyGrant(forged, { secret: SECRET })).toBeNull();
  });

  it("rejects junk / empty / missing", () => {
    for (const bad of ["", "x", "a.b.c", null, undefined]) {
      expect(verifyGrant(bad as string, { secret: SECRET })).toBeNull();
    }
  });

  it("rejects everything when no secret is configured", () => {
    const token = sign({ v: 1, sub: "d", role: "developer", iat: 0, exp: future() });
    expect(verifyGrant(token, { secret: null })).toBeNull();
  });
});
