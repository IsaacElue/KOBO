import { describe, expect, test } from "vitest";
import { allowedOnrampOrigins, parseTransakMessage } from "@/lib/kobo/onramp-transak";

describe("parseTransakMessage", () => {
  test.each([
    ["TRANSAK_ORDER_CREATED", "order-created"],
    ["TRANSAK_ORDER_SUCCESSFUL", "order-successful"],
    ["TRANSAK_ORDER_FAILED", "order-failed"],
    ["TRANSAK_WIDGET_CLOSE", "widget-closed"],
  ])("maps %s to %s", (eventId, kind) => {
    expect(parseTransakMessage({ event_id: eventId })).toEqual({ kind });
  });

  test("also accepts a camelCase eventId key", () => {
    expect(parseTransakMessage({ eventId: "TRANSAK_ORDER_SUCCESSFUL" })).toEqual({
      kind: "order-successful",
    });
  });

  test.each([null, undefined, "a string", 42, {}, { event_id: "SOMETHING_ELSE" }])(
    "returns null for unrecognised payload %p",
    (payload) => {
      expect(parseTransakMessage(payload)).toBeNull();
    }
  );
});

describe("allowedOnrampOrigins", () => {
  test("always includes Transak's documented hosts", () => {
    expect(allowedOnrampOrigins()).toContain("https://global.transak.com");
    expect(allowedOnrampOrigins()).toContain("https://global-stg.transak.com");
  });

  test("in mock mode (no NEXT_PUBLIC_KOBO_API_URL set), also trusts this app's own origin", () => {
    // The test env never sets NEXT_PUBLIC_KOBO_API_URL, so isMockMode() is true here.
    expect(allowedOnrampOrigins()).toContain(window.location.origin);
  });

  test("never trusts an arbitrary third-party origin", () => {
    expect(allowedOnrampOrigins()).not.toContain("https://evil.example.com");
  });
});
