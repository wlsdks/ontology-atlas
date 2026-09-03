"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { listboxBottomIsHidden, listboxTopIsHidden } from '@/shared/ui/select-growth';

import { cn } from '@/shared/lib/cn';
import { badgeClass } from '@/shared/ui/badge-class';

import type { ArchitectureGraph as Graph, GraphBoxShape } from '../model/graph-layout';
import type { RoleLedger } from '../model/role-ledger';
import { placeEdgeSentences, type SentenceEdge } from '../model/edge-sentences';
import { captionLineRoom, splitSummaryLinesByWidth } from '../model/summary-lines';

/* Geometry. One place, so the drawing can be reasoned about without reading the JSX. */
/**
 * ⚠️ **One value for every stroke, named once.** Measured at 1512 on the installed app,
 * translucent indigo at a hairline remained below the 3:1 adjacent-mark threshold on the solid
 * canvas. The brand step clears it, while selection keeps the brighter accent. A legend row must
 * name a mark that is on the screen (`docs/AGENT-DESIGN-METHOD.md`), so both sides read this.
 */
export const EDGE_STROKE = 'var(--color-indigo-brand)';
/**
 * ⚠️ **A violation is the one thing on this canvas that is not indigo.** The design system runs on
 * neutrals plus one indigo and a violated edge would normally be a shape, not a colour — but the
 * receipt's own verdict already owns a signal tone on this screen (`RECORD_TONE_CLASS.violated`),
 * and the pill saying "Violated · 2" while the drawing paints those two edges exactly like every
 * conforming one is the contradiction fable measured on 2026-08-30. Same tone as the pill, plus a
 * dash, so it survives without colour too.
 */
export const VIOLATED_STROKE = 'var(--color-danger-text)';

const BOX_W = 148;
/**
 * The wide-workbench face. The compact width remains the fallback at tablet/laptop boundaries and
 * for a role set that would no longer fit after expansion; spacious canvases no longer leave a
 * four-role contract occupying less than one fifth of the available plane.
 */
const BOX_W_ROOMY = 220;
const BOX_H_ROOMY = 84;
const OBSERVATION_BOX_H = 44;
const OBSERVATION_LANE_GAP = 48;
/*
 * ⚠️ **The ledger widens the box as well as deepening it.** Measured 2026-08-30 at 1512 and 1920:
 * the receipt line renders 144–156px against 132px of usable width inside a 148px box, so the
 * sentence crossed both outlines. Widening to 180 clears the longest measured line in both
 * locales, and keeps the seven-role chain horizontal at 1920 — 1628px of drawing against 1756px of
 * canvas — which is what stops it from falling back to the vertical axis a short panel would clip.
 */
const BOX_W_LEDGER = 180;
/** Split contract/observation faces may yield this far once their long receipt line is separate. */
const BOX_W_LEDGER_FIT = 160;
const BOX_W_LEDGER_ROOMY = 240;
/**
 * ⚠️ **Two heights, because a box only grows when it has something more to say.** A role that
 * carries a measured ledger line needs the room; one with no receipt behind it must stay the size
 * it was, or a browser — where source cannot be listed at all — pays 20px per role for a blank
 * row. Direction B, 2026-08-29.
 */
const BOX_H = 72;
/*
 * ⚠️ **The receipt is one line; the sentence is two; the rows close up to pay for it** (Direction
 * C, 2026-08-30). The first ledger attempt gave the *receipt* two lines and an 82px box, and with
 * 26px gaps the chain ran 778px against roughly 718px of canvas: Shared foundation, the role every
 * arrow points at, was cut in half below the fold. The receipt went back to one line and the box
 * to 74. Then the one-line *sentence* cut all seven of the profile's role summaries before their
 * first clause carried meaning, which the record that put it there had named as its own falsifier.
 * So the box is 82 again, but the second line is the sentence's, and the row gap gives up 6px so
 * seven rows still clear a 1512×945 viewport with the inspector open: 7×82 + 6×12 + 2×20 = 686.
 * Gate: `tests/e2e/architecture-role-ledger.spec.ts`, which fails at 90px.
 */
const BOX_H_LEDGER = 82;
const ROW_GAP_LEDGER = 12;
/** How far apart two crossings of the same span sit, so a bundle reads as separate strokes. */
const SKIP_LANE_STEP = 14;
/**
 * How many caption lines a role's sentence may take. How many characters each line holds is not a
 * constant any more: `captionLineBudgets` reads it off the box, because a stadium's second line
 * has less room than its first (owner, 2026-08-30: the Adapters pill's caption crossed its caps).
 */
const SUMMARY_LINES = 2;
/** One caption line to the next, in SVG units: the `--leading-caption` pair of `text-caption`. */
const CAPTION_LEADING = 14;

/**
 * ⚠️ **Shapes, not colour.** This design system runs on neutrals plus one indigo, and status
 * colour would be a second colour system — a rule change to request, never one to assume. The
 * glyphs are the achromatic ones already legible at the caption step: a tick for clean, a slashed
 * circle where a role's own edges break its rules, a hollow circle where no source matched it.
 */
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
/*
 * Direction C — the dual evidence ladder selected on 2026-09-02. A downward chain is no longer
 * one compressed card pretending reviewed intent and source observation are the same thing.
 * These three widths are the selected structure: contract, comparison gutter, observation.
 */
const PAIRED_CONTRACT_W = 280;
const PAIRED_GUTTER_W = 72;
const PAIRED_OBSERVATION_W = 240;
/*
 * ⚠️ **The connector gap carries a sentence now.** The adjacent rule's sentence sits beside the
 * arrow it describes (measured 2026-09-03: the left-lane sentence ended 160px from its arrow and
 * read as a floating caption). A 12px caption line with 4px of air on each side needs 20px; four
 * more keep the rectangle clear of both faces under the collision pad.
 */
const PAIRED_ROW_GAP = 24;
/*
 * ⚠️ **The ladder yields its own spare height before it hides a role.** Measured 2026-09-03 at
 * 1280x800: the canvas column is 638px tall while the roomy rows ask for 684, so the seventh role
 * fell past the fold and the widest laptop the product ships to answered with "1 more below". The
 * faces keep their 280/72/240 widths, because the side-by-side comparison is the whole structure;
 * the row gives up its second summary line instead. 58px of face, and a 22px gap: the narrowest a
 * 12px sentence rectangle clears with the 4px collision pad on both sides. 20 leaves only 3px
 * under the words, and `placeEdgeSentences` drops the rule sentence as a collision, which is the
 * opposite of what the tighter rows are for. Seven roles: 4 + 20 + 7x58 + 6x22 + 4 = 566.
 */
const PAIRED_ROW_GAP_TIGHT = 22;
const PAIRED_PAD_Y_TIGHT = 4;
const BOX_H_PAIRED_TIGHT = 58;
/*
 * ⚠️ **Receding must leave the words readable.** At 0.35 a non-selected role title measured
 * 3.02:1 and its sentence 1.7:1; at 0.18 the unrelated edge sentences measured 1.23:1 — four of
 * seven roles became unreadable the moment one was chosen (2026-09-03). The selected pair is
 * emphasised by its indigo face and stroke, so the rest only needs to step back, not vanish:
 * 0.65 keeps a receded title above 7:1 and its sentence above 3:1 on the canvas ground.
 */
/* Re-measured 2026-09-03 after the first pass: 0.65/0.55 still left a receded index at 2.8:1 and
   a receded sentence at 2.6:1. 0.7 keeps every receded word at or above 3:1 while the selected
   pair still wins through its indigo face and stroke. */
const RECEDED_ROLE_OPACITY = 0.7;
const RECEDED_STROKE_OPACITY = 0.7;
const PAIRED_HEADER_H = 20;
const PAIRED_PAD_Y = 8;
/* Long edge sentences and focused skip arcs share one bounded outside lane on each side. */
const PAIRED_SIDE_ROOM = 180;
/*
 * ⚠️ **The ladder needs its faces, not its full side lanes.** A 1112px tablet gave the canvas
 * 984px; the ladder asked for 1008 and the drawing fell back to 148px combined boxes with every
 * summary and sentence cut (re-audit, 2026-09-03). The side lanes only hold skip arcs revealed on
 * selection and their sentences, which are stated as held when they have no room, so the ladder
 * may take a canvas as narrow as its faces plus this much lane on each side.
 */
const PAIRED_SIDE_ROOM_MIN = 48;
/** The most ground the observation lane takes for its arcs and sentences when the canvas has it. */
const PAIRED_TRAIL_ROOM_MAX = 360;
/* The two lanes' adjacent sentences share the gutter row gap from opposite ends; this keeps a
   rule sentence and a count sentence apart even when both are long. */
const GAP_BETWEEN_LANE_SENTENCES = 24;
const PAIRED_FIXED_W =
  PAD_X * 2 + PAIRED_CONTRACT_W + PAIRED_GUTTER_W + PAIRED_OBSERVATION_W;
const PAIRED_MIN_W = PAIRED_FIXED_W + PAIRED_SIDE_ROOM_MIN * 2;
/*
 * ⚠️ **A scrollbar for empty ground is noise.** Measured 2026-08-30 at 1440×900: the chain fit but
 * the drawing's own bottom padding did not, so the canvas scrolled 13px and showed a bar for dot
 * field nobody needs to reach. With a ledger the boxes already carry their own breathing room, so
 * the field around them gives some back.
 *
 * Measured again 2026-08-30 in the installed app at a 1512x949 window (a 917px WebView, the
 * title bar takes 32): the seven-role chain drew 686px into a 682px canvas and the same bar
 * came back for 4px of canvas ground. 12px at each end makes the drawing 670px, which with
 * the 235px of chrome above and below the canvas keeps the chain whole down to a 905px WebView,
 * every window the 14-inch display can hold with the menu bar shown.
 */
const PAD_Y_LEDGER = 12;
/** How far past the lane a skip swings, and how much deeper each further rank pushes it. */
const SKIP_DROP = 30;
const SKIP_STEP = 10;
/*
 * ⚠️ **Every stroke at rest says its sentence** (Direction B, owner, 2026-08-30). The room the
 * sentences take is measured from the sentences: left of a downward column as wide as the longest
 * adjacent sentence needs (capped), above an across chain two tiers deep, and past the deepest
 * arc where skips carry theirs. The same 4.7px glyph the box captions budget with.
 */
const SENTENCE_LEAD_MAX = 380;
const SENTENCE_TOP_ROOM = 44;
const SENTENCE_TRAIL_ROOM = 260;
const SENTENCE_CHAR_PX = 4.7;

/**
 * ⚠️ **Which way the chain runs.** The drawing had one axis, so a seven-role profile was always a
 * 1404px row that no column could hold — which is why the canvas had to be a band, and why the
 * drawing got a fifth of the window (owner, 2026-08-28: *"it should not always be that
 * horizontal-scrolling shape — sometimes three things join into one going down, sometimes it
 * should be tall"*). The same seven roles laid out downward are 148 wide and 616 tall.
 *
 * Turning the chain is only useful once the canvas has height to turn into, which is why this
 * arrives after the frame rather than with it.
 */
export type FlowAxis = 'across' | 'down';

/** Rank runs along the axis; lane is the offset across it. */
function place(
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

/**
 * A port is the point where a real, currently drawn dependency meets a role face. It carries no
 * new topology: callers create one only when a visible edge actually enters or leaves that side.
 * The hollow-to-solid change mirrors focus without becoming a second selection colour.
 */
function ConnectionPort({
  axis,
  at,
  boxW,
  boxH,
  direction,
  active,
  tone,
  lane,
  side,
}: {
  axis: FlowAxis;
  at: Placed;
  boxW: number;
  boxH: number;
  direction: 'incoming' | 'outgoing';
  active: boolean;
  tone: string;
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
      fill={active ? tone : 'var(--color-canvas)'}
      stroke={tone}
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
 * The architecture, drawn.
 *
 * ⚠️ **The stroke says where the fact came from.** This screen carries two kinds of claim and has
 * always taken care not to let them read alike: a reviewed profile is what a person declared, and
 * measured traffic is what the scanner counted. Both used to be indigo strokes told apart only by
 * a legend sentence. Here the hand does it — **a declared rule is drawn with an unsteady human
 * line, an observation with an exact machine one** — so the difference survives being glanced at.
 *
 * ⚠️ **Shapes are ISO 5807's**, assigned from the declared graph in `buildArchitectureGraph`: a
 * terminator (stadium) at either end of the chain, a rectangle for a unit of work. The standard's
 * diamond and parallelogram stay unused because this drawing has no branch and no input step.
 *
 * One `<svg>` holds everything. The previous attempt put DOM boxes under an SVG overlay and spent
 * three rounds fighting the seam between them; a drawing is one artifact, and every mark here is
 * placed by the same arithmetic.
 */
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
  contractTrackLabel,
  observationTrackLabel,
  deltaTrackLabel,
  observationMissingLabel,
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
  /**
   * What each role's own outgoing edges did, or `{}` where no measurement exists. Empty is the
   * honest state, not a zero row: a box with nothing measured behind it says nothing.
   */
  ledgers: Readonly<Record<string, RoleLedger>>;
  /**
   * The profile's own one-line sentence for a role, or null where it declared none.
   *
   * ⚠️ **A box says what a role *is* before anybody clicks it** (2026-08-30, after studying an
   * MIT-licensed reference the owner pointed at: every node there carries a summary, and that is
   * what makes its graph read like prose instead of a wiring diagram). The sentence is the
   * reviewed profile's own — nothing is inferred — and it takes the line the counts had, because a
   * count of zero is the loudest thing a quiet box can say and this file already refuses to print
   * one for modules.
   */
  roleSummary: (id: string) => string | null;
  /**
   * `from>to` for every crossing the receipt counted as a violation.
   *
   * ⚠️ **The pill said "Violated · 2" and the drawing showed no violation at all** (judged
   * 2026-08-30). Both violating edges were skips, which the canvas holds back until a role is
   * chosen, and even then they were painted in the same indigo as every conforming stroke. A
   * violation is the one fact this drawing exists to surface, so it is never held back and never
   * wears the conforming stroke.
   */
  violatedPairs: ReadonlySet<string>;
  /** The sentence a stroke states, the same string the dock printed: rule, count, or violation. */
  edgeSentence: (edge: SentenceEdge) => string;
  /** The ledger's first half, already worded by the locale — never assembled here. */
  ledgerStatusLabel: (ledger: RoleLedger) => string;
  ledgerImportsLabel: (count: number) => string;
  contractTrackLabel: string;
  observationTrackLabel: string;
  deltaTrackLabel: string;
  observationMissingLabel: string;
  /** "N more to the right" — the count is derived, so the screen never guesses. */
  hiddenRightLabel: (count: number) => string;
  /** The same for the side a pan pushes roles off. */
  hiddenLeftLabel: (count: number) => string;
  /** And the same two again for a chain that is cut top and bottom rather than left and right. */
  hiddenAboveLabel: (count: number) => string;
  hiddenBelowLabel: (count: number) => string;
}) {
  /*
   * ⚠️ **The axis is measured, not configured.** A profile is drawn across while it fits across and
   * down once it does not. Derived from the measured box rather than stored, so it can never
   * disagree with the width the drawing is actually given, and so no effect has to correct state
   * after the fact.
   */
  const [boxWidth, setBoxWidth] = useState(0);
  /*
   * ⚠️ **The chain does not turn under a click** (2026-08-30). At 1920 the seven-role chain runs
   * across; choosing a role opens the inspector beside the canvas, the canvas loses 380px, and
   * the drawing that was measured against the narrower box turned into a column — every box,
   * every sentence and every arc moved the moment a reader pointed at one of them. The axis is
   * still measured, but against the width the canvas has *at rest*: a selection may narrow the
   * canvas and cut the chain (the fade, the count and the pan say so), it may not turn it. The
   * chosen box is scrolled into view instead.
   */
  const [restWidth, setRestWidth] = useState(0);
  /*
   * ⚠️ **The comparison ladder is chosen by the height it needs, not by whether seven boxes could
   * squeeze across.** Measured 2026-09-03 at 1920×1080: "across while it fits across" drew the
   * chain as 151px cards, 205px of ink in a 918px canvas, every role sentence cut to "…" and the
   * lane labels repeated fourteen times — the widest screen showed the least. The 2026-09-03
   * comparison-workbench record decided the 280/72/240 rows; this reads the canvas height at
   * rest (the column that holds both the canvas and its hidden-count row, so a count appearing
   * cannot flip the axis) and prefers those rows whenever they fit. Across remains the answer for
   * a canvas too short for the rows, and for profiles with parallel lanes.
   */
  const [restHeight, setRestHeight] = useState(0);
  /*
   * ⚠️ **One height for every box, not one per box.** A ledger exists per role, but a chain whose
   * boxes are two different heights reads as two kinds of thing rather than as one row of roles —
   * and the lane arithmetic below assumes a single box height everywhere. So the drawing grows when
   * the profile has a measurement at all, and every role grows with it; a role with no receipt
   * simply leaves its third line empty rather than shrinking out of the row.
   */
  const hasLedger = graph.boxes.some((box) => ledgers[box.id] !== undefined);
  const compactBoxW = hasLedger ? BOX_W_LEDGER : BOX_W;
  const roomyBoxW = hasLedger ? BOX_W_LEDGER_ROOMY : BOX_W_ROOMY;
  const ranks = graph.columns;
  const lanes = graph.boxes.reduce((most, box) => Math.max(most, box.slot + 1), 1);
  const naturalAcross = PAD_X * 2 + ranks * compactBoxW + (ranks - 1) * COL_GAP;
  const axisWidth = restWidth > 0 ? restWidth : boxWidth;
  const pairedNaturalH =
    PAIRED_PAD_Y * 2 + PAIRED_HEADER_H + ranks * BOX_H + (ranks - 1) * PAIRED_ROW_GAP;
  /* The same rows with one summary line each. Fixed-readable faces and connector space yield with
     the canvas before any role is hidden, so a canvas too short for the roomy rows still gets the
     comparison rather than a compressed across chain with a hidden-role count under it. */
  const pairedTightH =
    PAIRED_PAD_Y_TIGHT * 2 +
    PAIRED_HEADER_H +
    ranks * BOX_H_PAIRED_TIGHT +
    (ranks - 1) * PAIRED_ROW_GAP_TIGHT;
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
  /* An opening dock first eases each face within a bounded readable range, keeping the 52px
     sentence handoff intact. Only after the faces reach that floor may the connector gap yield.
     Because boxWidth follows the grid's transition, this is continuous rather than a size snap. */
  const fittedAcrossBoxW =
    ranks > 0 && boxWidth > 0
      ? (boxWidth - PAD_X * 2 - (ranks - 1) * COL_GAP) / ranks
      : preferredBoxW;
  const minimumAcrossBoxW = hasLedger ? BOX_W_LEDGER_FIT : BOX_W;
  const boxW =
    axis === 'across'
      ? Math.max(minimumAcrossBoxW, Math.min(preferredBoxW, fittedAcrossBoxW))
      : preferredBoxW;
  const usesPairedDown = axis === 'down' && lanes === 1 && axisWidth >= PAIRED_MIN_W;
  /*
   * Which of the two ladder densities this canvas can hold. Below xl `restHeight` is 0 and the
   * roomy rows stand, exactly as before; the tight rows are the answer only where the canvas was
   * measured, the roomy rows do not fit it, and the tight ones do. When even those do not fit,
   * the hidden-count row and the scroller stay the honest fallback.
   */
  const ladderDensity: 'roomy' | 'tight' =
    usesPairedDown && restHeight > 0 && restHeight < pairedNaturalH && restHeight >= pairedTightH
      ? 'tight'
      : 'roomy';
  const usesTightLadder = usesPairedDown && ladderDensity === 'tight';
  const splitsEvidence = (axis === 'across' && axisWidth > 0) || usesPairedDown;
  const contractBoxW = usesPairedDown ? PAIRED_CONTRACT_W : boxW;
  const observationBoxW = usesPairedDown ? PAIRED_OBSERVATION_W : boxW;
  const rowGap = usesPairedDown
    ? usesTightLadder
      ? PAIRED_ROW_GAP_TIGHT
      : PAIRED_ROW_GAP
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
  const boxH = usesRoomyBoxes
    ? BOX_H_ROOMY
    : usesPairedDown
      ? usesTightLadder
        ? BOX_H_PAIRED_TIGHT
        : BOX_H
    : axis === 'down'
      ? 64
      : hasLedger
        ? BOX_H_LEDGER
        : BOX_H;
  /* The tight row pays for its height with the sentence's second line, not with its face width:
     one line of summary keeps every role's first clause, which cutting the faces would not. */
  /* The observation face is exactly its row: a 64px face in a 72px row gave the two lanes
     different arrow lengths and put their sentences on different baselines (owner, 2026-09-03),
     and on the tight ladder it closed the gap its count sentence needs. */
  const observationBoxH = usesPairedDown ? boxH : OBSERVATION_BOX_H;
  const summaryLineCount =
    usesTightLadder || (axis === 'down' && !usesPairedDown) ? 1 : SUMMARY_LINES;
  /* Keep the role faces fixed while a desktop dock opens, but let their empty handoff space absorb
     the reserved width first. This follows the animated grid on every ResizeObserver frame, so the
     chain neither turns nor loses its last role behind a 380px dock at the 1512px app width. */
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
      ? contractBoxW + PAIRED_GUTTER_W
      : 0;

  /*
   * Hover answers locally; selection owns the graph-wide comparison. Letting hover dim the entire
   * canvas made a casual pointer move look like a committed state change.
   */
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
      /* The same rule `visibleEdges` draws by: the spine always, a skip on focus or when violated. */
      drawn:
        edge.columnSpan <= 1 ||
        selected === edge.from ||
        selected === edge.to ||
        violatedPairs.has(`${edge.from}>${edge.to}`),
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
  /*
   * ⚠️ **Side lanes are given where the arcs are.** Two equal 180px lanes left 188px of empty
   * ground on the contract side while three nested observation arcs and their sentences fought
   * for the same 188px on the other side and every sentence was cut (installed app, 1512 with the
   * role dock open, 2026-09-03). The contract lane only needs room when the profile declares a
   * skip; otherwise it keeps the minimum and the observation lane takes the rest, up to a cap.
   */
  const contractNeedsLane = graph.edges.some(
    (edge) => edge.kind === 'permitted' && edge.columnSpan > 1,
  );
  const pairedSlack = usesPairedDown && boxWidth > 0 ? Math.max(0, boxWidth - PAIRED_FIXED_W) : PAIRED_SIDE_ROOM * 2;
  const pairedLeadRoom = contractNeedsLane
    ? Math.max(PAIRED_SIDE_ROOM_MIN, Math.min(PAIRED_SIDE_ROOM, pairedSlack / 2))
    : PAIRED_SIDE_ROOM_MIN;
  const pairedTrailRoom = Math.max(
    PAIRED_SIDE_ROOM_MIN,
    Math.min(PAIRED_TRAIL_ROOM_MAX, pairedSlack - pairedLeadRoom),
  );
  const layoutLeadRoom = usesPairedDown ? pairedLeadRoom : leadRoom;
  const layoutTrailRoom = usesPairedDown ? pairedTrailRoom : trailRoom;

  const placed = useMemo(() => {
    const map = new Map<string, Placed>();
    for (const box of graph.boxes) {
      const at = place(axis, box.column, box.slot, boxH, contractBoxW, rowGap, padY, colGap);
      map.set(box.id, {
        id: box.id,
        x: at.x + (axis === 'down' ? layoutLeadRoom : 0),
        y:
          at.y +
          (axis === 'across' ? layoutLeadRoom : usesPairedDown ? PAIRED_HEADER_H : 0),
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

  /* Where each box ends, in the SVG's own units — which are CSS pixels, because the drawing is no
     longer scaled. Derived, never a ref written during render. */
  const boxEnd = useMemo(
    () => ({
      /*
       * Roomy roles include a lower observation card inside the same interactive group. Counting
       * only the upper contract card said zero hidden roles in a short 1400x400 canvas while all
       * four observation cards were below the viewport. The group is the role; its lowest face is
       * the boundary that the hidden-count affordance must measure.
       */
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
            ? contractBoxW + PAIRED_GUTTER_W + observationBoxW
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
      placed,
      splitsEvidence,
      usesPairedDown,
    ],
  );

  /*
   * ⚠️ **A canvas that scrolls has to say so.** Seven roles do not fit the workbench width, so the
   * last box is simply cut off at the panel edge — and macOS keeps its overlay scrollbar invisible
   * until something moves, so nothing on screen distinguishes "there is more to the right" from
   * "the drawing ends here" (installed app, 2026-08-28). This is the same defect the agent packet
   * had one panel over, on the other axis.
   *
   * The judgment is the repository's existing one rather than a second opinion: those helpers are
   * plain arithmetic over a scroll offset, a client extent and a scroll extent, so the horizontal
   * case passes width where the listbox passes height. The reading is attached to the node itself
   * because an effect fires while the ref is still null -- the mistake this file's sibling panel
   * made twice before a callback ref settled it.
   */
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
    /* A right dock reserves width but must not redefine the architecture. Add the measured sibling
       width back so a role/rules/evidence press keeps the chain's axis; a real window resize still
       changes the sum and may reflow it. Below xl the docks are in document flow and reserve no
       canvas width. */
    const dockWidth = window.matchMedia('(min-width: 1280px)').matches
      ? Math.max(
          document.getElementById('architecture-inspector')?.getBoundingClientRect().width ?? 0,
          document.getElementById('architecture-evidence-dock')?.getBoundingClientRect().width ?? 0,
        )
      : 0;
    setRestWidth(element.clientWidth + dockWidth);
    /*
     * The column around the scroller keeps its height whether or not a hidden-count row is shown,
     * and no dock changes it at xl (docks open beside the canvas, never above it). Below xl the
     * column is content-sized, so its height is the drawing's own and would only ratify whichever
     * axis drew first (review, 2026-09-03: the same 1100px window drew two different chains
     * depending on its history). There the width rule alone decides, deterministically.
     */
    setRestHeight(
      window.matchMedia('(min-width: 1280px)').matches
        ? element.parentElement?.clientHeight ?? element.clientHeight
        : 0,
    );
    /*
     * ⚠️ **Measured along the axis the chain runs.** These readings were written when a drawing
     * could only be cut on the right; a chain that runs down is cut at the bottom instead, and a
     * count that only ever looks sideways is the same defect as one that only ever looked right.
     */
    /*
     * ⚠️ **Whichever axis is actually cut, not whichever the chain runs.** A chain drawn across can
     * still be cut top and bottom in a short window — measured at 1400x400: 87px hidden vertically
     * while every reading looked sideways and reported nothing (2026-08-29). The chain's own axis
     * wins when both overflow, because that is the one a reader is following.
     */
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
      left: listboxTopIsHidden(overflowing, offset),
      right: listboxBottomIsHidden(overflowing, offset, visible, extent),
      /*
       * Counted from the boxes themselves, so the chip states a fact rather than an impression.
       * ⚠️ Both directions. Panning was added before this count was, so dragging the drawing left
       * pushed roles off the left edge with nothing saying so — the very defect the right-hand
       * count exists to prevent, reintroduced on the side nobody had looked at yet (installed app,
       * 2026-08-28).
       */
      /* Along the covered axis, which is not always the axis the boxes were laid out on. */
      coveredDown: down,
      hiddenLeft: alongCovered.filter(
        (end) => end - (down ? boxH : contractBoxW) < offset,
      ).length,
      hiddenRight: alongCovered.filter((end) => end > edge).length,
    });
  }, [axis, boxEnd, boxH, contractBoxW]);
  /*
   * The chosen box is brought into view when the canvas has cut it — a selection that narrows
   * the canvas at 1920 leaves the far end of an across chain behind the fade. Nearest edge only,
   * with time when the reader has not asked for none.
   */
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
          ? contractBoxW + PAIRED_GUTTER_W + observationBoxW
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
  }, [boxH, boxWidth, contractBoxW, observationBoxW, placed, selected, usesPairedDown]);

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
   * ⚠️ **Press and drag pans the canvas.** The drawing keeps its true size, so a wide profile is
   * reachable only by scrolling — and a fresh-eyes walkthrough on 2026-08-28 found that pressing
   * and dragging left `scrollLeft` at 0: the only thing that worked was a horizontal trackpad
   * swipe, which nothing on screen names and a mouse cannot perform at all. Grabbing the canvas is
   * what every node editor does with it.
   *
   * Mouse only. Touch already pans this box natively, and taking pointer capture there would
   * fight the browser rather than help it.
   *
   * A drag must not also select whatever was under the cursor when it started. The threshold is
   * what separates the two: below it the press is still a click, above it the click is swallowed
   * once. This is not drag-only discovery — the count chip says what is off the edge, the wheel
   * still works, and the sentences carry the whole answer without any of it.
   */
  const pan = useRef<{ startX: number; startScroll: number; moved: boolean } | null>(null);
  const swallowClick = useRef(false);
  const PAN_THRESHOLD = 4;

  const onPanStart = (event: React.PointerEvent<HTMLDivElement>) => {
    /*
     * ⚠️ **The flag lives until the next press, not until it is used.** A drag that ends on empty
     * ground produces no click to consume it, so it stayed armed and swallowed the next real one —
     * caught by the gate below, which presses a node right after a drag. The order is fixed:
     * pointerup, then any click, then the next pointerdown, so clearing here can never eat the
     * click the drag is meant to suppress.
     */
    swallowClick.current = false;
    const element = scrollerRef.current;
    if (!element || event.pointerType !== 'mouse' || event.button !== 0) return;
    /* The covered axis, not the chain's — they differ when a chain drawn across is cut by a short
       window, and a drag that only ever moved sideways would do nothing there. */
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
    /* The fade is as wide as this panel's own inset, so the covered edge and the padded edge
       agree rather than each picking a number. */
    const fade = 'var(--card-pad)';
    /*
     * ⚠️ **The strip that carries the count is as tall as the count.** The bottom band used to be
     * one inset like the others, and the count pinned over it stood 28px tall on a 16px fade: a
     * review on 2026-08-30 measured the badge over the last box's receipt line in a short window,
     * which is the covered node the badge exists to avoid. Two insets hold the badge and its air,
     * so nothing under it is still opaque.
     */
    const endFade = covered.coveredDown ? 'calc(var(--card-pad) * 2)' : fade;
    const [from, to] = covered.coveredDown ? ['bottom', 'top'] : ['right', 'left'];
    if (covered.left && covered.right) {
      return `linear-gradient(to ${from}, transparent 0, #000 ${fade}, #000 calc(100% - ${endFade}), transparent 100%)`;
    }
    if (covered.left) return `linear-gradient(to ${from}, transparent 0, #000 ${fade})`;
    if (covered.right) return `linear-gradient(to ${to}, transparent 0, #000 ${endFade})`;
    return undefined;
  })();

  /* At rest the canvas draws the spine. A crossing that skips a column is a fact about one role,
     so it arrives when that role is chosen; the legend says so rather than leaving it a mystery. */
  /**
   * Which lane each skip takes, counted inside its own span so the offsets stay small.
   *
   * Deterministic by construction: the graph's edge order is stable, so the same profile always
   * draws the same bundle in the same order.
   */

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
    const place = (
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
          SKIP_DROP +
          (edge.columnSpan - 2) * SKIP_STEP +
          (skipLane.get(`${edge.from}>${edge.to}`) ?? 0) * SKIP_LANE_STEP +
          (axis === 'across' ? laneBoxH : laneBoxW) / 2,
        leadRoom: layoutLeadRoom,
        trailRoom: layoutTrailRoom,
        skipSide,
        /* On the comparison ladder an adjacent rule's sentence sits beside its own arrow, with
           the half face, the delta gutter and the observation face as its room; the row gap
           between the two faces is clear ground by construction. */
        adjacentSeat: usesPairedDown ? 'connector' : 'lead',
        /* The contract lane reads right over the gutter; the observation lane reads left into the
           gutter, keeping its right side free for the skip arcs. */
        connectorSide: lane === placed ? 'right' : 'left',
        connectorRoom:
          lane === placed
            ? contractBoxW / 2 + PAIRED_GUTTER_W + observationBoxW / 2 - GAP_BETWEEN_LANE_SENTENCES
            : observationBoxW / 2 + PAIRED_GUTTER_W - GAP_BETWEEN_LANE_SENTENCES,
        sentenceOf: edgeSentence,
        focus,
      });
    if (!splitsEvidence) return place(graph.edges, placed, contractBoxW, boxH);
    const rules = place(
      graph.edges.filter((edge) => edge.kind === 'permitted'),
      placed,
      contractBoxW,
      boxH,
      usesPairedDown ? 'negative' : 'positive',
    );
    /* The rule lane places first and holds its ground; a count sentence that would touch a rule
       sentence in the shared gutter gives way. */
    const held = rules.flatMap((placement) => (placement.rect ? [placement.rect] : []));
    return [
      ...rules,
      ...place(
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
    colGap,
    edgeSentence,
    focus,
    graph.edges,
    layoutLeadRoom,
    layoutTrailRoom,
    observationBoxH,
    observationBoxW,
    observedPlaced,
    placed,
    rowGap,
    skipLane,
    splitsEvidence,
    toSentenceEdge,
    usesPairedDown,
  ]);

  const visibleEdges = graph.edges.filter(
    (edge) =>
      edge.columnSpan <= 1 ||
      selected === edge.from ||
      selected === edge.to ||
      violatedPairs.has(`${edge.from}>${edge.to}`),
  );
  /*
   * ⚠️ Reserve room for the skips that are actually drawn, not for the ones that could be. The
   * first cut always added the deepest possible swing, so at rest — where no skip is drawn at all
   * — the canvas ended in 180px of empty ground (installed app, 2026-08-28). The drawing grows
   * when a selection reveals a skip and shrinks back when it is let go.
   */
  /*
   * ⚠️ **The room depends on the profile, not on the selection.** Reading it off the *visible*
   * edges made the canvas grow the moment a role was chosen, and the second fresh-eyes
   * walkthrough measured what that costs: everything below shifted down, and the right column's
   * readable height fell from 456px to 406px, cutting a closing sentence that had fit a moment
   * earlier. A page that moves under a click is a worse defect than a canvas with space in it —
   * and on a dotted ground that space reads as canvas rather than as a gap, which is the whole
   * reason node editors draw one.
   */
  const deepestSkip = graph.edges.reduce((most, edge) => Math.max(most, edge.columnSpan), 0);
  const skipRoom = deepestSkip <= 1 ? 0 : SKIP_DROP + deepestSkip * SKIP_STEP;
  /* Ranks run along the axis and lanes across it; the skip swing widens whichever side it leaves. */
  const alongExtent =
    axis === 'across'
      ? PAD_X * 2 + ranks * boxW + (ranks - 1) * colGap
      : padY * 2 + ranks * boxH + (ranks - 1) * rowGap +
        (usesPairedDown ? PAIRED_HEADER_H : 0);
  const acrossExtent =
    axis === 'across'
      ? padY * 2 + lanes * boxH + (lanes - 1) * rowGap + skipRoom + leadRoom + trailRoom
      : PAD_X * 2 +
        lanes * contractBoxW +
        (lanes - 1) * colGap +
        (usesPairedDown ? PAIRED_GUTTER_W + observationBoxW : 0) +
        (usesPairedDown ? 0 : skipRoom) +
        layoutLeadRoom +
        layoutTrailRoom;
  const width = axis === 'across' ? alongExtent : acrossExtent;
  const height = axis === 'across'
    ? acrossExtent + (splitsEvidence ? OBSERVATION_LANE_GAP + observationBoxH : 0)
    : alongExtent;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/*
        ⚠️ **A hidden-role count gets a row, never an overlay.** A fresh-eyes
        walkthrough measured 180px hidden at 700 and 490px at 390 and reported "no scrollbar, no
        fade, no arrow" — after zooming in specifically to check whether the cut edge was an
        intentional mask. The mask is real and measurable; it has nothing to act on, because a fade
        works by dissolving ink and this edge carries a lane surface and a hairline arrow tail. A
        scrollbar is no better: on macOS the overlay one stays hidden until something moves, and
        whether it does at all is the viewer's system setting rather than ours.

        So the screen states a fact it can derive — how many roles end past the visible edge — which
        is the one thing the walker could not tell: that the drawing continues rather than ends. It
        occupies layout only while something is actually hidden. The mask stays because it still
        softens a label clipped mid-character.
      */}
      {covered.hiddenLeft === 0 && covered.hiddenRight === 0 ? null : (
        <div className="flex items-center justify-end gap-2 px-[var(--card-pad)] pt-2.5">
        {covered.hiddenLeft === 0 ? null : (
          <span
            className={badgeClass({
              shape: 'pill',
              className:
                'border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] text-[color:var(--color-text-tertiary)]',
            })}
            data-testid="architecture-canvas-hidden-left"
          >
            {(covered.coveredDown ? hiddenAboveLabel : hiddenLeftLabel)(covered.hiddenLeft)}
          </span>
        )}
        {covered.hiddenRight === 0 || covered.coveredDown ? null : (
          <span
            className={badgeClass({
              shape: 'pill',
              className:
                'border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] text-[color:var(--color-text-tertiary)]',
            })}
            data-testid="architecture-canvas-hidden-right"
          >
            {hiddenRightLabel(covered.hiddenRight)}
          </span>
        )}
        </div>
      )}

      {/*
        ⚠️ **The drawing keeps its size and the canvas scrolls.** It used to be `width="100%"`,
        which fits the viewBox to the element — and at 390 that is a 0.39 scale, so measured on the
        built export the labels rendered at roughly 4px and the counts were a smudge, while the run
        button (plain HTML, outside the SVG) stayed full size and became the largest thing on the
        canvas.

        Scaling an SVG scales the text inside it, which is how a transform quietly produces sizes
        the type ramp forbids and no lint rule can see. `.claude/rules/design.md` already answers
        this for wide content: a diagram scrolls inside its own container and the page body never
        does. That is also what every node editor does — the canvas is a viewport, not a fit.
      */}
      <div
        ref={attachScroller}
        onScroll={readCoveredEdges}
        onPointerDown={onPanStart}
        onPointerMove={onPanMove}
        onPointerUp={onPanEnd}
        onPointerCancel={onPanEnd}
        /*
         * ⚠️ **A visible scrollbar, because the fade alone was not perceived.** A fresh-eyes
         * walkthrough measured 180px hidden at 700 and 490px at 390 and reported "no scrollbar, no
         * fade, no arrow" — having zoomed in specifically to check whether the cut edge was an
         * intentional mask, and concluded it was not. The mask is there and measurable; it simply
         * has nothing to act on. A fade works by dissolving ink, and this edge carries a lane field
         * and a hairline arrow tail, where a line of text dissolving is unmistakable. An
         * affordance nobody perceives is not an affordance.
         *
         * So the scrollbar itself speaks, which is what the walker looked for first. macOS keeps
         * the overlay one hidden until something moves; `DocsQuickDrawer` already answers that by
         * painting a thin persistent one, and this reuses those exact values rather than inventing
         * a second answer. It also says how much is hidden and can be dragged, which the fade
         * could never do. The mask stays: where there is ink at the edge, it still softens the cut.
         */
        className={cn(
          covered.left || covered.right ? 'cursor-grab active:cursor-grabbing' : undefined,
          /*
           * ⚠️ **`safe center`, not `center`.** The drawing keeps one width whatever the window
           * does — the boxes are a fixed size because scaling an SVG scales the text inside it off
           * the type ramp, which this file already refused once. So on a wide screen the slack is
           * real, and it was all landing on the right: measured 2026-08-29 on the built export, the
           * drawing sat at left gap 0 with 544px spare at 1512, 952px at 1920 and 1586px at 2560,
           * because a row flex container defaults to `flex-start`. Plain `center` would fix that and
           * break the other end — a chain wider than its scroller would have its left edge pushed
           * out of reach, which is the overflow trap `safe` exists for: centre while it fits, start
           * as soon as it does not. Where the keyword is unsupported the declaration is dropped and
           * the layout falls back to today's left edge, so the failure mode is the old behaviour.
           */
          '[justify-content:safe_center]',
          /* The ladder sits in the middle of the height it has, the way the across chain
             already sat in the middle of its width: top-aligned it left every spare pixel below
             the seventh row (owner, 2026-09-03). `safe` keeps the top reachable when it does not
             fit. */
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
          /*
           * ⚠️ `shrink-0`, because the scroller is a flex container now — it centres the drawing in
           * a canvas taller than the drawing. A flex item shrinks by default, so without this the
           * drawing quietly scaled itself down to whatever width it was handed, which is the
           * defect this file already fixed once by taking `width="100%"` off. Scaling an SVG
           * scales the text inside it, where no lint rule can see the size it produces.
           */
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
            {/*
              ⚠️ **An explicit stroke, not `context-stroke`.** The arrowhead was invisible in the
              installed app while Chromium drew it correctly: WebKit does not resolve
              `context-stroke` here, so the marker had `fill="none"` and no colour at all — and the
              legend claimed an arrow the drawing did not have. Both stroke kinds already use the
              same indigo, so naming it costs nothing and works in both engines.
            */}
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
        </defs>

        {usesPairedDown ? (
          <g
            className="architecture-role-reveal"
            aria-hidden
            data-testid="architecture-paired-lane-headings"
          >
            <text
              x={PAD_X + layoutLeadRoom + contractBoxW / 2}
              y={padY + 14}
              textAnchor="middle"
              className="fill-[color:var(--color-text-quaternary)] text-label font-[var(--font-weight-emphasis)] uppercase tracking-[var(--tracking-label)]"
            >
              {contractTrackLabel}
            </text>
            <text
              x={PAD_X + layoutLeadRoom + contractBoxW + PAIRED_GUTTER_W / 2}
              y={padY + 14}
              textAnchor="middle"
              className="fill-[color:var(--color-indigo-text-soft)] text-label font-[var(--font-weight-emphasis)] uppercase tracking-[var(--tracking-label)]"
            >
              {deltaTrackLabel}
            </text>
            <text
              x={
                PAD_X +
                layoutLeadRoom +
                contractBoxW +
                PAIRED_GUTTER_W +
                observationBoxW / 2
              }
              y={padY + 14}
              textAnchor="middle"
              className="fill-[color:var(--color-text-quaternary)] text-label font-[var(--font-weight-emphasis)] uppercase tracking-[var(--tracking-label)]"
            >
              {observationTrackLabel}
            </text>
          </g>
        ) : null}

        {graph.edges.map((edge) => {
          const usesObservationLane = splitsEvidence && edge.kind === 'traffic';
          const edgeLane = usesObservationLane ? observedPlaced : placed;
          const a = edgeLane.get(edge.from);
          const b = edgeLane.get(edge.to);
          if (!a || !b) return null;
          /* A skip stays in the drawing at rest, held at zero, so revealing it on focus is a
             fade rather than a mount: one input, one event, and the stroke is where it will be. */
          const drawn = visibleEdges.includes(edge);
          /* Leave the trailing face and arrive at the leading one, whichever way the chain runs. */
          const edgeBoxW = usesObservationLane ? observationBoxW : contractBoxW;
          const edgeBoxH = usesObservationLane ? observationBoxH : boxH;
          const trackY = (at: Placed) => at.y + edgeBoxH / 2;
          /*
           * On the compact downward layout, reviewed permission and measured traffic used exactly
           * the same centre line. The traffic stroke therefore overpainted the rule 1:1 and the
           * legend promised two facts while the canvas showed one. Six SVG units to either side
           * keeps both attached to the same roles and makes their provenance visible as geometry.
           */
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

          /*
           * A permitted edge is a person's declared rule, so it is drawn by hand. Measured traffic
           * is a machine's count, so it is drawn exactly and its width carries the number.
           */
          const isDeclared = edge.kind === 'permitted';
          const violated = violatedPairs.has(`${edge.from}>${edge.to}`);
          /*
           * A skip leaves the chain and comes back to it: below the row when the chain runs
           * across, out to the side when it runs down. The arithmetic is the same either way — the
           * axis only decides which coordinate the swing is measured in.
           */
          /*
           * ⚠️ **Two skips of the same span used to share one curve.** The swing was read off the
           * span alone, so `features → shared` and `widgets → shared` left the chain at the same
           * offset and came back overlapping — a bundle nobody could follow, which is what the
           * owner asked to be able to tell apart (2026-08-30). A small per-edge step spreads them.
           */
          const sameSpanOffset = skipLane.get(`${edge.from}>${edge.to}`) ?? 0;
          const swing =
            edge.columnSpan <= 1
              ? 0
              : SKIP_DROP +
                (edge.columnSpan - 2) * SKIP_STEP +
                sameSpanOffset * SKIP_LANE_STEP +
                (axis === 'across' ? edgeBoxH : edgeBoxW) / 2;
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
              /*
               * On the ladder a skip leaves the face's side, not its foot: a foot-launched arc
               * swept through the row gap where the adjacent sentence now sits (installed app,
               * 2026-09-03: three arcs crossed "views reaches widgets"). The apex stays where the
               * sentence model expects it, one swing past the face's centre line.
               */
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
            const midX = usesPairedDown && isDeclared
              ? Math.min(sx, tx) - swing
              : Math.max(sx, tx) + swing;
            return `M ${sx} ${sy} C ${sx} ${sy + rowGap}, ${midX} ${sy + rowGap}, ${midX} ${
              (sy + ty) / 2
            } C ${midX} ${ty - rowGap}, ${tx} ${ty - rowGap}, ${tx} ${ty}`;
          })();

          return (
            <path
              key={`${edge.kind}-${edge.from}-${edge.to}`}
              d={d}
              fill="none"
              stroke={violated ? VIOLATED_STROKE : EDGE_STROKE}
              strokeWidth={
                isDeclared
                  ? 1.4
                  : edge.columnSpan > 1
                    ? 1.2 + (edge.weight ?? 0) * 1.5
                    : 1.4 + (edge.weight ?? 0) * 3
              }
              /* Dashed as well as toned, so the violation survives a colour-blind reading and a
                 greyscale print — the tone is the alarm, the dash is the fact. */
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
          );
        })}

        {/*
          ⚠️ **Every stroke says its sentence, at rest** (Direction B, owner, 2026-08-30). The two
          references the owner pointed at both put a sentence on the line; ours carried a count on
          focus and kept its sentences in a dock that was closed by default. The strings are the
          dock's own (a rule, a measured count, a violation) so a reader and an agent read one
          sentence about one stroke. A sentence with no room is held, never cropped, and says why
          in `data-edge-sentence` so the gate can count it.
        */}
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
          const portTone = EDGE_STROKE;
          /*
           * Budgeted by characters rather than by CSS, because an SVG text node does not wrap or
           * ellipsize on its own: at the caption step a 180px box holds about 34 characters, and
           * the cut lands on a word boundary where one is near.
           */
          const summary = roleSummary(box.id);
          /*
           * ⚠️ **The name and counts stop being centred once a ledger joins them.** Vertical
           * centring is right for a block that ends where its text ends and wrong for one with a
           * ruled separator: the line has to land between what the profile declares and what the
           * scanner counted, so with a ledger every baseline is fixed from the top. Without one
           * the block is centred: a one-line block for the counts, a two-line block for the
           * sentence. A sentence that turns out to need one line keeps the two-line positions,
           * because its budget was read off those positions and moving it would change the room.
           */
          const nameY = splitsEvidence
            ? usesPairedDown
              ? at.y + 23
              : at.y + 35
            : axis === 'down'
              ? at.y + 18
              : ledger
              ? at.y + 21
              : summary === null
                ? at.y + boxH / 2 - 4
                : at.y + boxH / 2 - 4 - ((SUMMARY_LINES - 1) * CAPTION_LEADING) / 2;
          const countsY = splitsEvidence
            ? usesPairedDown
              ? at.y + 43
              : at.y + 52
            : axis === 'down'
              ? at.y + 34
              : nameY + 15;
          const summaryLines =
            summary === null
              ? null
              : /* Budgeted by estimated glyph width, so a Korean sentence wraps where it reaches
                   (owner, 2026-09-03: the first Korean summaries ran past both outlines). Every
                   face is a rectangle now, so each line has the same straight room. */
                splitSummaryLinesByWidth(summary, captionLineRoom(contractBoxW), summaryLineCount);

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
                splitsEvidence && !ledger ? observationMissingLabel : null,
              ]
                .filter((part): part is string => part !== null)
                .join(' · ')}
              data-graph-box={box.id}
              /* The drawn size, stated: the box is one filled path now, so nothing else on it
                 carries a height a test or a probe can read. */
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
              {/*
                The roomy role is one interactive fact split into two visual faces. Its SVG group
                therefore has a taller bounding box than either painted card, and pointer
                automation correctly chooses that centre — the empty delta gap. A transparent
                first rect makes the full role footprint a real hit target while every visible
                face and event still belongs to this one group.
              */}
              <rect
                x={at.x}
                y={at.y}
                width={
                  usesPairedDown
                    ? contractBoxW + PAIRED_GUTTER_W + observationBoxW
                    : contractBoxW
                }
                height={
                  splitsEvidence && !usesPairedDown
                    ? observationOffset + observationBoxH
                    : boxH
                }
                fill="transparent"
                stroke="none"
                pointerEvents="all"
                data-architecture-role-hit-area="true"
              />
              {/*
                The fill is a separate flat shape: the sketch passes are an outline built from
                joined segments — several subpaths, which fill as slivers rather than as a box —
                and giving them a fill would also double-paint the wobble into a smudge.

                ⚠️ **The ghost the owner saw was the second pass, not the fill** (2026-08-30). On a
                rectangle a repeated stroke reads as one hand-drawn line; on a stadium, whose two
                caps are wide arcs, the echo lands several pixels outside and reads as a second box
                behind the first. The terminators are drawn once for that reason; the boxes in
                between keep both passes.
              */}
              {/* One face for every role. The chain's ends were drawn as ISO 5807 terminators
                  (stadiums) until 2026-09-03; the owner read the two shapes as a difference the
                  screen never explained, and position already says where a chain begins. */}
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
                />              {usesPairedDown && contractPortEdges.some((edge) => edge.columnSpan > 1 && (edge.from === box.id || edge.to === box.id)) ? (
                <ConnectionPort
                  axis={axis}
                  at={at}
                  boxW={contractBoxW}
                  boxH={boxH}
                  direction="outgoing"
                  active={focus === box.id}
                  tone={portTone}
                  lane="contract"
                  side="left"
                />
              ) : null}
              {contractIncoming.length > 0 ? (
                <ConnectionPort
                  axis={axis}
                  at={at}
                  boxW={contractBoxW}
                  boxH={boxH}
                  direction="incoming"
                  active={focus === box.id}
                  tone={portTone}
                  lane="contract"
                />
              ) : null}
              {contractOutgoing.length > 0 ? (
                <ConnectionPort
                  axis={axis}
                  at={at}
                  boxW={contractBoxW}
                  boxH={boxH}
                  direction="outgoing"
                  active={focus === box.id}
                  tone={portTone}
                  lane="contract"
                />
              ) : null}
              {splitsEvidence ? (
                <>
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
                  {axis === 'across' ? (
                    <text
                      x={at.x + contractBoxW / 2}
                      y={at.y + 17}
                      textAnchor="middle"
                      className="fill-[color:var(--color-text-quaternary)] text-label font-[var(--font-weight-emphasis)] uppercase tracking-[var(--tracking-label)]"
                    >
                      {contractTrackLabel}
                    </text>
                  ) : null}
                </>
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
                  'text-caption fill-[color:var(--color-text-tertiary)]',
                  summaryLines === null && 'tabular-nums',
                )}
                data-testid={`architecture-box-line-${box.id}`}
              >
                {summaryLines === null
                  ? counts
                  : summaryLines.map((line, index) => (
                      <tspan
                        key={index}
                        x={at.x + contractBoxW / 2}
                        y={countsY + index * CAPTION_LEADING}
                      >
                        {line}
                      </tspan>
                    ))}
              </text>
              {!splitsEvidence && ledger ? (
                <>
                  {/*
                    ⚠️ **Ruled, and straight.** Everything above this line is what a person
                    declared, drawn by the unsteady hand this surface uses for declarations;
                    everything below it is what the scanner counted. The separator is a machine
                    line for the same reason the traffic strokes are: geometry carries the
                    rule/measurement distinction alongside ink (2026-08-28).
                  */}
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
              {splitsEvidence && observedAt ? (
                <g
                  className="architecture-observation-reveal"
                >
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
                      x={at.x + contractBoxW + PAIRED_GUTTER_W / 2}
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
                      aria-hidden
                    >
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
                    <ConnectionPort
                      axis={axis}
                      at={observedAt}
                      boxW={observationBoxW}
                      boxH={observationBoxH}
                      direction="outgoing"
                      active={focus === box.id}
                      tone={portTone}
                      lane="observation"
                      side="right"
                    />
                  ) : null}
                  {observationIncoming.length > 0 ? (
                    <ConnectionPort
                      axis={axis}
                      at={observedAt}
                      boxW={observationBoxW}
                      boxH={observationBoxH}
                      direction="incoming"
                      active={focus === box.id}
                      tone={portTone}
                      lane="observation"
                    />
                  ) : null}
                  {observationOutgoing.length > 0 ? (
                    <ConnectionPort
                      axis={axis}
                      at={observedAt}
                      boxW={observationBoxW}
                      boxH={observationBoxH}
                      direction="outgoing"
                      active={focus === box.id}
                      tone={portTone}
                      lane="observation"
                    />
                  ) : null}
                  {usesPairedDown ? null : (
                    <text
                      x={observedAt.x + observationBoxW / 2}
                      y={observedAt.y + 15}
                      textAnchor="middle"
                      className="fill-[color:var(--color-text-quaternary)] text-label font-[var(--font-weight-emphasis)] uppercase tracking-[var(--tracking-label)]"
                    >
                      {observationTrackLabel}
                    </text>
                  )}
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
      {/*
        ⚠️ **The count of what is below belongs at the bottom.** It shared the run control's row at
        the top, roughly 500px away from the cut it describes, and the box it hides is the
        terminator every arrow points at (judged 2026-08-30).

        ⚠️ **Over the fade, not in a row.** It was a flow row under the scroller first, and the
        row was the defect: measured in the installed app 2026-08-30 at a 1512x949 window, the
        chain fit the scroller by 13px, the first mount-time reading came in short, the pill
        appeared, its row took about 30px from the scroller it had just measured, and the reading it
        caused then kept it there — one role reported hidden, and hidden by the report. The count
        cannot be allowed to change the height it counts against, so it sits on the mask's own
        strip at the bottom, where the drawing is already faded and nothing is covered outright.
        The strip is two insets tall for that reason (`coveredMask` above): the badge is 20px on
        an 8px offset, and a 16px fade left 12px of it over opaque ink.
      */}
      {covered.coveredDown && covered.hiddenRight > 0 ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-2 flex items-center justify-center px-[var(--card-pad)]">
          <span
            className={badgeClass({
              shape: 'pill',
              className:
                'border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] text-[color:var(--color-text-tertiary)]',
            })}
            data-testid="architecture-canvas-hidden-below"
          >
            {hiddenBelowLabel(covered.hiddenRight)}
          </span>
        </div>
      ) : null}
    </div>
  );
}
