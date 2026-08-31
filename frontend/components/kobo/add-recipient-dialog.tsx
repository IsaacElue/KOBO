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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AddRecipientDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (user: CreateUserResponse) => void;
}) {
  const [mode, setMode] = useState<"email" | "address">("email");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [wallet, setWallet] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setMode("email");
    setName("");
    setEmail("");
    setWallet("");
    setError("");
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  function switchMode(next: "email" | "address") {
    setMode(next);
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    let request: Parameters<typeof createUser>[0];

    if (mode === "email") {
      const trimmedEmail = email.trim();
      if (!trimmedEmail) {
        setError("Enter the recipient's email address.");
        return;
      }
      if (!EMAIL_RE.test(trimmedEmail)) {
        setError("That doesn't look like a valid email address.");
        return;
      }
      request = { name: name.trim() || "New recipient", role: "recipient", country: "NG", email: trimmedEmail };
    } else {
      const trimmedWallet = wallet.trim();
      if (!trimmedWallet) {
        setError("Enter a Solana wallet address.");
        return;
      }
      if (!isPlausibleSolanaAddress(trimmedWallet)) {
        setError("That doesn't look like a valid Solana wallet address.");
        return;
      }
      request = {
        name: name.trim() || "New recipient",
        role: "recipient",
        country: "NG",
        wallet_address: trimmedWallet,
      };
    }

    setSubmitting(true);
    try {
      // Kobo Phase 1 is the Ireland -> Nigeria corridor only, so every recipient
      // added here is in Nigeria by product scope, not by assumption — there's no
      // country input in this form (see API_CONTRACT.md, "Add new recipient").
      const created = await createUser(request);
      onAdd(created);
      reset();
      onOpenChange(false);
    } catch {
      toast.error(
        mode === "email"
          ? "Couldn't set up a wallet for that email. Please try again."
          : "Couldn't add recipient. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        {/* noValidate: validation is entirely our own (setError below) — without
            this, the browser's native type="email" constraint check silently
            blocks the submit event for a malformed address before our handler
            (and its role="alert" message) ever runs. */}
        <form onSubmit={handleSubmit} noValidate>
          <DialogHeader>
            <DialogTitle>Add new recipient</DialogTitle>
            <DialogDescription>
              {mode === "email"
                ? "They'll receive USDC even if they don't have a wallet yet. We'll set one up for them."
                : "They'll receive USDC directly to this wallet."}
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

            {mode === "email" ? (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="recipient-email" className="text-sm font-medium text-kobo-ink">
                  Email address
                </label>
                <Input
                  id="recipient-email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError("");
                  }}
                  placeholder="e.g. folake@example.com"
                  aria-invalid={!!error}
                  aria-describedby={error ? "recipient-email-error" : undefined}
                />
                {error && (
                  <p id="recipient-email-error" role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                )}
              </div>
            ) : (
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
            )}

            <button
              type="button"
              onClick={() => switchMode(mode === "email" ? "address" : "email")}
              className="self-start text-sm text-kobo-ink/60 underline-offset-2 hover:underline"
            >
              {mode === "email"
                ? "They already have a Solana address. Paste it instead"
                : "Use their email instead"}
            </button>
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
