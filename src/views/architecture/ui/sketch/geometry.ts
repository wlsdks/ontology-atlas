export const OBSERVATION_LANE_GAP = 48;
/** Under an across skip's run: the line its sentence reads on. */
export const ACROSS_SKIP_SENTENCE_ROOM = 28;
/** Under an across rule skip's run: its sentence, then the two count lines over the observation faces. */
export const ACROSS_RULE_BAND = 64;
/** The pillar's joint keeps this height over the observation face however far a rule skip opens the gap. */
export const ACROSS_JOINT_RISE = OBSERVATION_LANE_GAP / 2;
/** How far apart two crossings of the same span sit, so a bundle reads as separate strokes. */
const SKIP_LANE_STEP = 14;
/** Caption lines per role sentence. */
export const SUMMARY_LINES = 2;
/** The size a role's description steps down to before any line is cut (`text-label`). */
export const SUMMARY_FONT_PX = 11;
export const PAD_X = 28;
export const PAIRED_CONTRACT_W = 280;
export const PAIRED_GUTTER_W = 72;
export const PAIRED_OBSERVATION_W = 240;
export const PAIRED_HEADER_H = 20;
/* Side lanes hold only skip arcs, so the ladder needs just this much beside its faces. */
export const PAIRED_SIDE_ROOM_MIN = 48;
/** The most ground the observation lane takes for its arcs and sentences when the canvas has it. */
export const PAIRED_TRAIL_ROOM_MAX = 360;
/** Air the narrow ladder keeps between its face and the canvas edge on each side. */
export const NARROW_LADDER_EDGE = 16;
export const RULE_SENTENCE_ROW_H = 16;
/* A 3px ledge stops short of the adjacent rule's sentence rectangle on both ladder densities. */
export const PLANE_INSET_Y = 3;
/** How far past the lane a skip swings, and how much deeper each further rank pushes it. */
export const SKIP_DROP = 30;
export const SKIP_STEP = 10;
/** Keeps a rule sentence and a count sentence apart in the shared gutter row gap. */
export const LANE_SENTENCE_GAP = 24;
/** Air between the furthest rule sentence and the panel's edge. */
export const EMPTY_PANEL_SENTENCE_AIR = 12;

/* The narrow ladder's skip is a shallow bracket in the air beside its face. */
const NARROW_SKIP_REACH = 16;
const NARROW_SKIP_LANE_STEP = 10;

/** How far a skip swings, below an across chain or beside the paired ladder; a per-edge lane step keeps same-span skips apart. */
export function skipSwing(columnSpan: number, laneIndex: number, halfBox: number): number {
  return SKIP_DROP + (columnSpan - 2) * SKIP_STEP + laneIndex * SKIP_LANE_STEP + halfBox;
}

export function narrowSkipSwing(laneIndex: number, halfBox: number): number {
  return NARROW_SKIP_REACH + laneIndex * NARROW_SKIP_LANE_STEP + halfBox;
}

/**
 * Which lane each skip takes, keyed `kind:from>to` and counted within its span (per track where each
 * track has its own side), so same-span skips nest. Skips drawn at rest take the inner lanes. O(E).
 */
export function skipLanes<Edge extends { from: string; to: string; kind: string; columnSpan: number }>(
  edges: readonly Edge[],
  tracksHaveOwnSide: boolean,
  drawnAtRest: (edge: Edge) => boolean,
): Map<string, number> {
  const lanes = new Map<string, number>();
  const used = new Map<string, number>();
  const skips = edges.filter((edge) => edge.columnSpan > 1);
  for (const edge of [...skips.filter(drawnAtRest), ...skips.filter((skip) => !drawnAtRest(skip))]) {
    const bundle = `${tracksHaveOwnSide ? edge.kind : ''}:${edge.columnSpan}`;
    const taken = used.get(bundle) ?? 0;
    lanes.set(`${edge.kind}:${edge.from}>${edge.to}`, taken);
    used.set(bundle, taken + 1);
  }
  return lanes;
}
