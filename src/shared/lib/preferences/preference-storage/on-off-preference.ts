import { notifyPreferenceChange } from "./preference-change-event";

/** Writes "off" explicitly so "never set" and "turned off" stay distinguishable. */
export function readOnOff(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const saved = window.localStorage.getItem(key);
    if (saved === "on") return true;
    if (saved === "off") return false;
    return fallback;
  } catch {
    return fallback;
  }
}

export function writeOnOff(key: string, value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value ? "on" : "off");
  } catch {
    // Storage blocked; the event still updates this session.
  }
  notifyPreferenceChange();
}
