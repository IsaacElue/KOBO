"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LogoutConfirmDialog } from "@/components/kobo/logout-confirm-dialog";
import { Search } from "lucide-react";

export function AppHeader({
  currencyCode,
  rate,
  userName,
  userInitials,
  onLogout,
}: {
  currencyCode: string;
  rate: string;
  userName: string;
  userInitials: string;
  /** Omitted in mock mode — the avatar button then just isn't clickable, same as before this existed. */
  onLogout?: () => void;
}) {
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
        <button
          onClick={onLogout ? () => setConfirmingLogout(true) : undefined}
          aria-label={onLogout ? "Account menu — log out" : undefined}
          className="flex items-center gap-2.5 rounded-full border border-kobo-ink/[0.07] bg-white/70 py-1.5 pr-3.5 pl-1.5 transition-all hover:-translate-y-px hover:bg-white active:scale-[0.97]"
        >
          <Avatar>
            <AvatarFallback className="bg-gradient-to-br from-kobo-mint to-[#BFE7D1] font-semibold text-kobo-mint-dark">
              {userInitials}
            </AvatarFallback>
          </Avatar>
          <span className="text-[14.5px] font-medium text-kobo-ink">{userName}</span>
        </button>
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
