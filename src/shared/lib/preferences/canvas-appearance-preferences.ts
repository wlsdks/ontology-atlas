import { useCallback, useSyncExternalStore } from "react";
import { notifyPreferenceChange, subscribeToPreferenceChange } from "./preference-storage/preference-change-event";

/**
 * `dot`: static grid. `web`: proximity constellation, the one moving background. `depth`: dots in
 * three layers moving only with the camera. Line or closed-figure backgrounds compete with nodes and
 * edges for the eye.
 */
export type CanvasBackground = "dot" | "web" | "depth";
export type GlyphSet = "geometric" | "line";

export const CANVAS_BACKGROUNDS: readonly CanvasBackground[] = ["dot", "web", "depth"];
export const GLYPH_SETS: readonly GlyphSet[] = ["geometric", "line"];

/**
 * Removed value to successor: falling back to the default would discard the user's pick, so
 * constellation-like choices go to `web`, static ones to `dot`.
 */
const RETIRED_CANVAS_BACKGROUNDS: Readonly<Record<string, CanvasBackground>> = {
  constellation: "web",
  contour: "dot",
  // Both were chosen for their motion, so they map to the surviving moving background.
  flow: "web",
  gravity: "web",
};

export const DEFAULT_CANVAS_BACKGROUND: CanvasBackground = "dot";
export const DEFAULT_GLYPH_SET: GlyphSet = "geometric";

const CANVAS_BACKGROUND_KEY = "ontology-atlas:canvas-background:v1";
const GLYPH_SET_KEY = "ontology-atlas:glyph-set:v1";

function isCanvasBackground(value: string | null): value is CanvasBackground {
  return value !== null && (CANVAS_BACKGROUNDS as readonly string[]).includes(value);
}

function isGlyphSet(value: string | null): value is GlyphSet {
  return value !== null && (GLYPH_SETS as readonly string[]).includes(value);
}

export function resolveCanvasBackground(saved: string | null): CanvasBackground {
  if (isCanvasBackground(saved)) return saved;
  if (saved !== null && saved in RETIRED_CANVAS_BACKGROUNDS) return RETIRED_CANVAS_BACKGROUNDS[saved];
  return DEFAULT_CANVAS_BACKGROUND;
}

export function readCanvasBackground(): CanvasBackground {
  if (typeof window === "undefined") return DEFAULT_CANVAS_BACKGROUND;
  try {
    return resolveCanvasBackground(window.localStorage.getItem(CANVAS_BACKGROUND_KEY));
  } catch {
    return DEFAULT_CANVAS_BACKGROUND;
  }
}

export function readGlyphSet(): GlyphSet {
  if (typeof window === "undefined") return DEFAULT_GLYPH_SET;
  try {
    const saved = window.localStorage.getItem(GLYPH_SET_KEY);
    return isGlyphSet(saved) ? saved : DEFAULT_GLYPH_SET;
  } catch {
    return DEFAULT_GLYPH_SET;
  }
}

export function writeCanvasBackground(value: CanvasBackground): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CANVAS_BACKGROUND_KEY, value);
  } catch {
    // Blocked storage (private mode) is not an error: the event still updates this session.
  }
  notifyPreferenceChange();
}

export function writeGlyphSet(value: GlyphSet): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GLYPH_SET_KEY, value);
  } catch {
    // Storage blocked; the event still updates this session.
  }
  notifyPreferenceChange();
}

export function useCanvasBackground(): CanvasBackground {
  const getSnapshot = useCallback(() => readCanvasBackground(), []);
  const getServerSnapshot = useCallback(() => DEFAULT_CANVAS_BACKGROUND, []);
  return useSyncExternalStore(subscribeToPreferenceChange, getSnapshot, getServerSnapshot);
}

export function useGlyphSet(): GlyphSet {
  const getSnapshot = useCallback(() => readGlyphSet(), []);
  const getServerSnapshot = useCallback(() => DEFAULT_GLYPH_SET, []);
  return useSyncExternalStore(subscribeToPreferenceChange, getSnapshot, getServerSnapshot);
}

/**
 * Whether the frame meter is drawn over the map. Off by default: it is a diagnostic, not product
 * chrome; opt-in in settings so a number can come from the machine that hurts.
 */
const FRAME_METER_KEY = "atlas.appearance.frameMeter";

const DEFAULT_FRAME_METER = false;

function readFrameMeter(): boolean {
  if (typeof window === "undefined") return DEFAULT_FRAME_METER;
  try {
    return window.localStorage.getItem(FRAME_METER_KEY) === "on";
  } catch {
    return DEFAULT_FRAME_METER;
  }
}

export function writeFrameMeter(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FRAME_METER_KEY, value ? "on" : "off");
  } catch {
    // Storage blocked; the event still updates this session.
  }
  notifyPreferenceChange();
}

export function useFrameMeter(): boolean {
  const getSnapshot = useCallback(() => readFrameMeter(), []);
  const getServerSnapshot = useCallback(() => DEFAULT_FRAME_METER, []);
  return useSyncExternalStore(subscribeToPreferenceChange, getSnapshot, getServerSnapshot);
}
