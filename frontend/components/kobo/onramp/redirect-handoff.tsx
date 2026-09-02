"use client";

import { useEffect, useState } from "react";
import { KoboLogo } from "@/components/kobo/kobo-logo";

/** Caller must persist any state it needs to resume before rendering this — it navigates away. */
export function RedirectHandoff({
  widgetUrl,
  partnerName = "Transak",
}: {
  widgetUrl: string;
  /** On-ramp partner name for the copy. Defaults to Transak (its long-standing caller). */
  partnerName?: string;
}) {
  const [showManualLink, setShowManualLink] = useState(false);

  useEffect(() => {
    const redirectTimer = setTimeout(() => {
      window.location.href = widgetUrl;
    }, 400);
    const manualLinkTimer = setTimeout(() => setShowManualLink(true), 3000);
    return () => {
      clearTimeout(redirectTimer);
      clearTimeout(manualLinkTimer);
    };
    // Only ever run once per mount - re-running on prop identity churn would re-trigger the redirect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-gradient-to-b from-[#DCEDEA] via-kobo-bg to-[#E8F0F1] px-6 text-center"
    >
      <KoboLogo variant="mark" priority className="h-14" />
      <div className="relative size-10">
        <div className="absolute inset-0 rounded-full border-2 border-kobo-teal-600/20" />
        <div className="absolute inset-0 motion-safe:animate-spin rounded-full border-2 border-transparent border-t-kobo-teal-600" />
      </div>
      <div>
        <div className="text-xl font-semibold tracking-tight text-kobo-ink">
          Continuing to {partnerName}
        </div>
        <p className="mt-2 max-w-sm text-[14.5px] text-[#5E7A81]">
          Your payment details are handled directly by {partnerName}, our licensed on-ramp partner.
          Kobo never sees them.
        </p>
      </div>
      {showManualLink && (
        <a
          href={widgetUrl}
          className="text-sm font-medium text-kobo-teal-600 underline underline-offset-4 hover:text-kobo-teal-800"
        >
          Taking a while? Continue to {partnerName}
        </a>
      )}
    </div>
  );
}
