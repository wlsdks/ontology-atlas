import { cssOf, mix, rgbOf, type RGB } from "../board/board-tones";
import { TREE_TONE_STEPS, type TreeMarkSizes, type TreeNameSizes } from "../model/tree-view/types";

export interface TreeDetailTokens { openPitchPx: number; leafPitchPx: number; elementNamePitchPx: number; pickSlopPx: number }

/** Shares mix an ink toward the ground (1 keeps the ink); `-Px` are CSS pixels where scale is 1. */
export interface TreePaintTokens {
  toneFar: number;
  branchMinPx: number; branchInk: number; branchMidShare: number; branchMidInk: number; branchCoreShare: number; branchCoreMinPx: number; branchCoreInk: number; branchLitInk: number;
  markInk: number; ringShare: number; ringMinPx: number; domainCoreShare: number; domainCoreRingPx: number;
  hubGlowAlpha: number; hubGlowReach: number;
  closedRingGapPx: number; closedRingPx: number; staleDotShare: number; staleDotMinPx: number;
  arcWidthPx: number; arcHaloPx: number; arcBow: number; arcGapPx: number;
  focusVeilAlpha: number; focusRingGapPx: number; focusRingPx: number;
  nameHaloPx: number; domainNameHaloPx: number; nameSubInk: number;
  backdropAlpha: number; backdropReach: number; canopyAlpha: number; canopyReach: number;
  poolAlpha: number; poolReach: number; poolFlatten: number;
}

/** Resolved colours: the flat map's inks, the map ground, and gradient stops derived from them. */
export interface TreeInks {
  project: string; discFill: string; name: string; nameStrong: string; halo: string;
  /** What the focus depends on. */
  arc: string;
  /** What depends on the focus. */
  reach: string;
  warning: string;
  ground: string;
  /** The middle layer of a branch on the focus's path to the trunk. */
  branchLit: string;
  backdropGlow: readonly [string, string];
  canopyGlow: readonly [string, string, string];
  poolGlow: readonly [string, string, string];
}

/** Opaque colours per tone step, index 0 far .. TREE_TONE_STEPS - 1 near. */
export interface TreeTones {
  branch: readonly string[]; branchMid: readonly string[]; branchCore: readonly string[]; mark: readonly string[]; stale: readonly string[];
  project: readonly string[]; name: readonly string[]; nameStrong: readonly string[]; nameSub: readonly string[];
}

export interface TreeTokens {
  marks: TreeMarkSizes;
  names: TreeNameSizes;
  detail: TreeDetailTokens;
  paint: TreePaintTokens;
  inks: TreeInks;
  tones: TreeTones;
}

const kebab = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const vars = <K extends string>(keys: readonly K[], cssVar: (key: K) => string) => keys.map((key) => ({ key, cssVar: cssVar(key) }));

const MARK_VARS = vars<keyof TreeMarkSizes>(["project", "domain", "capability", "element", "bud"], (k) => `--map-tree-mark-${k}-px`);
const NAME_VARS = vars<keyof TreeNameSizes>(
  ["project", "domain", "domainSub", "capability", "element", "gap", "pad", "leading"],
  (k) => (k === "leading" ? "--map-tree-name-leading" : `--map-tree-name-${kebab(k)}-px`),
);
const DETAIL_VARS = vars<keyof TreeDetailTokens>(["openPitchPx", "leafPitchPx", "elementNamePitchPx", "pickSlopPx"], (k) => `--map-tree-${kebab(k)}`);
const PAINT_VARS = vars<keyof TreePaintTokens>(
  [
    "toneFar", "branchMinPx", "branchInk", "branchMidShare", "branchMidInk", "branchCoreShare", "branchCoreMinPx", "branchCoreInk", "branchLitInk",
    "markInk", "ringShare", "ringMinPx", "domainCoreShare", "domainCoreRingPx", "hubGlowAlpha", "hubGlowReach", "closedRingGapPx", "closedRingPx", "staleDotShare", "staleDotMinPx",
    "arcWidthPx", "arcHaloPx", "arcBow", "arcGapPx", "focusVeilAlpha", "focusRingGapPx", "focusRingPx",
    "nameHaloPx", "domainNameHaloPx", "nameSubInk",
    "backdropAlpha", "backdropReach", "canopyAlpha", "canopyReach", "poolAlpha", "poolReach", "poolFlatten",
  ],
  (k) => `--map-tree-${kebab(k)}`,
);
/** Spelled out: Tailwind emits an `@theme` variable only when a scanned source names it. */
const INK_VARS: readonly { key: keyof TreeInks; cssVar: string }[] = [
  { key: "project", cssVar: "--map-graph-project" },
  { key: "discFill", cssVar: "--map-graph-disc-fill" },
  { key: "name", cssVar: "--map-graph-name" },
  { key: "nameStrong", cssVar: "--map-graph-name-strong" },
  { key: "halo", cssVar: "--map-graph-halo" },
  { key: "arc", cssVar: "--map-graph-arc" },
  { key: "reach", cssVar: "--map-graph-reach" },
  { key: "warning", cssVar: "--color-status-warning" },
  { key: "ground", cssVar: "--map-canvas-bg-near" },
];

/** Middle stop of the canopy and pool glows, as a share of their centre alpha. */
const GLOW_MID_SHARE = 0.4;

const rgba = (c: RGB, alpha: number) => `rgba(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}, ${alpha})`;

function toneLadder(ink: string, ground: RGB, share: number, toneFar: number): string[] {
  const rgb = rgbOf(ink);
  const out: string[] = [];
  for (let step = 0; step < TREE_TONE_STEPS; step += 1) {
    const near = toneFar + ((1 - toneFar) * step) / (TREE_TONE_STEPS - 1);
    out.push(cssOf(mix(ground, rgb, share * near)));
  }
  return out;
}

/**
 * Reads every tree token from the document and precomputes the tone ladders; a missing or
 * non-numeric token throws, never falls back. It reads the stylesheet on each call, so a
 * caller reads once per mount, not per frame.
 */
export function readTreeTokens(): TreeTokens {
  const style = getComputedStyle(document.documentElement);
  const missing: string[] = [];
  const numbers = <K extends string>(specs: readonly { key: K; cssVar: string }[]) => {
    const out = {} as Record<K, number>;
    for (const { key, cssVar } of specs) {
      const raw = style.getPropertyValue(cssVar).trim();
      const value = Number(raw);
      if (!raw || !Number.isFinite(value)) missing.push(cssVar);
      out[key] = value;
    }
    return out;
  };
  const marks = numbers(MARK_VARS);
  const names = numbers(NAME_VARS);
  const detail = numbers(DETAIL_VARS);
  const paint = numbers(PAINT_VARS);
  const read = {} as Record<(typeof INK_VARS)[number]["key"], string>;
  for (const { key, cssVar } of INK_VARS) {
    const ink = style.getPropertyValue(cssVar).trim();
    if (!ink) missing.push(cssVar);
    read[key] = ink;
  }
  if (missing.length > 0) throw new Error(`Tree token drift: missing/empty ${missing.join(", ")}`);

  const ground = rgbOf(read.ground);
  const nameStrong = rgbOf(read.nameStrong);
  const project = rgbOf(read.project);
  const inks: TreeInks = {
    project: read.project, discFill: read.discFill, name: read.name, nameStrong: read.nameStrong, halo: read.halo,
    arc: read.arc, reach: read.reach, warning: read.warning, ground: read.ground,
    branchLit: cssOf(mix(ground, nameStrong, paint.branchLitInk)),
    backdropGlow: [rgba(rgbOf(read.name), paint.backdropAlpha), rgba(rgbOf(read.name), 0)],
    canopyGlow: [rgba(nameStrong, paint.canopyAlpha), rgba(nameStrong, paint.canopyAlpha * GLOW_MID_SHARE), rgba(nameStrong, 0)],
    poolGlow: [rgba(project, paint.poolAlpha), rgba(project, paint.poolAlpha * GLOW_MID_SHARE), rgba(project, 0)],
  };
  const ladder = (ink: string, share: number) => toneLadder(ink, ground, share, paint.toneFar);
  const tones: TreeTones = {
    branch: ladder(read.name, paint.branchInk),
    branchMid: ladder(read.nameStrong, paint.branchMidInk),
    branchCore: ladder(read.nameStrong, paint.branchCoreInk),
    mark: ladder(read.nameStrong, paint.markInk),
    stale: ladder(read.warning, 1),
    project: ladder(read.project, 1),
    name: ladder(read.name, 1),
    nameStrong: ladder(read.nameStrong, 1),
    nameSub: ladder(read.name, paint.nameSubInk),
  };
  return { marks, names, detail, paint, inks, tones };
}
