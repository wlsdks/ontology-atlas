import { useCallback, useSyncExternalStore } from "react";

/**
 * Appearance preferences (`docs/plans/DESIGN-OVERHAUL-2026-07-25.md` #20/#21) —
 * the single source of truth for map canvas background and node glyph set, read
 * live by every surface.
 *
 * **Why a store rather than a Context provider.** These values are read from the
 * map canvas (a non-React renderer) *and* from DOM glyphs in several widgets at
 * the same time, and a change in settings has to reach both instantly — fable:
 * "If only one surface updates, that is a defect." So
 * localStorage is the source of truth and `useSyncExternalStore` + a custom event
 * deliver the live update, the same local-first persistence idiom as
 * `docs-vault-local` / `audiencePlain`.
 *
 * SSR / static-export prerender returns the defaults (`getServerSnapshot`) so
 * hydration cannot mismatch.
 */

/**
 * Map canvas backgrounds.
 *
 * **Why only three survived** (council 2026-07-29, owner confirmed). Eleven
 * candidates were rejected, and the measurement said the cause was the *shape*
 * of the ink, not its amount: every rejected background was lines or closed
 * figures — the same visual grammar as nodes and edges — so it competed with the
 * graph for the eye. Dots survived precisely because they do not pretend to be
 * data. Continuous particles were also rejected: 78% of the pixels that changed
 * per frame carried no information.
 *
 * - `dot` — static blueprint grid. Says only that a coordinate system exists.
 * - `web` — proximity constellation. The one moving background kept (owner call).
 * - `depth` — the same dots in three layers, reacting to the camera **only**.
 *   Zero autonomous motion, so idle burn is structurally impossible.
 *
 * Retired: `constellation`, `contour`, `flow`, `gravity`.
 */
export type CanvasBackground = "dot" | "web" | "depth";
export type GlyphSet = "geometric" | "line";

export const CANVAS_BACKGROUNDS: readonly CanvasBackground[] = ["dot", "web", "depth"];
export const GLYPH_SETS: readonly GlyphSet[] = ["geometric", "line"];

/**
 * Retired value → successor. Falling back to the default would silently discard
 * what the user picked, so each retired background maps to its nearest survivor:
 * constellation-like choices go to `web`, static ones to `dot`.
 */
const RETIRED_CANVAS_BACKGROUNDS: Readonly<Record<string, CanvasBackground>> = {
  constellation: "web",
  contour: "dot",
  // Retired by the 2026-07-29 council; both were chosen for their motion, so
  // they map to the surviving moving background.
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

/** Stored value → live value: retired ones to their successor, unknown ones to the default. */
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

/* ── Accent ─────────────────────────────────────────────────────────────── */

/**
 * The app's only chromatic colour: indigo (`#5e6ad2`) by default, ember
 * (`#c14a24`) opt-in.
 *
 * 2026-08-18: the default was switched to ember in the morning and the owner
 * reverted it the same day. The revert swapped the two palette bodies in
 * `globals.css` so indigo sits on `:root`, rather than only flipping the default
 * constant here — the tokens are named `--color-indigo-*`, so a copper value in
 * the base palette would make the names lie about their values, and no gate
 * catches that kind of lie.
 *
 * **Why exactly two, and not a colour picker.** The charter's "one accent" rule
 * is about contrast, not taste: both values were measured to clear AA for white
 * text on the filled control and for ink on all three dark surfaces. An arbitrary
 * colour throws that guarantee away, so the choice is between two verified sets.
 *
 * **What this preference cannot change.** App icon, favicon and og images are
 * baked at build time (`scripts/build-brand-assets.mjs`), so the colour in the
 * Dock is fixed to whichever was chosen then — the settings screen says so.
 *
 * Applied at one place, the `data-accent` attribute on `:root`, from which CSS
 * swaps 52 tokens (last block of `app/globals.css`).
 */
export type Accent = "indigo" | "ember";

export const ACCENTS: readonly Accent[] = ["indigo", "ember"];

export const DEFAULT_ACCENT: Accent = "indigo";

const ACCENT_KEY = "ontology-atlas:accent:v1";

/** Paired with the CSS selector `:root[data-accent="ember"]`. */
export const ACCENT_ATTRIBUTE = "data-accent";

function isAccent(value: string | null): value is Accent {
  return value !== null && (ACCENTS as readonly string[]).includes(value);
}

function readAccent(): Accent {
  if (typeof window === "undefined") return DEFAULT_ACCENT;
  try {
    const saved = window.localStorage.getItem(ACCENT_KEY);
    return isAccent(saved) ? saved : DEFAULT_ACCENT;
  } catch {
    return DEFAULT_ACCENT;
  }
}

/**
 * The default **removes** the attribute rather than writing it. Leaving it would
 * make "on the default" and "explicitly chose this" indistinguishable in the DOM,
 * so a later change of default would find the old default frozen into markup.
 */
function applyAccentAttribute(value: Accent): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (value === DEFAULT_ACCENT) root.removeAttribute(ACCENT_ATTRIBUTE);
  else root.setAttribute(ACCENT_ATTRIBUTE, value);
}

export function writeAccent(value: Accent): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACCENT_KEY, value);
  } catch {
    // Storage blocked; the event still updates this session.
  }
  applyAccentAttribute(value);
  notifyPreferenceChange();
}

export function useAccent(): Accent {
  const getSnapshot = useCallback(() => readAccent(), []);
  const getServerSnapshot = useCallback(() => DEFAULT_ACCENT, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/* ── Frame meter ────────────────────────────────────────────────────────── */

/**
 * Whether the frame meter is drawn over the map.
 *
 * **Off by default** because it is a diagnostic, not product chrome: permanent
 * numbers over the map are noise to someone who came to read the graph, and the
 * attention budget belongs to the map. It lives opt-in in settings, next to the
 * footprint controls.
 *
 * **Why it exists at all** — to end "it isn't slow on my machine". On 2026-07-31
 * the owner reported node-drag lag while the reproduction environment (Playwright
 * Chromium) measured 2.1 ms of frame work; frame timestamps from a screen
 * recording showed real 150 ms stalls. The same code hurt differently per
 * environment, so what was needed was a number from the machine that hurts, not a
 * developer's repro. Without an on-screen number every performance discussion is
 * one person's feeling against someone else's benchmark.
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

/* ── 3D view (map view mode) ────────────────────────────────────────────── */

/**
 * Whether the map is drawn with a 3D arrangement rather than the flat map.
 *
 * Owner request, 2026-08-18: "Put our actual map into a 3D dome that still zooms
 * and can be moved around freely." (put our actual map into a 3D dome that still zooms
 * and can be moved around freely). The toolbar picker now presents one flat view
 * (the default) plus the Cone and Cloud 3D arrangements in one place. There is no
 * duplicate switch in the settings sheet.
 *
 * **Off by default on a measurement, not a preference.** The same data in the
 * original Dome arrangement raises edge crossings sharply: 58.0 → 190.7 on
 * the hero graph, 3.29×.
 * Crossing count dominates graph readability (Purchase 1997), so the default map
 * stays planar and 3D is opt-in for people who want to see structure as shape.
 * Geometry and cost: `src/widgets/ontology-map/model/dome-view.ts`,
 * `docs/DECISIONS.md`.
 */
const VIEW_3D_KEY = "atlas.appearance.view3d";

const DEFAULT_VIEW_3D = false;

function readView3d(): boolean {
  return readOnOff(VIEW_3D_KEY, DEFAULT_VIEW_3D);
}

export function writeView3d(value: boolean): void {
  writeOnOff(VIEW_3D_KEY, value);
}

export function useView3d(): boolean {
  const getSnapshot = useCallback(() => readView3d(), []);
  const getServerSnapshot = useCallback(() => DEFAULT_VIEW_3D, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/* ── Galaxy (2D map, seen as a sky) ─────────────────────────────────────── */

/**
 * Whether the flat map is drawn as a galaxy — every node a star.
 *
 * Owner request, 2026-09-10: *"totally like a galaxy"*, in 2D. It shipped first as an
 * **altitude**: zoom out far enough and the workbench became a sky, with no control anywhere.
 * Seeing it built, the owner said where they had gone looking for it — the view picker that
 * already holds Flat, Cone, Strata and Cloud — and chose to move it there and drop the altitude
 * behaviour entirely. Both readings are defensible; what settles it is that a person looking
 * for "how the map looks" opens that menu, and a mode nobody can find is a mode nobody has.
 *
 * It sits beside `view3d` rather than inside `MapArrangement` because it is not an arrangement:
 * the three 3D entries move where nodes *are*, and this changes only how they are *drawn*. The
 * menu presents all five as one choice because to a reader they are one question.
 */
const GALAXY_KEY = "atlas.appearance.galaxy";

const DEFAULT_GALAXY = false;

function readGalaxy(): boolean {
  return readOnOff(GALAXY_KEY, DEFAULT_GALAXY);
}

export function writeGalaxy(value: boolean): void {
  writeOnOff(GALAXY_KEY, value);
}

export function useGalaxy(): boolean {
  const getSnapshot = useCallback(() => readGalaxy(), []);
  const getServerSnapshot = useCallback(() => DEFAULT_GALAXY, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/* ── Arrangement (3D map) ───────────────────────────────────────────────── */

/**
 * Which structural question decides a node's **position** in 3D. This is a
 * question, not a style, and the picker names the resulting visible
 * arrangements Cone and Cloud (the cone tree replaced the dome on 2026-09-02):
 *
 * - `ownership` (default) — *who contains what.* Every parent is the apex of
 *   its own cone and its children rest on a circle directly under it, so
 *   ownership is readable as shape.
 * - `coupling` — *what attaches to what.* Every relation contributes to a free,
 *   deterministic 3D force cloud. It releases the kind tiers so dependencies
 *   can decide height as well as bearing; keeping the tiers produced only a
 *   distorted Dome and was explicitly reverted. Geometry and determinism live
 *   in `src/widgets/ontology-map/model/dome-view.ts`; decision 84 records the
 *   rejected tier-constrained hybrid.
 *
 * - `strata` (2026-09-06) — *who contains what, read by level.* The same
 *   containment fact as `ownership`, drawn as four stacked labelled planes
 *   instead of nested cones, so "which level is this on" is a glance rather than
 *   an inference. It is the one structure the three.js probe of that day found
 *   clearly better than the cone at tier legibility, and porting it needed no
 *   renderer: `buildStrataTargets` in
 *   `src/widgets/ontology-map/model/dome-view.ts` is pure geometry.
 *
 * **Why `strata` breaks the "key is the question" habit.** `ownership` and
 * `coupling` are named for what they ask because they ask different things.
 * Strata asks the same question as `ownership` and answers it with a different
 * shape, so a question-shaped key would collide. The shape's name is the honest
 * key.
 *
 * **Why this shares one picker with Flat.** Splitting 3D on/off from its
 * arrangement makes the current view depend on two controls. The toolbar's one
 * four-row picker states the whole view choice without duplicating it in settings.
 */
export type MapArrangement = "ownership" | "coupling" | "strata";

const MAP_ARRANGEMENTS: readonly MapArrangement[] = ["ownership", "coupling", "strata"];

export const DEFAULT_MAP_ARRANGEMENT: MapArrangement = "ownership";

const MAP_ARRANGEMENT_KEY = "atlas.appearance.map-arrangement";

function isMapArrangement(value: string | null): value is MapArrangement {
  return value !== null && (MAP_ARRANGEMENTS as readonly string[]).includes(value);
}

function readMapArrangement(): MapArrangement {
  if (typeof window === "undefined") return DEFAULT_MAP_ARRANGEMENT;
  try {
    const saved = window.localStorage.getItem(MAP_ARRANGEMENT_KEY);
    return isMapArrangement(saved) ? saved : DEFAULT_MAP_ARRANGEMENT;
  } catch {
    return DEFAULT_MAP_ARRANGEMENT;
  }
}

export function writeMapArrangement(value: MapArrangement): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MAP_ARRANGEMENT_KEY, value);
  } catch {
    // Storage blocked; the event still updates this session.
  }
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
 * The one place a tone names its token.
 *
 * ⚠️ There used to be three: the map loop, the settings preview, and a bare hex default. The
 * preview still branched two ways after the star tone landed, so picking "starlight" painted
 * **amber** in the preview while the map painted white — and that module's own header says a
 * preview that drifts stops being a preview (design-system, 2026-09-10). Every consumer reads
 * this, so a fourth tone cannot be added to the union and forgotten in one of them.
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
 * Footprint appearance — the values the owner tunes directly (2026-07-29).
 *
 * **Shape is not a preference.** It is fixed to a two-foot shoe print: letting
 * users pick the shape means everyone sees a different picture, and the screen
 * can then no longer say what the mark means. What is adjustable is only how
 * loudly the same meaning is said.
 *
 * The owner named 11 values; the 2026-07-29 council cut them to 8. All three
 * removed were values with no decision behind them — edge mark size (now fixed),
 * edge offset (folded into the node's `gap`, because it is one sentence to the
 * user), and edge mark count (replaced by the two-step density).
 *
 * Field names describe what is seen, not the value behind it ("Intensity" rather
 * than "alpha") — a settings screen is not a code review.
 */
/**
 * What a person may choose about their walked path.
 *
 * ⚠️ **Six of these were retired on 2026-09-10 and the reason is worth keeping.** They
 * described a *glyph* — its fill, its outline weight, its bloom, whether it repeated along the
 * relation, how densely, and on which side. There is no glyph: the owner asked for the
 * footprint mark to go and for the node's own border to light instead, so the walked path is
 * now the node emitting, a line, and a number. A control whose value nothing reads is worse
 * than a missing one, because a person spends attention setting it and gets nothing back.
 *
 * Stored preferences carrying the old keys still load — `resolveFootprint` reads the fields it
 * knows and ignores the rest — so nobody's saved settings break; the retired values simply
 * stop being consulted.
 */
export interface FootprintPreference {
  /**
   * How far the step number sits from the node, in px, before the gap is added.
   *
   * It sized the glyph once. It now only places the ordinal, which is why the settings screen
   * no longer calls it "star size": the star is the node, and the node's size is the map's.
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
   * Only the four live fields are read. A preference saved before 2026-09-10 still carries
   * `filled`, `strokeWidth`, `bloom`, `onEdges`, `edgeDensity` and `placement`; they are
   * ignored rather than migrated, because there is nothing to migrate them *to* — the glyph
   * they described no longer exists. Ignoring is also what keeps this function total: a stored
   * shape from any version resolves, and no key is required to be present.
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
 * How expanded children are laid out.
 *
 * All but `disc` come from the mockup's three candidates; `disc` is the previous
 * production layout (golden-angle phyllotaxis spiral,
 * `placePhyllotaxisDisk` in the map's `model/layout.ts`). The default is `fan`
 * (owner decision 2026-08-02), which makes `disc` more important, not less: it is
 * the only way back to the previous screen if the fan's falsifier is observed.
 * **Do not delete it** (`docs/DECISIONS.md`).
 *
 * - `disc` — spiral disc. Area grows only as √n, so it stays bounded.
 * - `fan` — sector fanning outward. Widens as rows stack and can collide with
 *   sibling domains.
 * - `ring` — a ring around the parent. Uses every direction, so the same count
 *   fits in less area.
 * - `column` — a line running outward. Labels sit side by side, the easiest to
 *   read, at the cost of length.
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
 * ⚠️ Two of these deliberately change what is on screen today: `affordance: "bar"`
 * (owner, 2026-08-01: *"How about making the overhead bar the default?"* — make the overhead bar
 * the default) and `structure: "fan"` (owner, 2026-08-02). The three numbers are
 * the previous constants unchanged.
 *
 * Overlap was measured before promoting the fan: three parents expanded (48
 * children, 1512×982) gave 26 overlapping mark pairs; raising arc spacing from 26
 * to 34 and centring the last row brought it to **0**, with labelled marks rising
 * 31% → 34% — above the spiral's 27%. Values and falsifier: `docs/DECISIONS.md`,
 * 2026-08-02.
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
 * **Which of the Library's two lists the index is showing**, remembered per machine.
 *
 * The column carried both — sources above, wiki below, one scroll — until the owner read
 * it in the installed app on a folder of seven sources and seven pages (2026-09-07):
 * *"I hate this structure: sources on top, wiki underneath, one long scroll. A switch at
 * the top is better."* One segmented control now names both lists with their counts and
 * draws one of them, so the doors on screen are the ones that belong to the list on
 * screen.
 *
 * **Sources is the default** because it is the first half of the work: a folder with no
 * sources has no pages to list, and the three doors that are the reason somebody opens
 * this destination — add, find, bring from a service — are that segment's own. The stored
 * answer wins from the second visit onward, and opening a file from the graph or from the
 * guide moves the switch to the list that file is in, so the index can never name one
 * thing while the reader shows another.
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
 * **What the person had typed in the index's field, so a door can give it back.**
 *
 * Measured 2026-09-11 on the day-one folder (design-interaction, council): typing `T+2`,
 * pressing the caption, then pressing the Agents door and coming back through the rail
 * left the field empty — the door U2 exists to give somebody costs them the retype, and on
 * a capped folder a second read of every file as well. A door that makes a person redo
 * their own work is a door they stop pressing.
 *
 * ⚠️ **It is memory for this tab, not a stored preference, and that is a boundary rather
 * than a shortcut.** The scope this column is handed is `useVaultSessionIdentityScope` — a
 * per-session token that `use-vault-identity-scope.ts` says in as many words must never
 * become a persisted storage key. A `sessionStorage` slot keyed by it would be refused on
 * the next page load anyway, because the token is minted fresh per load, so the storage
 * bought nothing and `tests/contract/scope-registry.contract.test.ts` would have had to
 * certify a per-vault *persisted* key whose protection is a scope check inside the value.
 * A route round trip does not need persistence: this module outlives the unmounted column
 * and dies with the tab, which is the exact lifetime of the trip the door asks for.
 *
 * Two properties follow from the shape, and both are what the council asked for:
 *
 * - **Keyed by the folder.** Another folder never opens holding this folder's question;
 *   a scope that does not match reads back as nothing.
 * - **Cleared when the folder closes**, which is the same statement — the scope changes —
 *   and cleared when the person empties the field, which is them saying so.
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
 * **Whether the Library's index column is folded to its edge tab**, per machine.
 *
 * Same verdict, same day: *"the left panel must be closable, I may want only the graph."*
 * The map's INDEX panel already answers this — it folds to a slim vertical tab and its
 * camera refits against the width it gained — so the Library borrows the vocabulary
 * rather than inventing a second one. Off by default: the column is how a person reaches
 * the doors, and a destination that opens folded hides them.
 *
 * The fold is a `lg`-and-above answer only. Below `lg` the index is the bottom half of one
 * column and the graph is the top of it; there is no second pane for the column to give
 * its width to.
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
 * **How an agent's wiki page lands**, per machine.
 *
 * Owner direction 2026-09-07: agents act and the person can step in. `auto` lets a page
 * that fits the wiki contract be written without a permission card; `ask` stops every
 * page at the card. It is a setting, not a door: it changes how every Compile, Fix and
 * proposal behaves, so it lives in Settings beside the folder's shape rather than in the
 * Library's index column, where two chips beside the doors read as scattered (owner,
 * 2026-09-07 evening). The key predates this move so a person's earlier choice carries.
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
