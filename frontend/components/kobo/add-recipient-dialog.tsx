"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createUser } from "@/lib/kobo/api";
import { isPlausibleSolanaAddress } from "@/lib/kobo/solana";
import type { CreateUserResponse } from "@/lib/kobo/types";

export function AddRecipientDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (user: CreateUserResponse) => void;
}) {
  const [name, setName] = useState("");
  const [wallet, setWallet] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setName("");
    setWallet("");
    setError("");
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedWallet = wallet.trim();
    if (!trimmedWallet) {
      setError("Enter a Solana wallet address.");
      return;
    }
    if (!isPlausibleSolanaAddress(trimmedWallet)) {
      setError("That doesn't look like a valid Solana wallet address.");
      return;
    }

    setSubmitting(true);
    try {
      const created = await createUser({
        name: name.trim() || "New recipient",
        role: "recipient",
        // Kobo Phase 1 is the Ireland -> Nigeria corridor only, so every recipient
        // added here is in Nigeria by product scope, not by assumption — there's no
        // country input in this form (see API_CONTRACT.md, "Add new recipient").
        country: "NG",
        wallet_address: trimmedWallet,
      });
      onAdd(created);
      reset();
      onOpenChange(false);
    } catch {
      toast.error("Couldn't add recipient. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add new recipient</DialogTitle>
            <DialogDescription>
              They&apos;ll receive USDC directly to this wallet.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="recipient-name" className="text-sm font-medium text-kobo-ink">
                Name
              </label>
              <Input
                id="recipient-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Folake Adeyemi"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="recipient-wallet" className="text-sm font-medium text-kobo-ink">
                Solana wallet address
              </label>
              <Input
                id="recipient-wallet"
                value={wallet}
                onChange={(e) => {
                  setWallet(e.target.value);
                  if (error) setError("");
                }}
                placeholder="e.g. 7xKX...gAsU"
                aria-invalid={!!error}
                aria-describedby={error ? "recipient-wallet-error" : undefined}
              />
              {error && (
                <p id="recipient-wallet-error" role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              Add recipient
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
