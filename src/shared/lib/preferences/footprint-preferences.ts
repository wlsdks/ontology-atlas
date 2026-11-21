import { useCallback, useSyncExternalStore } from "react";
import { clamp } from "./clamp";
import { notifyPreferenceChange, subscribeToPreferenceChange } from "./preference-storage/preference-change-event";
import { createStoredSnapshot } from "./preference-storage/stored-snapshot";

const FOOTPRINT_KEY = "ontology-atlas:footprint:v1";

/**
 * Three named tones, not a colour picker. `star` is the map's own ink (`render/starfield.ts`);
 * `amber` avoids the hub's own value, which already says "this is a centre".
 */
export type FootprintTone = "amber" | "indigo" | "star";

/**
 * The one place a tone names its token, so every consumer reads it and a new tone cannot be added to
 * the union and forgotten in the settings preview or the map.
 */
export const FOOTPRINT_TONE_TOKEN: Record<FootprintTone, string> = {
  star: "--color-footprint-trail-star",
  indigo: "--color-footprint-trail-indigo",
  amber: "--color-footprint-trail",
};

/** Last-resort ink per tone, byte-equal to the tokens above, for a missing custom property. */
export const FOOTPRINT_TONE_FALLBACK: Record<FootprintTone, readonly [number, number, number]> = {
  star: [236, 236, 240],
  indigo: [200, 210, 255],
  amber: [232, 196, 122],
};

/** Stored preferences with older keys still load: `resolveFootprint` ignores fields it does not know. */
export interface FootprintPreference {
  /**
   * How far the step number sits from the node, in px, before the gap is added. It only places the
   * ordinal; the node's size is the map's.
   */
  size: number;
  gap: number;
  opacity: number;
  tone: FootprintTone;
}

export const DEFAULT_FOOTPRINT: FootprintPreference = {
  size: 13,
  gap: 8,
  opacity: 0.7,
  tone: "star",
};

/**
 * Bounds both the sliders and the stored-value clamp. Lower bounds stay readable: freedom to make
 * the mark invisible is a defect, not a preference.
 */
export const FOOTPRINT_RANGES = {
  size: { min: 9, max: 26, step: 1 },
  gap: { min: 0, max: 28, step: 1 },
  opacity: { min: 0.5, max: 1, step: 0.05 },
} as const satisfies Record<string, { min: number; max: number; step: number }>;

/** Shown first, so opening settings puts attention on the choice rather than on every slider. */
export const FOOTPRINT_PRESETS = {
  subtle: { size: 10, opacity: 0.5 },
  default: { size: 13, opacity: 0.7 },
  bold: { size: 17, opacity: 0.95 },
} as const satisfies Record<string, Partial<FootprintPreference>>;

export type FootprintPresetName = keyof typeof FOOTPRINT_PRESETS;

/**
 * Clamps and defaults stored JSON: a hand-edited or older shape would otherwise leak `NaN` into
 * the renderer, and the footprints vanish with no error.
 */
export function resolveFootprint(raw: unknown): FootprintPreference {
  if (typeof raw !== "object" || raw === null) return DEFAULT_FOOTPRINT;
  const src = raw as Record<string, unknown>;
  const preferenceNumber = (key: keyof typeof FOOTPRINT_RANGES): number => {
    const v = src[key];
    if (typeof v !== "number" || !Number.isFinite(v)) return DEFAULT_FOOTPRINT[key];
    return clamp(v, FOOTPRINT_RANGES[key].min, FOOTPRINT_RANGES[key].max);
  };
  /*
   * Only the four live fields are read; older stored keys are ignored rather than migrated, which
   * keeps this function total: a stored shape from any version resolves.
   */
  return {
    size: preferenceNumber("size"),
    gap: preferenceNumber("gap"),
    opacity: preferenceNumber("opacity"),
    tone:
      src.tone === "indigo" || src.tone === "amber" || src.tone === "star"
        ? src.tone
        : DEFAULT_FOOTPRINT.tone,
  };
}

export function applyFootprintPreset(
  current: FootprintPreference,
  preset: FootprintPresetName,
): FootprintPreference {
  return resolveFootprint({ ...current, ...FOOTPRINT_PRESETS[preset] });
}

function readFootprint(): FootprintPreference {
  if (typeof window === "undefined") return DEFAULT_FOOTPRINT;
  try {
    const saved = window.localStorage.getItem(FOOTPRINT_KEY);
    return saved === null ? DEFAULT_FOOTPRINT : resolveFootprint(JSON.parse(saved));
  } catch {
    return DEFAULT_FOOTPRINT;
  }
}

export function writeFootprint(value: FootprintPreference): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FOOTPRINT_KEY, JSON.stringify(resolveFootprint(value)));
  } catch {
    // Storage blocked; the event still updates this session.
  }
  notifyPreferenceChange();
}

const footprintSnapshot = createStoredSnapshot(FOOTPRINT_KEY, DEFAULT_FOOTPRINT, readFootprint);

export function useFootprint(): FootprintPreference {
  const getSnapshot = useCallback(() => footprintSnapshot(), []);
  const getServerSnapshot = useCallback(() => DEFAULT_FOOTPRINT, []);
  return useSyncExternalStore(subscribeToPreferenceChange, getSnapshot, getServerSnapshot);
}
