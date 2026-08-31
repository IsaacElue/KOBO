"use client";

import type { CurrencyCode } from "./types";

/**
 * Local-only user preferences for the redesigned Settings page. None of these
 * have a backend column yet, so they live in `localStorage` and seed the UI on
 * next load — matching the design handoff, which treats them as client state.
 * The one exception with real reach is `defaultCurrency`: Settings writes it and
 * the Send flow reads it as the initial send currency.
 */

export type SettingsToggleKey =
  | "rateAlerts"
  | "biometric"
  | "emailReceipts"
  | "monthlyDigest";

export type SettingsToggles = Record<SettingsToggleKey, boolean>;

export const DEFAULT_TOGGLES: SettingsToggles = {
  rateAlerts: true,
  biometric: true,
  emailReceipts: false,
  monthlyDigest: true,
};

const TOGGLES_KEY = "kobo:settings:toggles";
const DEFAULT_CURRENCY_KEY = "kobo:settings:default-currency";

function readJSON<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJSON(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode / quota / disabled storage — the preference just won't persist.
  }
}

export function loadToggles(): SettingsToggles {
  const stored = readJSON<Partial<SettingsToggles>>(TOGGLES_KEY);
  return { ...DEFAULT_TOGGLES, ...(stored ?? {}) };
}

export function saveToggles(toggles: SettingsToggles): void {
  writeJSON(TOGGLES_KEY, toggles);
}

const CURRENCY_CODES: CurrencyCode[] = ["EUR", "GBP", "USD"];

export function loadDefaultCurrency(): CurrencyCode | null {
  const stored = readJSON<string>(DEFAULT_CURRENCY_KEY);
  return stored && CURRENCY_CODES.includes(stored as CurrencyCode)
    ? (stored as CurrencyCode)
    : null;
}

export function saveDefaultCurrency(currency: CurrencyCode): void {
  writeJSON(DEFAULT_CURRENCY_KEY, currency);
}
