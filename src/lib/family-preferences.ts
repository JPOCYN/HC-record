"use client";

// Family foundation v1. Canonical copy: oc-family-hub/src/lib/family-preferences.ts.
// Keep checked-in copies identical; no runtime dependency on another deployment.
import { useCallback, useEffect, useSyncExternalStore } from "react";

export type FamilyLanguage = "en" | "zh-HK";
export const FAMILY_LANGUAGE_KEY = "family-hub:language";
export const FAMILY_LANGUAGE_EVENT = "family-hub:language-change";
export const FAMILY_HUB_ORIGIN = "https://oc-family-hub.vercel.app";
let transientLanguage: FamilyLanguage | null = null;

export function normalizeFamilyLanguage(value: unknown): FamilyLanguage | null {
  if (value === "en") return "en";
  return value === "zh-HK" || value === "zh-Hant" ? "zh-HK" : null;
}

export function readFamilyLanguage(legacyKey?: string): FamilyLanguage {
  if (typeof window === "undefined") return "en";
  if (transientLanguage) return transientLanguage;
  try {
    const saved = normalizeFamilyLanguage(window.localStorage.getItem(FAMILY_LANGUAGE_KEY));
    if (saved) return saved;
    for (const key of [legacyKey, "harper-language", "richfam-language"]) {
      if (!key) continue;
      const legacy = normalizeFamilyLanguage(window.localStorage.getItem(key));
      if (legacy) return legacy;
    }
  } catch { /* Private browsing may block storage; the page must still work. */ }
  return transientLanguage ?? (window.navigator.language.toLowerCase().startsWith("zh") ? "zh-HK" : "en");
}

export function setFamilyLanguage(language: FamilyLanguage) {
  const normalized = normalizeFamilyLanguage(language);
  if (!normalized || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FAMILY_LANGUAGE_KEY, normalized);
    transientLanguage = null;
  } catch { transientLanguage = normalized; }
  window.dispatchEvent(new Event(FAMILY_LANGUAGE_EVENT));
}

export function initializeFamilyLanguage(legacyKey?: string) {
  try {
    if (normalizeFamilyLanguage(window.localStorage.getItem(FAMILY_LANGUAGE_KEY))) return;
  } catch { /* Keep the choice in memory for this visit. */ }
  setFamilyLanguage(readFamilyLanguage(legacyKey));
}

export function subscribeFamilyLanguage(callback: () => void) {
  // storage handles other tabs; the custom event handles components in this tab.
  const events = ["storage", FAMILY_LANGUAGE_EVENT, "pageshow", "focus"];
  events.forEach(event => window.addEventListener(event, callback));
  return () => events.forEach(event => window.removeEventListener(event, callback));
}

export function useFamilyLanguage(legacyKey?: string) {
  const snapshot = useCallback(() => readFamilyLanguage(legacyKey), [legacyKey]);
  const language = useSyncExternalStore(subscribeFamilyLanguage, snapshot, () => "en" as FamilyLanguage);
  useEffect(() => { initializeFamilyLanguage(legacyKey); }, [legacyKey]);
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  return { language, setLanguage: setFamilyLanguage };
}

export function familyHubHref(origin: string) {
  return origin === FAMILY_HUB_ORIGIN ? "/" : `${FAMILY_HUB_ORIGIN}/`;
}
