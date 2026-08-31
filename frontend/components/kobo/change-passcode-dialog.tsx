"use client";

import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { changePassword } from "@/lib/kobo/api";

/**
 * Password change, lifted out of the old inline Settings form into a dialog
 * opened from the Security card's "Change passcode" row. Same `POST
 * /auth/password` call, validation, and sign-out-after behaviour as before. The
 * parent remounts this via a `key` on open, so each open starts from a cleared
 * form.
 */
export function ChangePasscodeDialog({
  open,
  onOpenChange,
  onLogout,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present in real-auth mode: a successful change signs the user out. */
  onLogout?: () => void;
}) {
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!currentPw || !newPw) return setError("Enter your current and new password.");
    if (newPw.length < 8) return setError("New password must be at least 8 characters.");
    if (newPw !== confirmPw) return setError("New passwords don't match.");
    if (newPw === currentPw) {
      return setError("Your new password must be different from your current one.");
    }

    setSaving(true);
    setError("");
    try {
      await changePassword(currentPw, newPw);
      if (onLogout) {
        toast.success("Password updated. Please sign in again");
        onLogout();
      } else {
        toast.success("Password updated");
        onOpenChange(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update your password. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-w-[440px] gap-0 rounded-[32px] border border-white/95 bg-white p-8 pb-7 shadow-[0_60px_110px_-44px_rgba(0,0,0,0.6)] ring-0"
      >
        <DialogHeader>
          <DialogTitle className="text-2xl font-semibold tracking-tight text-kobo-ink">
            Change passcode
          </DialogTitle>
          <DialogDescription className="text-[14.5px] text-[#5E7A81]">
            You&apos;ll be signed out and need to log in again with the new one.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
          <DialogField label="Current password" htmlFor="change-pw-current">
            <Input
              id="change-pw-current"
              type="password"
              value={currentPw}
              onChange={(e) => {
                setCurrentPw(e.target.value);
                if (error) setError("");
              }}
              autoComplete="current-password"
            />
          </DialogField>
          <DialogField label="New password" htmlFor="change-pw-new" hint="At least 8 characters">
            <Input
              id="change-pw-new"
              type="password"
              value={newPw}
              onChange={(e) => {
                setNewPw(e.target.value);
                if (error) setError("");
              }}
              autoComplete="new-password"
            />
          </DialogField>
          <DialogField label="Confirm new password" htmlFor="change-pw-confirm">
            <Input
              id="change-pw-confirm"
              type="password"
              value={confirmPw}
              onChange={(e) => {
                setConfirmPw(e.target.value);
                if (error) setError("");
              }}
              autoComplete="new-password"
              aria-invalid={!!error}
              aria-describedby={error ? "change-pw-error" : undefined}
            />
          </DialogField>

          {error && (
            <p id="change-pw-error" role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="mt-1 flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-auto flex-1 rounded-full border-kobo-ink/[0.14] bg-white py-3.5 text-[15px] font-medium text-kobo-ink hover:-translate-y-0.5 hover:border-kobo-teal-600"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="h-auto flex-[1.3] rounded-full bg-gradient-to-br from-kobo-teal-500 to-kobo-teal-800 py-3.5 text-[15px] font-semibold text-kobo-mint-light shadow-lg shadow-kobo-teal-900/40 hover:-translate-y-0.5 hover:opacity-95"
            >
              {saving ? "Updating…" : "Update password"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DialogField({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-kobo-ink">
        {label}
      </label>
      {children}
      {hint && <span className="text-[12.5px] text-[#8AA3A9]">{hint}</span>}
    </div>
  );
}
