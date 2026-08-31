"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { LogoutConfirmDialog } from "@/components/kobo/logout-confirm-dialog";
import { ChevronDown, LifeBuoy, LogOut, Search, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

export function AppHeader({
  currencyCode,
  rate,
  userName,
  userInitials,
  onGoToSettings,
  onGoToHelp,
  onLogout,
}: {
  currencyCode: string;
  rate: string;
  userName: string;
  userInitials: string;
  onGoToSettings: () => void;
  onGoToHelp: () => void;
  /**
   * Present only in real-auth mode. When absent (mock mode) the "Sign out" row
   * still renders but does nothing — there's no real session to end, same as the
   * account button was inert before this menu existed.
   */
  onLogout?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  // `rate` comes from a live fetch, so its value at server-render time and at the
  // client's initial (pre-hydration) render time can genuinely differ — that's a
  // real server/client mismatch, not a false positive to silence. Render a stable
  // placeholder until after mount (this render is deterministic on both server and
  // client, since `mounted` starts `false` on both and only flips via an effect,
  // which never runs during SSR or the hydrating render), then swap to the real
  // value client-side — the standard Next.js pattern for client-only data.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot post-mount flag for the client-only rate value; deterministic, not a render loop
    setMounted(true);
  }, []);

  return (
    <header className="flex items-center justify-between gap-6 border-b border-kobo-ink/[0.06] bg-white/45 px-6 py-4 backdrop-blur-xl sm:px-10">
      <div className="flex max-w-[420px] flex-1 items-center gap-2.5 rounded-2xl border border-kobo-ink/[0.07] bg-white/75 px-4 py-2.5">
        <Search className="size-[15px] shrink-0 text-[#8AA3A9]" strokeWidth={1.9} />
        <Input
          placeholder="Search recipients, transfers, references"
          className="h-auto border-none bg-transparent p-0 text-[14.5px] text-kobo-ink shadow-none focus-visible:ring-0"
        />
      </div>
      <div className="flex items-center gap-3.5">
        <div className="hidden items-center gap-2 rounded-full border border-kobo-ink/[0.07] bg-white/70 px-3.5 py-2 sm:flex">
          <span className="size-1.5 motion-safe:animate-pulse rounded-full bg-[#1E9B76]" />
          <span className="font-mono text-[12.5px] text-[#33565E]">
            1 {currencyCode} = {mounted ? rate : "····"} USDC
          </span>
        </div>

        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger
            aria-label="Account menu"
            className="flex items-center gap-2.5 rounded-full border border-kobo-ink/[0.07] bg-white/70 py-1.5 pr-3 pl-1.5 transition-all outline-none hover:-translate-y-px hover:bg-white focus-visible:ring-3 focus-visible:ring-kobo-teal-600/40 active:scale-[0.97] aria-expanded:bg-white"
          >
            <Avatar>
              <AvatarFallback className="bg-gradient-to-br from-kobo-mint to-[#BFE7D1] font-semibold text-kobo-mint-dark">
                {userInitials}
              </AvatarFallback>
            </Avatar>
            <span className="text-[14.5px] font-medium text-kobo-ink">{userName}</span>
            <ChevronDown
              className={cn(
                "size-3.5 text-[#6E8A91] transition-transform",
                menuOpen && "rotate-180"
              )}
              strokeWidth={2}
            />
          </DropdownMenuTrigger>

          <DropdownMenuContent className="min-w-[220px]">
            <DropdownMenuItem onClick={() => onGoToSettings()}>
              <Settings className="size-[15px] text-[#6E8A91]" strokeWidth={1.8} />
              Account settings
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onGoToHelp()}>
              <LifeBuoy className="size-[15px] text-[#6E8A91]" strokeWidth={1.8} />
              Help centre
            </DropdownMenuItem>
            <DropdownMenuItem
              destructive
              onClick={onLogout ? () => setConfirmingLogout(true) : undefined}
            >
              <LogOut className="size-[15px]" strokeWidth={1.8} />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {onLogout && (
        <LogoutConfirmDialog
          open={confirmingLogout}
          onOpenChange={setConfirmingLogout}
          onConfirm={onLogout}
        />
      )}
    </header>
  );
}
