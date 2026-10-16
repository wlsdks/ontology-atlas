import {
  NARROW_LADDER_EDGE,
  OBSERVATION_LANE_GAP,
  PAD_X,
  PAIRED_CONTRACT_W,
  PAIRED_GUTTER_W,
  PAIRED_HEADER_H,
  PAIRED_OBSERVATION_W,
  PAIRED_SIDE_ROOM_MIN,
  PAIRED_TRAIL_ROOM_MAX,
  PLANE_INSET_Y,
  RULE_SENTENCE_ROW_H,
  SUMMARY_FONT_PX,
  SUMMARY_LINES,
} from './geometry';
import { captionLineRoom, splitLinesByWidthAt } from '../../model/summary-lines';
import type { ArchitectureSketchProps, FlowAxis } from './types';

const BOX_W = 148;
/** The wide-workbench face; the compact width stays the fallback when an expanded role set would not fit. */
const BOX_W_ROOMY = 220;
const BOX_H_ACROSS_SPLIT = 90;
const OBSERVATION_BOX_H = 44;
/* 180 fits the widest measured receipt line (156px) and keeps seven roles across at 1920 (1628 of 1756px). */
const BOX_W_LEDGER = 180;
/** Split contract/observation faces may yield this far once their long receipt line is separate. */
const BOX_W_LEDGER_FIT = 160;
const BOX_W_LEDGER_ROOMY = 240;
/** A box grows only when it carries a ledger line; without a receipt it keeps its size. */
const BOX_H = 72;
/*
 * The receipt is one line and the sentence two; the row gap pays for it so seven rows fit
 * 1512x945 with the inspector open: 7×82 + 6×12 + 2×20 = 686.
 * Gate: `tests/e2e/harness/architecture-role-ledger.spec.ts`, which fails at 90px.
 */
const BOX_H_LEDGER = 82;
const ROW_GAP_LEDGER = 12;
/* The across split face has room for a third caption line without the per-face lane label. */
const SUMMARY_LINES_ACROSS = 3;
const COL_GAP = 52;
/** The narrowest readable handoff between fixed-size roles while a desktop dock is open. */
const MIN_COL_GAP = 20;
const ROW_GAP_PLAIN = 26;
const PAD_Y = 26;
/*
 * The contract face grows into spare card width so role sentences finish instead of ellipsizing.
 * 560 is derived: the dogfood profile's longest sentence estimates at 472px and `captionLineRoom`
 * spends 24 on padding, leaving 64px of headroom. Longer sentences wrap as before.
 */
const PAIRED_CONTRACT_W_MAX = 560;
/*
 * The gutter carries the observation sentence: its room is
 * `observationBoxW / 2 + PAIRED_GUTTER_W - GAP_BETWEEN_LANE_SENTENCES`, less 22 in `placeEdgeSentences`.
 * 160 fits the dogfood profile's longest observation sentence (179px) with 55px of headroom.
 */
const PAIRED_GUTTER_W_MAX = 160;
/* The connector gap seats the adjacent rule's sentence beside its arrow: a 12px line with air on each side under the collision pad. */
const PAIRED_ROW_GAP = 24;
/*
 * Before hiding a role the ladder drops the sentence's second line, keeping 280/72/240 widths.
 * 22 is the narrowest gap a 12px sentence clears with the 4px collision pad; at 20
 * `placeEdgeSentences` drops it. Seven roles: 4 + 20 + 7x58 + 6x22 + 4 = 566.
 */
const PAIRED_ROW_GAP_TIGHT = 22;
const PAIRED_PAD_Y_TIGHT = 4;
const BOX_H_PAIRED_TIGHT = 58;
const PAIRED_PAD_Y = 8;
const PLANE_EDGE = 20;
/* Head room so the top plane's lit edge does not read as a rule under the lane headings. */
const PLANE_HEAD_ROOM = 8;
const PAIRED_FIXED_W =
  PAD_X * 2 + PAIRED_CONTRACT_W + PAIRED_GUTTER_W + PAIRED_OBSERVATION_W;
const PAIRED_MIN_W = PAIRED_FIXED_W + PAIRED_SIDE_ROOM_MIN * 2;
/* With a ledger the field gives back padding, so a seven-role chain fits without a scrollbar for empty ground down to a 905px WebView. */
const PAD_Y_LEDGER = 12;

export function solveSketchFrame({
  graph,
  ledgers,
  boxWidth,
  restWidth,
  restHeight,
  roleSummary,
}: {
  graph: ArchitectureSketchProps['graph'];
  ledgers: ArchitectureSketchProps['ledgers'];
  boxWidth: number;
  restWidth: number;
  restHeight: number;
  roleSummary: ArchitectureSketchProps['roleSummary'];
}) {
  /* One height for every box: mixed heights read as two kinds of thing, and the lane arithmetic assumes one. */
  const hasLedger = graph.boxes.some((box) => ledgers[box.id] !== undefined);
  const compactBoxW = hasLedger ? BOX_W_LEDGER : BOX_W;
  const roomyBoxW = hasLedger ? BOX_W_LEDGER_ROOMY : BOX_W_ROOMY;
  const ranks = graph.columns;
  const lanes = graph.boxes.reduce((most, box) => Math.max(most, box.slot + 1), 1);
  const naturalAcross = PAD_X * 2 + ranks * compactBoxW + (ranks - 1) * COL_GAP;
  const axisWidth = restWidth > 0 ? restWidth : boxWidth;
  /* The ladder's height includes the plane head room and ledge, or a canvas 11px short would choose rows it must scroll. */
  const planeVerticalRoom = ranks > 1 ? PLANE_HEAD_ROOM + PLANE_INSET_Y : 0;
  /* Under `lower-only` the six rules say one thing, said once under the contract heading. */
  const saysRuleOnce =
    graph.policy === 'lower-only' && graph.edges.some((edge) => edge.kind === 'permitted');
  const pairedHeaderH = PAIRED_HEADER_H + (saysRuleOnce ? RULE_SENTENCE_ROW_H : 0);
  const pairedNaturalH =
    PAIRED_PAD_Y * 2 +
    pairedHeaderH +
    ranks * BOX_H +
    (ranks - 1) * PAIRED_ROW_GAP +
    planeVerticalRoom;
  /* One summary line per row: faces and connectors yield before any role is hidden. */
  const pairedTightH =
    PAIRED_PAD_Y_TIGHT * 2 +
    pairedHeaderH +
    ranks * BOX_H_PAIRED_TIGHT +
    (ranks - 1) * PAIRED_ROW_GAP_TIGHT +
    planeVerticalRoom;
  const pairedRowsFit =
    lanes === 1 &&
    axisWidth >= PAIRED_MIN_W &&
    restHeight > 0 &&
    restHeight >= pairedTightH;
  const axis: FlowAxis = pairedRowsFit
    ? 'down'
    : axisWidth > 0 && naturalAcross > axisWidth
      ? 'down'
      : 'across';
  const roomyAcross = PAD_X * 2 + ranks * roomyBoxW + (ranks - 1) * COL_GAP;
  const usesRoomyBoxes = axis === 'across' && axisWidth > 0 && roomyAcross <= axisWidth;
  const preferredBoxW = usesRoomyBoxes ? roomyBoxW : compactBoxW;
  /* An opening dock first eases each face within a readable range, keeping the 52px sentence handoff; `boxWidth` follows the transition, so it is continuous. */
  const fittedAcrossBoxW =
    ranks > 0 && boxWidth > 0
      ? (boxWidth - PAD_X * 2 - (ranks - 1) * COL_GAP) / ranks
      : preferredBoxW;
  const minimumAcrossBoxW = hasLedger ? BOX_W_LEDGER_FIT : BOX_W;
  const usesPairedDown = axis === 'down' && lanes === 1 && axisWidth >= PAIRED_MIN_W;
  /* A phone gets the narrow ladder: one lane, the face up to 280px, rule sentences beside their arrows. */
  const usesNarrowLadder = axis === 'down' && lanes === 1 && !usesPairedDown && boxWidth > 0;
  const narrowFaceW = usesNarrowLadder
    ? Math.max(BOX_W, Math.min(PAIRED_CONTRACT_W, boxWidth - PAD_X * 2 - NARROW_LADDER_EDGE))
    : preferredBoxW;
  /* An across chain grows its faces with the canvas up to the roomy face. */
  const boxW =
    axis === 'across'
      ? Math.max(minimumAcrossBoxW, Math.min(usesRoomyBoxes ? preferredBoxW : roomyBoxW, fittedAcrossBoxW))
      : usesNarrowLadder
        ? narrowFaceW
        : preferredBoxW;
  /* Below xl `restHeight` is 0 and the roomy rows stand; tight rows only where measured and needed. */
  const ladderDensity: 'roomy' | 'tight' =
    usesPairedDown && restHeight > 0 && restHeight < pairedNaturalH && restHeight >= pairedTightH
      ? 'tight'
      : 'roomy';
  const usesTightLadder = usesPairedDown && ladderDensity === 'tight';
  const splitsEvidence = (axis === 'across' && axisWidth > 0) || usesPairedDown;
  /* No receipt and no measured crossing: one empty state for the column. Partial receipts keep per-role faces. */
  const observationEmpty =
    splitsEvidence && !hasLedger && !graph.edges.some((edge) => edge.kind === 'traffic');
  const groundSpare = (trailLane: number) =>
    usesPairedDown && boxWidth > 0
      ? Math.max(0, boxWidth - PAIRED_FIXED_W - PAIRED_SIDE_ROOM_MIN - trailLane)
      : 0;
  const contractWAt = (trailLane: number) =>
    Math.min(PAIRED_CONTRACT_W_MAX, PAIRED_CONTRACT_W + groundSpare(trailLane));
  /* The skip lane is held, empty or observed, wherever it cuts no description that fits without it. */
  const heldW = contractWAt(PAIRED_TRAIL_ROOM_MAX);
  const freeW = contractWAt(PAIRED_SIDE_ROOM_MIN);
  const laneLines = usesTightLadder ? 1 : SUMMARY_LINES;
  const cutAt = (width: number, text: string) =>
    splitLinesByWidthAt(text, captionLineRoom(width), laneLines, SUMMARY_FONT_PX).at(-1)?.endsWith('…') ?? false;
  const holdsSkipLane =
    heldW === freeW ||
    graph.boxes.every((box) => {
      const text = roleSummary(box.id);
      return text === null || cutAt(freeW, text) || !cutAt(heldW, text);
    });
  const observationNeedsLane =
    holdsSkipLane || graph.edges.some((edge) => edge.kind === 'traffic' && edge.columnSpan > 1);
  const pairedGroundSpare = groundSpare(observationNeedsLane ? PAIRED_TRAIL_ROOM_MAX : PAIRED_SIDE_ROOM_MIN);
  const pairedContractW = contractWAt(observationNeedsLane ? PAIRED_TRAIL_ROOM_MAX : PAIRED_SIDE_ROOM_MIN);
  /* The face takes its share first, then the gutter; both capped. */
  const pairedGutterW = Math.min(
    PAIRED_GUTTER_W_MAX,
    PAIRED_GUTTER_W + Math.max(0, pairedGroundSpare - (pairedContractW - PAIRED_CONTRACT_W)),
  );
  /** The ladder's own width at this canvas: padding, the grown face, the gutter, the observation. */
  const pairedFixedW =
    PAD_X * 2 + pairedContractW + pairedGutterW + PAIRED_OBSERVATION_W;
  const contractBoxW = usesPairedDown ? pairedContractW : boxW;
  const observationBoxW = usesPairedDown ? PAIRED_OBSERVATION_W : boxW;
  const rowGap = usesPairedDown
    ? usesTightLadder
      ? PAIRED_ROW_GAP_TIGHT
      : PAIRED_ROW_GAP
    : usesNarrowLadder
      ? PAIRED_ROW_GAP
      : axis === 'down'
        ? 8
        : hasLedger
          ? ROW_GAP_LEDGER
          : ROW_GAP_PLAIN;
  const padY = usesPairedDown
    ? usesTightLadder
      ? PAIRED_PAD_Y_TIGHT
      : PAIRED_PAD_Y
    : axis === 'down'
      ? 8
      : hasLedger
        ? PAD_Y_LEDGER
        : PAD_Y;
  /*
   * One source for the chrome row's vertical rhythm: headings sit on the ladder's top padding and
   * faces are placed from the same `padY`.
   */
  const laneHeadingY = padY + 14;
  const boxH = axis === 'across' && splitsEvidence
    ? BOX_H_ACROSS_SPLIT
    : usesPairedDown
      ? usesTightLadder
        ? BOX_H_PAIRED_TIGHT
        : BOX_H
    : usesNarrowLadder
      ? BOX_H
    : axis === 'down'
      ? 64
      : hasLedger
        ? BOX_H_LEDGER
        : BOX_H;
  /* The observation face is exactly its row, so both lanes share arrow lengths and sentence baselines. */
  const observationBoxH = usesPairedDown ? boxH : OBSERVATION_BOX_H;
  /* The tight row pays with the sentence's second line, not the face width. */
  const summaryLineCount =
    usesTightLadder || (axis === 'down' && !usesPairedDown && !usesNarrowLadder)
      ? 1
      : axis === 'across' && splitsEvidence
        ? SUMMARY_LINES_ACROSS
        : SUMMARY_LINES;
  /* Faces stay fixed while a dock opens; the handoff space absorbs the width first, per ResizeObserver frame. */
  const colGap =
    axis === 'across' && ranks > 1 && boxWidth > 0
      ? Math.max(
          MIN_COL_GAP,
          Math.min(COL_GAP, (boxWidth - PAD_X * 2 - ranks * boxW) / (ranks - 1)),
        )
      : COL_GAP;
  const observationOffset = axis === 'across' && splitsEvidence
    ? boxH + OBSERVATION_LANE_GAP
    : usesPairedDown
      ? contractBoxW + pairedGutterW
      : 0;

  /* Bands join what was observed; their room is held before, so a landing record moves no face. */
  const reservesPlaneRoom = usesPairedDown && ranks > 1;
  const usesLayerPlanes = reservesPlaneRoom && !observationEmpty;
  const planeRoom = reservesPlaneRoom ? PLANE_EDGE : 0;
  const planeTrailRoom = planeRoom;
  const planeHeadRoom = reservesPlaneRoom ? PLANE_HEAD_ROOM : 0;
  return {
    ranks,
    lanes,
    axisWidth,
    axis,
    usesRoomyBoxes,
    usesPairedDown,
    usesNarrowLadder,
    boxW,
    ladderDensity,
    splitsEvidence,
    observationEmpty,
    pairedContractW,
    pairedGutterW,
    pairedFixedW,
    contractBoxW,
    observationBoxW,
    rowGap,
    padY,
    laneHeadingY,
    boxH,
    observationBoxH,
    summaryLineCount,
    colGap,
    observationOffset,
    usesLayerPlanes,
    planeRoom,
    planeTrailRoom,
    planeHeadRoom,
    pairedHeaderH,
    saysRuleOnce: usesPairedDown && saysRuleOnce,
    holdsSkipLane: usesPairedDown && observationNeedsLane,
  };
}
