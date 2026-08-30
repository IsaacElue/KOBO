import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The landing page's call to action. Three looks, all from the Landing export:
 *  - solid   forest-green gradient, cream text — the primary button
 *  - ghost   hairline border, ink text — the nav "Log in"
 *  - inverse cream fill, forest text — for use on the dark final-CTA band
 *
 * `href` defaults to "/?auth=signup" — the app root reads the `?auth=` intent
 * (see AuthGate) and opens the sign-up form instead of bouncing back to the
 * landing page. Pass "/?auth=login" for a log-in CTA.
 */
export function CtaButton({
  href = "/?auth=signup",
  children = "Start sending",
  variant = "solid",
  className,
}: {
  href?: string;
  children?: React.ReactNode;
  variant?: "solid" | "ghost" | "inverse";
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center justify-center rounded-full font-semibold tracking-tight transition-transform duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-landing-green focus-visible:ring-offset-2 focus-visible:ring-offset-landing-bg active:scale-[0.98]",
        variant === "solid" &&
          "bg-gradient-to-br from-landing-teal to-landing-teal-deep px-9 py-[18px] text-[16.5px] text-[#f2fbf8] shadow-[0_24px_40px_-22px_rgba(8,62,59,0.9)] hover:-translate-y-0.5",
        variant === "ghost" &&
          "border border-landing-ink/15 bg-transparent px-[22px] py-[11px] text-[14.5px] text-landing-ink hover:border-landing-ink/30",
        variant === "inverse" &&
          "bg-landing-on-dark px-10 py-[18px] text-[16.5px] text-landing-teal-deep shadow-[0_24px_44px_-22px_rgba(0,0,0,0.5)] hover:-translate-y-0.5",
        className,
      )}
    >
      {children}
    </Link>
  );
}
