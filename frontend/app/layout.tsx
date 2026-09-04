import type { Metadata, Viewport } from "next";
import { Outfit, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { Toaster } from "@/components/ui/sonner";
import { AccessSync } from "@/components/kobo/access-sync";
import "./globals.css";

// Outfit — the sans used across the "Kobo Web App" design export. A clean,
// slightly rounded geometric grotesque: approachable for a money app without
// tipping into novelty. Numerics use Geist Mono (--font-geist-mono) as before.
const sans = Outfit({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Kobo",
  description: "Send EUR home as USDC, usually within two minutes.",
  // Browser-tab icon, theme-aware. The dotted K is a single dark colour
  // (#0b1f24) — invisible on a dark tab strip — so we ship two variants and let
  // the browser pick: the ink mark by default (light chrome), a light mint mark
  // under `prefers-color-scheme: dark`. Assets: scripts/build-brand-assets.mjs.
  // `app/favicon.ico` stays a file-convention asset (Next always emits its
  // link, as the legacy fallback); defining `icons` here suppresses the
  // file-convention `icon`/`apple-icon` merge, so those are listed explicitly.
  icons: {
    icon: [
      { url: "/brand/kobo-icon.png", type: "image/png", sizes: "96x96" },
      {
        url: "/brand/kobo-icon-light.png",
        type: "image/png",
        sizes: "96x96",
        media: "(prefers-color-scheme: dark)",
      },
    ],
    apple: { url: "/brand/kobo-apple-icon.png", type: "image/png", sizes: "180x180" },
  },
};

// `viewport-fit=cover` so `env(safe-area-inset-*)` resolves to real values on
// notched iOS / Android gesture-bar devices — the mobile bottom tab bar uses it
// (components/kobo/bottom-nav.tsx). width/initial-scale are Next's defaults.
//
// `themeColor` tints mobile browser chrome (iOS status bar, Android address bar)
// with the brand's deep forest green — `--kobo-teal-800` from globals.css, the
// dark end of every primary gradient in the app.
export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#073f3c",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Script
          strategy="afterInteractive"
          data-domain="kobopayments.com"
          src="https://plausible.io/js/pa-GZ0hr_Osai5YBmpiXjcpB.js"
        />
        <Script id="plausible-init" strategy="afterInteractive">
          {`window.plausible = window.plausible || function() { (window.plausible.q = window.plausible.q || []).push(arguments) }; window.plausible.init = window.plausible.init || function(i) { window.plausible.o = i || {} }; window.plausible.init()`}
        </Script>
        <AccessSync />
        {children}
        {/* Bottom offset lifts toasts clear of the mobile bottom tab bar
            (< 1024px); resolves to the plain 24px on desktop. See globals.css. */}
        <Toaster
          position="bottom-right"
          offset={{ bottom: "var(--kobo-toast-offset-bottom)" }}
          mobileOffset={{ bottom: "var(--kobo-toast-offset-bottom)" }}
        />
      </body>
    </html>
  );
}
