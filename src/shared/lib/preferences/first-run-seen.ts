export const FIRST_RUN_SEEN_ENTRIES: readonly (readonly [string, string])[] = [
  // The folder-first guidance sheet; this key alone reads '1'.
  ["vault-open-guide:auto:v1", "1"],
  ["atlas.library.guide-seen", "on"],
];

export type GuideOverride = "off" | "reset";

export function resolveGuideOverride(search: string): GuideOverride | null {
  let value: string | null = null;
  try {
    value = new URLSearchParams(search).get("guides");
  } catch {
    return null;
  }
  return value === "off" || value === "reset" ? value : null;
}

export function applyFirstRunSeen(): void {
  if (typeof window === "undefined") return;
  for (const [key, value] of FIRST_RUN_SEEN_ENTRIES) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Storage may be unavailable.
    }
  }
}

export function clearFirstRunSeen(): void {
  if (typeof window === "undefined") return;
  for (const [key] of FIRST_RUN_SEEN_ENTRIES) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Storage may be unavailable.
    }
  }
}

export function applyGuideOverride(search: string): GuideOverride | null {
  const override = resolveGuideOverride(search);
  if (override === "off") applyFirstRunSeen();
  else if (override === "reset") clearFirstRunSeen();
  return override;
}
