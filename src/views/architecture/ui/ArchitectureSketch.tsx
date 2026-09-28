"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScanSearch } from 'lucide-react';

import { listboxBottomIsHidden as endIsHidden, listboxTopIsHidden as startIsHidden } from '@/shared/ui/select-growth';

import { cn } from '@/shared/lib/cn';
import { badgeClass } from '@/shared/ui/badge-class';
import { ICON_SIZE } from '@/shared/ui/icon-size';

import type { ArchitectureGraph as Graph, GraphBoxShape } from '../model/graph-layout';
import type { RoleLedger } from '../model/role-ledger';
import { laneHeadingRect, placeEdgeSentences, type SentenceEdge } from '../model/edge-sentences';
import {
  balanceLinesByWidthAt,
  captionLineRoom,
  estimateCaptionWidth,
  estimateTextWidthAt,
  splitLinesByWidthAt,
} from '../model/summary-lines';

/** One stroke colour, named once: the brand step clears 3:1 on the canvas where translucent indigo did not. The legend reads it too. */
export const EDGE_STROKE = 'var(--color-indigo-brand)';
/** A violated edge wears the receipt pill's own danger tone plus a dash, so it survives without colour and never contradicts the pill. */
export const VIOLATED_STROKE = 'var(--color-danger-text)';

const BOX_W = 148;
/** The wide-workbench face; the compact width stays the fallback when an expanded role set would not fit. */
const BOX_W_ROOMY = 220;
const BOX_H_ACROSS_SPLIT = 90;
const OBSERVATION_BOX_H = 44;
const OBSERVATION_LANE_GAP = 48;
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
 * Gate: `tests/e2e/architecture-role-ledger.spec.ts`, which fails at 90px.
 */
const BOX_H_LEDGER = 82;
const ROW_GAP_LEDGER = 12;
/** How far apart two crossings of the same span sit, so a bundle reads as separate strokes. */
const SKIP_LANE_STEP = 14;
/** Caption lines per role sentence; every face is a rectangle, so each line gets captionLineRoom's straight room. */
const SUMMARY_LINES = 2;
/* The across split face has room for a third caption line without the per-face lane label. */
const SUMMARY_LINES_ACROSS = 3;
const SUMMARY_FONT_PX = 11;
/** One sentence line to the next, in SVG units: the `--leading-label` pair of `text-label`. */
const SUMMARY_LEADING = 16;

/** Shapes, not colour: tick for clean, slashed circle where a role's edges break its rules, hollow circle where no source matched. */
const LEDGER_GLYPH: Record<RoleLedger['state'], string> = {
  clean: '✓',
  violated: '⊘',
  'no-source': '○',
};
const COL_GAP = 52;
/** The narrowest readable handoff between fixed-size roles while a desktop dock is open. */
const MIN_COL_GAP = 20;
const ROW_GAP_PLAIN = 26;
const PAD_X = 28;
const PAD_Y = 26;
/* The dual evidence ladder: contract face, comparison gutter, observation face. */
const PAIRED_CONTRACT_W = 280;
const PAIRED_GUTTER_W = 72;
const PAIRED_OBSERVATION_W = 240;
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
/* Receding must leave the words readable: 0.7 keeps every receded word at or above 3:1, while the selected pair wins through its indigo face and stroke. */
const RECEDED_ROLE_OPACITY = 0.7;
const RECEDED_STROKE_OPACITY = 0.7;
const PAIRED_HEADER_H = 20;
const PAIRED_PAD_Y = 8;
const PAIRED_SIDE_ROOM_MAX = 180;
/* The ladder needs its faces plus this much side lane, not the full lanes: side lanes only hold skip arcs revealed on selection. */
const PAIRED_SIDE_ROOM_MIN = 48;
/** The most ground the observation lane takes for its arcs and sentences when the canvas has it. */
const PAIRED_TRAIL_ROOM_MAX = 360;
/** Air the narrow ladder keeps between its face and the canvas edge on each side. */
const NARROW_LADDER_EDGE = 16;
/*
 * Import direction drawn as depth: one sheared column of layer planes, each role's faces on its
 * own plane, so a permitted edge runs down and a violation climbs. The step per layer in SVG units
 * is also the shear, `PLANE_STEP / rowPitch`, so adjacent planes meet on one continuous line.
 */
const PLANE_STEP = 14;
/** How much plane stays visible beyond the outermost face, so a role sits *on* its layer. */
const PLANE_EDGE = 16;
/* A 3px ledge stops short of the adjacent rule's sentence rectangle on both ladder densities. */
const PLANE_INSET_Y = 3;
/* Head room so the top plane's lit edge does not read as a rule under the lane headings. */
const PLANE_HEAD_ROOM = 8;
/*
 * The halo marks a violation, the stroke going up the stack. Blur is on the SVG filter because
 * `stdDeviation` cannot read `var()`; its opacities are `--architecture-plane-climb-halo*` tokens.
 * Gate: `ArchitectureSketch.test.tsx`, "a violation climbs the stack".
 */
const VIOLATION_HALO_BLUR = 2.5;
const VIOLATION_HALO_WIDTH = 4;
/** Selecting the role raises its own violation off the plane; every other stroke stays put. */
const VIOLATION_HALO_WIDTH_RAISED = 7;
const VIOLATION_STROKE_RAISE = 1;
/* Keeps a rule sentence and a count sentence apart in the shared gutter row gap. */
const GAP_BETWEEN_LANE_SENTENCES = 24;
const PAIRED_FIXED_W =
  PAD_X * 2 + PAIRED_CONTRACT_W + PAIRED_GUTTER_W + PAIRED_OBSERVATION_W;
const PAIRED_MIN_W = PAIRED_FIXED_W + PAIRED_SIDE_ROOM_MIN * 2;
/* With a ledger the field gives back padding, so a seven-role chain fits without a scrollbar for empty ground down to a 905px WebView. */
const PAD_Y_LEDGER = 12;
/** How far past the lane a skip swings, and how much deeper each further rank pushes it. */
const SKIP_DROP = 30;
const SKIP_STEP = 10;
/* Every stroke at rest says its sentence; rooms use the 4.7px edge-sentence glyph, not the caption's 4.8. */
const SENTENCE_LEAD_MAX = 380;
const SENTENCE_TOP_ROOM = 44;
const SENTENCE_TRAIL_ROOM = 260;
const SENTENCE_CHAR_PX = 4.7;
/** How far an adjacent rule sentence starts past its arrow (`GAP_TO_ARC` in `edge-sentences`). */
const SENTENCE_ARROW_GAP = 10;

/*
 * Before any inspection the measured columns are one dashed empty-state panel naming the fact and
 * the action. The panel keeps this much air past the planes' ledge (more when a rule sentence
 * reaches further), so planes and words are never covered. SVG units are CSS pixels.
 */
const EMPTY_PANEL_GAP = 12;
/** Air between the furthest rule sentence and the panel's edge. */
const EMPTY_PANEL_SENTENCE_AIR = 12;
const EMPTY_PANEL_PAD_X = 20;
/** `text-body` and `text-label`, the ladder's own name and chrome steps. */
const EMPTY_TITLE_PX = 12.5;
const EMPTY_BODY_PX = 11;
/** The `--leading-body` and `--leading-label` line boxes of those two steps. */
const EMPTY_TITLE_LINE = 20;
const EMPTY_BODY_LINE = 16;
/** The space under the icon, whose own box is `ICON_SIZE.lg`. */
const EMPTY_ICON_GAP = 10;
/** Between the fact and the action when an across band sets them on one line. */
const EMPTY_BAND_GAP = 12;
const EMPTY_TITLE_MAX_LINES = 2;
const EMPTY_BODY_MAX_LINES = 5;

/** Which way the chain runs: a seven-role row cannot fit a column, while the same roles laid downward are 148 wide. */
export type FlowAxis = 'across' | 'down';

function boxOrigin(
  axis: FlowAxis,
  rank: number,
  lane: number,
  boxH: number,
  boxW: number,
  rowGap: number,
  padY: number,
  colGap: number,
): { x: number; y: number } {
  const along = rank * (axis === 'across' ? boxW + colGap : boxH + rowGap);
  const across = lane * (axis === 'across' ? boxH + rowGap : boxW + colGap);
  return axis === 'across'
    ? { x: PAD_X + along, y: padY + across }
    : { x: PAD_X + across, y: padY + along };
}

interface Placed {
  id: string;
  x: number;
  y: number;
  shape: GraphBoxShape;
}

/** The one empty state of the measured lane: a column on the ladder, a band under an across row. */
interface EmptyPanel {
  key: string;
  layout: 'column' | 'band';
  x: number;
  y: number;
  width: number;
  height: number;
}

const HIDDEN_COUNT_BADGE_CLASS = badgeClass({
  shape: 'pill',
  className:
    'border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] text-[color:var(--color-text-tertiary)]',
});

/** At rest the canvas draws the spine; a skip is about one role, so it arrives when that role is selected or is violated. */
function isEdgeDrawn(edge: { from: string; to: string; columnSpan: number }, selected: string | null, violatedPairs: ReadonlySet<string>): boolean {
  return edge.columnSpan <= 1 || selected === edge.from || selected === edge.to || violatedPairs.has(`${edge.from}>${edge.to}`);
}

/** How far a skip swings, below an across chain or beside a downward one; a per-edge lane step keeps same-span skips apart. */
function skipSwing(columnSpan: number, laneIndex: number, halfBox: number): number {
  return SKIP_DROP + (columnSpan - 2) * SKIP_STEP + laneIndex * SKIP_LANE_STEP + halfBox;
}

/**
 * Where a currently drawn dependency meets a role face; created only when a visible edge enters or
 * leaves that side. Hollow-to-solid mirrors focus without a second selection colour.
 */
function ConnectionPort({
  axis,
  at,
  boxW,
  boxH,
  direction,
  active,
  lane,
  side,
}: {
  axis: FlowAxis;
  at: Placed;
  boxW: number;
  boxH: number;
  direction: 'incoming' | 'outgoing';
  active: boolean;
  lane: 'contract' | 'observation';
  /** A ladder skip leaves and arrives at the face's side; the port sits there, mid-height. */
  side?: 'left' | 'right';
}) {
  const incoming = direction === 'incoming';
  const cx = side
    ? side === 'left' ? at.x : at.x + boxW
    : axis === 'across' ? at.x + (incoming ? 0 : boxW) : at.x + boxW / 2;
  const cy = side || axis === 'across' ? at.y + boxH / 2 : at.y + (incoming ? 0 : boxH);

  return (
    <circle
      cx={cx}
      cy={cy}
      r={3}
      fill={active ? EDGE_STROKE : 'var(--color-canvas)'}
      stroke={EDGE_STROKE}
      strokeWidth={1.5}
      opacity={active ? 1 : 0.42}
      className="architecture-node-port"
      aria-hidden
      pointerEvents="none"
      data-architecture-port={lane}
      data-port-direction={direction}
      data-port-side={side}
    />
  );
}

/**
 * The measured lane's one empty state: a dashed panel, the fact, and the action. A ladder column
 * stacks icon, fact and action, balanced; an across band sets fact and action on one line, cutting
 * the action last. One note for assistive tech; no pointer events.
 */
function ObservationEmptyState({ panel, title, body }: { panel: EmptyPanel; title: string; body: string }) {
  const innerW = Math.max(0, panel.width - EMPTY_PANEL_PAD_X * 2);
  const cx = panel.x + panel.width / 2;
  const frame = (
    <rect
      x={panel.x}
      y={panel.y}
      width={panel.width}
      height={panel.height}
      rx={12}
      fill="var(--color-overlay-1)"
      stroke="var(--color-divider)"
      strokeWidth={1}
      strokeDasharray="4 4"
    />
  );
  const groupProps = {
    role: 'note',
    'aria-label': `${title} ${body}`,
    pointerEvents: 'none',
    className: 'architecture-observation-reveal',
    'data-testid': 'architecture-observation-empty',
    'data-empty-layout': panel.layout,
  } as const;

  if (panel.layout === 'band') {
    const [bodyLine = ''] = splitLinesByWidthAt(
      body,
      Math.max(0, innerW - estimateTextWidthAt(title, EMPTY_TITLE_PX) - EMPTY_BAND_GAP),
      1,
      EMPTY_BODY_PX,
    );
    return (
      <g {...groupProps}>
        {frame}
        <text x={cx} y={panel.y + panel.height / 2 + 4} textAnchor="middle" aria-hidden>
          <tspan
            data-testid="architecture-observation-empty-title"
            className="text-body font-[var(--font-weight-emphasis)] fill-[color:var(--color-text-secondary)]"
          >
            {title}
          </tspan>
          {bodyLine ? (
            <tspan
              dx={EMPTY_BAND_GAP}
              data-testid="architecture-observation-empty-line"
              className="text-label fill-[color:var(--color-text-tertiary)]"
            >
              {bodyLine}
            </tspan>
          ) : null}
        </text>
      </g>
    );
  }

  /* Balanced like `text-wrap: balance`, so no lone word sits under a full line. */
  const titleLines = balanceLinesByWidthAt(title, innerW, EMPTY_TITLE_MAX_LINES, EMPTY_TITLE_PX);
  const bodyLines = balanceLinesByWidthAt(body, innerW, EMPTY_BODY_MAX_LINES, EMPTY_BODY_PX);
  /* Each line sits on its line box's middle; a glyph's visual centre is about 0.35em above the baseline. */
  const blockH =
    ICON_SIZE.lg +
    EMPTY_ICON_GAP +
    titleLines.length * EMPTY_TITLE_LINE +
    bodyLines.length * EMPTY_BODY_LINE;
  const blockTop = panel.y + Math.max(EMPTY_PANEL_PAD_X, (panel.height - blockH) / 2);
  const titleTop = blockTop + ICON_SIZE.lg + EMPTY_ICON_GAP;
  const bodyTop = titleTop + titleLines.length * EMPTY_TITLE_LINE;
  return (
    <g {...groupProps}>
      {frame}
      <ScanSearch
        x={cx - ICON_SIZE.lg / 2}
        y={blockTop}
        size={ICON_SIZE.lg}
        aria-hidden
        className="text-[color:var(--color-text-quaternary)]"
      />
      <text
        textAnchor="middle"
        aria-hidden
        data-testid="architecture-observation-empty-title"
        className="text-body font-[var(--font-weight-emphasis)] fill-[color:var(--color-text-secondary)]"
      >
        {titleLines.map((line, index) => (
          <tspan
            key={index}
            x={cx}
            y={titleTop + index * EMPTY_TITLE_LINE + EMPTY_TITLE_LINE / 2 + EMPTY_TITLE_PX * 0.35}
          >
            {line}
          </tspan>
        ))}
      </text>
      <text textAnchor="middle" aria-hidden className="text-label fill-[color:var(--color-text-tertiary)]">
        {bodyLines.map((line, index) => (
          <tspan
            key={index}
            x={cx}
            y={bodyTop + index * EMPTY_BODY_LINE + EMPTY_BODY_LINE / 2 + EMPTY_BODY_PX * 0.35}
            data-testid="architecture-observation-empty-line"
          >
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}

/** The architecture in one <svg>: one face per role; a declared rule is a fixed-width stroke and measured traffic's width carries its count. */
export function ArchitectureSketch({
  graph,
  selected,
  roleInspectorOpen,
  onSelect,
  roleLabel,
  moduleCountLabel,
  conceptCountLabel,
  moduleCounts,
  conceptCounts,
  ledgers,
  roleSummary,
  violatedPairs,
  edgeSentence,
  ledgerStatusLabel,
  ledgerImportsLabel,
  deltaUnknownLabel,
  contractTrackLabel,
  observationTrackLabel,
  deltaTrackLabel,
  deltaColumnHint,
  observationMissingLabel,
  observationEmptyTitle,
  observationEmptyBody,
  hiddenRightLabel,
  hiddenLeftLabel,
  hiddenAboveLabel,
  hiddenBelowLabel,
}: {
  graph: Graph;
  selected: string | null;
  roleInspectorOpen: boolean;
  onSelect: (id: string, trigger: SVGGElement) => void;
  roleLabel: (id: string) => string;
  moduleCountLabel: (count: number) => string;
  conceptCountLabel: (count: number) => string;
  /** `null` where this surface cannot list source at all, so a box says nothing rather than 0. */
  moduleCounts: Readonly<Record<string, number>> | null;
  conceptCounts: Readonly<Record<string, number>>;
  /** Each role's outgoing-edge ledger, or `{}` without a measurement: a box with nothing behind it says nothing. */
  ledgers: Readonly<Record<string, RoleLedger>>;
  /** The profile's own sentence for a role, or null; it takes the line counts had, since a zero count is loud. */
  roleSummary: (id: string) => string | null;
  /** Violated crossings as `from>to`; a violation is never held back and never wears the conforming stroke. */
  violatedPairs: ReadonlySet<string>;
  /** The sentence a stroke states, the same string the dock printed: rule, count, or violation. */
  edgeSentence: (edge: SentenceEdge) => string;
  /** The ledger's first half, already worded by the locale. */
  ledgerStatusLabel: (ledger: RoleLedger) => string;
  ledgerImportsLabel: (count: number) => string;
  /** What the comparison mark says before any source has been observed. */
  deltaUnknownLabel: string;
  contractTrackLabel: string;
  observationTrackLabel: string;
  deltaTrackLabel: string;
  /** The limit of what a delta mark asserts: the delta heading's hover text, never body prose. */
  deltaColumnHint: string;
  /** What a role's own observation face says when only some roles carry a receipt. */
  observationMissingLabel: string;
  /** The single empty state in both measured columns before any inspection. */
  observationEmptyTitle: string;
  observationEmptyBody: string;
  hiddenRightLabel: (count: number) => string;
  hiddenLeftLabel: (count: number) => string;
  hiddenAboveLabel: (count: number) => string;
  hiddenBelowLabel: (count: number) => string;
}) {
  /* The axis is derived from the measured box, never stored, so it cannot disagree with the given width. */
  const [boxWidth, setBoxWidth] = useState(0);
  /* Measured against the width at rest, so a selection opening the dock may cut the chain but never turn it; the chosen box scrolls into view. */
  const [restWidth, setRestWidth] = useState(0);
  /*
   * The comparison ladder is chosen by the height it needs, read at rest from the column holding
   * the canvas and its hidden-count row (so the count cannot flip the axis). Across stays the
   * answer for a short canvas and for parallel lanes.
   */
  const [restHeight, setRestHeight] = useState(0);
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
  const pairedNaturalH =
    PAIRED_PAD_Y * 2 +
    PAIRED_HEADER_H +
    ranks * BOX_H +
    (ranks - 1) * PAIRED_ROW_GAP +
    planeVerticalRoom;
  /* One summary line per row: faces and connectors yield before any role is hidden. */
  const pairedTightH =
    PAIRED_PAD_Y_TIGHT * 2 +
    PAIRED_HEADER_H +
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
  /* Trail ground is reserved only when the profile declares an observation-side skip, as `contractNeedsLane` does for the lead. */
  const observationNeedsLane = graph.edges.some(
    (edge) => edge.kind === 'traffic' && edge.columnSpan > 1,
  );
  const pairedGroundSpare =
    usesPairedDown && boxWidth > 0
      ? Math.max(
          0,
          boxWidth -
            PAIRED_FIXED_W -
            PAIRED_SIDE_ROOM_MIN -
            (observationNeedsLane ? PAIRED_TRAIL_ROOM_MAX : PAIRED_SIDE_ROOM_MIN),
        )
      : 0;
  const pairedContractW = Math.min(PAIRED_CONTRACT_W_MAX, PAIRED_CONTRACT_W + pairedGroundSpare);
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
  /* One owner for the chrome row's vertical rhythm: headings sit on the ladder's top padding and faces are placed from the same `padY`. */
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

  /* Planes are drawn only on the comparison ladder, which has side room (`PLANE_EDGE` + drift + lean) to give; the narrow ladder and across chain do not. */
  const usesLayerPlanes = usesPairedDown && ranks > 1;
  const planeRowPitch = boxH + rowGap;
  const planeH = boxH + PLANE_INSET_Y * 2;
  /** How far a single plane's top edge overhangs its bottom edge: the shear, once. */
  const planeLean = usesLayerPlanes ? (PLANE_STEP * planeH) / planeRowPitch : 0;
  /** Deepest plane to nearest, in x. The stack's whole horizontal travel. */
  const planeDrift = usesLayerPlanes ? (ranks - 1) * PLANE_STEP : 0;
  const planeRoom = usesLayerPlanes
    ? Math.ceil(PLANE_EDGE + planeDrift + planeLean)
    : 0;
  /** Trailing-side room: planes share one right edge, so it owes `PLANE_EDGE` and the lean, not the drift. */
  const planeTrailRoom = usesLayerPlanes ? Math.ceil(PLANE_EDGE + planeLean) : 0;
  const planeHeadRoom = usesLayerPlanes ? PLANE_HEAD_ROOM : 0;

  /* Hover answers locally; only selection dims the graph. */
  const [hovered, setHovered] = useState<string | null>(null);
  const [pressed, setPressed] = useState<string | null>(null);
  const focus = selected ?? hovered;

  const toSentenceEdge = useCallback(
    (edge: Graph['edges'][number]): SentenceEdge => ({
      from: edge.from,
      to: edge.to,
      kind: edge.kind,
      count: edge.count,
      columnSpan: edge.columnSpan,
      violated: violatedPairs.has(`${edge.from}>${edge.to}`),
      drawn: isEdgeDrawn(edge, selected, violatedPairs),
    }),
    [violatedPairs, selected],
  );
  const leadRoom = useMemo(() => {
    if (axis === 'across') return graph.edges.length === 0 ? 0 : SENTENCE_TOP_ROOM;
    const longest = graph.edges
      .filter((edge) => edge.columnSpan <= 1)
      .reduce((most, edge) => Math.max(most, edgeSentence(toSentenceEdge(edge)).length), 0);
    return longest === 0 ? 0 : Math.min(SENTENCE_LEAD_MAX, Math.ceil(longest * SENTENCE_CHAR_PX) + 32);
  }, [axis, graph.edges, edgeSentence, toSentenceEdge]);
  const needsDownObservationRoom =
    axis === 'down' && graph.edges.some((edge) => edge.kind === 'traffic');
  const trailRoom = graph.edges.some((edge) => edge.columnSpan > 1) || needsDownObservationRoom
    ? axis === 'across'
      ? 28
      : SENTENCE_TRAIL_ROOM
    : 0;
  /* Side lanes go where the arcs are: the contract lane needs room only when the profile declares a skip. */
  const contractNeedsLane = graph.edges.some(
    (edge) => edge.kind === 'permitted' && edge.columnSpan > 1,
  );
  const pairedSlack = usesPairedDown && boxWidth > 0 ? Math.max(0, boxWidth - pairedFixedW) : PAIRED_SIDE_ROOM_MAX * 2;
  /* The drawing is centred: once the face has its width, leftover lane ground is split evenly while each lane keeps its floor. */
  const pairedCentredLane = usesPairedDown && boxWidth > 0
    ? Math.max(0, boxWidth - 2 * PAD_X - pairedContractW - pairedGutterW - PAIRED_OBSERVATION_W) / 2
    : 0;
  /* The plane floor comes out of the lead room first and the trail room is measured from what is left, so canvases with slack keep their width. */
  const pairedLeadRoom = Math.max(
    planeRoom,
    pairedCentredLane,
    contractNeedsLane
      ? Math.max(PAIRED_SIDE_ROOM_MIN, Math.min(PAIRED_SIDE_ROOM_MAX, pairedSlack / 2))
      : PAIRED_SIDE_ROOM_MIN,
  );
  const pairedTrailRoom = Math.max(
    planeTrailRoom,
    PAIRED_SIDE_ROOM_MIN,
    Math.min(Math.max(PAIRED_TRAIL_ROOM_MAX, pairedCentredLane), pairedSlack - pairedLeadRoom),
  );
  const layoutLeadRoom = usesPairedDown ? pairedLeadRoom : usesNarrowLadder ? 0 : leadRoom;
  const layoutTrailRoom = usesPairedDown ? pairedTrailRoom : usesNarrowLadder ? 0 : trailRoom;

  const placed = useMemo(() => {
    const map = new Map<string, Placed>();
    for (const box of graph.boxes) {
      const at = boxOrigin(axis, box.column, box.slot, boxH, contractBoxW, rowGap, padY, colGap);
      map.set(box.id, {
        id: box.id,
        x: at.x + (axis === 'down' ? layoutLeadRoom : 0),
        y:
          at.y +
          (axis === 'across'
            ? layoutLeadRoom
            : usesPairedDown
              ? PAIRED_HEADER_H + planeHeadRoom
              : 0),
        shape: box.shape,
      });
    }
    return map;
  }, [
    axis,
    boxH,
    colGap,
    contractBoxW,
    graph.boxes,
    layoutLeadRoom,
    padY,
    planeHeadRoom,
    rowGap,
    usesPairedDown,
  ]);
  const observedPlaced = useMemo(() => {
    if (!splitsEvidence) return placed;
    return new Map(
      [...placed].map(([id, at]) => [
        id,
        usesPairedDown
          ? {
              ...at,
              x: at.x + observationOffset,
              y: at.y + (boxH - observationBoxH) / 2,
            }
          : { ...at, y: at.y + observationOffset },
      ]),
    );
  }, [boxH, observationBoxH, observationOffset, placed, splitsEvidence, usesPairedDown]);

  /* Where the one empty state stands: on the ladder a column-tall panel over the delta gutter and observation face, yielding its left edge to rule sentences; on an across chain one band per row. */
  const emptyPanels = useMemo((): EmptyPanel[] => {
    if (!observationEmpty) return [];
    const faces = [...placed.values()];
    if (faces.length === 0) return [];
    if (usesPairedDown) {
      const contractLeft = Math.min(...faces.map((face) => face.x));
      const contractRight = contractLeft + contractBoxW;
      const observationLeft = contractRight + pairedGutterW;
      const arrowX = contractLeft + contractBoxW / 2;
      const reach = graph.edges
        .filter((edge) => edge.kind === 'permitted' && edge.columnSpan <= 1)
        .reduce(
          (furthest, edge) =>
            Math.max(
              furthest,
              arrowX + SENTENCE_ARROW_GAP + estimateCaptionWidth(edgeSentence(toSentenceEdge(edge))),
            ),
          contractRight,
        );
      /* The planes end their ledge (plus the lean of the lit top face) past the contract faces. */
      const planeLedge = usesLayerPlanes ? planeRoom - planeDrift : 0;
      const x = Math.min(
        observationLeft,
        Math.max(contractRight + planeLedge + EMPTY_PANEL_GAP, reach + EMPTY_PANEL_SENTENCE_AIR),
      );
      const top = Math.min(...faces.map((face) => face.y));
      const bottom = Math.max(...faces.map((face) => face.y)) + boxH;
      return [
        {
          key: 'column',
          layout: 'column',
          x,
          y: top,
          width: observationLeft + observationBoxW - x,
          height: bottom - top,
        },
      ];
    }
    const rows = new Map<number, Placed[]>();
    for (const face of observedPlaced.values()) {
      rows.set(face.y, [...(rows.get(face.y) ?? []), face]);
    }
    return [...rows].map(([y, row]) => {
      const x = Math.min(...row.map((face) => face.x));
      return {
        key: `band-${y}`,
        layout: 'band',
        x,
        y,
        width: Math.max(...row.map((face) => face.x)) + observationBoxW - x,
        height: observationBoxH,
      };
    });
  }, [
    boxH,
    contractBoxW,
    edgeSentence,
    graph.edges,
    observationBoxH,
    observationBoxW,
    observationEmpty,
    observedPlaced,
    pairedGutterW,
    placed,
    planeDrift,
    planeRoom,
    toSentenceEdge,
    usesLayerPlanes,
    usesPairedDown,
  ]);
  const emptyColumn = emptyPanels.find((panel) => panel.layout === 'column') ?? null;
  /** The first x the empty column claims, so a rule sentence beside an arrow stops short of it. */
  const emptyColumnLeft = emptyColumn?.x ?? null;

  /* Box ends in SVG units, which are CSS pixels since the drawing is not scaled. Derived, never a ref written during render. */
  const boxEnd = useMemo(
    () => ({
      /* A roomy role's lowest face (its observation card) is the boundary the hidden count measures, since the group is the role. */
      down: graph.boxes.map((box) => {
        const contract = placed.get(box.id);
        const observation = observedPlaced.get(box.id);
        if (!contract) return 0;
        return splitsEvidence && observation
          ? Math.max(contract.y + boxH, observation.y + observationBoxH)
          : contract.y + boxH;
      }),
      across: [...placed.values()].map(
        (at) =>
          at.x +
          (usesPairedDown
            ? contractBoxW + pairedGutterW + observationBoxW
            : contractBoxW),
      ),
    }),
    [
      boxH,
      contractBoxW,
      graph.boxes,
      observationBoxH,
      observationBoxW,
      observedPlaced,
      pairedGutterW,
      placed,
      splitsEvidence,
      usesPairedDown,
    ],
  );

  /* A canvas that scrolls must say so: macOS hides its overlay scrollbar. Read on the node itself through a callback ref, since an effect fires while the ref is null. */
  const [covered, setCovered] = useState<{
    left: boolean;
    right: boolean;
    hiddenLeft: number;
    hiddenRight: number;
    coveredDown: boolean;
  }>({ left: false, right: false, hiddenLeft: 0, hiddenRight: 0, coveredDown: false });
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const readCoveredEdges = useCallback(() => {
    const element = scrollerRef.current;
    if (!element) return;
    setBoxWidth(element.clientWidth);
    /* At xl a right dock's measured width is added back, so opening a dock keeps the chain's axis; a real resize may reflow it. */
    const dockWidth = window.matchMedia('(min-width: 1280px)').matches
      ? Math.max(
          document.getElementById('architecture-inspector')?.getBoundingClientRect().width ?? 0,
          document.getElementById('architecture-evidence-dock')?.getBoundingClientRect().width ?? 0,
        )
      : 0;
    setRestWidth(element.clientWidth + dockWidth);
    /* At xl the column height is independent of the count row and the docks; below xl it is content-sized, so the width rule alone decides. */
    setRestHeight(
      window.matchMedia('(min-width: 1280px)').matches
        ? element.parentElement?.clientHeight ?? element.clientHeight
        : 0,
    );
    /* Whichever axis is actually cut: an across chain can still be cut top and bottom. The chain's own axis wins when both overflow. */
    const down =
      axis === 'down' ||
      (element.scrollWidth <= element.clientWidth + 1 &&
        element.scrollHeight > element.clientHeight + 1);
    const extent = down ? element.scrollHeight : element.scrollWidth;
    const visible = down ? element.clientHeight : element.clientWidth;
    const offset = down ? element.scrollTop : element.scrollLeft;
    const alongCovered = down ? boxEnd.down : boxEnd.across;
    const overflowing = extent > visible + 1;
    const edge = offset + visible;
    setCovered({
      left: startIsHidden(overflowing, offset),
      right: endIsHidden(overflowing, offset, visible, extent),
      /* Counted from the boxes, in both directions, since panning can push roles off either edge. */
      coveredDown: down,
      hiddenLeft: alongCovered.filter(
        (end) => end - (down ? boxH : contractBoxW) < offset,
      ).length,
      hiddenRight: alongCovered.filter((end) => end > edge).length,
    });
  }, [axis, boxEnd, boxH, contractBoxW]);
  /* A chosen box cut by the canvas scrolls into view, nearest edge only, with no motion under reduced motion. */
  useEffect(() => {
    const element = scrollerRef.current;
    const at = selected !== null ? placed.get(selected) : undefined;
    if (!element || !at) return;
    const svg = element.querySelector('[data-testid="architecture-graph"]');
    if (!(svg instanceof SVGGraphicsElement)) return;
    const scale = svg.getBoundingClientRect().width / Math.max(1, Number(svg.getAttribute('width')) || 1);
    const ROOM = 24;
    const left = at.x * scale - ROOM;
    const right =
      (at.x +
        (usesPairedDown
          ? contractBoxW + pairedGutterW + observationBoxW
          : contractBoxW)) *
        scale +
      ROOM;
    const top = at.y * scale - ROOM;
    const bottom = (at.y + boxH) * scale + ROOM;
    let dx = 0;
    let dy = 0;
    if (right > element.scrollLeft + element.clientWidth) dx = right - element.clientWidth - element.scrollLeft;
    else if (left < element.scrollLeft) dx = left - element.scrollLeft;
    if (bottom > element.scrollTop + element.clientHeight) dy = bottom - element.clientHeight - element.scrollTop;
    else if (top < element.scrollTop) dy = top - element.scrollTop;
    if (dx === 0 && dy === 0) return;
    const still =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (typeof element.scrollBy === 'function') {
      element.scrollBy({ left: dx, top: dy, behavior: still ? 'auto' : 'smooth' });
    } else {
      element.scrollLeft += dx;
      element.scrollTop += dy;
    }
  }, [boxH, boxWidth, contractBoxW, observationBoxW, pairedGutterW, placed, selected, usesPairedDown]);

  const attachScroller = useCallback(
    (element: HTMLDivElement | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      scrollerRef.current = element;
      if (!element) return;
      readCoveredEdges();
      if (typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(readCoveredEdges);
      observer.observe(element);
      observerRef.current = observer;
    },
    [readCoveredEdges],
  );
  /*
   * Mouse press-and-drag pans the canvas (touch already pans natively). Past the threshold the drag
   * swallows the click once, so a pan does not also select the node under the cursor.
   */
  const pan = useRef<{ startX: number; startScroll: number; moved: boolean } | null>(null);
  const swallowClick = useRef(false);
  const PAN_THRESHOLD = 4;

  const onPanStart = (event: React.PointerEvent<HTMLDivElement>) => {
    /* Cleared on the next press, not on use: a drag ending on empty ground produces no click and would swallow the next real one. */
    swallowClick.current = false;
    const element = scrollerRef.current;
    if (!element || event.pointerType !== 'mouse' || event.button !== 0) return;
    /* The covered axis, not the chain's, so a drag works when an across chain is cut vertically. */
    const down = covered.coveredDown;
    if (down ? element.scrollHeight <= element.clientHeight + 1 : element.scrollWidth <= element.clientWidth + 1) {
      return;
    }
    pan.current = {
      startX: down ? event.clientY : event.clientX,
      startScroll: down ? element.scrollTop : element.scrollLeft,
      moved: false,
    };
  };
  const onPanMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const element = scrollerRef.current;
    const state = pan.current;
    if (!element || !state) return;
    const down = covered.coveredDown;
    const dx = (down ? event.clientY : event.clientX) - state.startX;
    if (!state.moved && Math.abs(dx) < PAN_THRESHOLD) return;
    if (!state.moved) {
      state.moved = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    if (down) element.scrollTop = state.startScroll - dx;
    else element.scrollLeft = state.startScroll - dx;
    readCoveredEdges();
  };
  const onPanEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    setPressed(null);
    const state = pan.current;
    pan.current = null;
    if (!state?.moved) return;
    swallowClick.current = true;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const coveredMask = (() => {
    /* The fade matches the panel's own inset. */
    const fade = 'var(--card-pad)';
    /* Two insets at the covered bottom, so the count badge sits over faded ink, not opaque ink. */
    const endFade = covered.coveredDown ? 'calc(var(--card-pad) * 2)' : fade;
    const [from, to] = covered.coveredDown ? ['bottom', 'top'] : ['right', 'left'];
    if (covered.left && covered.right) {
      return `linear-gradient(to ${from}, transparent 0, #000 ${fade}, #000 calc(100% - ${endFade}), transparent 100%)`;
    }
    if (covered.left) return `linear-gradient(to ${from}, transparent 0, #000 ${fade})`;
    if (covered.right) return `linear-gradient(to ${to}, transparent 0, #000 ${endFade})`;
    return undefined;
  })();

  /** Which lane each skip takes, counted within its span; deterministic because the edge order is stable. */
  const skipLane = useMemo(() => {
    const lanes = new Map<string, number>();
    const used = new Map<number, number>();
    for (const edge of graph.edges) {
      if (edge.columnSpan <= 1) continue;
      const taken = used.get(edge.columnSpan) ?? 0;
      lanes.set(`${edge.from}>${edge.to}`, taken);
      used.set(edge.columnSpan, taken + 1);
    }
    return lanes;
  }, [graph.edges]);

  const sentences = useMemo(() => {
    const placeLaneSentences = (
      edges: readonly Graph['edges'][number][],
      lane: ReadonlyMap<string, Placed>,
      laneBoxW: number,
      laneBoxH: number,
      skipSide: 'negative' | 'positive' = 'positive',
      occupied: readonly { x: number; y: number; width: number; height: number }[] = [],
    ) =>
      placeEdgeSentences({
        occupied,
        axis,
        edges: edges.map(toSentenceEdge),
        placed: lane,
        boxW: laneBoxW,
        boxH: laneBoxH,
        rowGap,
        colGap,
        swingOf: (edge) =>
          skipSwing(edge.columnSpan, skipLane.get(`${edge.from}>${edge.to}`) ?? 0, (axis === 'across' ? laneBoxH : laneBoxW) / 2),
        leadRoom: layoutLeadRoom,
        trailRoom: layoutTrailRoom,
        skipSide,
        /* On the ladders an adjacent rule's sentence sits beside its arrow, in the clear row gap. */
        adjacentSeat: usesPairedDown || usesNarrowLadder ? 'connector' : 'lead',
        /* The contract lane reads right over the gutter; the observation lane reads left, leaving its right side to the skip arcs. */
        connectorSide: usesNarrowLadder ? 'split' : lane === placed ? 'right' : 'left',
        /* On the narrow ladder the sentence may run to the canvas edge, which a nineteen-glyph Korean rule needs. */
        connectorRoom: usesNarrowLadder
          ? contractBoxW / 2 + NARROW_LADDER_EDGE + PAD_X
          : lane === placed
            ? Math.min(
                contractBoxW / 2 + pairedGutterW + observationBoxW / 2 - GAP_BETWEEN_LANE_SENTENCES,
                /* Before an inspection a rule sentence stops one air short of the empty column (`placeEdgeSentences` spends the arrow gap and 12 of padding). */
                emptyColumnLeft === null
                  ? Number.POSITIVE_INFINITY
                  : emptyColumnLeft -
                      EMPTY_PANEL_SENTENCE_AIR -
                      (PAD_X + layoutLeadRoom + contractBoxW / 2) +
                      12,
              )
            : observationBoxW / 2 + pairedGutterW - GAP_BETWEEN_LANE_SENTENCES,
        sentenceOf: edgeSentence,
        focus,
      });
    if (!splitsEvidence) return placeLaneSentences(graph.edges, placed, contractBoxW, boxH);
    const headings =
      axis === 'across'
        ? [
            laneHeadingRect(contractTrackLabel, PAD_X, padY + layoutLeadRoom - 6),
            laneHeadingRect(observationTrackLabel, PAD_X, padY + layoutLeadRoom + observationOffset - 6),
          ]
        : [];
    const rules = placeLaneSentences(
      graph.edges.filter((edge) => edge.kind === 'permitted'),
      placed,
      contractBoxW,
      boxH,
      usesPairedDown ? 'negative' : 'positive',
      headings,
    );
    /* The rule lane places first; a count sentence that would touch it gives way. */
    const held = [...headings, ...rules.flatMap((placement) => (placement.rect ? [placement.rect] : []))];
    return [
      ...rules,
      ...placeLaneSentences(
        graph.edges.filter((edge) => edge.kind === 'traffic'),
        observedPlaced,
        observationBoxW,
        observationBoxH,
        'positive',
        held,
      ),
    ];
  }, [
    axis,
    boxH,
    contractBoxW,
    contractTrackLabel,
    colGap,
    edgeSentence,
    emptyColumnLeft,
    focus,
    graph.edges,
    layoutLeadRoom,
    layoutTrailRoom,
    observationBoxH,
    observationBoxW,
    observationOffset,
    observationTrackLabel,
    observedPlaced,
    padY,
    pairedGutterW,
    placed,
    rowGap,
    skipLane,
    splitsEvidence,
    toSentenceEdge,
    usesNarrowLadder,
    usesPairedDown,
  ]);

  /* Per render O(B·E + E²): per-role port filters and per-sentence edges.find / visibleEdges.includes are linear scans over tens of edges. */
  const visibleEdges = graph.edges.filter((edge) => isEdgeDrawn(edge, selected, violatedPairs));
  /* Skip room depends on the profile, not the selection, so the page does not move under a click. */
  const deepestSkip = graph.edges.reduce((most, edge) => Math.max(most, edge.columnSpan), 0);
  const skipRoom = deepestSkip <= 1 ? 0 : SKIP_DROP + deepestSkip * SKIP_STEP;
  const alongExtent =
    axis === 'across'
      ? PAD_X * 2 + ranks * boxW + (ranks - 1) * colGap
      : padY * 2 + ranks * boxH + (ranks - 1) * rowGap +
        (usesPairedDown ? PAIRED_HEADER_H : 0) +
        /* Plane head room and bottom ledge; zero on layouts without planes. */
        (usesLayerPlanes ? planeHeadRoom + PLANE_INSET_Y : 0);
  const acrossExtent =
    axis === 'across'
      ? padY * 2 + lanes * boxH + (lanes - 1) * rowGap + skipRoom + leadRoom + trailRoom
      : PAD_X * 2 +
        lanes * contractBoxW +
        (lanes - 1) * colGap +
        (usesPairedDown ? pairedGutterW + observationBoxW : 0) +
        (usesPairedDown ? 0 : skipRoom) +
        layoutLeadRoom +
        layoutTrailRoom;
  const width = axis === 'across' ? alongExtent : acrossExtent;
  const height = axis === 'across'
    ? acrossExtent + (splitsEvidence ? OBSERVATION_LANE_GAP + observationBoxH : 0)
    : alongExtent;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* Left, right and above counts take a row shown only while something is hidden: a fade or a macOS overlay scrollbar alone does not say the drawing continues. */}
      {covered.hiddenLeft === 0 && covered.hiddenRight === 0 ? null : (
        <div className="flex items-center justify-end gap-2 px-[var(--card-pad)] pt-2.5">
        {covered.hiddenLeft === 0 ? null : (
          <span
            className={HIDDEN_COUNT_BADGE_CLASS}
            data-testid="architecture-canvas-hidden-left"
          >
            {(covered.coveredDown ? hiddenAboveLabel : hiddenLeftLabel)(covered.hiddenLeft)}
          </span>
        )}
        {covered.hiddenRight === 0 || covered.coveredDown ? null : (
          <span
            className={HIDDEN_COUNT_BADGE_CLASS}
            data-testid="architecture-canvas-hidden-right"
          >
            {hiddenRightLabel(covered.hiddenRight)}
          </span>
        )}
        </div>
      )}

      {/* The drawing keeps its size and the canvas scrolls: scaling an SVG scales its text off the type ramp (`.claude/rules/design.md`: a diagram scrolls in its own container). */}
      <div
        ref={attachScroller}
        onScroll={readCoveredEdges}
        onPointerDown={onPanStart}
        onPointerMove={onPanMove}
        onPointerUp={onPanEnd}
        onPointerCancel={onPanEnd}
        /* A thin persistent scrollbar, with `DocsQuickDrawer`'s values, because macOS hides the overlay one and the fade alone was not perceived. The mask still softens clipped ink. */
        className={cn(
          covered.left || covered.right ? 'cursor-grab active:cursor-grabbing' : undefined,
          /* `safe center`: centre while the drawing fits, start once it does not, so a wide chain's left edge stays reachable; unsupported, it falls back to start. */
          '[justify-content:safe_center]',
          /* The ladder centres in its height as the across chain does in its width; `safe` keeps the top reachable. */
          axis === 'down'
            ? 'overflow-y-auto [align-items:safe_center]'
            : 'items-center overflow-x-auto',
          'flex min-h-0 flex-1 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[color:var(--color-divider)]',
        )}
        style={coveredMask ? { maskImage: coveredMask, WebkitMaskImage: coveredMask } : undefined}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          role="presentation"
          pointerEvents="none"
          data-testid="architecture-graph"
          data-edge-source={graph.edgeSource}
          data-architecture-axis={axis}
          data-column-gap={Math.round(colGap * 10) / 10}
          data-box-width-mode={usesRoomyBoxes ? 'roomy' : 'compact'}
          data-evidence-layout={usesPairedDown ? 'paired-ladder' : splitsEvidence ? 'split' : 'combined'}
          data-ladder-density={usesPairedDown ? ladderDensity : undefined}
          data-architecture-layout-ready={axisWidth > 0 ? 'true' : 'false'}
          /* `shrink-0`: in the centring flex scroller the SVG would otherwise shrink and scale its text. */
          className="block shrink-0"
        >
        <defs>
          <marker
            id="architecture-sketch-arrow"
            viewBox="0 0 8 8"
            refX="6"
            refY="4"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            {/* An explicit stroke, not `context-stroke`, which WebKit does not resolve on markers. */}
            <path
              d="M0,0.5 L7.5,4 L0,7.5"
              fill="none"
              stroke={EDGE_STROKE}
              strokeWidth={1.4}
            />
          </marker>
          <marker
            id="architecture-sketch-arrow-violation"
            viewBox="0 0 8 8"
            refX="6"
            refY="4"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path
              d="M0,0.5 L7.5,4 L0,7.5"
              fill="none"
              stroke="var(--color-danger-text)"
              strokeWidth={1.4}
            />
          </marker>
          {/* `userSpaceOnUse`: a vertical stroke has a zero-width bounding box, which would clip a percentage filter region to nothing. */}
          <filter
            id="architecture-violation-halo"
            filterUnits="userSpaceOnUse"
            x={0}
            y={0}
            width={width}
            height={height}
          >
            <feGaussianBlur stdDeviation={VIOLATION_HALO_BLUR} />
          </filter>
        </defs>

        {axis === 'across' && splitsEvidence ? (
          /* One heading per row, above its first face, not one per face. */
          <g
            className="architecture-role-reveal"
            aria-hidden
            data-testid="architecture-across-lane-headings"
          >
            <text
              x={PAD_X}
              y={padY + layoutLeadRoom - 6}
              textAnchor="start"
              className="fill-[color:var(--color-text-quaternary)] text-label font-[var(--font-weight-emphasis)] uppercase tracking-[var(--tracking-label)]"
            >
              {contractTrackLabel}
            </text>
            <text
              x={PAD_X}
              y={padY + layoutLeadRoom + boxH + observationOffset - boxH - 6}
              textAnchor="start"
              className="fill-[color:var(--color-text-quaternary)] text-label font-[var(--font-weight-emphasis)] uppercase tracking-[var(--tracking-label)]"
            >
              {observationTrackLabel}
            </text>
          </g>
        ) : null}
        {usesPairedDown ? (
          <g
            className="architecture-role-reveal"
            aria-hidden
            data-testid="architecture-paired-lane-headings"
          >
            <text
              x={PAD_X + layoutLeadRoom + contractBoxW / 2}
              y={laneHeadingY}
              textAnchor="middle"
              className="fill-[color:var(--color-text-quaternary)] text-label font-[var(--font-weight-emphasis)] uppercase tracking-[var(--tracking-label)]"
            >
              {contractTrackLabel}
            </text>
            {/* The lane headings are one row of chrome in one ink; state colour belongs to the markers. */}
            {/* The delta heading carries the mark's limit as hover text and waits for its marks; before an inspection the observation heading centres on the empty state. */}
            {emptyColumn === null ? (
              <text
                x={PAD_X + layoutLeadRoom + contractBoxW + pairedGutterW / 2}
                y={laneHeadingY}
                textAnchor="middle"
                pointerEvents="all"
                data-testid="architecture-delta-heading"
                className="fill-[color:var(--color-text-quaternary)] text-label font-[var(--font-weight-emphasis)] uppercase tracking-[var(--tracking-label)]"
              >
                <title>{deltaColumnHint}</title>
                {deltaTrackLabel}
              </text>
            ) : null}
            <text
              x={
                emptyColumn !== null
                  ? emptyColumn.x + emptyColumn.width / 2
                  : PAD_X + layoutLeadRoom + contractBoxW + pairedGutterW + observationBoxW / 2
              }
              y={laneHeadingY}
              textAnchor="middle"
              data-testid="architecture-observation-heading"
              className="fill-[color:var(--color-text-quaternary)] text-label font-[var(--font-weight-emphasis)] uppercase tracking-[var(--tracking-label)]"
            >
              {observationTrackLabel}
            </text>
          </g>
        ) : null}

        {/*
          Layer planes draw import direction as depth, stepping one `PLANE_STEP` per layer. One fill,
          capped under `--color-panel` so no face is darker than its plane; depth is the shear, the
          numeral and the arrows, with `data-layer-depth` carrying the normalised fact.
        */}
        {usesLayerPlanes ? (
          <g
            aria-hidden
            pointerEvents="none"
            data-testid="architecture-layer-planes"
            data-layer-step={PLANE_STEP}
          >
            {graph.boxes.map((box) => {
              const at = placed.get(box.id);
              if (!at) return null;
              const depth =
                ranks === 1 ? 1 : (ranks - 1 - box.column) / (ranks - 1);
              /* The left edge steps one `PLANE_STEP` per rank and every plane ends on one right edge, so the stagger reads as depth, not misalignment (`ArchitectureSketch.test.tsx`, "every layer plane ends on one line"). */
              const stagger = (ranks - 1 - box.column) * PLANE_STEP;
              const x = PAD_X + layoutLeadRoom - planeRoom + stagger;
              /* Before an inspection the planes end at the contract faces instead of running under the empty panel. */
              const planeW =
                contractBoxW +
                (observationEmpty ? 0 : pairedGutterW + observationBoxW) +
                planeRoom * 2 -
                planeDrift -
                planeLean -
                stagger;
              const top = at.y - PLANE_INSET_Y;
              const bottom = at.y + boxH + PLANE_INSET_Y;
              return (
                <g
                  key={`plane-${box.id}`}
                  className="architecture-layer-plane architecture-role-reveal"
                  data-testid={`architecture-layer-plane-${box.id}`}
                  data-layer-rank={box.column}
                  data-layer-depth={Math.round(depth * 100) / 100}
                >
                  <path
                    d={`M ${x} ${bottom} H ${x + planeW} L ${x + planeW + planeLean} ${top} H ${
                      x + planeLean
                    } Z`}
                    fill="var(--architecture-plane-fill)"
                  />
                  {/* The lit top face, the same one-flat-line device a raised node already uses. */}
                  <line
                    x1={x + planeLean}
                    x2={x + planeLean + planeW}
                    y1={top}
                    y2={top}
                    stroke="var(--architecture-plane-edge)"
                    strokeWidth={1}
                  />
                </g>
              );
            })}
          </g>
        ) : null}

        {/* One empty state where the measured columns will be: one note for assistive tech, no pointer events. */}
        {emptyPanels.map((panel) => (
          <ObservationEmptyState
            key={panel.key}
            panel={panel}
            title={observationEmptyTitle}
            body={observationEmptyBody}
          />
        ))}

        {graph.edges.map((edge) => {
          const usesObservationLane = splitsEvidence && edge.kind === 'traffic';
          const edgeLane = usesObservationLane ? observedPlaced : placed;
          const a = edgeLane.get(edge.from);
          const b = edgeLane.get(edge.to);
          if (!a || !b) return null;
          /* A skip stays mounted at zero opacity, so revealing it on selection is a fade, not a mount. */
          const drawn = visibleEdges.includes(edge);
          const edgeBoxW = usesObservationLane ? observationBoxW : contractBoxW;
          const edgeBoxH = usesObservationLane ? observationBoxH : boxH;
          const trackY = (at: Placed) => at.y + edgeBoxH / 2;
          /* Rule and traffic strokes sit six units apart on the compact downward layout, or traffic overpaints the rule. */
          const trackOffset = axis === 'down' && !splitsEvidence
            ? edge.kind === 'permitted'
              ? -6
              : 6
            : 0;
          const sx = axis === 'across' ? a.x + edgeBoxW : a.x + edgeBoxW / 2 + trackOffset;
          const sy = axis === 'across' ? trackY(a) : a.y + edgeBoxH;
          const tx = axis === 'across' ? b.x : b.x + edgeBoxW / 2 + trackOffset;
          const ty = axis === 'across' ? trackY(b) : b.y;
          const receded = selected !== null && selected !== edge.from && selected !== edge.to;
          /* Choosing either end of a violation raises it; nothing moves while nothing is selected. */
          const raised = selected !== null && (selected === edge.from || selected === edge.to);

          /* A declared rule keeps one width; measured traffic's width carries its count. */
          const isDeclared = edge.kind === 'permitted';
          const violated = violatedPairs.has(`${edge.from}>${edge.to}`);
          const swing =
            edge.columnSpan <= 1
              ? 0
              : skipSwing(edge.columnSpan, skipLane.get(`${edge.from}>${edge.to}`) ?? 0, (axis === 'across' ? edgeBoxH : edgeBoxW) / 2);
          const lead = axis === 'across' ? colGap : rowGap;
          const d = (() => {
            if (edge.columnSpan <= 1) {
              return axis === 'across'
                ? `M ${sx} ${sy} C ${sx + lead * 0.6} ${sy}, ${tx - lead * 0.6} ${ty}, ${tx} ${ty}`
                : `M ${sx} ${sy} C ${sx} ${sy + lead * 0.6}, ${tx} ${ty - lead * 0.6}, ${tx} ${ty}`;
            }
            if (axis === 'across') {
              const midY = Math.max(sy, ty) + swing;
              return `M ${sx} ${sy} C ${sx + colGap} ${sy}, ${sx + colGap} ${midY}, ${
                (sx + tx) / 2
              } ${midY} C ${tx - colGap} ${midY}, ${tx - colGap} ${ty}, ${tx} ${ty}`;
            }
            if (usesPairedDown) {
              /* On the ladder a skip leaves the face's side, not its foot, clearing the adjacent sentence's row gap. */
              const negative = isDeclared;
              const edgeX = (face: Placed) => (negative ? face.x : face.x + edgeBoxW);
              const psx = edgeX(a);
              const psy = a.y + edgeBoxH / 2;
              const ptx = edgeX(b);
              const pty = b.y + edgeBoxH / 2;
              const apex = negative
                ? Math.min(a.x, b.x) - (swing - edgeBoxW / 2)
                : Math.max(a.x, b.x) + edgeBoxW + (swing - edgeBoxW / 2);
              return `M ${psx} ${psy} C ${apex} ${psy}, ${apex} ${pty}, ${ptx} ${pty}`;
            }
            const midX = Math.max(sx, tx) + swing;
            return `M ${sx} ${sy} C ${sx} ${sy + rowGap}, ${midX} ${sy + rowGap}, ${midX} ${
              (sy + ty) / 2
            } C ${midX} ${ty - rowGap}, ${tx} ${ty - rowGap}, ${tx} ${ty}`;
          })();

          return (
            <Fragment key={`${edge.kind}-${edge.from}-${edge.to}`}>
            {/* The halo marks the climb up the stack. It has no data-edge-* identity, so stroke counts stay one per crossing; only selection changes its intensity. */}
            {violated && drawn ? (
              <path
                d={d}
                fill="none"
                stroke={VIOLATED_STROKE}
                strokeWidth={raised ? VIOLATION_HALO_WIDTH_RAISED : VIOLATION_HALO_WIDTH}
                strokeLinecap="round"
                filter="url(#architecture-violation-halo)"
                className="architecture-violation-halo"
                data-edge-raised={raised ? 'true' : 'false'}
                data-testid={`architecture-violation-halo-${edge.from}-${edge.to}`}
                aria-hidden
                pointerEvents="none"
              />
            ) : null}
            <path
              d={d}
              fill="none"
              stroke={violated ? VIOLATED_STROKE : EDGE_STROKE}
              strokeWidth={
                (isDeclared
                  ? 1.4
                  : edge.columnSpan > 1
                    ? 1.2 + (edge.weight ?? 0) * 1.5
                    : 1.4 + (edge.weight ?? 0) * 3) +
                (violated && raised ? VIOLATION_STROKE_RAISE : 0)
              }
              /* Dashed as well as toned: the tone is the alarm, the dash is the fact, and it survives greyscale. */
              strokeDasharray={violated ? '5 3' : undefined}
              strokeLinecap="round"
              markerEnd={
                violated
                  ? 'url(#architecture-sketch-arrow-violation)'
                  : 'url(#architecture-sketch-arrow)'
              }
              pointerEvents={drawn ? undefined : 'none'}
              aria-hidden={!drawn}
              data-edge-drawn={drawn ? 'true' : 'false'}
              className="architecture-stroke"
              style={{ opacity: !drawn ? 0 : receded ? RECEDED_STROKE_OPACITY : 1 }}
              data-edge-kind={edge.kind}
              data-edge-violated={violated ? 'true' : undefined}
              data-edge-from={edge.from}
              data-edge-to={edge.to}
              data-edge-count={edge.count}
              data-edge-track-offset={trackOffset}
            />
            </Fragment>
          );
        })}

        {/* Every stroke says its sentence at rest, in the dock's own strings; one with no room is held, never cropped, and says why in `data-edge-sentence`. */}
        {sentences.map((sentence) => {
          const edge = graph.edges.find(
            (e) => e.kind === sentence.kind && e.from === sentence.from && e.to === sentence.to,
          );
          const drawnStroke = edge !== undefined && visibleEdges.includes(edge);
          const receded =
            selected !== null && selected !== sentence.from && selected !== sentence.to;
          const violated = violatedPairs.has(sentence.key);
          const shown = sentence.hidden === undefined && drawnStroke;
          return (
            <text
              key={`sentence-${sentence.kind}-${sentence.key}`}
              x={sentence.x}
              y={sentence.y}
              textAnchor={sentence.anchor}
              className={cn(
                'architecture-stroke text-caption',
                violated
                  ? 'fill-[color:var(--color-danger-text)]'
                  : sentence.kind === 'traffic'
                    ? 'fill-[color:var(--color-text-secondary)] tabular-nums'
                    : 'fill-[color:var(--color-text-tertiary)]',
              )}
              style={{ opacity: !shown ? 0 : receded ? RECEDED_STROKE_OPACITY : 1 }}
              aria-hidden={!shown}
              data-testid={`architecture-edge-sentence-${sentence.from}-${sentence.to}`}
              data-edge-sentence={sentence.hidden ?? (drawnStroke ? 'drawn' : 'held')}
              data-edge-sentence-kind={sentence.kind}
            >
              {sentence.text}
            </text>
          );
        })}

        {graph.boxes.map((box, boxIndex) => {
          const at = placed.get(box.id);
          const observedAt = observedPlaced.get(box.id);
          if (!at) return null;
          const isSelected = selected === box.id;
          const roleState = isSelected
            ? 'selected'
            : pressed === box.id
              ? 'active'
              : hovered === box.id
                ? 'hover'
                : 'rest';
          const receded =
            selected !== null &&
            selected !== box.id &&
            !graph.edges.some(
              (edge) =>
                (edge.from === selected && edge.to === box.id) ||
                (edge.to === selected && edge.from === box.id),
            );
          const counts =
            moduleCounts === null
              ? conceptCountLabel(conceptCounts[box.id] ?? 0)
              : `${moduleCountLabel(moduleCounts[box.id] ?? 0)} · ${conceptCountLabel(
                  conceptCounts[box.id] ?? 0,
                )}`;
          const ledger = ledgers[box.id];
          const contractPortEdges = visibleEdges.filter(
            (edge) => !splitsEvidence || edge.kind === 'permitted',
          );
          const contractIncoming = contractPortEdges.filter((edge) => edge.to === box.id);
          const contractOutgoing = contractPortEdges.filter((edge) => edge.from === box.id);
          const observationIncoming = visibleEdges.filter(
            (edge) => edge.kind === 'traffic' && edge.to === box.id,
          );
          const observationOutgoing = visibleEdges.filter(
            (edge) => edge.kind === 'traffic' && edge.from === box.id,
          );
          const portProps = (lane: 'contract' | 'observation', face: Placed, faceW: number, faceH: number) =>
            ({ axis, at: face, boxW: faceW, boxH: faceH, lane, active: focus === box.id });
          /* Budgeted by characters, because an SVG text node does not wrap or ellipsize. */
          const summary = roleSummary(box.id);
          /* With a ledger every baseline is fixed from the top so the rule lands between declared and counted; without one the block is centred, keeping two-line positions for its budget. */
          const nameY = splitsEvidence
            ? at.y + 23
            : axis === 'down'
              ? at.y + 18
              : ledger
              ? at.y + 21
              : summary === null
                ? at.y + boxH / 2 - 4
                : at.y + boxH / 2 - 4 - ((SUMMARY_LINES - 1) * SUMMARY_LEADING) / 2;
          const countsY = splitsEvidence
            ? at.y + 43
            : axis === 'down'
              ? at.y + 34
              : nameY + 15;
          const summaryLines =
            summary === null
              ? null
              : /* Budgeted by estimated glyph width, so a Korean sentence wraps where it reaches. */
                splitLinesByWidthAt(summary, captionLineRoom(contractBoxW), summaryLineCount, SUMMARY_FONT_PX);

          return (
            <g
              key={box.id}
              role="button"
              pointerEvents="all"
              tabIndex={0}
              aria-pressed={isSelected}
              aria-controls="architecture-inspector"
              aria-expanded={isSelected && roleInspectorOpen}
              aria-label={[
                roleLabel(box.id),
                summary,
                counts,
                ledger ? ledgerStatusLabel(ledger) : null,
                ledger ? ledgerImportsLabel(ledger.importsOut) : null,
                /* Before any inspection the empty state says it once, not in every role's name. */
                splitsEvidence && !ledger && !observationEmpty ? observationMissingLabel : null,
              ]
                .filter((part): part is string => part !== null)
                .join(' · ')}
              data-graph-box={box.id}
              /* The drawn size, stated for tests and probes, since the box is one filled path. */
              data-box-height={boxH}
              data-box-width={contractBoxW}
              data-architecture-role-state={roleState}
              data-testid={`architecture-graph-box-${box.id}`}
              onClick={(event) => {
                if (swallowClick.current) {
                  swallowClick.current = false;
                  return;
                }
                onSelect(box.id, event.currentTarget);
              }}
              onPointerDown={() => setPressed(box.id)}
              onPointerUp={() => setPressed(null)}
              onPointerCancel={() => setPressed(null)}
              onPointerEnter={() => setHovered(box.id)}
              onPointerLeave={() => setHovered((at) => (at === box.id ? null : at))}
              onFocus={() => setHovered(box.id)}
              onBlur={() => setHovered((at) => (at === box.id ? null : at))}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(box.id, event.currentTarget);
                }
              }}
              style={{ opacity: receded ? RECEDED_ROLE_OPACITY : 1 }}
              className="architecture-recede architecture-role-reveal cursor-pointer outline-none [&:focus-visible_.architecture-node-face]:stroke-[color:var(--color-indigo-focus-ring)] [&:focus-visible_.architecture-node-face]:[stroke-width:2px]"
            >
              {/* A transparent first rect makes the whole two-face role footprint the hit target, so pointer automation aimed at the group's centre lands on it. */}
              <rect
                x={at.x}
                y={at.y}
                width={
                  usesPairedDown && !observationEmpty
                    ? contractBoxW + pairedGutterW + observationBoxW
                    : contractBoxW
                }
                height={
                  splitsEvidence && !usesPairedDown && !observationEmpty
                    ? observationOffset + observationBoxH
                    : boxH
                }
                fill="transparent"
                stroke="none"
                pointerEvents="all"
                data-architecture-role-hit-area="true"
              />
              {/* One face for every role; position already says where a chain begins. */}
              <rect
                x={at.x}
                y={at.y}
                width={contractBoxW}
                height={boxH}
                rx={12}
                fill={
                  isSelected
                    ? 'var(--color-indigo-a12)'
                    : roleState === 'active'
                      ? 'var(--color-indigo-a06)'
                      : roleState === 'hover'
                        ? 'var(--color-elevated)'
                        : 'var(--color-panel)'
                }
                stroke={isSelected ? 'var(--color-indigo-accent)' : 'var(--color-architecture-sketch-ink)'}
                strokeWidth={isSelected ? 1.6 : 1}
                className="architecture-canvas-node architecture-node-face"
                data-node-selected={isSelected ? 'true' : 'false'}
              />
              {usesPairedDown && contractPortEdges.some((edge) => edge.columnSpan > 1 && (edge.from === box.id || edge.to === box.id)) ? (
                <ConnectionPort {...portProps('contract', at, contractBoxW, boxH)} direction="outgoing" side="left" />
              ) : null}
              {contractIncoming.length > 0 ? (
                <ConnectionPort {...portProps('contract', at, contractBoxW, boxH)} direction="incoming" />
              ) : null}
              {contractOutgoing.length > 0 ? (
                <ConnectionPort {...portProps('contract', at, contractBoxW, boxH)} direction="outgoing" />
              ) : null}
              {splitsEvidence ? (
                <text
                  x={at.x + 14}
                  y={at.y + 17}
                  textAnchor="start"
                  aria-hidden
                  data-testid={`architecture-role-index-${box.id}`}
                  className={cn(
                    'architecture-node-copy font-mono text-caption tabular-nums',
                    isSelected
                      ? 'fill-[color:var(--color-indigo-text-soft)]'
                      : 'fill-[color:var(--color-text-quaternary)]',
                  )}
                >
                  {String(boxIndex + 1).padStart(2, '0')}
                </text>
              ) : null}
              <text
                x={at.x + contractBoxW / 2}
                y={nameY}
                textAnchor="middle"
                className="fill-[color:var(--color-text-primary)] text-body font-[var(--font-weight-strong)]"
              >
                {roleLabel(box.id)}
              </text>
              <text
                x={at.x + contractBoxW / 2}
                y={countsY}
                textAnchor="middle"
                className={cn(
                  'text-label fill-[color:var(--color-text-tertiary)]',
                  summaryLines === null && 'tabular-nums',
                )}
                data-testid={`architecture-box-line-${box.id}`}
              >
                {/* A cut caption still carries its whole sentence for hover and assistive readers. */}
                {summaryLines !== null && summary !== null && summaryLines.some((line) => line.endsWith('…')) ? (
                  <title>{summary}</title>
                ) : null}
                {summaryLines === null
                  ? counts
                  : summaryLines.map((line, index) => (
                      <tspan
                        key={index}
                        x={at.x + contractBoxW / 2}
                        y={countsY + index * SUMMARY_LEADING}
                      >
                        {line}
                      </tspan>
                    ))}
              </text>
              {!splitsEvidence && ledger ? (
                <>
                  {/* A ruled line between what the profile declares (above) and what the scanner counted (below). */}
                  <line
                    x1={at.x + 12}
                    x2={at.x + contractBoxW - 12}
                    y1={axis === 'down' ? at.y + 46 : at.y + 58}
                    y2={axis === 'down' ? at.y + 46 : at.y + 58}
                    stroke="var(--color-divider)"
                    strokeWidth={1}
                  />
                  <text
                    x={at.x + contractBoxW / 2}
                    y={axis === 'down' ? at.y + 59 : at.y + 71}
                    textAnchor="middle"
                    className={cn(
                      'text-caption tabular-nums',
                      ledger.state === 'violated'
                        ? 'fill-[color:var(--color-text-secondary)]'
                        : 'fill-[color:var(--color-text-quaternary)]',
                    )}
                    data-testid={`architecture-role-ledger-${box.id}`}
                    data-ledger-state={ledger.state}
                  >
                    {`${LEDGER_GLYPH[ledger.state]} ${ledgerStatusLabel(ledger)} · ${ledgerImportsLabel(
                      ledger.importsOut,
                    )}`}
                  </text>
                </>
              ) : null}
              {splitsEvidence && observedAt && !observationEmpty ? (
                <g className="architecture-observation-reveal">
                  <line
                    x1={usesPairedDown ? at.x + contractBoxW + 8 : at.x + contractBoxW / 2}
                    x2={usesPairedDown ? observedAt.x - 8 : at.x + contractBoxW / 2}
                    y1={usesPairedDown ? at.y + boxH / 2 : at.y + boxH + 6}
                    y2={usesPairedDown ? at.y + boxH / 2 : observedAt.y - 6}
                    stroke="var(--color-divider)"
                    strokeWidth={1}
                    strokeDasharray="2 4"
                    data-testid={`architecture-delta-connector-${box.id}`}
                    data-delta-state={ledger?.state ?? 'missing'}
                  />
                  {usesPairedDown ? (
                    <text
                      x={at.x + contractBoxW + pairedGutterW / 2}
                      y={at.y + boxH / 2 + 4}
                      textAnchor="middle"
                      className={cn(
                        'text-body font-[var(--font-weight-emphasis)]',
                        ledger?.state === 'violated'
                          ? 'fill-[color:var(--color-danger-text)]'
                          : 'fill-[color:var(--color-text-secondary)]',
                      )}
                      data-testid={`architecture-delta-marker-${box.id}`}
                      data-delta-state={ledger?.state ?? 'missing'}
                      role="img"
                      aria-label={ledger ? ledgerStatusLabel(ledger) : deltaUnknownLabel}
                    >
                      {/* The tick is scoped: like the role face (`role-ledger.ts`), it carries the edge-shaped sentence, so it never reads as a per-role verdict. */}
                      <title>{ledger ? ledgerStatusLabel(ledger) : deltaUnknownLabel}</title>
                      {ledger ? LEDGER_GLYPH[ledger.state] : '○'}
                    </text>
                  ) : (
                    <circle
                      cx={at.x + contractBoxW / 2}
                      cy={(at.y + boxH + observedAt.y) / 2}
                      r={2.5}
                      fill={ledger ? EDGE_STROKE : 'var(--color-canvas)'}
                      stroke={ledger ? EDGE_STROKE : 'var(--color-text-quaternary)'}
                      strokeWidth={1}
                    />
                  )}
                  {usesPairedDown ? (
                    <line
                      x1={at.x + contractBoxW + 8}
                      x2={observedAt.x - 8}
                      y1={at.y + boxH / 2}
                      y2={at.y + boxH / 2}
                      stroke="var(--color-indigo-accent)"
                      strokeWidth={1.5}
                      className="architecture-selection-trace"
                      data-selected={isSelected ? 'true' : 'false'}
                      data-testid={`architecture-selection-trace-${box.id}`}
                      aria-hidden
                    />
                  ) : null}
                  <rect
                    x={observedAt.x}
                    y={observedAt.y}
                    width={observationBoxW}
                    height={observationBoxH}
                    rx={12}
                    fill={
                      isSelected
                        ? 'var(--color-indigo-a08)'
                        : roleState === 'active'
                          ? 'var(--color-indigo-a06)'
                          : roleState === 'hover'
                            ? 'var(--color-overlay-2)'
                            : 'var(--color-overlay-1)'
                    }
                    stroke={
                      ledger?.state === 'violated'
                        ? 'var(--color-danger-text)'
                        : isSelected
                          ? 'var(--color-indigo-a30)'
                          : 'var(--color-divider)'
                    }
                    strokeWidth={1}
                    strokeDasharray={ledger ? undefined : '4 4'}
                    className="architecture-node-face"
                    data-testid={`architecture-observation-box-${box.id}`}
                    data-observation-state={ledger?.state ?? 'missing'}
                  />
                  {usesPairedDown && visibleEdges.some((edge) => edge.kind === 'traffic' && edge.columnSpan > 1 && (edge.from === box.id || edge.to === box.id)) ? (
                    <ConnectionPort {...portProps('observation', observedAt, observationBoxW, observationBoxH)} direction="outgoing" side="right" />
                  ) : null}
                  {observationIncoming.length > 0 ? (
                    <ConnectionPort {...portProps('observation', observedAt, observationBoxW, observationBoxH)} direction="incoming" />
                  ) : null}
                  {observationOutgoing.length > 0 ? (
                    <ConnectionPort {...portProps('observation', observedAt, observationBoxW, observationBoxH)} direction="outgoing" />
                  ) : null}
                  <text
                    x={observedAt.x + observationBoxW / 2}
                    y={
                      usesPairedDown
                        ? observedAt.y + observationBoxH / 2 + 4
                        : observedAt.y + 32
                    }
                    textAnchor="middle"
                    className={cn(
                      usesPairedDown ? 'text-label tabular-nums' : 'text-caption tabular-nums',
                      ledger?.state === 'violated'
                        ? 'fill-[color:var(--color-text-secondary)]'
                        : 'fill-[color:var(--color-text-quaternary)]',
                    )}
                    data-testid={
                      ledger
                        ? `architecture-role-ledger-${box.id}`
                        : `architecture-role-observation-${box.id}`
                    }
                    data-ledger-state={ledger?.state}
                  >
                    {/* Only a role missing from a receipt others carry reaches here. */}
                    {ledger
                      ? ledgerImportsLabel(ledger.importsOut)
                      : usesPairedDown
                        ? observationMissingLabel
                        : `○ ${observationMissingLabel}`}
                  </text>
                </g>
              ) : null}
            </g>
          );
        })}
        </svg>
      </div>
      {/* The below count overlays the bottom fade instead: a row there would take the height it counts against. The strip is two insets tall (coveredMask) so the badge covers no opaque ink. */}
      {covered.coveredDown && covered.hiddenRight > 0 ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-2 flex items-center justify-center px-[var(--card-pad)]">
          <span
            className={HIDDEN_COUNT_BADGE_CLASS}
            data-testid="architecture-canvas-hidden-below"
          >
            {hiddenBelowLabel(covered.hiddenRight)}
          </span>
        </div>
      ) : null}
    </div>
  );
}
