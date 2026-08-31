import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";

// Space Grotesk is the display + body face across the Landing and Signup
// design exports — a warm geometric grotesque. Numerics/tx references fall back
// to the app's existing mono (--font-geist-mono, already on <html>).
const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Kobo: euro in, USDC out, on Solana",
  description:
    "Send euros from Ireland to family in Nigeria as USDC. It settles on Solana in seconds, and is held safely until they choose to convert it.",
  openGraph: {
    title: "Kobo: euro in, USDC out, on Solana",
    description:
      "Euros from Ireland, digital dollars in Nigeria. Settled on Solana in seconds.",
    type: "website",
  },
};

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className={`landing-root ${spaceGrotesk.variable} min-h-screen w-full overflow-x-clip`}
    >
      {children}
    </div>
  );
}
