export const OBSERVATION_LANE_GAP = 48;
/** How far apart two crossings of the same span sit, so a bundle reads as separate strokes. */
const SKIP_LANE_STEP = 14;
/** Caption lines per role sentence; every face is a rectangle, so each line gets captionLineRoom's straight room. */
export const SUMMARY_LINES = 2;
/** The size a role's description steps down to before any line is cut (`text-label`). */
export const SUMMARY_FONT_PX = 11;
export const PAD_X = 28;
/* The dual evidence ladder: contract face, comparison gutter, observation face. */
export const PAIRED_CONTRACT_W = 280;
export const PAIRED_GUTTER_W = 72;
export const PAIRED_OBSERVATION_W = 240;
export const PAIRED_HEADER_H = 20;
/* The ladder needs its faces plus this much side lane, not the full lanes: side lanes only hold skip arcs revealed on selection. */
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
/** Air between the furthest rule sentence and the panel's edge. */
export const EMPTY_PANEL_SENTENCE_AIR = 12;

/** How far a skip swings, below an across chain or beside a downward one; a per-edge lane step keeps same-span skips apart. */
export function skipSwing(columnSpan: number, laneIndex: number, halfBox: number): number {
  return SKIP_DROP + (columnSpan - 2) * SKIP_STEP + laneIndex * SKIP_LANE_STEP + halfBox;
}
