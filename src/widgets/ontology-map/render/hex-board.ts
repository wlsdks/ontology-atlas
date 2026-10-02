import { BOARD_ARRIVAL } from "../board/board-scene";
import { HEX_TYPE, type HexBand, type HexMeasure, type HexTextRole } from "../model/hex-board";

export type HexEvidenceState = "current" | "stale" | "unknown";

/*
 * ⚠️ **Names are measured in the face the page ships, not in whatever the platform has**
 * (2026-09-25). The board's names band starts at the smallest cell every name fits
 * (`minNamesRadius`), so the font decides whether a board opens named. With a macOS-only stack
 * (`-apple-system, 'Apple SD Gothic Neo'`) every other platform fell to its own `sans-serif`:
 * on the Linux CI runner the dogfood vault's widest name needed R 48 where macOS needed 46, and
 * the same board at 1280 opened as pips there (R 47) while it opened named on the Mac that
 * proved it. The product's own Pretendard is self-hosted and measured within a pixel of the
 * Apple stack (125 vs 126 px for the widest dogfood name), so the band is the same on macOS,
 * Linux and the Windows beta. The system stack stays behind it for the frames before the
 * webfont arrives; the board re-measures once it has (`useHexFontsReady`).
 */
const SYSTEM_FAMILY = "-apple-system, 'SF Pro Text', 'Apple SD Gothic Neo', sans-serif";
const MONO = "ui-monospace, 'SF Mono', Menlo, monospace";

function fontsFor(family: string): Record<HexTextRole, string> {
  return {
    capability: `510 ${HEX_TYPE.capability}px ${family}`,
    capabilityStrong: `650 ${HEX_TYPE.capability}px ${family}`,
    domain: `650 ${HEX_TYPE.domain}px ${family}`,
    meta: `400 ${HEX_TYPE.meta}px ${family}`,
    project: `650 ${HEX_TYPE.project}px ${family}`,
    mono: `400 ${HEX_TYPE.mono}px ${MONO}`,
    plate: `650 ${HEX_TYPE.plate}px ${family}`,
    plateMeta: `510 ${HEX_TYPE.plateMeta}px ${family}`,
  };
}

let resolvedFonts: Record<HexTextRole, string> | null = null;

/**
 * Fonts per text role, on the product's weight ramp (510 signature, 560 emphasis, 650 strong).
 * The product face is read from `--font-pretendard` (the generated family name belongs to
 * `next/font`, so it is resolved, never spelled here).
 */
export function hexFonts(): Record<HexTextRole, string> {
  if (resolvedFonts) return resolvedFonts;
  const product =
    typeof document === "undefined"
      ? ""
      : getComputedStyle(document.documentElement).getPropertyValue("--font-pretendard").trim();
  if (!product) return fontsFor(SYSTEM_FAMILY);
  resolvedFonts = fontsFor(`${product}, ${SYSTEM_FAMILY}`);
  return resolvedFonts;
}

/** A route to draw, in unit space, already searched by `model/hex-router.ts`. */
export interface HexDrawRoute {
  points: readonly { x: number; y: number }[];
  /** Lattice node indices (canals keep them to seat their pill). */
  nodes?: readonly number[];
  targetId: string;
  sourceId: string;
  role: "need" | "use" | "need-inside" | "canal";
  /** Canal only: relations counted, both directions, and where its pill sits (unit space). */
  count?: number;
  twoWay?: boolean;
  pill?: { x: number; y: number } | null;
  /**
   * The route stops short of its target: the free map had no way through, so it runs as far
   * toward the target as it can and ends in an arrow pointing at it, rather than leaving the
   * free map to arrive.
   */
  stub?: boolean;
}

export interface HexDrawState {
  width: number;
  height: number;
  /** Cell circumradius in CSS px. */
  R: number;
  /** Screen = offset + unit × R. */
  ox: number;
  oy: number;
  band: HexBand;
  selectedId: string | null;
  hoverId: string | null;
  /** Keyboard focus, drawn like a hover ring when it is not the selection. */
  focusId: string | null;
  /** Nodes kept at full strength while something is focused; null = nothing dimmed. */
  lit: ReadonlySet<string> | null;
  /** Stale-only mode: the non-lit rest recedes further (spec: 16%). */
  staleOnly: boolean;
  /** Region whose plate is outlined (a domain title was chosen). */
  focusRegion: string | null;
  /** 0 → nothing dimmed, 1 → the rest fully receded. */
  dimT: number;
  evidence: ReadonlyMap<string, HexEvidenceState>;
  /** Capability → the moved file's name, shown under the name in stale-only mode. */
  staleFiles: ReadonlyMap<string, string>;
  /** Stale capabilities per domain; null when evidence is not measured. */
  staleByDomain: ReadonlyMap<string, number> | null;
  /** Domain title lines (the counts line and the stale line) and the project's count line. */
  domainMeta: ReadonlyMap<string, { meta: string; stale: string | null }>;
  projectMeta: string | null;
  /** Region nameplate words for the far band: name plus "caps · ◐ stale". */
  plateSub: ReadonlyMap<string, string>;
  routes: readonly HexDrawRoute[];
  /** Edge ticks at rest: capability → sides (0–5) facing regions it relies on. */
  ports: ReadonlyMap<string, readonly number[]>;
  /** Arrival: ms since the board first drew, or null when it has fully arrived. */
  arrivalMs: number | null;
  reducedMotion: boolean;
  /** Stale-only light sweep: 0..1 progress, or null. */
  sweep: number | null;
  measure: HexMeasure;
}

export interface HexFrameStats {
  band: HexBand;
  R: number;
  tiles: number;
  names: number;
  /** Tiles whose name was held back because it did not fit (should be 0 in the names band). */
  spills: number;
  routes: number;
  canals: number;
  pills: number;
  plates: number;
  dimT: number;
  focus: string | null;
  offset: [number, number];
  arrived: boolean;
  /** Milliseconds into the arrival, or null once arrived. */
  arrivalMs: number | null;
}

/** Screen boxes of every drawn text, for the mirror list and the overlap checks. */
export interface HexTextBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export function hexArrivalDuration(maxRing: number, reduced: boolean): number {
  if (reduced) return 0;
  return maxRing * BOARD_ARRIVAL.ringStaggerMs + BOARD_ARRIVAL.tileMs + BOARD_ARRIVAL.routesMs;
}
