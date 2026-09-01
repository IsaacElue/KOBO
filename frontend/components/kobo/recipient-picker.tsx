"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { Recipient } from "@/lib/kobo/types";
import { Search, Check, UserRoundSearch } from "lucide-react";

export function RecipientPicker({
  recipients,
  selectedId,
  onSelect,
  onAddNew,
}: {
  recipients: Recipient[];
  selectedId: string;
  onSelect: (id: string) => void;
  onAddNew: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = recipients.find((r) => r.id === selectedId) ?? recipients[0];
  const results = recipients.filter((r) =>
    r.name.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <Card className="gap-0 overflow-hidden rounded-[28px] border border-white/90 bg-white p-0 shadow-[0_30px_60px_-46px_rgba(11,31,36,0.7)] ring-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-4.5 px-6.5 py-5.5 text-left transition-colors hover:bg-[#F6FAFA]"
      >
        <Avatar size="lg">
          <AvatarFallback className="bg-gradient-to-br from-kobo-mint to-[#BFE7D1] font-semibold text-kobo-mint-dark">
            {selected.initials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="mb-0.5 text-[11px] font-semibold tracking-[0.16em] text-[#8AA3A9]">
            RECIPIENT
          </div>
          <div className="truncate text-[19px] font-semibold tracking-tight text-kobo-ink">
            {selected.name}
          </div>
          <div className="truncate text-[13.5px] text-[#7B959B]">{selected.meta}</div>
        </div>
        <span className="hidden max-w-[140px] truncate font-mono text-[12.5px] text-[#9BB2B8] sm:inline">
          {selected.wallet}
        </span>
        <span className="text-[13.5px] font-medium text-kobo-teal-600">
          {open ? "Close" : "Change"}
        </span>
      </button>

      {open && (
        <div
          role="region"
          aria-label="Saved recipients"
          className="border-t border-kobo-ink/[0.07] px-5.5 pt-4 pb-3"
        >
          <div className="flex items-center gap-2.5 rounded-2xl border border-kobo-ink/[0.06] bg-[#F1F6F7] px-4 py-2.5">
            <Search className="size-[15px] text-[#8AA3A9]" strokeWidth={1.9} />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search saved recipients"
              className="h-auto border-none bg-transparent p-0 text-[14.5px] shadow-none focus-visible:ring-0"
            />
          </div>

          {results.length > 0 ? (
            <div className="grid grid-cols-1 gap-1.5 py-2.5 sm:grid-cols-2">
              {results.map((r) => (
                <button
                  key={r.id}
                  onClick={() => {
                    onSelect(r.id);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={cn(
                    "flex items-center gap-3.5 rounded-2xl border border-transparent p-3 text-left transition-all hover:-translate-y-px hover:border-kobo-ink/[0.08] hover:bg-[#F4F9F9] active:scale-[0.985]"
                  )}
                >
                  <Avatar>
                    <AvatarFallback className="bg-gradient-to-br from-[#DDF2E6] to-[#C6EAD6] font-semibold text-kobo-mint-dark">
                      {r.initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[16px] font-medium text-kobo-ink">{r.name}</div>
                    <div className="text-[13px] text-[#8AA3A9]">{r.lastSent}</div>
                  </div>
                  {r.id === selectedId && (
                    <Check className="size-[18px] text-kobo-teal-600" strokeWidth={2.4} />
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center">
              <div className="mx-auto mb-3.5 flex size-14 items-center justify-center rounded-full border border-dashed border-kobo-ink/[0.16] bg-[#F1F6F7]">
                <UserRoundSearch className="size-[22px] text-[#9BB2B8]" strokeWidth={1.6} />
              </div>
              <div className="mb-1 text-[15.5px] font-medium text-[#33565E]">
                No one by that name
              </div>
              <div className="mb-4 text-[13.5px] text-[#8AA3A9]">
                Add someone by name or email, or use a wallet address.
              </div>
              <Button
                variant="outline"
                onClick={onAddNew}
                className="h-auto rounded-full border-kobo-ink/[0.14] px-5.5 py-2.5 text-[14.5px] hover:border-kobo-teal-600"
              >
                Add new recipient
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
