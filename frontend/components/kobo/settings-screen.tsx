"use client";

import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ToggleSwitch } from "@/components/kobo/toggle-switch";
import { EditProfileDialog } from "@/components/kobo/edit-profile-dialog";
import { ChangePasscodeDialog } from "@/components/kobo/change-passcode-dialog";
import { LogoutConfirmDialog } from "@/components/kobo/logout-confirm-dialog";
import { getProfile } from "@/lib/kobo/api";
import {
  loadToggles,
  saveToggles,
  type SettingsToggleKey,
  type SettingsToggles,
} from "@/lib/kobo/preferences";
import type { CurrencyCode, UserProfile } from "@/lib/kobo/types";
import { Check, ChevronRight, Copy, LogOut, ShieldCheck } from "lucide-react";

/**
 * Settings, rebuilt to the "Kobo Web App" design handoff: a two-column card
 * layout — Preferences (local toggles) and Sending defaults on the left; a
 * Profile card and a Security actions list on the right. The still-real,
 * still-tested flows (edit name/country via `PATCH /auth/profile`, change
 * password via `POST /auth/password`) now live behind dialogs opened from the
 * "Edit" control and the "Change passcode" row rather than inline forms.
 *
 * Toggles and (mostly) Sending defaults have no backend yet, so they're client
 * state per the handoff. `Default currency` is the exception: it drives the
 * live send currency and persists (see lib/kobo/preferences.ts).
 */

const TOGGLE_ROWS: { key: SettingsToggleKey; label: string; desc: string }[] = [
  { key: "rateAlerts", label: "Rate alerts", desc: "Ping me when the USDC rate beats my average." },
  { key: "biometric", label: "Biometric approval", desc: "Use Face ID instead of the 4-digit passcode." },
  { key: "emailReceipts", label: "Email receipts", desc: "A PDF receipt after every delivered transfer." },
  { key: "monthlyDigest", label: "Monthly digest", desc: "What you sent, where it went, what it cost." },
];

const CURRENCY_OPTIONS: CurrencyCode[] = ["EUR", "GBP", "USD"];

export function SettingsScreen({
  authUser,
  onLogout,
  defaultCurrency,
  onDefaultCurrencyChange,
  onGoToHelp,
  onManageFunding,
}: {
  authUser: { id: string; name: string };
  onLogout?: () => void;
  defaultCurrency: CurrencyCode;
  onDefaultCurrencyChange: (currency: CurrencyCode) => void;
  onGoToHelp?: () => void;
  onManageFunding?: () => void;
}) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadError, setLoadError] = useState(false);

  const [toggles, setToggles] = useState<SettingsToggles>(() => loadToggles());
  const [walletCopied, setWalletCopied] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [passcodeOpen, setPasscodeOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);

  async function loadProfile() {
    setLoadError(false);
    try {
      setProfile(await getProfile());
    } catch {
      setLoadError(true);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time fetch-on-mount, same pattern as kobo-app.tsx
    loadProfile();
  }, []);

  function setToggle(key: SettingsToggleKey, next: boolean) {
    setToggles((prev) => {
      const updated = { ...prev, [key]: next };
      saveToggles(updated);
      return updated;
    });
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
  const displayName = profile?.name ?? authUser.name;
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  const ibanTail = authUser.id.slice(-4).toUpperCase();

  return (
    <div className="flex-1 overflow-y-auto p-6 pb-10 sm:p-10">
      <div className="mb-6.5">
        <h1 className="mb-2 text-3xl font-semibold tracking-tight sm:text-[34px]">Settings</h1>
        <p className="max-w-xl text-[15.5px] text-[#4C6B72]">
          Account, security and how we reach you.
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

      <div className="grid items-start gap-6 min-[1180px]:grid-cols-[minmax(440px,1.35fr)_minmax(360px,0.9fr)]">
        {/* Left column */}
        <div className="flex min-w-0 flex-col gap-5">
          <SettingsCard>
            <SectionLabel>PREFERENCES</SectionLabel>
            <div>
              {TOGGLE_ROWS.map((row, i) => (
                <div
                  key={row.key}
                  className={cn(
                    "flex items-center gap-5 py-[17px]",
                    i < TOGGLE_ROWS.length - 1 && "border-b border-kobo-ink/[0.05]"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[15.5px] font-medium text-kobo-ink">{row.label}</div>
                    <div className="mt-1 text-[13.5px] text-[#6E8A91]">{row.desc}</div>
                  </div>
                  <ToggleSwitch
                    label={row.label}
                    checked={toggles[row.key]}
                    onChange={(next) => setToggle(row.key, next)}
                  />
                </div>
              ))}
            </div>
          </SettingsCard>

          <SettingsCard>
            <SectionLabel>SENDING DEFAULTS</SectionLabel>
            <div className="flex items-center justify-between gap-5 border-b border-kobo-ink/[0.05] py-[18px]">
              <div className="min-w-0">
                <div className="text-[15.5px] font-medium text-kobo-ink">Default currency</div>
                <div className="mt-1 text-[13.5px] text-[#6E8A91]">
                  Used for new transfers and rate alerts.
                </div>
              </div>
              <div className="flex shrink-0 gap-1.5">
                {CURRENCY_OPTIONS.map((code) => {
                  const active = code === defaultCurrency;
                  return (
                    <button
                      key={code}
                      type="button"
                      aria-pressed={active}
                      onClick={() => onDefaultCurrencyChange(code)}
                      className={cn(
                        "rounded-full border border-kobo-ink/10 px-[15px] py-[9px] text-[14px] font-medium text-[#33565E] transition-transform active:scale-95",
                        active ? "bg-[#EFF5F6]" : "bg-white hover:bg-[#F6FAFA]"
                      )}
                    >
                      {code}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between gap-5 border-b border-kobo-ink/[0.05] py-[18px]">
              <div className="min-w-0">
                <div className="text-[15.5px] font-medium text-kobo-ink">Funding account</div>
                <div className="mt-1 text-[13.5px] text-[#6E8A91]">
                  Instant SEPA · IBAN ·· {ibanTail}
                </div>
              </div>
              <PillButton
                onClick={() =>
                  onManageFunding
                    ? onManageFunding()
                    : toast("Manage your funding account from Add funds.")
                }
              >
                Manage
              </PillButton>
            </div>

            <div className="flex items-center justify-between gap-5 py-[18px]">
              <div className="min-w-0 flex-1">
                <div className="text-[15.5px] font-medium text-kobo-ink">Linked address</div>
                <div className="mt-1 truncate font-mono text-[12.5px] text-[#6E8A91]">
                  {profile?.wallet_address ?? "—"}
                </div>
              </div>
              <PillButton onClick={copyWallet} disabled={!profile}>
                {walletCopied ? (
                  <>
                    <Check className="size-[13px]" strokeWidth={2.2} />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="size-[13px]" strokeWidth={1.9} />
                    Copy
                  </>
                )}
              </PillButton>
            </div>
          </SettingsCard>
        </div>

        {/* Right column */}
        <div className="flex min-w-0 flex-col gap-5">
          <SettingsCard>
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3.5">
                <div className="flex size-[52px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#D7F0E2] to-[#BFE7D1] text-[17px] font-semibold text-[#155E4C]">
                  {initials}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[18px] font-semibold tracking-tight text-kobo-ink">
                    {displayName}
                  </div>
                  <div className="truncate text-[13.5px] text-[#6E8A91]">{email}</div>
                </div>
              </div>
              <Button
                variant="outline"
                aria-label="Edit profile"
                onClick={() => setEditOpen(true)}
                className="h-auto shrink-0 rounded-full border-kobo-ink/[0.12] px-4 py-2 text-[13px] font-medium text-[#12645D] hover:border-kobo-teal-600 hover:text-kobo-ink"
              >
                Edit
              </Button>
            </div>

            <div className="mt-4 flex items-center gap-2 rounded-2xl bg-kobo-mint-light px-3.5 py-3">
              <ShieldCheck className="size-[15px] text-[#155E4C]" strokeWidth={2} />
              <span className="text-[13.5px] font-medium text-[#155E4C]">
                Identity verified · Tier 3 limits
              </span>
            </div>

            <p className="mt-3.5 text-[13.5px] leading-relaxed text-[#4C6B72]">
              Member since <span>{memberSince}</span>. Monthly sending limit €15,000. Request an
              increase any time from support.
            </p>
          </SettingsCard>

          <SettingsCard>
            <SectionLabel>SECURITY</SectionLabel>
            <div className="-mx-3">
              <ActionRow label="Change passcode" onClick={() => setPasscodeOpen(true)} />
              <ActionRow
                label="Trusted devices · 2"
                onClick={() => toast("You're signed in on 2 trusted devices.")}
              />
              <ActionRow
                label="Download my data"
                onClick={() => toast("We'll email you a copy of your data within 48 hours.")}
              />
              <ActionRow label="Help & support" onClick={() => onGoToHelp?.()} />
              {onLogout && (
                <ActionRow
                  label="Log out"
                  destructive
                  icon={<LogOut className="size-[15px]" strokeWidth={1.9} />}
                  onClick={() => setLogoutOpen(true)}
                />
              )}
            </div>
          </SettingsCard>
        </div>
      </div>

      <EditProfileDialog
        key={editOpen ? "edit-open" : "edit-closed"}
        open={editOpen}
        onOpenChange={setEditOpen}
        profile={profile}
        onSaved={setProfile}
      />
      <ChangePasscodeDialog
        key={passcodeOpen ? "pw-open" : "pw-closed"}
        open={passcodeOpen}
        onOpenChange={setPasscodeOpen}
        onLogout={onLogout}
      />
      {onLogout && (
        <LogoutConfirmDialog open={logoutOpen} onOpenChange={setLogoutOpen} onConfirm={onLogout} />
      )}
    </div>
  );
}

function SettingsCard({ children }: { children: ReactNode }) {
  return (
    <Card className="gap-0 rounded-[28px] border border-white/90 bg-white p-6.5 shadow-[0_24px_50px_-38px_rgba(11,31,36,0.75)] ring-0">
      {children}
    </Card>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-1.5 text-[11.5px] font-semibold tracking-[0.16em] text-[#6E8A91]">
      {children}
    </div>
  );
}

function PillButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      variant="outline"
      onClick={onClick}
      disabled={disabled}
      className="h-auto shrink-0 gap-1.5 rounded-full border-kobo-ink/[0.12] px-5 py-2.5 text-[14px] font-semibold text-[#12645D] hover:border-kobo-teal-600 hover:bg-[#EFF7F4] hover:text-kobo-ink"
    >
      {children}
    </Button>
  );
}

function ActionRow({
  label,
  onClick,
  icon,
  destructive,
}: {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between gap-3.5 rounded-2xl px-3 py-3.5 text-left transition-colors",
        destructive
          ? "text-[15px] text-[#B4472E] hover:bg-[#B4472E]/[0.08]"
          : "text-[15px] text-[#33565E] hover:bg-[#F1F6F7]"
      )}
    >
      <span>{label}</span>
      {icon ?? <ChevronRight className="size-[15px] text-[#6E8A91]" strokeWidth={2} />}
    </button>
  );
}
