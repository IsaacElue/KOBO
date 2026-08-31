import type { Metadata, Viewport } from "next";
import { Outfit, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
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
