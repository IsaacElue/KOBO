"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Recipient } from "@/lib/kobo/types";
import { Search, Send, Trash2, UserRoundPlus, UserRoundSearch } from "lucide-react";

export function RecipientsScreen({
  recipients,
  onAddNew,
  onSend,
  onRemove,
}: {
  recipients: Recipient[];
  onAddNew: () => void;
  onSend: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);

  const results = recipients.filter((r) =>
    r.name.toLowerCase().includes(query.trim().toLowerCase())
  );
  const pendingRemove = recipients.find((r) => r.id === pendingRemoveId) ?? null;

  return (
    <div className="flex-1 overflow-y-auto p-6 pb-10 sm:p-10">
      <div className="mb-6.5 flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="mb-2 text-3xl font-semibold tracking-tight sm:text-[34px]">
            Recipients
          </h1>
          <p className="max-w-xl text-[15.5px] text-[#5E7A81]">
            Everyone you&apos;ve sent to, saved for next time.
          </p>
        </div>
        <Button
          onClick={onAddNew}
          className="h-auto gap-2 rounded-full bg-gradient-to-br from-kobo-teal-500 to-kobo-teal-800 px-5.5 py-2.5 text-[14.5px] font-medium text-kobo-mint-light shadow-lg shadow-kobo-teal-900/40 hover:-translate-y-0.5 hover:opacity-95"
        >
          <UserRoundPlus className="size-[17px]" strokeWidth={2} />
          Add recipient
        </Button>
      </div>

      <div className="mb-6 flex items-center gap-2.5 rounded-2xl border border-kobo-ink/[0.06] bg-white/80 px-4 py-3 sm:max-w-sm">
        <Search className="size-[15px] shrink-0 text-[#8AA3A9]" strokeWidth={1.9} />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name"
          className="h-auto border-none bg-transparent p-0 text-[14.5px] shadow-none focus-visible:ring-0"
        />
      </div>

      {results.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {results.map((r) => (
            <Card
              key={r.id}
              className="gap-0 rounded-[26px] border border-white/90 bg-white p-5.5 shadow-[0_24px_50px_-42px_rgba(11,31,36,0.7)] ring-0"
            >
              <div className="flex items-start gap-3.5">
                <Avatar size="lg">
                  <AvatarFallback className="bg-gradient-to-br from-kobo-mint to-[#BFE7D1] font-semibold text-kobo-mint-dark">
                    {r.initials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[17px] font-semibold tracking-tight text-kobo-ink">
                    {r.name}
                  </div>
                  <div className="truncate text-[13px] text-[#8AA3A9]">{r.meta}</div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between rounded-2xl bg-[#F6FAFA] px-3.5 py-2.5">
                <span className="truncate font-mono text-[12.5px] text-[#5E7A81]">
                  {r.wallet}
                </span>
              </div>
              <div className="mt-2.5 text-[13px] text-[#8AA3A9]">{r.lastSent}</div>

              <div className="mt-4.5 flex items-center gap-2">
                <Button
                  onClick={() => onSend(r.id)}
                  className="h-auto flex-1 gap-2 rounded-full bg-gradient-to-br from-kobo-teal-500 to-kobo-teal-800 py-2.5 text-[14px] font-medium text-kobo-mint-light hover:opacity-95"
                >
                  <Send className="size-[14px]" strokeWidth={2} />
                  Send
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${r.name}`}
                  title={
                    recipients.length <= 1
                      ? "You need at least one saved recipient"
                      : undefined
                  }
                  disabled={recipients.length <= 1}
                  onClick={() => setPendingRemoveId(r.id)}
                  // 36px circle stays (visual balance next to the Send pill); the
                  // `before` pseudo-element carries the 44px hit target.
                  className="relative size-9 shrink-0 rounded-full text-[#8AA3A9] before:absolute before:left-1/2 before:top-1/2 before:h-11 before:w-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-[''] hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-[15px]" strokeWidth={1.9} />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="max-w-md items-center gap-3 rounded-[28px] border border-white/90 bg-white/85 p-10 text-center ring-0">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-[#F1F6F7]">
            <UserRoundSearch className="size-[22px] text-[#9BB2B8]" strokeWidth={1.6} />
          </div>
          <h2 className="text-xl font-semibold tracking-tight text-kobo-ink">
            No one by that name
          </h2>
          <p className="text-[14.5px] text-[#7B959B]">
            Try a different search, or add someone new.
          </p>
          <Button
            variant="outline"
            onClick={onAddNew}
            className="mt-2 h-auto rounded-full border-kobo-ink/[0.14] px-5.5 py-2.5 text-[14.5px] hover:border-kobo-teal-600"
          >
            Add new recipient
          </Button>
        </Card>
      )}

      <AlertDialog
        open={pendingRemove !== null}
        onOpenChange={(open) => !open && setPendingRemoveId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {pendingRemove?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              You&apos;ll need to add them again to send money here in future.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (pendingRemoveId) onRemove(pendingRemoveId);
                setPendingRemoveId(null);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
