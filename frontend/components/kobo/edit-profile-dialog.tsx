"use client";

import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SUPPORT_EMAIL } from "@/lib/kobo/mock-data";
import { updateProfile } from "@/lib/kobo/api";
import type { UserProfile } from "@/lib/kobo/types";

/**
 * Name + country edit, lifted out of the old inline Settings form into a dialog
 * opened from the redesigned Profile card's "Edit" control. Same `PATCH
 * /auth/profile` call and validation as before; on success it hands the updated
 * profile back so the card re-renders.
 *
 * The parent remounts this via a `key` on open, so the field state seeds from
 * `profile` in the `useState` initializers — no reset effect needed.
 */
export function EditProfileDialog({
  open,
  onOpenChange,
  profile,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: UserProfile | null;
  onSaved: (profile: UserProfile) => void;
}) {
  const [name, setName] = useState(profile?.name ?? "");
  const [country, setCountry] = useState(profile?.country ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const dirty =
    !!profile && (name.trim() !== profile.name || country.trim() !== profile.country);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    if (!name.trim()) return setError("Enter your name.");
    if (!country.trim()) return setError("Enter your country.");

    setSaving(true);
    setError("");
    try {
      const updated = await updateProfile({ name: name.trim(), country: country.trim() });
      onSaved(updated);
      toast.success("Profile updated");
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your changes. Please try again.");
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
            Edit profile
          </DialogTitle>
          <DialogDescription className="text-[14.5px] text-[#5E7A81]">
            Your name as it appears on Kobo, and where you&apos;re sending from.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
          <DialogField label="Name" htmlFor="edit-profile-name">
            <Input
              id="edit-profile-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError("");
              }}
              autoComplete="name"
              disabled={!profile}
            />
          </DialogField>
          <DialogField label="Country" htmlFor="edit-profile-country" hint="Two-letter code, e.g. IE">
            <Input
              id="edit-profile-country"
              value={country}
              onChange={(e) => {
                setCountry(e.target.value);
                if (error) setError("");
              }}
              autoComplete="country"
              disabled={!profile}
            />
          </DialogField>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <p className="text-[12.5px] leading-relaxed text-[#8AA3A9]">
            To change your email, {""}
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=Change my email`}
              className="font-medium text-kobo-teal-600 hover:text-kobo-ink"
            >
              contact support
            </a>
            .
          </p>

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
              disabled={!dirty || saving}
              className="h-auto flex-[1.3] rounded-full bg-gradient-to-br from-kobo-teal-500 to-kobo-teal-800 py-3.5 text-[15px] font-semibold text-kobo-mint-light shadow-lg shadow-kobo-teal-900/40 hover:-translate-y-0.5 hover:opacity-95"
            >
              {saving ? "Saving…" : "Save changes"}
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
