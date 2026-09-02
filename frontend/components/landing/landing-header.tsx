import Link from "next/link";
import { CtaButton } from "@/components/landing/cta-button";
import { KoboLogo } from "@/components/kobo/kobo-logo";

/**
 * Sticky translucent nav from the Landing export. Collapses its link list on
 * narrow screens (the export hides them below the container's comfortable
 * width); brand + Log in always stay.
 */
export function LandingHeader() {
  return (
    <nav className="sticky top-0 z-40 border-b border-landing-ink/[0.08] bg-landing-bg/80 backdrop-blur-[14px]">
      <div className="mx-auto flex max-w-[1360px] items-center justify-between px-6 py-[18px] sm:px-12">
        <Link href="/landing" className="flex items-center" aria-label="Kobo home">
          <KoboLogo variant="full" priority className="h-7" />
        </Link>

        <div className="hidden items-center gap-9 text-[15px] font-medium text-[#33565E] md:flex">
          <a href="#how" className="transition-colors hover:text-landing-ink">
            How it works
          </a>
          <a href="#hold" className="transition-colors hover:text-landing-ink">
            Why we hold
          </a>
          <a href="#trust" className="transition-colors hover:text-landing-ink">
            Security
          </a>
        </div>

        <CtaButton href="/?auth=login" variant="ghost">
          Log in
        </CtaButton>
      </div>
    </nav>
  );
}
