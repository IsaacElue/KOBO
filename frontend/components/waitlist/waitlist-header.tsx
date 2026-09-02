/**
 * Minimal brand-only header for the standalone /waitlist route. No nav; the
 * page isn't linked from anywhere and has nothing to navigate to. The mark
 * links to /landing so a curious visitor can still see the product.
 */
import Link from "next/link";
import { KoboLogo } from "@/components/kobo/kobo-logo";

export function WaitlistHeader() {
  return (
    <header className="px-6 py-[18px] sm:px-12">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between">
        <Link href="/landing" className="flex items-center" aria-label="Kobo home">
          <KoboLogo variant="full" priority className="h-7" />
        </Link>
        <span className="text-[13px] font-semibold tracking-[0.02em] text-landing-mint-dark">
          Waitlist
        </span>
      </div>
    </header>
  );
}
