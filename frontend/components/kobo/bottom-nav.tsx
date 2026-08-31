"use client";

import { cn } from "@/lib/utils";
import { MOBILE_NAV_INDICES, NAV_ITEMS } from "@/lib/kobo/nav";
import { Activity, LayoutDashboard, LifeBuoy, Send, Users, type LucideIcon } from "lucide-react";

/**
 * Mobile bottom tab bar for < 1024px, where the sidebar (`hidden lg:flex`)
 * isn't shown. Same items and labels as the sidebar via `MOBILE_NAV_INDICES`
 * (Overview / Send money / Recipients / Activity / Help — Settings stays in the
 * account dropdown), and the same active signal: ink text + a mint accent,
 * mirroring the sidebar's active row (`text-kobo-ink` + green dot).
 *
 * `position: fixed` to the viewport bottom (the app shell scrolls the page, not
 * an inner container, so a flex child wouldn't stay in view). The shell adds
 * matching bottom padding below `lg` so this never covers page content, and
 * `pb-[env(safe-area-inset-bottom)]` keeps the tap targets clear of the iOS home
 * indicator / Android gesture bar (needs `viewport-fit=cover`, set in
 * app/layout.tsx). Hidden at `lg` — the sidebar takes over, untouched.
 */

const ICONS: Record<number, LucideIcon> = {
  0: LayoutDashboard,
  1: Send,
  2: Users,
  3: Activity,
  5: LifeBuoy,
};

export function BottomNav({
  activeIndex,
  onSelect,
}: {
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-kobo-ink/[0.07] bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
    >
      <ul className="flex items-stretch">
        {MOBILE_NAV_INDICES.map((index) => {
          const label = NAV_ITEMS[index];
          const Icon = ICONS[index];
          const active = index === activeIndex;
          return (
            <li key={index} className="flex-1">
              <button
                type="button"
                onClick={() => onSelect(index)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-[56px] w-full flex-col items-center justify-center gap-1 px-1 py-2 transition-transform active:scale-95",
                  active ? "text-kobo-ink" : "text-[#4A6970]"
                )}
              >
                <Icon
                  className={cn("size-[19px]", active ? "text-[#1E9B76]" : "text-[#8AA3A9]")}
                  strokeWidth={active ? 2.2 : 1.8}
                />
                <span className="text-[10.5px] font-medium leading-none whitespace-nowrap">
                  {label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
