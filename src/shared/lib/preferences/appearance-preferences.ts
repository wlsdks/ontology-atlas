import { useCallback, useSyncExternalStore } from "react";
import type { MapLayoutView } from "../map-canvas/map-layout-morph-store";
import { createStoredSnapshot } from "./stored-snapshot";

/**
 * Appearance preferences: the single source of truth for canvas background and glyph set, read live
 * by every surface. A store, not a Context: the non-React canvas and DOM glyphs both need the live
 * update. SSR returns defaults so hydration cannot mismatch.
 */

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
const FOOTPRINT_KEY = "ontology-atlas:footprint:v1";
const EXPAND_KEY = "ontology-atlas:expand:v1";

const PREFERENCE_EVENT = "ontology-atlas:appearance-preference-change";

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

function notifyPreferenceChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PREFERENCE_EVENT));
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

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(PREFERENCE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(PREFERENCE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useCanvasBackground(): CanvasBackground {
  const getSnapshot = useCallback(() => readCanvasBackground(), []);
  const getServerSnapshot = useCallback(() => DEFAULT_CANVAS_BACKGROUND, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useGlyphSet(): GlyphSet {
  const getSnapshot = useCallback(() => readGlyphSet(), []);
  const getServerSnapshot = useCallback(() => DEFAULT_GLYPH_SET, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
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
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export const MAP_SPEEDS = [0.5, 0.75, 1, 1.5, 2] as const;

export type MapSpeed = (typeof MAP_SPEEDS)[number];

export const DEFAULT_MAP_SPEED: MapSpeed = 1;

export interface MapNavigationSpeed {
  drag: MapSpeed;
  zoom: MapSpeed;
}

export const DEFAULT_MAP_NAVIGATION_SPEED: MapNavigationSpeed = {
  drag: DEFAULT_MAP_SPEED,
  zoom: DEFAULT_MAP_SPEED,
};

const MAP_DRAG_SPEED_KEY = "atlas.appearance.map-drag-speed";
const MAP_ZOOM_SPEED_KEY = "atlas.appearance.map-zoom-speed";

export function resolveMapSpeed(saved: string | null): MapSpeed {
  if (saved === null || saved.trim() === "") return DEFAULT_MAP_SPEED;
  const value = Number(saved);
  return MAP_SPEEDS.find((speed) => speed === value) ?? DEFAULT_MAP_SPEED;
}

function readMapSpeed(key: string): MapSpeed {
  if (typeof window === "undefined") return DEFAULT_MAP_SPEED;
  try {
    return resolveMapSpeed(window.localStorage.getItem(key));
  } catch {
    return DEFAULT_MAP_SPEED;
  }
}

function storeMapSpeed(key: string, value: MapSpeed): boolean {
  try {
    window.localStorage.setItem(key, String(value));
    return true;
  } catch {
    return false;
  }
}

function writeMapSpeed(key: string, value: MapSpeed): void {
  if (typeof window === "undefined") return;
  storeMapSpeed(key, value);
  notifyPreferenceChange();
}

export function writeMapDragSpeed(value: MapSpeed): void {
  writeMapSpeed(MAP_DRAG_SPEED_KEY, value);
}

export function writeMapZoomSpeed(value: MapSpeed): void {
  writeMapSpeed(MAP_ZOOM_SPEED_KEY, value);
}

export function useMapDragSpeed(): MapSpeed {
  const getSnapshot = useCallback(() => readMapSpeed(MAP_DRAG_SPEED_KEY), []);
  const getServerSnapshot = useCallback(() => DEFAULT_MAP_SPEED, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useMapZoomSpeed(): MapSpeed {
  const getSnapshot = useCallback(() => readMapSpeed(MAP_ZOOM_SPEED_KEY), []);
  const getServerSnapshot = useCallback(() => DEFAULT_MAP_SPEED, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

const VIEW_3D_KEY = "atlas.appearance.view3d";

const DEFAULT_VIEW_3D = false;

function readView3d(): boolean {
  return readOnOff(VIEW_3D_KEY, DEFAULT_VIEW_3D);
}

export function useView3d(): boolean {
  const getSnapshot = useCallback(() => readView3d(), []);
  const getServerSnapshot = useCallback(() => DEFAULT_VIEW_3D, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}




const STRUCTURE_KEY = "atlas.appearance.structure";
const RETIRED_VIEW_KEY = "atlas.appearance.galaxy";
const RETIRED_TERRITORIES_KEY = "atlas.appearance.territories";

function readDomainStructure(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const current = window.localStorage.getItem(STRUCTURE_KEY);
    return current === null ? window.localStorage.getItem(RETIRED_VIEW_KEY) === "on" : current === "on";
  } catch { return false; }
}

export function useDomainStructure(): boolean {
  return useSyncExternalStore(subscribe, readDomainStructure, () => false);
}


const HEX_BOARD_KEY = "atlas.appearance.hex-board";

const DEFAULT_HEX_BOARD = false;

function readHexBoard(): boolean {
  return readOnOff(HEX_BOARD_KEY, DEFAULT_HEX_BOARD);
}

export function useHexBoard(): boolean {
  const getSnapshot = useCallback(() => readHexBoard(), []);
  const getServerSnapshot = useCallback(() => DEFAULT_HEX_BOARD, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useFlatMapView(): boolean {
  return useMapView() === "flat";
}

/** The picker's view from its stored flags; 3D and Neural win over the flat-plane views. */
export function useMapView(): MapLayoutView {
  const view3d = useView3d();
  const neural = useSyncExternalStore(subscribe, readNeuralArrangement, () => false);
  const structure = useDomainStructure();
  const hexBoard = useHexBoard();
  return view3d ? (neural ? "neural" : "3d") : hexBoard ? "hex" : structure ? "structure" : "flat";
}

const HEX_RELIEF_KEY = "atlas.appearance.hex-relief";

const DEFAULT_HEX_RELIEF = false;

export function readHexRelief(): boolean {
  return readOnOff(HEX_RELIEF_KEY, DEFAULT_HEX_RELIEF);
}

export function writeHexRelief(value: boolean): void {
  writeOnOff(HEX_RELIEF_KEY, value);
}

export function useHexRelief(): boolean {
  const getSnapshot = useCallback(() => readHexRelief(), []);
  const getServerSnapshot = useCallback(() => DEFAULT_HEX_RELIEF, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export type MapArrangement = "strata" | "coupling";

export const DEFAULT_MAP_ARRANGEMENT: MapArrangement = "strata";

/**
 * With the 3D flag on, `coupling` here opens Neural, the value older builds stored for it; any
 * other value, Strata's included, opens the 3D tree. Picking any other view removes it.
 */
const MAP_ARRANGEMENT_KEY = "atlas.appearance.map-arrangement";
const NEURAL_ARRANGEMENT = "coupling";

function readNeuralArrangement(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(MAP_ARRANGEMENT_KEY) === NEURAL_ARRANGEMENT;
  } catch {
    return false;
  }
}

export function writeMapView(view: MapLayoutView): void {
  if (typeof window === "undefined") return;
  const neural = view === "neural";
  const writes: Array<[string, string]> = [
    [HEX_BOARD_KEY, view === "hex" ? "on" : "off"],
    [STRUCTURE_KEY, view === "structure" ? "on" : "off"],
    ...(neural ? [[MAP_ARRANGEMENT_KEY, NEURAL_ARRANGEMENT] as [string, string]] : []),
    [VIEW_3D_KEY, view === "3d" || neural ? "on" : "off"],
  ];
  for (const [key, value] of writes) {
    let unchanged = false;
    try {
      unchanged = window.localStorage.getItem(key) === value;
    } catch {}
    if (!unchanged) {
      try {
        window.localStorage.setItem(key, value);
      } catch {}
    }
  }
  const removed = neural ? [RETIRED_VIEW_KEY, RETIRED_TERRITORIES_KEY] : [RETIRED_VIEW_KEY, RETIRED_TERRITORIES_KEY, MAP_ARRANGEMENT_KEY];
  for (const key of removed) {
    try { window.localStorage.removeItem(key); } catch {}
  }
  notifyPreferenceChange();
}

/**
 * On by default, unlike the frame meter: an agent editing the folder is a fact, not a diagnostic,
 * so the setting exists to turn it off.
 */
const AGENT_STATUS_KEY = "atlas.agentActivity.status";
const AGENT_NOTIFICATIONS_KEY = "atlas.agentActivity.notifications";
const AGENT_NOTIFICATION_KINDS_KEY = "atlas.agentActivity.kinds";

const DEFAULT_AGENT_ACTIVITY_STATUS = true;
const DEFAULT_AGENT_NOTIFICATIONS = true;

/** Writes "off" explicitly so "never set" and "turned off" stay distinguishable. */
function readOnOff(key: string, fallback: boolean): boolean {
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

function writeOnOff(key: string, value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value ? "on" : "off");
  } catch {
    // Storage blocked; the event still updates this session.
  }
  notifyPreferenceChange();
}

function readAgentActivityStatus(): boolean {
  return readOnOff(AGENT_STATUS_KEY, DEFAULT_AGENT_ACTIVITY_STATUS);
}

export function writeAgentActivityStatus(value: boolean): void {
  writeOnOff(AGENT_STATUS_KEY, value);
}

export function useAgentActivityStatusEnabled(): boolean {
  const getSnapshot = useCallback(() => readAgentActivityStatus(), []);
  const getServerSnapshot = useCallback(() => DEFAULT_AGENT_ACTIVITY_STATUS, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

function readAgentNotificationsEnabled(): boolean {
  return readOnOff(AGENT_NOTIFICATIONS_KEY, DEFAULT_AGENT_NOTIFICATIONS);
}

export function writeAgentNotificationsEnabled(value: boolean): void {
  writeOnOff(AGENT_NOTIFICATIONS_KEY, value);
}

export function useAgentNotificationsEnabled(): boolean {
  const getSnapshot = useCallback(() => readAgentNotificationsEnabled(), []);
  const getServerSnapshot = useCallback(() => DEFAULT_AGENT_NOTIFICATIONS, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Stores the muted kinds, not the enabled ones, so a newly added kind arrives on for everyone
 * rather than silently off for existing users.
 */
const EMPTY_MUTED: ReadonlySet<string> = new Set();

function readMutedAgentNotificationKinds(): ReadonlySet<string> {
  if (typeof window === "undefined") return EMPTY_MUTED;
  try {
    const saved = window.localStorage.getItem(AGENT_NOTIFICATION_KINDS_KEY);
    if (!saved) return EMPTY_MUTED;
    const parsed: unknown = JSON.parse(saved);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((item): item is string => typeof item === "string"))
      : EMPTY_MUTED;
  } catch {
    return EMPTY_MUTED;
  }
}

export function writeMutedAgentNotificationKinds(kinds: ReadonlySet<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AGENT_NOTIFICATION_KINDS_KEY, JSON.stringify([...kinds].sort()));
  } catch {
    // Storage blocked; the event still updates this session.
  }
  notifyPreferenceChange();
}

const mutedSnapshot = createStoredSnapshot(
  AGENT_NOTIFICATION_KINDS_KEY,
  EMPTY_MUTED,
  readMutedAgentNotificationKinds,
);

export function useMutedAgentNotificationKinds(): ReadonlySet<string> {
  const getSnapshot = useCallback(() => mutedSnapshot(), []);
  const getServerSnapshot = useCallback(() => EMPTY_MUTED, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

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

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

/**
 * Clamps and defaults stored JSON: a hand-edited or older shape would otherwise leak `NaN` into
 * the renderer, and the footprints vanish with no error.
 */
export function resolveFootprint(raw: unknown): FootprintPreference {
  if (typeof raw !== "object" || raw === null) return DEFAULT_FOOTPRINT;
  const src = raw as Record<string, unknown>;
  const num = (key: keyof typeof FOOTPRINT_RANGES): number => {
    const v = src[key];
    if (typeof v !== "number" || !Number.isFinite(v)) return DEFAULT_FOOTPRINT[key];
    return clamp(v, FOOTPRINT_RANGES[key].min, FOOTPRINT_RANGES[key].max);
  };
  /*
   * Only the four live fields are read; older stored keys are ignored rather than migrated, which
   * keeps this function total: a stored shape from any version resolves.
   */
  return {
    size: num("size"),
    gap: num("gap"),
    opacity: num("opacity"),
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
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * `pill` floats in free space on a dotted leader; `bar` sits above the selected node and states
 * how many will open; `badge` rides the node's shoulder and reveals itself on hover.
 */
export type ExpandAffordance = "pill" | "bar" | "badge";

/**
 * `disc` (golden-angle spiral, area grows as the square root of n) is the only way back if the `fan`
 * default's falsifier is observed: do not delete it (`docs/DECISIONS.md`). `ring` surrounds the
 * parent; `column` runs outward.
 */
export type ExpandStructure = "disc" | "fan" | "ring" | "column";

export const EXPAND_AFFORDANCES: readonly ExpandAffordance[] = ["pill", "bar", "badge"];
export const EXPAND_STRUCTURES: readonly ExpandStructure[] = ["disc", "fan", "ring", "column"];

/**
 * Owns the defaults the map constants (`EGO_NEIGHBOR_LIMIT`, `DISC_LABEL_TOP_K`,
 * `MAX_EXPANDED_PARENTS`) read, so each value lives in one place.
 */
export interface ExpandPreference {
  affordance: ExpandAffordance;
  structure: ExpandStructure;
  /** How many open at once; the rest need another press. */
  batchSize: number;
  /** Labels *attempted* per parent — not how many end up placed. */
  labelAttempts: number;
  /** Parents kept expanded at once; past this the least recently opened closes. */
  maxOpenParents: number;
}

/** Fan arc spacing 34 with a centred last row gave no overlapping marks (`docs/DECISIONS.md`). */
export const DEFAULT_EXPAND: ExpandPreference = {
  affordance: "bar",
  structure: "fan",
  batchSize: 24,
  labelAttempts: 8,
  maxOpenParents: 3,
};

/** The bounds the 27 measured combinations covered; widening them shows unmeasured screens. */
export const EXPAND_RANGES = {
  batchSize: { min: 4, max: 24, step: 1 },
  labelAttempts: { min: 3, max: 40, step: 1 },
  maxOpenParents: { min: 1, max: 6, step: 1 },
} as const satisfies Record<string, { min: number; max: number; step: number }>;

/** Same contract as `resolveFootprint`: a leaked `NaN` silently kills expansion on the map. */
export function resolveExpand(raw: unknown): ExpandPreference {
  if (typeof raw !== "object" || raw === null) return DEFAULT_EXPAND;
  const src = raw as Record<string, unknown>;
  const num = (key: keyof typeof EXPAND_RANGES): number => {
    const v = src[key];
    if (typeof v !== "number" || !Number.isFinite(v)) return DEFAULT_EXPAND[key];
    return Math.round(clamp(v, EXPAND_RANGES[key].min, EXPAND_RANGES[key].max));
  };
  return {
    affordance: (EXPAND_AFFORDANCES as readonly string[]).includes(src.affordance as string)
      ? (src.affordance as ExpandAffordance)
      : DEFAULT_EXPAND.affordance,
    structure: (EXPAND_STRUCTURES as readonly string[]).includes(src.structure as string)
      ? (src.structure as ExpandStructure)
      : DEFAULT_EXPAND.structure,
    batchSize: num("batchSize"),
    labelAttempts: num("labelAttempts"),
    maxOpenParents: num("maxOpenParents"),
  };
}

function readExpand(): ExpandPreference {
  if (typeof window === "undefined") return DEFAULT_EXPAND;
  try {
    const saved = window.localStorage.getItem(EXPAND_KEY);
    return saved === null ? DEFAULT_EXPAND : resolveExpand(JSON.parse(saved));
  } catch {
    return DEFAULT_EXPAND;
  }
}

export function writeExpand(value: ExpandPreference): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(EXPAND_KEY, JSON.stringify(resolveExpand(value)));
  } catch {
    // Storage blocked; the event still updates this session.
  }
  notifyPreferenceChange();
}

const expandSnapshot = createStoredSnapshot(EXPAND_KEY, DEFAULT_EXPAND, readExpand);

export function useExpand(): ExpandPreference {
  const getSnapshot = useCallback(() => expandSnapshot(), []);
  const getServerSnapshot = useCallback(() => DEFAULT_EXPAND, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Sources is the default: a folder with no sources has no pages to list. Opening a file moves the
 * switch to that file's list so the index never disagrees with the reader.
 */
export type LibraryIndexSegment = "sources" | "wiki";

const LIBRARY_INDEX_SEGMENTS: readonly LibraryIndexSegment[] = ["sources", "wiki"];

const DEFAULT_LIBRARY_INDEX_SEGMENT: LibraryIndexSegment = "sources";

const LIBRARY_INDEX_SEGMENT_KEY = "atlas.library.index-segment";

function isLibraryIndexSegment(value: string | null): value is LibraryIndexSegment {
  return value !== null && (LIBRARY_INDEX_SEGMENTS as readonly string[]).includes(value);
}

function readLibraryIndexSegment(): LibraryIndexSegment {
  if (typeof window === "undefined") return DEFAULT_LIBRARY_INDEX_SEGMENT;
  try {
    const saved = window.localStorage.getItem(LIBRARY_INDEX_SEGMENT_KEY);
    return isLibraryIndexSegment(saved) ? saved : DEFAULT_LIBRARY_INDEX_SEGMENT;
  } catch {
    return DEFAULT_LIBRARY_INDEX_SEGMENT;
  }
}

export function writeLibraryIndexSegment(value: LibraryIndexSegment): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LIBRARY_INDEX_SEGMENT_KEY, value);
  } catch {
    // Storage blocked; the event still updates this session.
  }
  notifyPreferenceChange();
}

export function useLibraryIndexSegment(): LibraryIndexSegment {
  const getSnapshot = useCallback(() => readLibraryIndexSegment(), []);
  const getServerSnapshot = useCallback(() => DEFAULT_LIBRARY_INDEX_SEGMENT, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Tab-lifetime memory, not a stored preference: the identity scope is a per-session token that
 * must never become a persisted storage key. Keyed by folder; cleared on close or empty field.
 */
let libraryIndexQuery: { scope: string; query: string } | null = null;

export function readLibraryIndexQuery(vaultScope: string): string {
  if (!vaultScope || libraryIndexQuery?.scope !== vaultScope) return "";
  return libraryIndexQuery.query;
}

export function writeLibraryIndexQuery(vaultScope: string, query: string): void {
  libraryIndexQuery = vaultScope && query ? { scope: vaultScope, query } : null;
}

/**
 * Folded to its edge tab, `lg` and above only: below `lg` there is no second pane to give width
 * to. Off by default so the index doors stay reachable.
 */
const LIBRARY_INDEX_COLLAPSED_KEY = "atlas.library.index-collapsed";

const DEFAULT_LIBRARY_INDEX_COLLAPSED = false;

export function writeLibraryIndexCollapsed(value: boolean): void {
  writeOnOff(LIBRARY_INDEX_COLLAPSED_KEY, value);
}

export function useLibraryIndexCollapsed(): boolean {
  const getSnapshot = useCallback(
    () => readOnOff(LIBRARY_INDEX_COLLAPSED_KEY, DEFAULT_LIBRARY_INDEX_COLLAPSED),
    [],
  );
  const getServerSnapshot = useCallback(() => DEFAULT_LIBRARY_INDEX_COLLAPSED, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * `auto` writes a page that fits the wiki contract without a permission card; `ask` stops every
 * page at the card. The key is kept so earlier choices carry over.
 */
export type WikiWriteMode = "auto" | "ask";

const WIKI_WRITE_MODE_KEY = "library.wikiWriteMode";

const DEFAULT_WIKI_WRITE_MODE: WikiWriteMode = "auto";

function readWikiWriteMode(): WikiWriteMode {
  if (typeof window === "undefined") return DEFAULT_WIKI_WRITE_MODE;
  try {
    return window.localStorage.getItem(WIKI_WRITE_MODE_KEY) === "ask" ? "ask" : DEFAULT_WIKI_WRITE_MODE;
  } catch {
    return DEFAULT_WIKI_WRITE_MODE;
  }
}

export function writeWikiWriteMode(value: WikiWriteMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WIKI_WRITE_MODE_KEY, value);
  } catch {
    // Storage blocked; the event still updates this session.
  }
  notifyPreferenceChange();
}

export function useWikiWriteMode(): WikiWriteMode {
  const getSnapshot = useCallback(() => readWikiWriteMode(), []);
  const getServerSnapshot = useCallback(() => DEFAULT_WIKI_WRITE_MODE, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Per machine, not per folder: someone who has read the three steps should not be re-taught on a
 * second folder.
 */
const LIBRARY_GUIDE_SEEN_KEY = "atlas.library.guide-seen";

const DEFAULT_LIBRARY_GUIDE_SEEN = false;

export function readLibraryGuideSeen(): boolean {
  return readOnOff(LIBRARY_GUIDE_SEEN_KEY, DEFAULT_LIBRARY_GUIDE_SEEN);
}

export function writeLibraryGuideSeen(value: boolean): void {
  writeOnOff(LIBRARY_GUIDE_SEEN_KEY, value);
}

export function useLibraryGuideSeen(): boolean {
  const getSnapshot = useCallback(
    () => readOnOff(LIBRARY_GUIDE_SEEN_KEY, DEFAULT_LIBRARY_GUIDE_SEEN),
    [],
  );
  const getServerSnapshot = useCallback(() => DEFAULT_LIBRARY_GUIDE_SEEN, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
