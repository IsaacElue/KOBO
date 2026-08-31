"use client";

import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LogoutConfirmDialog } from "@/components/kobo/logout-confirm-dialog";
import { SUPPORT_EMAIL } from "@/lib/kobo/mock-data";
import { changePassword, getProfile, updateProfile } from "@/lib/kobo/api";
import type { UserProfile } from "@/lib/kobo/types";
import { Check, Copy, LogOut, Mail } from "lucide-react";

/**
 * Settings — profile, email, password, wallet, account details, support, and
 * logout. All real data: `GET /auth/me` for the profile (the only endpoint
 * that returns a sender their own email + member-since), `PATCH /auth/profile`
 * and `POST /auth/password` for the two editable things. No invented fields —
 * every value shown comes straight from the profile response.
 *
 * `onLogout` is `AuthGate`'s real logout flow, omitted in mock mode exactly
 * like the header's — the Log out section then simply isn't rendered, same as
 * the header avatar isn't clickable there.
 */
export function SettingsScreen({
  authUser,
  onLogout,
}: {
  authUser: { id: string; name: string };
  onLogout?: () => void;
}) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadError, setLoadError] = useState(false);

  const [name, setName] = useState(authUser.name);
  const [country, setCountry] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState("");

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [savingPw, setSavingPw] = useState(false);
  const [pwError, setPwError] = useState("");

  const [logoutOpen, setLogoutOpen] = useState(false);
  const [walletCopied, setWalletCopied] = useState(false);

  async function loadProfile() {
    setLoadError(false);
    try {
      const p = await getProfile();
      setProfile(p);
      setName(p.name);
      setCountry(p.country);
    } catch {
      setLoadError(true);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time fetch-on-mount, same pattern as kobo-app.tsx's refreshRate/refreshBalance
    loadProfile();
  }, []);

  const profileDirty =
    !!profile && (name.trim() !== profile.name || country.trim() !== profile.country);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    if (!name.trim()) {
      setProfileError("Enter your name.");
      return;
    }
    if (!country.trim()) {
      setProfileError("Enter your country.");
      return;
    }

    setSavingProfile(true);
    setProfileError("");
    try {
      const updated = await updateProfile({ name: name.trim(), country: country.trim() });
      setProfile(updated);
      setName(updated.name);
      setCountry(updated.country);
      toast.success("Profile updated");
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Couldn't save your changes. Please try again.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!currentPw || !newPw) {
      setPwError("Enter your current and new password.");
      return;
    }
    if (newPw.length < 8) {
      setPwError("New password must be at least 8 characters.");
      return;
    }
    if (newPw !== confirmPw) {
      setPwError("New passwords don't match.");
      return;
    }
    if (newPw === currentPw) {
      setPwError("Your new password must be different from your current one.");
      return;
    }

    setSavingPw(true);
    setPwError("");
    try {
      await changePassword(currentPw, newPw);
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
      if (onLogout) {
        toast.success("Password updated. Please sign in again");
        onLogout();
      } else {
        toast.success("Password updated");
      }
    } catch (err) {
      setPwError(err instanceof Error ? err.message : "Couldn't update your password. Please try again.");
    } finally {
      setSavingPw(false);
    }
  }

  async function copyWallet() {
    if (!profile) return;
    try {
      await navigator.clipboard.writeText(profile.wallet_address);
      setWalletCopied(true);
      setTimeout(() => setWalletCopied(false), 1600);
    } catch {
      toast.error("Couldn't copy. Select and copy it manually.");
    }
  }

  const memberSince = profile
    ? new Date(profile.created_at).toLocaleDateString("en-IE", { month: "long", year: "numeric" })
    : "—";
  const email = profile?.email ?? "—";

  return (
    <div className="flex-1 overflow-y-auto p-6 pb-10 sm:p-10">
      <div className="mb-6.5">
        <h1 className="mb-2 text-3xl font-semibold tracking-tight sm:text-[34px]">Settings</h1>
        <p className="max-w-xl text-[15.5px] text-[#5E7A81]">
          Your account, security, and how to reach us.
        </p>
      </div>

      {loadError && (
        <Card className="mb-5 max-w-2xl flex-row items-center justify-between gap-4 rounded-[22px] border border-white/90 bg-white/85 p-4 ring-0">
          <p className="text-[14px] text-[#7B959B]">Couldn&apos;t load your profile.</p>
          <Button
            variant="outline"
            onClick={loadProfile}
            className="h-auto rounded-full border-kobo-ink/[0.14] px-4 py-2 text-[13.5px] hover:border-kobo-teal-600"
          >
            Try again
          </Button>
        </Card>
      )}

      <div className="flex max-w-2xl flex-col gap-5">
        {/* Profile */}
        <Section
          title="Profile"
          description="Your name as it appears on Kobo, and where you're sending from."
        >
          <form onSubmit={handleSaveProfile} className="flex flex-col gap-4">
            <Field label="Name" htmlFor="settings-name">
              <Input
                id="settings-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (profileError) setProfileError("");
                }}
                autoComplete="name"
                disabled={!profile}
              />
            </Field>
            <Field label="Country" htmlFor="settings-country" hint="Two-letter code, e.g. IE">
              <Input
                id="settings-country"
                value={country}
                onChange={(e) => {
                  setCountry(e.target.value);
                  if (profileError) setProfileError("");
                }}
                autoComplete="country"
                disabled={!profile}
              />
            </Field>
            {profileError && (
              <p role="alert" className="text-sm text-destructive">
                {profileError}
              </p>
            )}
            <div>
              <Button
                type="submit"
                disabled={!profileDirty || savingProfile}
                className="h-auto rounded-full bg-gradient-to-br from-kobo-teal-500 to-kobo-teal-800 px-6 py-2.5 text-[14.5px] font-medium text-kobo-mint-light shadow-lg shadow-kobo-teal-900/40 hover:-translate-y-0.5 hover:opacity-95"
              >
                {savingProfile ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>
        </Section>

        {/* Email */}
        <Section title="Email address" description="Used to sign in on a new device.">
          <DetailRow label="Email" value={email} mono />
          <p className="mt-3 text-[13px] leading-relaxed text-[#7B959B]">
            Changing your email needs a confirmation link sent to both addresses, which
            isn&apos;t available yet.{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=Change my email`}
              className="font-medium text-kobo-teal-600 hover:text-kobo-ink"
            >
              Contact support
            </a>{" "}
            to change it.
          </p>
        </Section>

        {/* Password */}
        <Section
          title="Password"
          description="You'll be signed out and need to log in again with the new one."
        >
          <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
            <Field label="Current password" htmlFor="settings-current-pw">
              <Input
                id="settings-current-pw"
                type="password"
                value={currentPw}
                onChange={(e) => {
                  setCurrentPw(e.target.value);
                  if (pwError) setPwError("");
                }}
                autoComplete="current-password"
              />
            </Field>
            <Field label="New password" htmlFor="settings-new-pw" hint="At least 8 characters">
              <Input
                id="settings-new-pw"
                type="password"
                value={newPw}
                onChange={(e) => {
                  setNewPw(e.target.value);
                  if (pwError) setPwError("");
                }}
                autoComplete="new-password"
              />
            </Field>
            <Field label="Confirm new password" htmlFor="settings-confirm-pw">
              <Input
                id="settings-confirm-pw"
                type="password"
                value={confirmPw}
                onChange={(e) => {
                  setConfirmPw(e.target.value);
                  if (pwError) setPwError("");
                }}
                autoComplete="new-password"
                aria-invalid={!!pwError}
                aria-describedby={pwError ? "settings-pw-error" : undefined}
              />
            </Field>
            {pwError && (
              <p id="settings-pw-error" role="alert" className="text-sm text-destructive">
                {pwError}
              </p>
            )}
            <div>
              <Button
                type="submit"
                disabled={savingPw}
                className="h-auto rounded-full bg-gradient-to-br from-kobo-teal-500 to-kobo-teal-800 px-6 py-2.5 text-[14.5px] font-medium text-kobo-mint-light shadow-lg shadow-kobo-teal-900/40 hover:-translate-y-0.5 hover:opacity-95"
              >
                {savingPw ? "Updating…" : "Update password"}
              </Button>
            </div>
          </form>
        </Section>

        {/* Account details */}
        <Section title="Account details">
          <div className="flex flex-col gap-1.5">
            <DetailRow label="Name" value={profile?.name ?? "—"} />
            <DetailRow label="Email" value={email} mono />
            <DetailRow label="Country" value={profile?.country ?? "—"} />
            <DetailRow label="Member since" value={memberSince} />
          </div>
        </Section>

        {/* Wallet */}
        <Section title="Linked address">
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#F6FAFA] px-3.5 py-2.5">
            <span className="truncate font-mono text-[12.5px] text-[#5E7A81]">
              {profile?.wallet_address ?? "—"}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Copy linked address"
              disabled={!profile}
              onClick={copyWallet}
              className="size-8 shrink-0 rounded-full text-[#8AA3A9] hover:bg-kobo-teal-600/10 hover:text-kobo-teal-700"
            >
              {walletCopied ? (
                <Check className="size-[15px]" strokeWidth={2} />
              ) : (
                <Copy className="size-[15px]" strokeWidth={1.9} />
              )}
            </Button>
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-[#7B959B]">
            Kobo sends USDC from its own pooled wallet, so this address isn&apos;t used to
            hold or move your money. It&apos;s kept on file in case direct wallet payouts
            are added later.
          </p>
        </Section>

        {/* Support */}
        <Section title="Help & support">
          <p className="text-[14px] leading-relaxed text-[#5E7A81]">
            Something not working, or a question about a transfer? Email us and we&apos;ll
            usually reply within one business day.
          </p>
          <div className="mt-4">
            <Button
              variant="outline"
              onClick={() => {
                window.location.href = `mailto:${SUPPORT_EMAIL}`;
              }}
              className="h-auto gap-2 rounded-full border-kobo-ink/[0.14] px-5 py-2.5 text-[14px] text-[#33565E] hover:border-kobo-teal-600 hover:text-kobo-ink"
            >
              <Mail className="size-[15px]" strokeWidth={1.9} />
              {SUPPORT_EMAIL}
            </Button>
          </div>
        </Section>

        {/* Log out */}
        {onLogout && (
          <Section title="Log out" description="End your session on this device.">
            <div>
              <Button
                variant="outline"
                onClick={() => setLogoutOpen(true)}
                className="h-auto gap-2 rounded-full border-kobo-ink/[0.14] px-5 py-2.5 text-[14px] text-[#33565E] hover:border-kobo-teal-600 hover:text-kobo-ink"
              >
                <LogOut className="size-[15px]" strokeWidth={1.9} />
                Log out
              </Button>
            </div>
          </Section>
        )}
      </div>

      {onLogout && (
        <LogoutConfirmDialog open={logoutOpen} onOpenChange={setLogoutOpen} onConfirm={onLogout} />
      )}
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card className="gap-0 rounded-[28px] border border-white/90 bg-white p-6.5 shadow-[0_24px_50px_-42px_rgba(11,31,36,0.7)] ring-0">
      <div className="mb-5">
        <h2 className="text-base font-semibold tracking-tight text-kobo-ink">{title}</h2>
        {description && <p className="mt-1 text-[13px] text-[#8AA3A9]">{description}</p>}
      </div>
      {children}
    </Card>
  );
}

function Field({
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

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-[#F6FAFA] px-3.5 py-2.5">
      <span className="shrink-0 text-[13px] text-[#8AA3A9]">{label}</span>
      <span
        className={
          mono
            ? "min-w-0 text-right font-mono text-[12.5px] break-all text-kobo-ink"
            : "min-w-0 truncate text-right text-[14px] text-kobo-ink"
        }
      >
        {value}
      </span>
    </div>
  );
}
