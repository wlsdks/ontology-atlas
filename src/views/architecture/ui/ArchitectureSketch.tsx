"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { listboxBottomIsHidden, listboxTopIsHidden } from '@/shared/ui/select-growth';

import { cn } from '@/shared/lib/cn';
import { badgeClass } from '@/shared/ui/badge-class';
import { controlClass } from '@/shared/ui/control-class';

import type { ArchitectureGraph as Graph, GraphBoxShape } from '../model/graph-layout';
import type { RoleLedger } from '../model/role-ledger';
import { placeEdgeSentences, type SentenceEdge } from '../model/edge-sentences';
import { captionLineBudgets, splitSummaryLines } from '../model/summary-lines';

/* Geometry. One place, so the drawing can be reasoned about without reading the JSX. */
/**
 * ⚠️ **One value for every stroke, named once.** Measured at 1512 on the installed app,
 * `--color-indigo-a38` at a hairline was invisible against the canvas ground, so the measured-
 * traffic branch was raised to a60 — through a ternary whose two arms then held the same value,
 * while the legend swatch went on drawing the a38 the canvas no longer paints. A legend row must
 * name a mark that is on the screen (`docs/AGENT-DESIGN-METHOD.md`), so both sides read this.
 */
export const EDGE_STROKE = 'var(--color-indigo-a60)';
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
const ROW_GAP_PLAIN = 26;
const PAD_X = 28;
const PAD_Y = 26;
/*
 * ⚠️ **A scrollbar for empty ground is noise.** Measured 2026-08-30 at 1440×900: the chain fit but
 * the drawing's own bottom padding did not, so the canvas scrolled 13px and showed a bar for dot
 * field nobody needs to reach. With a ledger the boxes already carry their own breathing room, so
 * the field around them gives some back.
 *
 * Measured again 2026-08-30 in the installed app at a 1512x949 window (a 917px WebView, the
 * title bar takes 32): the seven-role chain drew 686px into a 682px canvas and the same bar
 * came back for 4px of dot field. 12px of ground at each end makes the drawing 670px, which with
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
): { x: number; y: number } {
  const along = rank * (axis === 'across' ? boxW + COL_GAP : boxH + rowGap);
  const across = lane * (axis === 'across' ? boxH + rowGap : boxW + COL_GAP);
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
  observationMissingLabel,
  runLabel,
  finishRunLabel,
  hiddenRightLabel,
  hiddenLeftLabel,
  hiddenAboveLabel,
  hiddenBelowLabel,
}: {
  graph: Graph;
  selected: string | null;
  onSelect: (id: string) => void;
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
  observationMissingLabel: string;
  runLabel: string;
  finishRunLabel: string;
  /** "N more to the right" — the count is derived, so the screen never guesses. */
  hiddenRightLabel: (count: number) => string;
  /** The same for the side a pan pushes roles off. */
  hiddenLeftLabel: (count: number) => string;
  /** And the same two again for a chain that is cut top and bottom rather than left and right. */
  hiddenAboveLabel: (count: number) => string;
  hiddenBelowLabel: (count: number) => string;
}) {
  const [runSeq, setRunSeq] = useState(0);
  /*
   * ⚠️ **The run has to end.** `.architecture-flow-running` carries the dash pattern as a static
   * rule, so leaving the class on left every stroke dashed for good, with no way back and no
   * control to stop it (fresh-eyes walkthrough, 2026-08-28). The count comes from the paths
   * themselves through `onAnimationEnd`, so the duration lives in exactly one place — the token
   * the CSS reads — and never has to be repeated here as a number.
   */
  const [running, setRunning] = useState(false);
  const pending = useRef(0);

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
  const selectedRef = useRef(selected);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);
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
  const axis: FlowAxis = axisWidth > 0 && naturalAcross > axisWidth ? 'down' : 'across';
  const roomyAcross = PAD_X * 2 + ranks * roomyBoxW + (ranks - 1) * COL_GAP;
  const usesRoomyBoxes = axis === 'across' && axisWidth > 0 && roomyAcross <= axisWidth;
  const boxW = usesRoomyBoxes ? roomyBoxW : compactBoxW;
  const rowGap = axis === 'down' ? 8 : hasLedger ? ROW_GAP_LEDGER : ROW_GAP_PLAIN;
  const padY = axis === 'down' ? 8 : hasLedger ? PAD_Y_LEDGER : PAD_Y;
  const boxH = usesRoomyBoxes
    ? BOX_H_ROOMY
    : axis === 'down'
      ? 64
      : hasLedger
        ? BOX_H_LEDGER
        : BOX_H;
  const summaryLineCount = axis === 'down' ? 1 : SUMMARY_LINES;
  const observationOffset = usesRoomyBoxes
    ? boxH + OBSERVATION_LANE_GAP
    : 0;

  /*
   * ⚠️ **The drawing answers the pointer before it is clicked.** A reference the owner pointed at
   * (Understand-Anything, MIT — read for its principles only) makes its graph feel alive by
   * lighting the hovered node and everything it touches, and this canvas already had the machinery
   * for it: choosing a role recedes the rest and reveals its crossings. Hover borrows the same
   * focus, without touching the selection, so moving across the chain reads its shape without a
   * single click.
   */
  const [hovered, setHovered] = useState<string | null>(null);
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
        focus === edge.from ||
        focus === edge.to ||
        violatedPairs.has(`${edge.from}>${edge.to}`),
    }),
    [violatedPairs, focus],
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

  const placed = useMemo(() => {
    const map = new Map<string, Placed>();
    for (const box of graph.boxes) {
      const at = place(axis, box.column, box.slot, boxH, boxW, rowGap, padY);
      map.set(box.id, {
        id: box.id,
        x: at.x + (axis === 'down' ? leadRoom : 0),
        y: at.y + (axis === 'across' ? leadRoom : 0),
        shape: box.shape,
      });
    }
    return map;
  }, [graph.boxes, axis, boxH, boxW, rowGap, padY, leadRoom]);
  const observedPlaced = useMemo(() => {
    if (!usesRoomyBoxes) return placed;
    return new Map(
      [...placed].map(([id, at]) => [id, { ...at, y: at.y + observationOffset }]),
    );
  }, [observationOffset, placed, usesRoomyBoxes]);

  /* Where each box ends, in the SVG's own units — which are CSS pixels, because the drawing is no
     longer scaled. Derived, never a ref written during render. */
  const boxEnd = useMemo(
    () => ({
      down: [...placed.values()].map((at) => at.y + boxH),
      across: [...placed.values()].map((at) => at.x + boxW),
    }),
    [placed, boxH, boxW],
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
    if (selectedRef.current === null) setRestWidth(element.clientWidth);
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
      hiddenLeft: alongCovered.filter((end) => end - (down ? boxH : boxW) < offset).length,
      hiddenRight: alongCovered.filter((end) => end > edge).length,
    });
  }, [boxEnd, axis, boxH, boxW]);
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
    const right = (at.x + boxW) * scale + ROOM;
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
  }, [selected, placed, boxW, boxH]);

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
      laneBoxH: number,
    ) =>
      placeEdgeSentences({
        axis,
        edges: edges.map(toSentenceEdge),
        placed: lane,
        boxW,
        boxH: laneBoxH,
        rowGap,
        colGap: COL_GAP,
        swingOf: (edge) =>
          SKIP_DROP +
          (edge.columnSpan - 2) * SKIP_STEP +
          (skipLane.get(`${edge.from}>${edge.to}`) ?? 0) * SKIP_LANE_STEP +
          (axis === 'across' ? laneBoxH : boxW) / 2,
        leadRoom,
        trailRoom,
        sentenceOf: edgeSentence,
        focus,
      });
    if (!usesRoomyBoxes) return place(graph.edges, placed, boxH);
    return [
      ...place(
        graph.edges.filter((edge) => edge.kind === 'permitted'),
        placed,
        boxH,
      ),
      ...place(
        graph.edges.filter((edge) => edge.kind === 'traffic'),
        observedPlaced,
        OBSERVATION_BOX_H,
      ),
    ];
  }, [
    axis,
    boxH,
    boxW,
    edgeSentence,
    focus,
    graph.edges,
    leadRoom,
    observedPlaced,
    placed,
    rowGap,
    skipLane,
    toSentenceEdge,
    trailRoom,
    usesRoomyBoxes,
  ]);

  const visibleEdges = graph.edges.filter(
    (edge) =>
      edge.columnSpan <= 1 ||
      focus === edge.from ||
      focus === edge.to ||
      violatedPairs.has(`${edge.from}>${edge.to}`),
  );
  /* Directional motion belongs only to a revision-stamped observation. A reviewed permission is
     static policy, not traffic, so an unmeasured profile exposes no replay control at all. */
  const replayableEdges = visibleEdges.filter((edge) => edge.kind === 'traffic');
  const replaySourceRoles = new Set(replayableEdges.map((edge) => edge.from));
  const maxReplayColumn = Math.max(
    1,
    ...replayableEdges.map(
      (edge) => graph.boxes.find((box) => box.id === edge.from)?.column ?? 0,
    ),
  );

  const finishRun = () => {
    const root = scrollerRef.current;
    if (root) {
      root
        .querySelectorAll<SVGElement>(
          '.architecture-flow-running, .architecture-observation-pulse',
        )
        .forEach((element) => element.getAnimations?.().forEach((animation) => animation.finish()));
    }
    pending.current = 0;
    setRunning(false);
  };


  /*
   * ⚠️ Reserve room for the skips that are actually drawn, not for the ones that could be. The
   * first cut always added the deepest possible swing, so at rest — where no skip is drawn at all
   * — the canvas ended in 180px of empty dot field (installed app, 2026-08-28). The drawing grows
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
      ? PAD_X * 2 + ranks * boxW + (ranks - 1) * COL_GAP
      : padY * 2 + ranks * boxH + (ranks - 1) * rowGap;
  const acrossExtent =
    axis === 'across'
      ? padY * 2 + lanes * boxH + (lanes - 1) * rowGap + skipRoom + leadRoom + trailRoom
      : PAD_X * 2 + lanes * boxW + (lanes - 1) * COL_GAP + skipRoom + leadRoom + trailRoom;
  const width = axis === 'across' ? alongExtent : acrossExtent;
  const height = axis === 'across'
    ? acrossExtent + (usesRoomyBoxes ? OBSERVATION_LANE_GAP + OBSERVATION_BOX_H : 0)
    : alongExtent;

  return (
    <div className="architecture-canvas-ground relative flex min-h-0 flex-1 flex-col rounded-panel border border-[color:var(--color-border-soft)]">
      {/*
        ⚠️ **The control has its own row rather than floating over the drawing.** As an absolute
        overlay it sat in the top-right corner: at 1512 that is empty dot field, and once the
        canvas became a scrolling viewport it covered a node outright at 390. An opaque chip on
        top of a node is the accepted-overlap the design system forbids, and a control alone in an
        empty corner reads as decoration.
      */}
      {/*
        ⚠️ **The count sits in the canvas's control row, not over the drawing.** A fresh-eyes
        walkthrough measured 180px hidden at 700 and 490px at 390 and reported "no scrollbar, no
        fade, no arrow" — after zooming in specifically to check whether the cut edge was an
        intentional mask. The mask is real and measurable; it has nothing to act on, because a fade
        works by dissolving ink and this edge carries a dot grid and a hairline arrow tail. A
        scrollbar is no better: on macOS the overlay one stays hidden until something moves, and
        whether it does at all is the viewer's system setting rather than ours.

        So the screen states a fact it can derive — how many roles end past the visible edge — which
        is the one thing the walker could not tell: that the drawing continues rather than ends. It
        shares the run control's row because pinned over the drawing it covered a node outright,
        which is the accepted overlap this design system forbids and the same mistake that row was
        created to fix. The mask stays; it still softens a label clipped mid-character.
      */}
      {replayableEdges.length === 0 && covered.hiddenLeft === 0 && covered.hiddenRight === 0 ? null : (
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
          {replayableEdges.length === 0 ? null : (
          <button
            type="button"
            onClick={() => {
              if (running) {
                finishRun();
                return;
              }
              pending.current = replayableEdges.length;
              setRunSeq((seq) => seq + 1);
              setRunning(true);
            }}
            data-testid="architecture-graph-run"
            data-run-state={running ? 'running' : 'idle'}
            className={cn(
              controlClass({ shape: 'chip', size: 'sm', tone: 'secondary', hoverBorder: 'strong' }),
              'bg-[color:var(--color-elevated)]',
            )}
          >
            <svg width={9} height={10} viewBox="0 0 9 10" aria-hidden>
              <path d="M0.5 0.5 L8.5 5 L0.5 9.5 Z" fill="currentColor" />
            </svg>
            {running ? finishRunLabel : runLabel}
          </button>
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
         * has nothing to act on. A fade works by dissolving ink, and this edge carries a dot grid
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
          axis === 'down' ? 'overflow-y-auto' : 'items-center overflow-x-auto',
          'flex min-h-0 flex-1 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[color:var(--color-divider)]',
        )}
        style={coveredMask ? { maskImage: coveredMask, WebkitMaskImage: coveredMask } : undefined}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          role="presentation"
          data-testid="architecture-graph"
          data-edge-source={graph.edgeSource}
          data-architecture-axis={axis}
          data-box-width-mode={usesRoomyBoxes ? 'roomy' : 'compact'}
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
              stroke="var(--color-indigo-a60)"
              strokeWidth={1.4}
            />
          </marker>
        </defs>

        {graph.edges.map((edge) => {
          const edgeLane = usesRoomyBoxes && edge.kind === 'traffic' ? observedPlaced : placed;
          const a = edgeLane.get(edge.from);
          const b = edgeLane.get(edge.to);
          if (!a || !b) return null;
          /* A skip stays in the drawing at rest, held at zero, so revealing it on focus is a
             fade rather than a mount: one input, one event, and the stroke is where it will be. */
          const drawn = visibleEdges.includes(edge);
          /* Leave the trailing face and arrive at the leading one, whichever way the chain runs. */
          const edgeBoxH = usesRoomyBoxes && edge.kind === 'traffic'
            ? OBSERVATION_BOX_H
            : boxH;
          const trackY = (at: Placed) => at.y + edgeBoxH / 2;
          /*
           * On the compact downward layout, reviewed permission and measured traffic used exactly
           * the same centre line. The traffic stroke therefore overpainted the rule 1:1 and the
           * legend promised two facts while the canvas showed one. Six SVG units to either side
           * keeps both attached to the same roles and makes their provenance visible as geometry.
           */
          const trackOffset = axis === 'down' && !usesRoomyBoxes
            ? edge.kind === 'permitted'
              ? -6
              : 6
            : 0;
          const sx = axis === 'across' ? a.x + boxW : a.x + boxW / 2 + trackOffset;
          const sy = axis === 'across' ? trackY(a) : a.y + boxH;
          const tx = axis === 'across' ? b.x : b.x + boxW / 2 + trackOffset;
          const ty = axis === 'across' ? trackY(b) : b.y;
          const receded = focus !== null && focus !== edge.from && focus !== edge.to;

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
                (axis === 'across' ? boxH : boxW) / 2;
          const lead = axis === 'across' ? COL_GAP : rowGap;
          const d = (() => {
            if (edge.columnSpan <= 1) {
              return axis === 'across'
                ? `M ${sx} ${sy} C ${sx + lead * 0.6} ${sy}, ${tx - lead * 0.6} ${ty}, ${tx} ${ty}`
                : `M ${sx} ${sy} C ${sx} ${sy + lead * 0.6}, ${tx} ${ty - lead * 0.6}, ${tx} ${ty}`;
            }
            if (axis === 'across') {
              const midY = Math.max(sy, ty) + swing;
              return `M ${sx} ${sy} C ${sx + COL_GAP} ${sy}, ${sx + COL_GAP} ${midY}, ${
                (sx + tx) / 2
              } ${midY} C ${tx - COL_GAP} ${midY}, ${tx - COL_GAP} ${ty}, ${tx} ${ty}`;
            }
            const midX = Math.max(sx, tx) + swing;
            return `M ${sx} ${sy} C ${sx} ${sy + rowGap}, ${midX} ${sy + rowGap}, ${midX} ${
              (sy + ty) / 2
            } C ${midX} ${ty - rowGap}, ${tx} ${ty - rowGap}, ${tx} ${ty}`;
          })();

          return (
            <path
              key={`${edge.kind}-${edge.from}-${edge.to}-${runSeq}`}
              d={d}
              fill="none"
              stroke={violated ? VIOLATED_STROKE : EDGE_STROKE}
              strokeWidth={isDeclared ? 1.4 : 1.4 + (edge.weight ?? 0) * 3}
              /* Dashed as well as toned, so the violation survives a colour-blind reading and a
                 greyscale print — the tone is the alarm, the dash is the fact. */
              strokeDasharray={violated ? '5 3' : undefined}
              strokeLinecap="round"
              markerEnd="url(#architecture-sketch-arrow)"
              pointerEvents={drawn ? undefined : 'none'}
              aria-hidden={!drawn}
              data-edge-drawn={drawn ? 'true' : 'false'}
              className={cn(
                'architecture-stroke',
                running && drawn && edge.kind === 'traffic'
                  ? 'architecture-flow-running'
                  : undefined,
              )}
              onAnimationEnd={() => {
                pending.current -= 1;
                if (pending.current <= 0) setRunning(false);
              }}
              style={{
                opacity: !drawn ? 0 : receded ? 0.18 : 1,
                ...(running
                  ? ({
                      /*
                       * ⚠️ **The column, not the x.** This was fed `placed.get(...).x` — a pixel
                       * coordinate — and the CSS multiplies the step by the stagger token, so the
                       * three strokes of the storefront profile started at 2520ms, 20520ms and
                       * 38520ms. The walkthrough measured a "run" that took forty seconds to
                       * cross four boxes. A stagger counts places in a queue.
                       */
                      '--architecture-run-step':
                        (graph.boxes.find((b) => b.id === edge.from)?.column ?? 0) /
                        maxReplayColumn,
                    } as React.CSSProperties)
                  : {}),
              }}
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
          const receded = focus !== null && focus !== sentence.from && focus !== sentence.to;
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
              style={{ opacity: !shown ? 0 : receded ? 0.18 : 1 }}
              aria-hidden={!shown}
              data-testid={`architecture-edge-sentence-${sentence.from}-${sentence.to}`}
              data-edge-sentence={sentence.hidden ?? (drawnStroke ? 'drawn' : 'held')}
              data-edge-sentence-kind={sentence.kind}
            >
              {sentence.text}
            </text>
          );
        })}

        {graph.boxes.map((box) => {
          const at = placed.get(box.id);
          const observedAt = observedPlaced.get(box.id);
          if (!at) return null;
          const isSelected = selected === box.id;
          const receded =
            focus !== null &&
            focus !== box.id &&
            !graph.edges.some(
              (edge) =>
                (edge.from === focus && edge.to === box.id) ||
                (edge.to === focus && edge.from === box.id),
            );
          const counts =
            moduleCounts === null
              ? conceptCountLabel(conceptCounts[box.id] ?? 0)
              : `${moduleCountLabel(moduleCounts[box.id] ?? 0)} · ${conceptCountLabel(
                  conceptCounts[box.id] ?? 0,
                )}`;
          const ledger = ledgers[box.id];
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
          const nameY = usesRoomyBoxes
            ? at.y + 35
            : axis === 'down'
              ? at.y + 18
              : ledger
              ? at.y + 21
              : summary === null
                ? at.y + boxH / 2 - 4
                : at.y + boxH / 2 - 4 - ((SUMMARY_LINES - 1) * CAPTION_LEADING) / 2;
          const countsY = usesRoomyBoxes
            ? at.y + 52
            : axis === 'down'
              ? at.y + 34
              : nameY + 15;
          const summaryLines =
            summary === null
              ? null
              : splitSummaryLines(
                  summary,
                  captionLineBudgets({
                    boxW,
                    boxH,
                    shape: box.shape,
                    baselines: Array.from(
                      { length: summaryLineCount },
                      (_, line) => countsY - at.y + line * CAPTION_LEADING,
                    ),
                  }),
                  summaryLineCount,
                );

          return (
            <g
              key={box.id}
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              aria-label={[
                roleLabel(box.id),
                summary,
                counts,
                ledger ? ledgerStatusLabel(ledger) : null,
                ledger ? ledgerImportsLabel(ledger.importsOut) : null,
                usesRoomyBoxes && !ledger ? observationMissingLabel : null,
              ]
                .filter((part): part is string => part !== null)
                .join(' · ')}
              data-graph-box={box.id}
              /* The drawn size, stated: the box is one filled path now, so nothing else on it
                 carries a height a test or a probe can read. */
              data-box-height={boxH}
              data-box-width={boxW}
              data-testid={`architecture-graph-box-${box.id}`}
              onClick={() => {
                if (swallowClick.current) {
                  swallowClick.current = false;
                  return;
                }
                onSelect(box.id);
              }}
              onPointerEnter={() => setHovered(box.id)}
              onPointerLeave={() => setHovered((at) => (at === box.id ? null : at))}
              onFocus={() => setHovered(box.id)}
              onBlur={() => setHovered((at) => (at === box.id ? null : at))}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(box.id);
                }
              }}
              style={{ opacity: receded ? 0.35 : 1 }}
              className="architecture-recede architecture-role-reveal cursor-pointer outline-none [&:focus-visible>rect]:stroke-[color:var(--color-indigo-a60)]"
            >
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
              {box.shape === 'terminator' ? (
                <rect
                  x={at.x}
                  y={at.y}
                  width={boxW}
                  height={boxH}
                  rx={boxH / 2}
                  fill={isSelected ? 'var(--color-indigo-a08)' : 'var(--color-elevated)'}
                  stroke={isSelected ? 'var(--color-indigo-a60)' : 'var(--color-architecture-sketch-ink)'}
                  strokeWidth={1}
                />
              ) : (
                <rect
                  x={at.x}
                  y={at.y}
                  width={boxW}
                  height={boxH}
                  rx={6}
                  fill={isSelected ? 'var(--color-indigo-a08)' : 'var(--color-elevated)'}
                  stroke={isSelected ? 'var(--color-indigo-a60)' : 'var(--color-architecture-sketch-ink)'}
                  strokeWidth={1}
                />
              )}
              {usesRoomyBoxes ? (
                <text
                  x={at.x + boxW / 2}
                  y={at.y + 17}
                  textAnchor="middle"
                  className="fill-[color:var(--color-text-quaternary)] text-label font-[var(--font-weight-emphasis)] uppercase tracking-[var(--tracking-label)]"
                >
                  {contractTrackLabel}
                </text>
              ) : null}
              <text
                x={at.x + boxW / 2}
                y={nameY}
                textAnchor="middle"
                className="fill-[color:var(--color-text-primary)] text-body font-[var(--font-weight-strong)]"
              >
                {roleLabel(box.id)}
              </text>
              <text
                x={at.x + boxW / 2}
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
                        x={at.x + boxW / 2}
                        y={countsY + index * CAPTION_LEADING}
                      >
                        {line}
                      </tspan>
                    ))}
              </text>
              {!usesRoomyBoxes && ledger ? (
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
                    x2={at.x + boxW - 12}
                    y1={axis === 'down' ? at.y + 46 : at.y + 58}
                    y2={axis === 'down' ? at.y + 46 : at.y + 58}
                    stroke="var(--color-divider)"
                    strokeWidth={1}
                  />
                  <text
                    x={at.x + boxW / 2}
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
              {usesRoomyBoxes && observedAt ? (
                <g
                  className="architecture-observation-reveal"
                >
                  <line
                    x1={at.x + boxW / 2}
                    x2={at.x + boxW / 2}
                    y1={at.y + boxH + 6}
                    y2={observedAt.y - 6}
                    stroke="var(--color-divider)"
                    strokeWidth={1}
                    strokeDasharray="2 4"
                    data-testid={`architecture-delta-connector-${box.id}`}
                    data-delta-state={ledger?.state ?? 'missing'}
                  />
                  <circle
                    cx={at.x + boxW / 2}
                    cy={(at.y + boxH + observedAt.y) / 2}
                    r={2.5}
                    fill={ledger ? 'var(--color-indigo-a60)' : 'var(--color-canvas)'}
                    stroke={ledger ? 'var(--color-indigo-a60)' : 'var(--color-text-quaternary)'}
                    strokeWidth={1}
                  />
                  <rect
                    x={observedAt.x}
                    y={observedAt.y}
                    width={boxW}
                    height={OBSERVATION_BOX_H}
                    rx={8}
                    fill="var(--color-overlay-1)"
                    stroke={
                      ledger?.state === 'violated'
                        ? 'var(--color-danger-text)'
                        : 'var(--color-divider)'
                    }
                    strokeWidth={1}
                    strokeDasharray={ledger ? undefined : '4 4'}
                    data-testid={`architecture-observation-box-${box.id}`}
                    data-observation-state={ledger?.state ?? 'missing'}
                  />
                  <text
                    x={observedAt.x + boxW / 2}
                    y={observedAt.y + 15}
                    textAnchor="middle"
                    className="fill-[color:var(--color-text-quaternary)] text-label font-[var(--font-weight-emphasis)] uppercase tracking-[var(--tracking-label)]"
                  >
                    {observationTrackLabel}
                  </text>
                  <text
                    x={observedAt.x + boxW / 2}
                    y={observedAt.y + 32}
                    textAnchor="middle"
                    className={cn(
                      'text-caption tabular-nums',
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
                      ? `${LEDGER_GLYPH[ledger.state]} ${ledgerStatusLabel(ledger)} · ${ledgerImportsLabel(
                          ledger.importsOut,
                        )}`
                      : `○ ${observationMissingLabel}`}
                  </text>
                </g>
              ) : null}
              {running && replaySourceRoles.has(box.id) ? (
                <g
                  className="architecture-observation-pulse"
                  style={
                    {
                      '--architecture-run-step': box.column / maxReplayColumn,
                    } as React.CSSProperties
                  }
                  data-testid={`architecture-observation-pulse-${box.id}`}
                  aria-hidden
                >
                  <rect
                    x={(usesRoomyBoxes && observedAt ? observedAt.x : at.x) + 12}
                    y={
                      (usesRoomyBoxes && observedAt
                        ? observedAt.y + OBSERVATION_BOX_H
                        : at.y + boxH) - 19
                    }
                    width={boxW - 24}
                    height={16}
                    rx={4}
                    fill="var(--color-indigo-a08)"
                  />
                  <rect
                    x={(usesRoomyBoxes && observedAt ? observedAt.x : at.x) + 12}
                    y={
                      (usesRoomyBoxes && observedAt
                        ? observedAt.y + OBSERVATION_BOX_H
                        : at.y + boxH) - 3
                    }
                    width={boxW - 24}
                    height={2}
                    rx={1}
                    fill="var(--color-indigo-accent)"
                  />
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
