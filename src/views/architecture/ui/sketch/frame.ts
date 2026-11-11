import {
  ACROSS_RULE_BAND,
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
const BOX_W_ROOMY = 220;
const BOX_H_ACROSS_SPLIT = 90;
const OBSERVATION_BOX_H = 44;
/* Fits the widest receipt line (156px) with seven roles across at 1920. */
const BOX_W_LEDGER = 180;
/** How far a split face may yield while a dock is open. */
const BOX_W_LEDGER_FIT = 160;
const BOX_W_LEDGER_ROOMY = 240;
const BOX_H = 72;
/* One receipt line taller than `BOX_H`; `architecture-role-ledger.spec.ts` fails at 90. */
const BOX_H_LEDGER = 82;
/* The across split face has room for a third caption line without the per-face lane label. */
const SUMMARY_LINES_ACROSS = 3;
const COL_GAP = 52;
/** The narrowest readable handoff between faces while a dock is open. */
const MIN_COL_GAP = 20;
const PAD_Y = 26;
/* The contract face grows into spare width so role sentences finish: the dogfood profile's longest estimates at 472px, plus 24 of padding. */
const PAIRED_CONTRACT_W_MAX = 560;
/* Fits the dogfood profile's longest observation sentence (179px) beside its arrow. */
const PAIRED_GUTTER_W_MAX = 160;
/* Seats a 12px sentence beside its arrow with air on each side of the collision pad. */
const PAIRED_ROW_GAP = 24;
/* The narrowest gap a 12px sentence clears with the 4px collision pad; tight rows also drop the second summary line. */
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
const PAIRED_ROW_SPAN_MAX = PAIRED_CONTRACT_W_MAX / 2 + PAIRED_GUTTER_W_MAX + PAIRED_OBSERVATION_W / 2;
/** The contract lane of a ladder not measured yet, once the profile declares a skip. */
const PAIRED_SIDE_ROOM_UNMEASURED = 180;
/* With a ledger the field gives back padding, so seven roles fit a 905px WebView without scrolling. */
const PAD_Y_LEDGER = 12;

type LaneClaim = { lane: number; countLane: number };

export function solveSketchFrame({
  graph,
  ledgers,
  boxWidth,
  restWidth,
  restHeight,
  roleSummary,
  hasStamp,
  ruleSentenceRoom,
}: {
  graph: ArchitectureSketchProps['graph'];
  ledgers: ArchitectureSketchProps['ledgers'];
  boxWidth: number;
  restWidth: number;
  restHeight: number;
  roleSummary: ArchitectureSketchProps['roleSummary'];
  hasStamp: boolean;
  /** The ground the profile's sentences need; `heldLane` is the lane once rank skips wait for a choice. Never read from a record. */
  ruleSentenceRoom: LaneClaim & { waiting: LaneClaim; rowSpan: number; skipDepth: number };
}) {
  /* One height for every box: mixed heights read as two kinds of thing. */
  const hasLedger = graph.boxes.some((box) => ledgers[box.id] !== undefined);
  const compactBoxW = hasLedger ? BOX_W_LEDGER : BOX_W;
  const roomyBoxW = hasLedger ? BOX_W_LEDGER_ROOMY : BOX_W_ROOMY;
  const ranks = graph.columns;
  const naturalAcross = PAD_X * 2 + ranks * compactBoxW + (ranks - 1) * COL_GAP;
  const axisWidth = restWidth > 0 ? restWidth : boxWidth;
  /* The ladder's height includes the plane head room and ledge, or a canvas 11px short would choose rows it must scroll. */
  const planeVerticalRoom = ranks > 1 ? PLANE_HEAD_ROOM + PLANE_INSET_Y : 0;
  /* Under `lower-only` the six rules say one thing, said once under the contract heading. */
  const saysRuleOnce =
    graph.policy === 'lower-only' && graph.edges.some((edge) => edge.kind === 'permitted');
  const pairedHeaderH = PAIRED_HEADER_H + (saysRuleOnce || hasStamp ? RULE_SENTENCE_ROW_H : 0);
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
  /* An opening dock eases each face within a readable range; `boxWidth` follows the transition, so it is continuous. */
  const fittedAcrossBoxW =
    ranks > 0 && boxWidth > 0
      ? (boxWidth - PAD_X * 2 - (ranks - 1) * COL_GAP) / ranks
      : preferredBoxW;
  const minimumAcrossBoxW = hasLedger ? BOX_W_LEDGER_FIT : BOX_W;
  const usesPairedDown = axis === 'down' && axisWidth >= PAIRED_MIN_W;
  /* A phone gets the narrow ladder: the face up to 280px, rule sentences beside their arrows. */
  const usesNarrowLadder = axis === 'down' && !usesPairedDown;
  const narrowFaceW = usesNarrowLadder
    ? Math.max(BOX_W, Math.min(PAIRED_CONTRACT_W, boxWidth - PAD_X * 2 - NARROW_LADDER_EDGE))
    : preferredBoxW;
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
  const laneLines = usesTightLadder ? 1 : SUMMARY_LINES;
  const cutAt = (width: number, text: string) =>
    splitLinesByWidthAt(text, captionLineRoom(width), laneLines, SUMMARY_FONT_PX).at(-1)?.endsWith('…') ?? false;
  /* Bands join what was observed; their room is held before, so a landing record moves no face. */
  const reservesPlaneRoom = usesPairedDown && ranks > 1;
  const planeRoom = reservesPlaneRoom ? PLANE_EDGE : 0;
  const laneFloor = Math.max(planeRoom, PAIRED_SIDE_ROOM_MIN);
  const declaresRuleSkip = graph.edges.some((edge) => edge.kind === 'permitted' && edge.columnSpan > 1);
  const hasTrafficSkip = graph.edges.some((edge) => edge.kind === 'traffic' && edge.columnSpan > 1);
  const laneShare = (trailLane: number) => (PAIRED_SIDE_ROOM_MIN + trailLane) / 2;
  /* O(roles): two gutter passes over the role summaries. */
  const ladderOn = (width: number, claim: LaneClaim, observesSkip = hasTrafficSkip) => {
    /* A drawn skip's sentences claim their lanes before the face grows: a cut rule or count says nothing, while a cut description keeps its title. */
    const laneWithin = (need: number) => Math.max(PAIRED_SIDE_ROOM_MIN, Math.min(PAIRED_TRAIL_ROOM_MAX, need));
    const ruleLane = laneWithin(claim.lane);
    const countLane = laneWithin(claim.countLane);
    const isMeasured = usesPairedDown && width > 0;
    const ladderAt = (gutterNeed: number) => {
      const gutterFloor = Math.max(
        PAIRED_GUTTER_W,
        Math.min(PAIRED_GUTTER_W_MAX, gutterNeed, PAIRED_GUTTER_W + width - PAIRED_MIN_W),
      );
      /* Both lanes share the ground a held skip lane reserves; a rule lane deeper than its share takes the difference before the face grows. */
      const groundSpare = (trailLane: number) =>
        isMeasured
          ? Math.max(
              0,
              width -
                PAIRED_FIXED_W -
                (gutterFloor - PAIRED_GUTTER_W) -
                Math.max(ruleLane, laneShare(trailLane)) -
                Math.max(countLane, laneShare(trailLane)),
            )
          : 0;
      const contractWAt = (trailLane: number) =>
        Math.min(PAIRED_CONTRACT_W_MAX, PAIRED_CONTRACT_W + groundSpare(trailLane));
      /* The skip lane is held, empty or observed, wherever it cuts no description that fits without it. */
      const heldW = contractWAt(PAIRED_TRAIL_ROOM_MAX);
      const freeW = contractWAt(PAIRED_SIDE_ROOM_MIN);
      const holdsSkipLane =
        heldW === freeW ||
        graph.boxes.every((box) => {
          const text = roleSummary(box.id);
          return text === null || cutAt(freeW, text) || !cutAt(heldW, text);
        });
      const needsLane =
        holdsSkipLane || observesSkip;
      const trailLane = needsLane ? PAIRED_TRAIL_ROOM_MAX : PAIRED_SIDE_ROOM_MIN;
      const contractW = contractWAt(trailLane);
      /* The face takes its share first, then the gutter; both capped. */
      const gutterW = Math.min(
        PAIRED_GUTTER_W_MAX,
        gutterFloor + Math.max(0, groundSpare(trailLane) - (contractW - PAIRED_CONTRACT_W)),
      );
      return { needsLane, contractW, gutterW, trailNeed: Math.max(countLane, laneShare(trailLane)) };
    };
    /* A narrower face lets its rule sentence reach further over the gutter, so the gutter is solved at the narrowest face and again at the face that leaves. */
    const gutterNeedAt = (contractW: number) =>
      ruleSentenceRoom.rowSpan - contractW / 2 - PAIRED_OBSERVATION_W / 2;
    const { needsLane, contractW, gutterW, trailNeed } = ladderAt(gutterNeedAt(ladderAt(gutterNeedAt(PAIRED_CONTRACT_W)).contractW));
    const laneGround = isMeasured
      ? Math.max(0, width - (PAD_X * 2 + contractW + gutterW + PAIRED_OBSERVATION_W))
      : PAIRED_SIDE_ROOM_UNMEASURED * 2;
    /* Faces stand on the card's centre line unless a lane needs more than half the ground, the rule lane first; neither takes the other's floor. */
    const leadRoom = isMeasured
      ? Math.max(
          laneFloor,
          Math.min(Math.max(ruleLane, Math.min(laneGround / 2, laneGround - countLane)), laneGround - laneFloor),
        )
      : Math.max(laneFloor, declaresRuleSkip ? PAIRED_SIDE_ROOM_UNMEASURED : 0);
    const trailRoom = Math.max(laneFloor, laneGround - leadRoom);
    const ruleLaneReadsWhole = leadRoom >= claim.lane;
    const observationLaneKeepsShare = trailRoom >= Math.max(trailNeed, claim.countLane);
    const rowGapSpansItsSentences =
      contractW / 2 + gutterW + PAIRED_OBSERVATION_W / 2 >= Math.min(ruleSentenceRoom.rowSpan, PAIRED_ROW_SPAN_MAX);
    const cutsNoDescriptionTheCapReads = graph.boxes.every((box) => {
      const text = roleSummary(box.id);
      return text === null || !cutAt(contractW, text) || cutAt(PAIRED_CONTRACT_W_MAX, text);
    });
    const costsNoSentence =
      ruleLaneReadsWhole && observationLaneKeepsShare && rowGapSpansItsSentences && cutsNoDescriptionTheCapReads;
    return { needsLane, contractW, gutterW, leadRoom, trailRoom, costsNoSentence };
  };
  /* Rest width, a record's skip lane: neither a dock nor a record withdraws a resting skip. */
  const restsRuleSkips = usesPairedDown && ladderOn(axisWidth, ruleSentenceRoom, true).costsNoSentence;
  const {
    needsLane: observationNeedsLane,
    contractW: pairedContractW,
    gutterW: pairedGutterW,
    leadRoom: pairedLeadRoom,
    trailRoom: pairedTrailRoom,
  } = ladderOn(boxWidth, restsRuleSkips ? ruleSentenceRoom : ruleSentenceRoom.waiting);
  const contractBoxW = usesPairedDown ? pairedContractW : boxW;
  const observationBoxW = usesPairedDown ? PAIRED_OBSERVATION_W : boxW;
  const rowGap = usesTightLadder ? PAIRED_ROW_GAP_TIGHT : PAIRED_ROW_GAP;
  const padY = usesPairedDown
    ? usesTightLadder
      ? PAIRED_PAD_Y_TIGHT
      : PAIRED_PAD_Y
    : axis === 'down'
      ? 8
      : hasLedger
        ? PAD_Y_LEDGER
        : PAD_Y;
  /* Headings sit on the ladder's top padding; faces are placed from the same `padY`. */
  const laneHeadingY = padY + 14;
  const boxH = axis === 'across' && splitsEvidence
    ? BOX_H_ACROSS_SPLIT
    : usesPairedDown
      ? usesTightLadder
        ? BOX_H_PAIRED_TIGHT
        : BOX_H
    : usesNarrowLadder
      ? BOX_H
      : hasLedger
        ? BOX_H_LEDGER
        : BOX_H;
  /* The observation face is exactly its row, so both lanes share arrow lengths and sentence baselines. */
  const observationBoxH = usesPairedDown ? boxH : OBSERVATION_BOX_H;
  /* The tight row pays with the sentence's second line, not the face width. */
  const summaryLineCount =
    usesTightLadder
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
  /* A rule skip turns under the contract faces, so the gap holds its run and sentence above the observation row's own line. */
  const acrossLaneGap = Math.max(
    OBSERVATION_LANE_GAP,
    ruleSentenceRoom.skipDepth > 0 ? ruleSentenceRoom.skipDepth + ACROSS_RULE_BAND : 0,
  );
  const observationOffset = axis === 'across' && splitsEvidence
    ? boxH + acrossLaneGap
    : usesPairedDown
      ? contractBoxW + pairedGutterW
      : 0;

  const usesLayerPlanes = reservesPlaneRoom && !observationEmpty;
  const planeHeadRoom = reservesPlaneRoom ? PLANE_HEAD_ROOM : 0;
  return {
    ranks,
    axisWidth,
    axis,
    usesRoomyBoxes,
    usesPairedDown,
    usesNarrowLadder,
    boxW,
    ladderDensity,
    splitsEvidence,
    observationEmpty,
    pairedGutterW,
    pairedLeadRoom,
    pairedTrailRoom,
    restsRuleSkips,
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
    acrossLaneGap,
    usesLayerPlanes,
    planeRoom,
    planeHeadRoom,
    pairedHeaderH,
    saysRuleOnce: usesPairedDown && saysRuleOnce,
    holdsSkipLane: usesPairedDown && observationNeedsLane,
  };
}
