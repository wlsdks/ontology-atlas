"use client";

import { useCallback, useMemo, useRef, useState } from 'react';

import { listboxBottomIsHidden, listboxTopIsHidden } from '@/shared/ui/select-growth';

import { cn } from '@/shared/lib/cn';
import { badgeClass } from '@/shared/ui/badge-class';
import { controlClass } from '@/shared/ui/control-class';

import type { ArchitectureGraph as Graph, GraphBoxShape } from '../model/graph-layout';
import { sketchConnector, sketchRect, sketchStadium } from '../model/sketch-stroke';

/* Geometry. One place, so the drawing can be reasoned about without reading the JSX. */
const BOX_W = 148;
const BOX_H = 62;
const COL_GAP = 52;
const ROW_GAP = 26;
const PAD_X = 28;
const PAD_Y = 26;
/** How far past the lane a skip swings, and how much deeper each further rank pushes it. */
const SKIP_DROP = 30;
const SKIP_STEP = 10;

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
function place(axis: FlowAxis, rank: number, lane: number): { x: number; y: number } {
  const along = rank * (axis === 'across' ? BOX_W + COL_GAP : BOX_H + ROW_GAP);
  const across = lane * (axis === 'across' ? BOX_H + ROW_GAP : BOX_W + COL_GAP);
  return axis === 'across'
    ? { x: PAD_X + along, y: PAD_Y + across }
    : { x: PAD_X + across, y: PAD_Y + along };
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
  permittedEdgeLabel,
  trafficEdgeLabel,
  moduleCounts,
  conceptCounts,
  runLabel,
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
  permittedEdgeLabel: (from: string, to: string) => string;
  trafficEdgeLabel: (from: string, to: string, count: number) => string;
  /** `null` where this surface cannot list source at all, so a box says nothing rather than 0. */
  moduleCounts: Readonly<Record<string, number>> | null;
  conceptCounts: Readonly<Record<string, number>>;
  runLabel: string;
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
  const ranks = graph.columns;
  const lanes = graph.boxes.reduce((most, box) => Math.max(most, box.slot + 1), 1);
  const naturalAcross = PAD_X * 2 + ranks * BOX_W + (ranks - 1) * COL_GAP;
  const axis: FlowAxis = boxWidth > 0 && naturalAcross > boxWidth ? 'down' : 'across';

  const placed = useMemo(() => {
    const map = new Map<string, Placed>();
    for (const box of graph.boxes) {
      map.set(box.id, { id: box.id, ...place(axis, box.column, box.slot), shape: box.shape });
    }
    return map;
  }, [graph.boxes, axis]);

  /* Where each box ends, in the SVG's own units — which are CSS pixels, because the drawing is no
     longer scaled. Derived, never a ref written during render. */
  const boxEnd = useMemo(
    () => ({
      down: [...placed.values()].map((at) => at.y + BOX_H),
      across: [...placed.values()].map((at) => at.x + BOX_W),
    }),
    [placed],
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
      hiddenLeft: alongCovered.filter((end) => end - (down ? BOX_H : BOX_W) < offset).length,
      hiddenRight: alongCovered.filter((end) => end > edge).length,
    });
  }, [boxEnd, axis]);
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
    const [from, to] = covered.coveredDown ? ['bottom', 'top'] : ['right', 'left'];
    if (covered.left && covered.right) {
      return `linear-gradient(to ${from}, transparent 0, #000 ${fade}, #000 calc(100% - ${fade}), transparent 100%)`;
    }
    if (covered.left) return `linear-gradient(to ${from}, transparent 0, #000 ${fade})`;
    if (covered.right) return `linear-gradient(to ${to}, transparent 0, #000 ${fade})`;
    return undefined;
  })();

  /* At rest the canvas draws the spine. A crossing that skips a column is a fact about one role,
     so it arrives when that role is chosen; the legend says so rather than leaving it a mystery. */
  const visibleEdges = graph.edges.filter(
    (edge) => edge.columnSpan <= 1 || selected === edge.from || selected === edge.to,
  );

  /*
   * ⚠️ **Reading order is not drawing order.** `buildArchitectureGraph` sorts by column span
   * descending so the longest skip is painted first and short strokes land on top of it. Read as
   * sentences that order scatters: the storefront profile listed adapter, adapter, application,
   * adapter, application, port. Grouped by where the rule starts, the same six read down the
   * chain, so the list is sorted here instead of changing what the canvas paints.
   */
  const sentenceOrder = useMemo(() => {
    const columnOf = new Map(graph.boxes.map((box) => [box.id, box.column]));
    const at = (id: string) => columnOf.get(id) ?? 0;
    return [...graph.edges].sort(
      (a, b) =>
        at(a.from) - at(b.from) ||
        at(a.to) - at(b.to) ||
        a.from.localeCompare(b.from) ||
        a.to.localeCompare(b.to),
    );
  }, [graph.boxes, graph.edges]);

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
      ? PAD_X * 2 + ranks * BOX_W + (ranks - 1) * COL_GAP
      : PAD_Y * 2 + ranks * BOX_H + (ranks - 1) * ROW_GAP;
  const acrossExtent =
    axis === 'across'
      ? PAD_Y * 2 + lanes * BOX_H + (lanes - 1) * ROW_GAP + skipRoom
      : PAD_X * 2 + lanes * BOX_W + (lanes - 1) * COL_GAP + skipRoom;
  const width = axis === 'across' ? alongExtent : acrossExtent;
  const height = axis === 'across' ? acrossExtent : alongExtent;

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
      {graph.edges.length === 0 && covered.hiddenRight === 0 ? null : (
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
        {covered.hiddenRight === 0 ? null : (
          <span
            className={badgeClass({
              shape: 'pill',
              className:
                'border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] text-[color:var(--color-text-tertiary)]',
            })}
            data-testid="architecture-canvas-hidden-right"
          >
            {(covered.coveredDown ? hiddenBelowLabel : hiddenRightLabel)(covered.hiddenRight)}
          </span>
        )}
          {graph.edges.length === 0 ? null : (
          <button
            type="button"
            onClick={() => {
              pending.current = visibleEdges.length;
              setRunSeq((seq) => seq + 1);
              setRunning(true);
            }}
            disabled={running}
            data-testid="architecture-graph-run"
            className={cn(
              controlClass({ shape: 'chip', size: 'sm', tone: 'secondary', hoverBorder: 'strong' }),
              'bg-[color:var(--color-elevated)]',
            )}
          >
            <svg width={9} height={10} viewBox="0 0 9 10" aria-hidden>
              <path d="M0.5 0.5 L8.5 5 L0.5 9.5 Z" fill="currentColor" />
            </svg>
            {runLabel}
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
          axis === 'down' ? 'justify-center overflow-y-auto' : 'items-center overflow-x-auto',
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

        {visibleEdges.map((edge) => {
          const a = placed.get(edge.from);
          const b = placed.get(edge.to);
          if (!a || !b) return null;
          /* Leave the trailing face and arrive at the leading one, whichever way the chain runs. */
          const sx = axis === 'across' ? a.x + BOX_W : a.x + BOX_W / 2;
          const sy = axis === 'across' ? a.y + BOX_H / 2 : a.y + BOX_H;
          const tx = axis === 'across' ? b.x : b.x + BOX_W / 2;
          const ty = axis === 'across' ? b.y + BOX_H / 2 : b.y;
          const receded = selected !== null && selected !== edge.from && selected !== edge.to;

          /*
           * A permitted edge is a person's declared rule, so it is drawn by hand. Measured traffic
           * is a machine's count, so it is drawn exactly and its width carries the number.
           */
          const isDeclared = edge.kind === 'permitted';
          /*
           * A skip leaves the chain and comes back to it: below the row when the chain runs
           * across, out to the side when it runs down. The arithmetic is the same either way — the
           * axis only decides which coordinate the swing is measured in.
           */
          const swing =
            edge.columnSpan <= 1
              ? 0
              : SKIP_DROP +
                (edge.columnSpan - 2) * SKIP_STEP +
                (axis === 'across' ? BOX_H : BOX_W) / 2;
          const lead = axis === 'across' ? COL_GAP : ROW_GAP;
          const d = (() => {
            if (edge.columnSpan <= 1) {
              if (isDeclared) {
                return sketchConnector(`${edge.from}>${edge.to}`, sx, sy, tx, ty, lead * 0.6, axis);
              }
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
            return `M ${sx} ${sy} C ${sx} ${sy + ROW_GAP}, ${midX} ${sy + ROW_GAP}, ${midX} ${
              (sy + ty) / 2
            } C ${midX} ${ty - ROW_GAP}, ${tx} ${ty - ROW_GAP}, ${tx} ${ty}`;
          })();

          return (
            <path
              key={`${edge.kind}-${edge.from}-${edge.to}-${runSeq}`}
              d={d}
              fill="none"
              /* Measured at 1512 on the installed app: `--color-indigo-a38` at a hairline was not
                 visible against the canvas ground at all. A stroke nobody can see is a fact the
                 drawing did not state. */
              stroke={isDeclared ? 'var(--color-indigo-a60)' : 'var(--color-indigo-a60)'}
              strokeWidth={isDeclared ? 1.4 : 1.4 + (edge.weight ?? 0) * 3}
              strokeLinecap="round"
              markerEnd="url(#architecture-sketch-arrow)"
              opacity={receded ? 0.18 : 1}
              className={running ? 'architecture-flow-running' : undefined}
              onAnimationEnd={() => {
                pending.current -= 1;
                if (pending.current <= 0) setRunning(false);
              }}
              style={
                running
                  ? ({
                      /*
                       * ⚠️ **The column, not the x.** This was fed `placed.get(...).x` — a pixel
                       * coordinate — and the CSS multiplies the step by the stagger token, so the
                       * three strokes of the storefront profile started at 2520ms, 20520ms and
                       * 38520ms. The walkthrough measured a "run" that took forty seconds to
                       * cross four boxes. A stagger counts places in a queue.
                       */
                      '--architecture-run-step': graph.boxes.find((b) => b.id === edge.from)?.column ?? 0,
                    } as React.CSSProperties)
                  : undefined
              }
              data-edge-kind={edge.kind}
              data-edge-from={edge.from}
              data-edge-to={edge.to}
              data-edge-count={edge.count}
            />
          );
        })}

        {graph.boxes.map((box) => {
          const at = placed.get(box.id);
          if (!at) return null;
          const isSelected = selected === box.id;
          const receded =
            selected !== null &&
            !isSelected &&
            !graph.edges.some(
              (edge) =>
                (edge.from === selected && edge.to === box.id) ||
                (edge.to === selected && edge.from === box.id),
            );
          const passes =
            box.shape === 'terminator'
              ? sketchStadium(box.id, at.x, at.y, BOX_W, BOX_H)
              : sketchRect(box.id, at.x, at.y, BOX_W, BOX_H);
          const counts =
            moduleCounts === null
              ? conceptCountLabel(conceptCounts[box.id] ?? 0)
              : `${moduleCountLabel(moduleCounts[box.id] ?? 0)} · ${conceptCountLabel(
                  conceptCounts[box.id] ?? 0,
                )}`;

          return (
            <g
              key={box.id}
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              aria-label={`${roleLabel(box.id)} · ${counts}`}
              data-graph-box={box.id}
              data-testid={`architecture-graph-box-${box.id}`}
              onClick={() => {
                if (swallowClick.current) {
                  swallowClick.current = false;
                  return;
                }
                onSelect(box.id);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(box.id);
                }
              }}
              opacity={receded ? 0.35 : 1}
              className="cursor-pointer outline-none [&:focus-visible>path]:stroke-[color:var(--color-indigo-a60)]"
            >
              {/* The fill is a separate flat shape: the sketch passes are the outline, and giving
                  them a fill would double-paint the wobble into a smudge. */}
              {box.shape === 'terminator' ? (
                <rect
                  x={at.x}
                  y={at.y}
                  width={BOX_W}
                  height={BOX_H}
                  rx={BOX_H / 2}
                  fill={
                    isSelected ? 'var(--color-indigo-a08)' : 'var(--color-elevated)'
                  }
                />
              ) : (
                <rect
                  x={at.x}
                  y={at.y}
                  width={BOX_W}
                  height={BOX_H}
                  fill={isSelected ? 'var(--color-indigo-a08)' : 'var(--color-elevated)'}
                />
              )}
              {passes.map((d, pass) => (
                <path
                  key={pass}
                  d={d}
                  fill="none"
                  stroke={
                    isSelected
                      ? 'var(--color-indigo-a60)'
                      : 'var(--color-architecture-sketch-ink)'
                  }
                  strokeWidth={1.2}
                  strokeLinecap="round"
                  opacity={pass === 0 ? 1 : 0.55}
                />
              ))}
              <text
                x={at.x + BOX_W / 2}
                y={at.y + BOX_H / 2 - 4}
                textAnchor="middle"
                className="fill-[color:var(--color-text-primary)] text-body font-[var(--font-weight-strong)]"
              >
                {roleLabel(box.id)}
              </text>
              <text
                x={at.x + BOX_W / 2}
                y={at.y + BOX_H / 2 + 13}
                textAnchor="middle"
                className="fill-[color:var(--color-text-tertiary)] text-caption tabular-nums"
              >
                {counts}
              </text>
            </g>
          );
        })}
        </svg>
      </div>
      {/*
        ⚠️ **Painted, not screen-reader-only.** This list held the complete answer to the question
        the screen exists to answer — every rule, all at once — inside an `sr-only` box measured at
        one pixel wide, so a fresh-eyes walker could reach it only through the DOM (walkthrough,
        2026-08-28). `docs/AGENT-DESIGN-METHOD.md` names this exact failure: a fact only the
        accessibility tree carries is a fact on no screen at all.

        It also fixes the drawing's own limit. At rest the canvas draws the spine and holds skips
        back until a role is chosen, so a profile with six declared rules shows three strokes. The
        sentences carry all six, and a measured count carries a number that a stroke width can only
        approximate.
      */}
      {graph.edges.length === 0 ? null : (
        <ol
          className="flex flex-wrap gap-x-4 gap-y-1 rounded-b-panel border-t border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-[var(--card-pad)] py-2.5 text-caption text-[color:var(--color-text-tertiary)]"
          data-testid="architecture-edge-sentences"
        >
          {sentenceOrder.map((edge) => (
            <li key={`${edge.kind}-${edge.from}-${edge.to}`} className="break-keep">
              {edge.kind === 'permitted'
                ? permittedEdgeLabel(roleLabel(edge.from), roleLabel(edge.to))
                : trafficEdgeLabel(roleLabel(edge.from), roleLabel(edge.to), edge.count ?? 0)}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
