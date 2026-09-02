import { describe, it, expect } from "vitest";
import { signGrant, verifyGrant, GRANT_TTL_SECONDS, isPrivilegedRole } from "../lib/access-grant";

/**
 * The HMAC access-grant scheme shared with the Next.js proxy
 * (frontend/lib/access/grant.ts). Signed by GET /auth/access after a DB
 * `access_role` check; verified offline by the proxy.
 */

const SECRET = "test-secret-at-least-16-chars-long";

describe("access-grant sign/verify", () => {
  it("round-trips a developer grant", () => {
    const token = signGrant("user-1", "developer", { secret: SECRET })!;
    expect(token).toContain(".");
    const v = verifyGrant(token, { secret: SECRET });
    expect(v).toEqual({ sub: "user-1", role: "developer" });
  });

  it("rejects a tampered payload", () => {
    const token = signGrant("user-1", "developer", { secret: SECRET })!;
    const [, sig] = token.split(".");
    const forged = `${Buffer.from(JSON.stringify({ v: 1, sub: "user-1", role: "admin", iat: 0, exp: 9e9 })).toString("base64url")}.${sig}`;
    expect(verifyGrant(forged, { secret: SECRET })).toBeNull();
  });

  it("rejects a grant signed with a different secret", () => {
    const token = signGrant("user-1", "developer", { secret: "another-secret-16+chars" })!;
    expect(verifyGrant(token, { secret: SECRET })).toBeNull();
  });

  it("rejects an expired grant", () => {
    const past = Date.now() - (GRANT_TTL_SECONDS + 60) * 1000;
    const token = signGrant("user-1", "developer", { secret: SECRET, now: past })!;
    expect(verifyGrant(token, { secret: SECRET })).toBeNull();
    // still valid at issue time
    expect(verifyGrant(token, { secret: SECRET, now: past + 1000 })).not.toBeNull();
  });

  it("rejects garbage and empty input", () => {
    for (const bad of ["", "no-dot", "a.b", "....", null, undefined]) {
      expect(verifyGrant(bad as string, { secret: SECRET })).toBeNull();
    }
  });

  it("cannot sign or verify without a secret", () => {
    expect(signGrant("user-1", "developer", { secret: null })).toBeNull();
    const token = signGrant("user-1", "developer", { secret: SECRET })!;
    expect(verifyGrant(token, { secret: null })).toBeNull();
  });

  it("isPrivilegedRole only accepts developer/admin", () => {
    expect(isPrivilegedRole("developer")).toBe(true);
    expect(isPrivilegedRole("admin")).toBe(true);
    expect(isPrivilegedRole("user")).toBe(false);
    expect(isPrivilegedRole(null)).toBe(false);
    expect(isPrivilegedRole(undefined)).toBe(false);
  });
});
