import Link from "next/link";

/** Footer from the Landing export: darkest forest, copyright + two links. */
export function SiteFooter() {
  return (
    <footer className="bg-landing-dark px-6 py-10 text-[13.5px] text-landing-on-dark/50 sm:px-12">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between">
        <div>© 2026 Kobo</div>
        <nav className="flex gap-6">
          <Link href="/" className="transition-colors hover:text-landing-on-dark/80">
            Terms
          </Link>
          <Link href="/" className="transition-colors hover:text-landing-on-dark/80">
            Privacy
          </Link>
        </nav>
      </div>
    </footer>
  );
}
