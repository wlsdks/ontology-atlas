/**
 * The harness film's geometry and clock, as pure functions so tests can hold every frame to them.
 * The film plays the app's own Harness › Setup screen (`src/widgets/harness-setup/`) on the example
 * repository in `harness-example.ts`; this file decides where that window sits on the stage, how
 * large a lifted subject is drawn, and when each press lands.
 */

export const EXAMPLE_REPO = 'my-app/';

/* ---------- the film's clock, in film milliseconds ---------- */

/** Scan, filter, problem, copies that differ. */
export const ACT_MS = [2600, 2600, 2800, 2800] as const;
export const STARTS = [0, 2600, 5200, 8000] as const;
export const TOTAL = 10800;

/**
 * The window, in its own CSS pixels. The body's slot is the window less the app's 40px gutters,
 * 1024px, the width at which the Setup view lays out its three panes.
 */
export const WINDOW = { w: 1104, h: 560, radius: 14 } as const;

/** Below this scale the window's 12.5px body text would fall under 9px, so the still shows instead. */
export const MIN_PLAY_SCALE = 0.72;

/* ---------- the stage ---------- */

/** The picture zone on a stage, in CSS pixels: left, top, right, bottom. */
export interface Zone {
  l: number;
  t: number;
  r: number;
  b: number;
}

export const ZONE = { topMin: 120, labelGap: 24, captionGap: 32, edge: 32, narrow: 960 } as const;

/**
 * The picture zone of a playing stage, from the page as laid out: the page column (read from the
 * caption block, so it follows whatever gutter the page has), or 960px wide when that column is
 * narrower, and between the stage label and the caption block with room around both.
 */
export function pictureZone(w: number, column: { left: number; right: number }, labelBottom: number, captionTop: number): Zone {
  const narrow = column.right - column.left < ZONE.narrow;
  const l = narrow ? Math.max(ZONE.edge, (w - ZONE.narrow) / 2) : column.left;
  const r = narrow ? w - l : column.right;
  return { l, r, t: Math.max(ZONE.topMin, labelBottom + ZONE.labelGap), b: captionTop - ZONE.captionGap };
}

/** Where the window sits on the stage, and its scale. */
export interface WindowFrame {
  x: number;
  y: number;
  s: number;
}

/**
 * The window as large as the zone allows, its left edge on the column line and centred between the
 * label and the caption. It never moves while the film plays; only a resize changes it.
 */
export function windowFrame(zone: Zone): WindowFrame {
  const zw = zone.r - zone.l;
  const zh = zone.b - zone.t;
  const s = Math.min(zw / WINDOW.w, zh / WINDOW.h);
  return { x: zone.l, y: zone.t + (zh - WINDOW.h * s) / 2, s };
}

/* ---------- the lift ---------- */

/** Inner padding of a lifted card, in window pixels before the lift's scale. */
export const LIFT_PAD = 14;
/** How far inside the window's edge a lifted card stays. */
export const LIFT_INSET = 24;

/**
 * How much larger a lifted subject is drawn than its source: enough for its 12.5px body text to
 * reach 15px on screen at the window's scale `s`, at least 1.25 and at most 1.7, and never wider
 * or taller than the window allows.
 */
export function liftScale(s: number, w: number, h: number): number {
  const legible = Math.max(1.25, 15 / (12.5 * s));
  const roomW = (WINDOW.w - 2 * LIFT_INSET - 16) / (w + 2 * LIFT_PAD);
  const roomH = (WINDOW.h - 2 * LIFT_INSET) / (h + 2 * LIFT_PAD);
  return Math.min(1.7, legible, roomW, roomH);
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The lifted card at rest, in window pixels: the source with its padding scaled by `z`, centred
 * on the source and kept `LIFT_INSET` inside the window.
 */
export function liftRest(source: Box, z: number): Box {
  const w = (source.w + 2 * LIFT_PAD) * z;
  const h = (source.h + 2 * LIFT_PAD) * z;
  const clampTo = (v: number, size: number, room: number) => Math.min(Math.max(v, LIFT_INSET), room - LIFT_INSET - size);
  return {
    x: clampTo(source.x + source.w / 2 - w / 2, w, WINDOW.w),
    y: clampTo(source.y + source.h / 2 - h / 2, h, WINDOW.h),
    w,
    h,
  };
}

/* ---------- the pointer ---------- */

/** Travel time for a pointer move of `px` window pixels. */
export function travelMs(px: number): number {
  return Math.min(650, 250 + 0.5 * px);
}

/** A gentle ease for travel: its peak speed is half a cubic's, so no frame jumps. */
export function cosine(k: number): number {
  const v = Math.min(1, Math.max(0, k));
  return (1 - Math.cos(Math.PI * v)) / 2;
}

/** The pointer arrives this long before it presses. */
export const PRESS_LEAD = 100;

/** Every press the film makes, in film time, and what it presses. */
export type PressTarget = 'skills' | 'codex' | 'all' | 'problem' | 'subagents' | 'reviewer';
export const PRESSES: ReadonlyArray<{ at: number; target: PressTarget }> = [
  { at: 3000, target: 'skills' },
  { at: 4000, target: 'codex' },
  { at: 5400, target: 'all' },
  { at: 6300, target: 'problem' },
  { at: 8350, target: 'subagents' },
  { at: 8900, target: 'reviewer' },
];

/** When the pointer appears, and when it leaves. */
export const POINTER_IN = [2650, 2770] as const;
export const POINTER_OUT = [10400, 10550] as const;

/** The pointer's travel to press `i`: it arrives `PRESS_LEAD` before the press, never before `from`. */
export function travelWindow(i: number, px: number, from: number): readonly [number, number] {
  const end = PRESSES[i]!.at - PRESS_LEAD;
  return [Math.max(from, end - travelMs(px)), end];
}

/* ---------- the act timeline ---------- */

export const SCAN_MS = 1100;
export const SCAN_OUT = [1100, 1300] as const;
export const ARRIVE = { lead: 1250, panes: [1250, 1330, 1410], fade: 200, rise: 360 } as const;
export const PANE1_SCROLL = [1900, 2500] as const;
export const LIFTS = [
  { at: 6700, drop: 7650, tone: 'amber' as const },
  { at: 9250, drop: 10250, tone: 'indigo' as const },
];
export const LIFT_UP_MS = 420;
export const LIFT_DOWN_MS = 300;
export const SCRIM_MS = 240;
export const SCRIM_ALPHA = 0.45;

/** The film's still pictures under `public/gateway/`; a locale without its own set reads English. */
export const STILL_NAMES = ['harness-film', 'harness-film-detail'] as const;
export const STILL_LOCALES = ['ko', 'en', 'ja', 'zh'] as const;

export function stillSrc(name: (typeof STILL_NAMES)[number], locale: string): string {
  const shot = (STILL_LOCALES as readonly string[]).includes(locale) ? locale : 'en';
  return `/gateway/${name}.${shot}.png`;
}
