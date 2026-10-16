import { useCallback, useSyncExternalStore } from "react";
import type { MapLayoutView } from "../map-canvas/map-layout-morph-store";

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

/** Same-tab notification; cross-tab arrives through the `storage` event. */
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

/** Same-tab custom event plus the cross-tab `storage` event. */
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

/* ── Frame meter ────────────────────────────────────────────────────────── */

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

/* ── 3D view (map view mode) ────────────────────────────────────────────── */

/**
 * Whether the map is drawn with a 3D arrangement rather than the flat map. Off by default: the 3D
 * arrangement raises edge crossings about 3x, and crossing count dominates graph readability.
 * Geometry: `src/widgets/ontology-map/model/dome-view/`.
 */
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

/* ── Territories (2D map, nothing folded) ───────────────────────────────── */

/**
 * Whether the flat map is drawn as Territories: every capability named, gathered in its domain's
 * slice, with no expansion step. The home route mirrors this flag into `?view=territories`.
 */
const TERRITORIES_KEY = "atlas.appearance.territories";

const DEFAULT_TERRITORIES = false;

function readTerritories(): boolean {
  return readOnOff(TERRITORIES_KEY, DEFAULT_TERRITORIES);
}

export function useTerritories(): boolean {
  const getSnapshot = useCallback(() => readTerritories(), []);
  const getServerSnapshot = useCallback(() => DEFAULT_TERRITORIES, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/* ── Hex board (2D map, one tile per capability) ─────────────────────────── */


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
  const view3d = useView3d();
  const structure = useDomainStructure();
  const territories = useTerritories();
  const hexBoard = useHexBoard();
  return !view3d && !structure && !territories && !hexBoard;
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

/* ── Arrangement (3D map) ───────────────────────────────────────────────── */

/**
 * `strata`: who contains what, read by level (`buildStrataTargets` in
 * `src/widgets/ontology-map/model/dome-view/`). `coupling`: what attaches to what, a force cloud
 * without kind tiers. A stored `ownership` or `cone` opens Strata.
 */
export type MapArrangement = "strata" | "coupling";

const MAP_ARRANGEMENTS: readonly MapArrangement[] = ["strata", "coupling"];

const LEGACY_MAP_ARRANGEMENTS: Readonly<Record<string, MapArrangement>> = {
  ownership: "strata",
  cone: "strata",
};

export const DEFAULT_MAP_ARRANGEMENT: MapArrangement = "strata";

const MAP_ARRANGEMENT_KEY = "atlas.appearance.map-arrangement";

function isMapArrangement(value: string | null): value is MapArrangement {
  return value !== null && (MAP_ARRANGEMENTS as readonly string[]).includes(value);
}

export function resolveStoredMapArrangement(saved: string | null): MapArrangement {
  if (isMapArrangement(saved)) return saved;
  if (saved !== null && Object.prototype.hasOwnProperty.call(LEGACY_MAP_ARRANGEMENTS, saved)) {
    return LEGACY_MAP_ARRANGEMENTS[saved];
  }
  return DEFAULT_MAP_ARRANGEMENT;
}

function readMapArrangement(): MapArrangement {
  if (typeof window === "undefined") return DEFAULT_MAP_ARRANGEMENT;
  try {
    return resolveStoredMapArrangement(window.localStorage.getItem(MAP_ARRANGEMENT_KEY));
  } catch {
    return DEFAULT_MAP_ARRANGEMENT;
  }
}

export function writeMapView(view: MapLayoutView): void {
  if (typeof window === "undefined") return;
  const dome = view === "strata" || view === "coupling";
  const writes: Array<[string, string]> = [
    [TERRITORIES_KEY, view === "territories" ? "on" : "off"],
    [HEX_BOARD_KEY, view === "hex" ? "on" : "off"],
    [STRUCTURE_KEY, view === "structure" ? "on" : "off"],
    ...(dome ? [[MAP_ARRANGEMENT_KEY, view] as [string, string]] : []),
    [VIEW_3D_KEY, dome ? "on" : "off"],
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
  try { window.localStorage.removeItem(RETIRED_VIEW_KEY); } catch {}
  notifyPreferenceChange();
}

export function useMapArrangement(): MapArrangement {
  const getSnapshot = useCallback(() => readMapArrangement(), []);
  const getServerSnapshot = useCallback(() => DEFAULT_MAP_ARRANGEMENT, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/* ── Agent activity (working indicator, notifications) ──────────────────── */

/**
 * **On by default**, unlike the frame meter, and for the opposite reason. The
 * frame meter is a diagnostic; this is a fact — something is changing your folder
 * right now. Hiding that behind an opt-in means whoever never turned it on sees
 * nothing while an agent edits their vault. So the default is on and the setting
 * exists to turn it *off*.
 *
 * The cost is kept small in exchange: one quiet status chip, and notifications
 * only at task granularity.
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
 * Stores the **muted** kinds, not the enabled ones. Storing the enabled set would
 * make any newly added kind arrive silently off for existing users only; storing
 * mutes means a new kind arrives on for everyone (the default is all on).
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

/**
 * `useSyncExternalStore` compares snapshots with `Object.is`, so returning a
 * fresh Set on every call loops forever. Cache it against the raw stored string.
 */
let mutedCacheKey: string | null = null;
let mutedCacheValue: ReadonlySet<string> = EMPTY_MUTED;

function mutedSnapshot(): ReadonlySet<string> {
  if (typeof window === "undefined") return EMPTY_MUTED;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(AGENT_NOTIFICATION_KINDS_KEY);
  } catch {
    return EMPTY_MUTED;
  }
  if (raw === mutedCacheKey) return mutedCacheValue;
  mutedCacheKey = raw;
  mutedCacheValue = readMutedAgentNotificationKinds();
  return mutedCacheValue;
}

export function useMutedAgentNotificationKinds(): ReadonlySet<string> {
  const getSnapshot = useCallback(() => mutedSnapshot(), []);
  const getServerSnapshot = useCallback(() => EMPTY_MUTED, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/* ── The path you walked ────────────────────────────────────────────────── */

/**
 * Three named tones, not a colour picker.
 *
 * `star` is the default and the map's own ink: `render/starfield.ts` already paints its
 * far-field dust and diffraction spikes at this value, under a header that names the
 * language — "B1 constellation DNA". The walked path was the one mark standing outside it.
 *
 * The other two stay because they were chosen deliberately and neither is broken. Yellow
 * already means something here — hub amber `#d4b478` says "this is a centre" — so the trail
 * uses a different value in the same family rather than the hub's own bits. Indigo is a
 * value on the selection ladder, pale enough to clear contrast where the accent did not.
 * A person who prefers either keeps it; what changed is which one a folder opens with.
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

/**
 * Footprint appearance. The shape is fixed to a two-foot shoe print: letting users pick it would
 * make the screen unable to say what the mark means. Only how loudly it is said is adjustable. Field
 * names describe what is seen ("Intensity", not "alpha").
 */
/**
 * What a person may choose about their walked path. The walked path is the node emitting, a line and
 * a number, so only four live fields exist. Stored preferences with older keys still load:
 * `resolveFootprint` reads the fields it knows and ignores the rest.
 */
export interface FootprintPreference {
  /**
   * How far the step number sits from the node, in px, before the gap is added. It only places the
   * ordinal; the node's size is the map's.
   */
  size: number;
  /** Extra offset for the step number, in px. */
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
 * Single source for both the slider bounds and the clamp on stored values.
 *
 * The lower bounds are deliberately not generous. At `size` 6px the toe and heel
 * of the print merge and shape stops being a channel at all; at `opacity` 0.1 the
 * effective contrast over the canvas falls far short of 3:1 (infoviz
 * measurement). What a user can pick has to stay within what is still readable —
 * the freedom to make it invisible is a defect, not a preference.
 */
export const FOOTPRINT_RANGES = {
  size: { min: 9, max: 26, step: 1 },
  gap: { min: 0, max: 28, step: 1 },
  opacity: { min: 0.5, max: 1, step: 0.05 },
} as const satisfies Record<string, { min: number; max: number; step: number }>;

/**
 * What the settings screen shows first. Spilling all 8 sliders on open gives the
 * attention to the controls rather than to the choice; the rest sits behind
 * 「Manual Tuning」 (the manual-tuning disclosure).
 */
export const FOOTPRINT_PRESETS = {
  subtle: { size: 10, opacity: 0.5 },
  default: { size: 13, opacity: 0.7 },
  bold: { size: 17, opacity: 0.95 },
} as const satisfies Record<string, Partial<FootprintPreference>>;

export type FootprintPresetName = keyof typeof FOOTPRINT_PRESETS;

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

/**
 * Stored JSON → a valid preference: out-of-range numbers clamped, missing keys
 * defaulted. Kept pure and tested because a hand-edited localStorage or an older
 * shape can otherwise leak `NaN` into the renderer, and the footprints then
 * vanish entirely with no error.
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

/** Layers a preset over the current preference, keeping what the preset does not set. */
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

/**
 * The hook must not build a new object per call: `useSyncExternalStore` compares
 * snapshots with `Object.is`, so a fresh object re-subscribes every render and
 * loops. Cache the parse against the raw stored string.
 */
let footprintCacheKey: string | null = null;
let footprintCacheValue: FootprintPreference = DEFAULT_FOOTPRINT;

function footprintSnapshot(): FootprintPreference {
  if (typeof window === "undefined") return DEFAULT_FOOTPRINT;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(FOOTPRINT_KEY);
  } catch {
    return DEFAULT_FOOTPRINT;
  }
  if (raw === footprintCacheKey) return footprintCacheValue;
  footprintCacheKey = raw;
  footprintCacheValue = readFootprint();
  return footprintCacheValue;
}

export function useFootprint(): FootprintPreference {
  const getSnapshot = useCallback(() => footprintSnapshot(), []);
  const getServerSnapshot = useCallback(() => DEFAULT_FOOTPRINT, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/* ── Expansion (how a collapsed group opens) ────────────────────────────── */

/**
 * Where the "expand" control sits and what it looks like. The three options come
 * from a mockup built to measure them side by side, and moved into the product
 * unchanged.
 *
 * - `pill` — floats in empty space away from the node, joined by a dotted line.
 *   The only one that has to *find* a spot, so it drifts further as space fills.
 * - `bar` — a text button directly above the selected node. Nothing is shown
 *   unless a node is selected, and it states how many will open.
 * - `badge` — a small circle on the node's top-right shoulder. It tracks the
 *   node, so it never hunts for space; what it does is revealed on hover.
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
 * The three numbers already existed as constants in the map code; the mockup only
 * pulled them out as sliders to measure them. So this file owns them and the map
 * constants (`EGO_NEIGHBOR_LIMIT`, `DISC_LABEL_TOP_K`, `MAX_EXPANDED_PARENTS`)
 * read these defaults. The other direction writes the same value in two places,
 * which is where drift starts.
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

/**
 * `affordance: "bar"` and `structure: "fan"` deliberately change what is on screen; the three
 * numbers are the original constants. Fan arc spacing 34 with a centred last row gave no overlapping
 * marks (`docs/DECISIONS.md`).
 */
export const DEFAULT_EXPAND: ExpandPreference = {
  affordance: "bar",
  structure: "fan",
  batchSize: 24,
  labelAttempts: 8,
  maxOpenParents: 3,
};

/**
 * The mockup's bounds, carried over unchanged. It picked them while measuring 27
 * combinations, so narrowing them here would leave the product showing only
 * screens that measurement never covered.
 */
export const EXPAND_RANGES = {
  batchSize: { min: 4, max: 24, step: 1 },
  labelAttempts: { min: 3, max: 40, step: 1 },
  maxOpenParents: { min: 1, max: 6, step: 1 },
} as const satisfies Record<string, { min: number; max: number; step: number }>;

/**
 * Stored JSON → a valid preference, same contract as `resolveFootprint`: a
 * hand-edited localStorage leaking `NaN` into the renderer kills expansion on the
 * map entirely, and it fails silently.
 */
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

/** Same caching reason as the footprint snapshot: `Object.is` on snapshots. */
let expandCacheKey: string | null = null;
let expandCacheValue: ExpandPreference = DEFAULT_EXPAND;

function expandSnapshot(): ExpandPreference {
  if (typeof window === "undefined") return DEFAULT_EXPAND;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(EXPAND_KEY);
  } catch {
    return DEFAULT_EXPAND;
  }
  if (raw === expandCacheKey) return expandCacheValue;
  expandCacheKey = raw;
  expandCacheValue = readExpand();
  return expandCacheValue;
}

export function useExpand(): ExpandPreference {
  const getSnapshot = useCallback(() => expandSnapshot(), []);
  const getServerSnapshot = useCallback(() => DEFAULT_EXPAND, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/* ── Library index (which list, and whether the column stands) ───────────── */

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
