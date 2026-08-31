import { describe, it, expect } from "vitest";
import { parseRail } from "../routes/funding";

describe("parseRail — POST /funding rail validation (fast, no DB)", () => {
  it("valid funding rail selection: accepts a known rail", () => {
    expect(parseRail("moonpay")).toBe("moonpay");
    expect(parseRail("transak")).toBe("transak");
    expect(parseRail("crossmint")).toBe("crossmint");
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(parseRail(" MoonPay ")).toBe("moonpay");
    expect(parseRail("TRANSAK")).toBe("transak");
  });

  it("accepts the reserved-but-unimplemented rail names at the parse level (routing rejects them separately)", () => {
    expect(parseRail("coinbase")).toBe("coinbase");
    expect(parseRail("sepa")).toBe("sepa");
    expect(parseRail("stripe")).toBe("stripe");
  });

  it("returns null when absent (caller defaults to ONRAMP_PROVIDER)", () => {
    expect(parseRail(undefined)).toBeNull();
    expect(parseRail(null)).toBeNull();
  });

  it("invalid rail: throws a user-facing message for an unknown value", () => {
    expect(() => parseRail("dogecoin")).toThrow(/rail must be one of/i);
    expect(() => parseRail("")).toThrow(/rail must be one of/i);
  });

  it("invalid rail: throws for a non-string value", () => {
    expect(() => parseRail(123)).toThrow(/rail must be a string/i);
    expect(() => parseRail({ rail: "moonpay" })).toThrow(/rail must be a string/i);
  });
});
