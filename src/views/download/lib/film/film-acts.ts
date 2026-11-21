import { clamp01, easeInOut, easeInOutSine, easeOut } from './film-kit';

/**
 * The film's clock: when every move starts and how far along it is at film time `T`. Every value
 * is a pure function of film time, so scrubbing and replay land on exact frames, and each move
 * starts from where the move before it ended.
 */

/** The files, one file opened, every file, two readers. */
export const ACT_MS = [2400, 3200, 3600, 3400] as const;
export const FILM_MS = ACT_MS.reduce((a, b) => a + b, 0);
export const ACT_START = ACT_MS.map((_, i) => ACT_MS.slice(0, i).reduce((a, b) => a + b, 0));
export const ACT_SPANS = ACT_MS.map((ms, i) => [ACT_START[i]! / FILM_MS, (ACT_START[i]! + ms) / FILM_MS] as const);
/** The last frame holds, then the whole picture fades to the ground and the film starts again. */
export const HOLD_MS = 2600;
export const FADE_MS = 420;
/** A jump with the act bar fades out and back in over this long instead of cutting. */
export const SEEK_FADE_MS = 200;

/** Progress of a move that starts at `from` and lasts `ms`, clamped to 0..1. */
export const span = (t: number, from: number, ms: number) => clamp01((t - from) / Math.max(1e-6, ms));

/** Local time inside act `act` (0-based); negative before it, past its length after it. */
export const local = (T: number, act: number) => T - ACT_START[act]!;

/* Act 1: the folder. */
export const WALL = {
  columnStep: 90,
  columnMs: 340,
  rise: 6,
  phoneIn: 400,
  scrollFrom: 300,
  scrollMs: 1700,
  chipFrom: 1300,
  chipMs: 340,
  dimFrom: 1500,
  dimMs: 700,
  dimTo: 0.55,
} as const;

/* Act 2: one file. */
export const OPEN = {
  morphMs: 520,
  wallOutMs: 320,
  headerFrom: 420,
  headerMs: 280,
  rowFrom: 700,
  rowStep: 440,
  rowInMs: 260,
  hairMs: 260,
  drawDelay: 120,
  drawMs: 360,
  growMs: 420,
  dotStep: 40,
  dotMs: 300,
  lineStep: 60,
  lineMs: 420,
} as const;

/* Act 3: every file. */
export const FLIGHT = {
  foldMs: 400,
  fragmentOutMs: 240,
  travelFrom: 200,
  travelMs: 700,
  hubFrom: 400,
  hubStep: 70,
  capFrom: 620,
  capStep: 26,
  elementFrom: 1250,
  elementStep: 11,
  flightMs: 640,
  bow: 0.12,
  poolMs: 900,
  blockMs: 300,
  namesFrom: 2300,
  namesMs: 300,
  arcFrom: 2500,
  arcStep: 110,
  arcMs: 480,
  numeralMs: 260,
} as const;

/* Act 4: two readers. */
export const LIT = {
  pointerMs: 700,
  pointerIn: 260,
  selectFrom: 700,
  selectMs: 300,
  sinkFrom: 700,
  sinkMs: 600,
  linesFrom: 900,
  lineStep: 70,
  lineMs: 440,
  endMs: 240,
  blockFrom: 1000,
  blockMs: 300,
  agentFrom: 1900,
  ringMs: 400,
  leaderFrom: 2000,
  leaderMs: 260,
  tagFrom: 2060,
  tagMs: 240,
  glintFrom: 2300,
  glintStep: 40,
  glintMs: 700,
  glintShare: 0.14,
} as const;

/** Act 1: a wall column's light and rise as it fades in, left to right. */
export function wallColumn(t1: number, col: number): { alpha: number; rise: number } {
  const v = easeOut(span(t1, col * WALL.columnStep, WALL.columnMs));
  return { alpha: v, rise: (1 - v) * WALL.rise };
}

/** Act 1: how far the other rows have dimmed, 1 to 0.55. */
export const wallDim = (t1: number) => 1 - (1 - WALL.dimTo) * easeInOut(span(t1, WALL.dimFrom, WALL.dimMs));
export const chipIn = (t1: number) => easeOut(span(t1, WALL.chipFrom, WALL.chipMs));
export const phoneScroll = (t1: number) => easeInOut(span(t1, WALL.scrollFrom, WALL.scrollMs));

/** Act 2: frontmatter line `k` (0 kind .. 4 dependencies) starts being read. */
export const rowStart = (k: number) => OPEN.rowFrom + k * OPEN.rowStep;

/** Act 2: the active row's highlight, 0..1; the last row's stays through the act's rest. */
export function rowHighlight(t2: number, k: number, rows: number): number {
  const on = easeOut(span(t2, rowStart(k), OPEN.rowInMs));
  const off = k < rows - 1 ? span(t2, rowStart(k + 1), OPEN.rowInMs) : 0;
  return on * (1 - off);
}

/**
 * Act 3: when a file's flight starts, by its kind and rank: hubs first, then capabilities in slot
 * order, then elements; the order is sorted, never random.
 */
export function flightStart(kind: 'hub' | 'capability' | 'element', rank: number): number {
  if (kind === 'hub') return FLIGHT.hubFrom + rank * FLIGHT.hubStep;
  if (kind === 'capability') return FLIGHT.capFrom + rank * FLIGHT.capStep;
  return FLIGHT.elementFrom + rank * FLIGHT.elementStep;
}

const FULL_DIAGONAL = Math.hypot(1920, 960);

/**
 * How long a flight of `length` px takes: the spec's 640 ms, longer for a far row, so its top
 * speed stays under 2.8 px per ms on a 1920 stage (47 px in a 60 Hz frame, 2.2% of its diagonal)
 * and under the same share of a smaller stage's `diagonal`.
 */
export const flightMs = (length: number, diagonal = FULL_DIAGONAL) =>
  Math.max(FLIGHT.flightMs, (length * Math.PI) / 2 / (2.8 * Math.min(1, diagonal / FULL_DIAGONAL)));

/** Act 3: a flight's progress, its name's light and size, and its mark's light. */
export function flight(t3: number, start: number, ms: number = FLIGHT.flightMs): { p: number; name: number; scale: number; mark: number } {
  const u = span(t3, start, ms);
  const leave = span(u, 0, 0.45);
  return {
    p: easeInOutSine(u),
    name: 0.5 * (1 - leave),
    scale: 1 - 0.4 * easeOut(leave),
    mark: span(u, 0.25, 0.55),
  };
}

/** Act 3: when a rest arc's numeral starts to fade in: when its growing line passes its midpoint. */
export const arcMidpointMs = FLIGHT.arcMs * (1 - Math.cbrt(0.5));

/** Act 4: when lit line `k` starts to grow, in the order the spec reads them. */
export function litLineStart(kind: 'needs' | 'own' | 'neededBy' | 'relates', rank: number, counts: { needs: number; neededBy: number }): number {
  const needsEnd = LIT.linesFrom + counts.needs * LIT.lineStep;
  if (kind === 'needs') return LIT.linesFrom + rank * LIT.lineStep;
  if (kind === 'own') return needsEnd;
  if (kind === 'neededBy') return needsEnd + LIT.lineStep + rank * LIT.lineStep;
  return needsEnd + LIT.lineStep + counts.neededBy * LIT.lineStep + rank * LIT.lineStep;
}

/** The loop's seam: the canvas's light near the cycle's two ends, eased so it reaches 0 exactly. */
export function seamLight(elapsed: number, cycle: number): number {
  const fadeIn = elapsed < FADE_MS ? easeInOut(elapsed / FADE_MS) : 1;
  const fadeOut = elapsed > cycle - FADE_MS ? easeInOut((cycle - elapsed) / FADE_MS) : 1;
  return Math.min(fadeIn, fadeOut);
}
