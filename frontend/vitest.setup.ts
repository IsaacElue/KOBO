import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import type { ReactNode } from "react";

// vitest.config.ts doesn't inject NEXT_PUBLIC_* vars the way a real Next.js
// build does. Most of them already degrade gracefully when unset (e.g.
// getMoonPayObservedIp() just returns null). CrossmintCheckoutModal
// deliberately does NOT degrade gracefully — a missing client key renders a
// loud "not configured" error UI in production, which would otherwise mask
// every Crossmint-flow test behind that fallback instead of the real modal.
if (!process.env.NEXT_PUBLIC_CROSSMINT_CLIENT_KEY) {
  process.env.NEXT_PUBLIC_CROSSMINT_CLIENT_KEY = "ck_test_fake_not_a_real_key";
}

afterEach(() => {
  cleanup();
});

// Components under test call next/navigation hooks (KoboApp, the return page) but
// tests render them outside a real Next.js App Router. Individual test files can
// reconfigure these via `vi.mocked(useSearchParams).mockReturnValue(...)` etc.
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
  usePathname: vi.fn(() => "/"),
  useParams: vi.fn(() => ({})),
}));

if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

if (!window.ResizeObserver) {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (!window.IntersectionObserver) {
  // @ts-expect-error minimal jsdom polyfill
  window.IntersectionObserver = class IntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// The real @crossmint/client-sdk-react-ui pulls in a very large dependency
// graph (wallet-connect/metamask SDKs etc — real cost, not a bug) that
// visibly slowed down the WHOLE suite once kobo-app.tsx started importing
// it transitively, even for test files that never touch the Crossmint flow
// (measured: full-suite import time went from ~10s to 200s+). A real
// embedded-checkout SDK shouldn't be loaded live in a unit test anyway
// (same principle as MoonPay/Transak, whose real widgets are never
// rendered either) — inert here by default; onramp-crossmint.test.tsx
// overrides this locally with a controllable fake to test the actual
// wiring (onClose/onProcessing).
vi.mock("@crossmint/client-sdk-react-ui", () => ({
  CrossmintProvider: ({ children }: { children: ReactNode }) => children,
  CrossmintCheckoutProvider: ({ children }: { children: ReactNode }) => children,
  CrossmintEmbeddedCheckout: () => null,
  useCrossmintCheckout: () => ({ order: undefined, orderClientSecret: undefined }),
}));

if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
