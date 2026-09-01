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
  title: "Kobo waitlist: early access to euro-in, USDC-out",
  description:
    "Join the Kobo waitlist. Send euros from Ireland to family in Nigeria as USDC on Solana, held safely until they choose to convert. Refer friends to move up the queue.",
  openGraph: {
    title: "Get early access to Kobo",
    description:
      "Euros from Ireland, digital dollars in Nigeria, settled on Solana in seconds. Join the waitlist.",
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
