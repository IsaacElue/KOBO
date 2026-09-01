/**
 * Minimal brand-only header for the standalone /waitlist route. No nav; the
 * page isn't linked from anywhere and has nothing to navigate to. The mark
 * links to /landing so a curious visitor can still see the product.
 */
import Link from "next/link";

export function WaitlistHeader() {
  return (
    <header className="px-6 py-[18px] sm:px-12">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between">
        <Link
          href="/landing"
          className="flex items-center gap-2.5 text-[19px] font-bold tracking-[-0.02em] text-landing-ink"
        >
          <span className="size-[26px] rounded-[8px] bg-gradient-to-br from-[#1E9B76] to-landing-teal-deep" />
          Kobo
        </Link>
        <span className="text-[13px] font-semibold tracking-[0.02em] text-landing-mint-dark">
          Waitlist
        </span>
      </div>
    </header>
  );
}
