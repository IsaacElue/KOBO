"use client";

import { useState } from "react";
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
import type { NewRecipientInput } from "@/lib/kobo/types";

export function AddRecipientDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (input: NewRecipientInput) => void;
}) {
  const [name, setName] = useState("");
  const [wallet, setWallet] = useState("");
  const [error, setError] = useState("");

  function reset() {
    setName("");
    setWallet("");
    setError("");
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet.trim()) {
      setError("Enter a wallet address or phone number.");
      return;
    }
    onAdd({ name: name.trim() || "New recipient", wallet: wallet.trim() });
    reset();
    onOpenChange(false);
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
                Wallet address or phone number
              </label>
              <Input
                id="recipient-wallet"
                value={wallet}
                onChange={(e) => {
                  setWallet(e.target.value);
                  if (error) setError("");
                }}
                placeholder="0x… or +234…"
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
            <Button type="submit">Add recipient</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
