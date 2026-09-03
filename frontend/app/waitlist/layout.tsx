import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";

// Same display/body face and self-contained cream surface as /landing, via the
// shared `landing-root` token scope in globals.css. This route is otherwise
// standalone: a post-Demo-Day campaign page, not part of the app or the
// landing/signup flow.
const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Kobo: early access to a better way to send money home",
  description:
    "Kobo is building a faster, simpler way to send money from Ireland to Nigeria. Join the early-access list and be first to try it.",
  openGraph: {
    title: "Be first in line for Kobo",
    description:
      "A faster, simpler way to send money home from Ireland to Nigeria. Join the waitlist for early access.",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export default function WaitlistLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`landing-root ${spaceGrotesk.variable} min-h-screen w-full overflow-x-clip`}
    >
      {children}
    </div>
  );
}
