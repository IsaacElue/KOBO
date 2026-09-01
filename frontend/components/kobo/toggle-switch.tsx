"use client";

import { cn } from "@/lib/utils";

/**
 * Pill toggle from the Settings design handoff: 46×27 track, 21px knob that
 * slides on a 0.2s ease, mint (#1E9B76) when on. A real `role="switch"` button
 * so it's keyboard- and screen-reader-operable (the handoff mock was a bare div).
 */
export function ToggleSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Accessible name — the visible row label is separate, so this ties them together. */
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        // 46x27 is the handoff's visual pill; the `before` pseudo-element gives
        // it a centered 44x44 hit target (WCAG 2.5.5 / Apple HIG) without
        // changing the pill's footprint in the row.
        "relative h-[27px] w-[46px] shrink-0 rounded-full p-[3px] transition-colors duration-200 outline-none focus-visible:ring-3 focus-visible:ring-kobo-teal-600/40 before:absolute before:left-1/2 before:top-1/2 before:h-11 before:w-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']",
        checked ? "bg-[#1E9B76]" : "bg-kobo-ink/16"
      )}
    >
      <span
        className={cn(
          "block size-[21px] rounded-full bg-white shadow-[0_2px_6px_rgba(11,31,36,0.25)] transition-[margin] duration-200 ease-[cubic-bezier(0.2,0.7,0.3,1)]",
          checked ? "ml-[19px]" : "ml-0"
        )}
      />
    </button>
  );
}
