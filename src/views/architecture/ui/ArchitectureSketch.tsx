"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { listboxBottomIsHidden as endIsHidden, listboxTopIsHidden as startIsHidden } from '@/shared/ui/fields/select-growth';

import { cn } from '@/shared/lib/cn';
import { usePanelPresence, useHeldValue } from '@/shared/lib/render-timing/use-presence';
import { MOTION, STAGGER } from '@/shared/motion/tokens';
import { badgeClass } from '@/shared/ui/badge-class';

import type { ArchitectureGraph as Graph } from '../model/graph-layout';
import type { SentenceEdge } from '../model/edge-sentences';
import { EdgeSentences } from './sketch/EdgeSentences';
import { EdgeStrokes } from './sketch/EdgeStrokes';
import { solveSketchFrame } from './sketch/frame';
import {
  OBSERVATION_LANE_GAP,
  PAD_X,
  PAIRED_OBSERVATION_W,
  PAIRED_SIDE_ROOM_MIN,
  PAIRED_TRAIL_ROOM_MAX,
  PLANE_INSET_Y,
  SKIP_DROP,
  SKIP_STEP,
} from './sketch/geometry';
import { AcrossLaneHeadings, PairedLaneHeadings } from './sketch/LaneHeadings';
import { LayerPlanes } from './sketch/LayerPlanes';
import { ObservationEmptyBand, ObservationEmptyColumn } from './sketch/ObservationEmptyState';
import { RoleFaces } from './sketch/RoleFaces';
import { SketchDefs } from './sketch/SketchDefs';
import type { ArchitectureSketchProps } from './sketch/types';
import { useEdgeSentenceLayout } from './sketch/use-edge-sentence-layout';
import { useSketchPlacement } from './sketch/use-sketch-placement';

const PAIRED_SIDE_ROOM_MAX = 180;
/* Rooms use the edge sentence's own `text-label` glyph estimate (`edge-sentences.ts`). */
const SENTENCE_LEAD_MAX = 380;
const SENTENCE_TOP_ROOM = 44;
const SENTENCE_TRAIL_ROOM = 260;
const SENTENCE_CHAR_PX = 5.5;

const HIDDEN_COUNT_BADGE_CLASS = badgeClass({
  shape: 'pill',
  className:
    'border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] text-[color:var(--color-text-tertiary)]',
});

/** At rest the canvas draws the spine; a skip is about one role, so it arrives when that role is selected or is violated. */
function isEdgeDrawn(edge: { from: string; to: string; columnSpan: number }, selected: string | null, violatedPairs: ReadonlySet<string>): boolean {
  return edge.columnSpan <= 1 || selected === edge.from || selected === edge.to || violatedPairs.has(`${edge.from}>${edge.to}`);
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
  observationEmptyAction = null,
  onObservationEmptyActionSeated,
  observationKnown = true,
  profileKey = '',
  lowerOnlyRuleLabel,
  hiddenRightLabel,
  hiddenLeftLabel,
  hiddenAboveLabel,
  hiddenBelowLabel,
}: ArchitectureSketchProps) {
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
  const {
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
    saysRuleOnce,
    holdsSkipLane,
  } = solveSketchFrame({
    graph,
    ledgers,
    boxWidth,
    restWidth,
    restHeight,
    roleSummary,
  });

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

  const {
    placed,
    observedPlaced,
    emptyPanels,
    emptyColumn,
    emptyColumnLeft,
    boxEnd,
  } = useSketchPlacement({
    graph,
    axis,
    usesPairedDown,
    splitsEvidence,
    observationEmpty,
    pairedGutterW,
    contractBoxW,
    observationBoxW,
    rowGap,
    padY,
    boxH,
    observationBoxH,
    colGap,
    observationOffset,
    planeHeadRoom,
    pairedHeaderH,
    layoutLeadRoom,
  });

  /* A receipt landing on a ladder that showed "not inspected" arrives (tier 3); one read on opening does not. Any input settles it. */
  const hasObservation =
    graph.boxes.some((box) => ledgers[box.id] !== undefined) ||
    graph.edges.some((edge) => edge.kind === 'traffic');
  const knownEmpty = observationKnown && !hasObservation && usesPairedDown && axisWidth > 0;
  const frameKey = `${contractBoxW}:${pairedGutterW}:${layoutLeadRoom}`;
  const [seen, setSeen] = useState({ profileKey, knownEmpty, frameKey });
  const [arriving, setArriving] = useState(false);
  const [arrivesWhole, setArrivesWhole] = useState(false);
  const [arrived, setArrived] = useState(false);
  if (seen.profileKey !== profileKey || seen.knownEmpty !== knownEmpty || seen.frameKey !== frameKey) {
    setSeen({ profileKey, knownEmpty, frameKey });
    if (seen.profileKey !== profileKey || seen.knownEmpty !== knownEmpty) {
      /* Choosing another profile that already has a record is a switch, not a landing. */
      const arrives =
        seen.profileKey === profileKey && seen.knownEmpty && hasObservation && usesPairedDown && axisWidth > 0;
      setArriving(arrives);
      /* A skip claiming a lane the empty ladder could not hold moves faces: one crossfade. */
      setArrivesWhole(arrives && seen.frameKey !== frameKey);
      if (arrives) setArrived(true);
    }
  }
  const arrival = arriving ? 'arriving' : arrived ? 'arrived' : 'rest';
  const arrivalWindowMs = Math.ceil(
    (arrivesWhole
      ? MOTION.fast.duration
      : MOTION.base.duration + Math.max(0, ranks - 1) * STAGGER + MOTION.settle.duration) * 1000,
  );
  useEffect(() => {
    if (!arriving) return undefined;
    const settle = () => setArriving(false);
    const timer = window.setTimeout(settle, arrivalWindowMs);
    const inputs = ['pointerdown', 'keydown', 'wheel'] as const;
    for (const input of inputs) window.addEventListener(input, settle, true);
    return () => {
      window.clearTimeout(timer);
      for (const input of inputs) window.removeEventListener(input, settle, true);
    };
  }, [arriving, arrivalWindowMs]);

  const shownColumn = observationKnown ? emptyColumn : null;
  const columnPanel = useHeldValue(
    shownColumn,
    shownColumn ? `${shownColumn.x}:${shownColumn.y}:${shownColumn.width}:${shownColumn.height}` : null,
  );
  const columnPresence = usePanelPresence(shownColumn !== null);
  const columnShown = shownColumn !== null || (arriving && columnPresence.exiting);
  /* Settled before paint, so the toolbar and the column never both wear the primary. */
  const actionSeated =
    observationKnown && axisWidth > 0 ? shownColumn !== null && observationEmptyAction !== null : null;
  useLayoutEffect(() => {
    onObservationEmptyActionSeated?.(actionSeated);
  }, [actionSeated, onObservationEmptyActionSeated]);
  useLayoutEffect(() => () => onObservationEmptyActionSeated?.(false), [onObservationEmptyActionSeated]);

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

  const {
    skipLane,
    sentences,
  } = useEdgeSentenceLayout({
    graph,
    edgeSentence,
    contractTrackLabel,
    observationTrackLabel,
    axis,
    usesPairedDown,
    usesNarrowLadder,
    splitsEvidence,
    pairedGutterW,
    contractBoxW,
    observationBoxW,
    rowGap,
    padY,
    boxH,
    observationBoxH,
    colGap,
    observationOffset,
    focus,
    toSentenceEdge,
    layoutLeadRoom,
    layoutTrailRoom,
    placed,
    observedPlaced,
    emptyColumnLeft,
    saysRuleOnce,
  });

  /* Per render O(B·E + E²): per-role port filters and per-sentence edges.find / visibleEdges.includes are linear scans over tens of edges. */
  const visibleEdges = graph.edges.filter((edge) => isEdgeDrawn(edge, selected, violatedPairs));
  /* Skip room depends on the profile, not the selection, so the page does not move under a click. */
  const deepestSkip = graph.edges.reduce((most, edge) => Math.max(most, edge.columnSpan), 0);
  const skipRoom = deepestSkip <= 1 ? 0 : SKIP_DROP + deepestSkip * SKIP_STEP;
  const alongExtent =
    axis === 'across'
      ? PAD_X * 2 + ranks * boxW + (ranks - 1) * colGap
      : padY * 2 + ranks * boxH + (ranks - 1) * rowGap +
        (usesPairedDown ? pairedHeaderH : 0) +
        /* Band head room and ledge, held before the bands exist. */
        (planeHeadRoom > 0 ? planeHeadRoom + PLANE_INSET_Y : 0);
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
        data-testid="architecture-canvas-scroller"
      >
        {/* One box for the drawing and its HTML, so SVG units stay CSS pixels. */}
        <div
          className="relative shrink-0"
          style={{ width, height }}
          data-architecture-layout-ready={axisWidth > 0 ? 'true' : 'false'}
          data-architecture-arrival={arriving ? (arrivesWhole ? 'whole' : 'staged') : undefined}
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
          data-skip-lane={usesPairedDown ? (holdsSkipLane ? 'held' : 'free') : undefined}
          data-architecture-layout-ready={axisWidth > 0 ? 'true' : 'false'}
          className="block"
        >
        <SketchDefs
          width={width}
          height={height}
        />

        {axis === 'across' && splitsEvidence ? (
          /* One heading per row, above its first face, not one per face. */
          <AcrossLaneHeadings
            contractTrackLabel={contractTrackLabel}
            observationTrackLabel={observationTrackLabel}
            padY={padY}
            boxH={boxH}
            observationOffset={observationOffset}
            layoutLeadRoom={layoutLeadRoom}
          />
        ) : null}
        {usesPairedDown ? (
          <PairedLaneHeadings
            contractTrackLabel={contractTrackLabel}
            observationTrackLabel={observationTrackLabel}
            deltaTrackLabel={deltaTrackLabel}
            deltaColumnHint={deltaColumnHint}
            pairedGutterW={pairedGutterW}
            contractBoxW={contractBoxW}
            observationBoxW={observationBoxW}
            laneHeadingY={laneHeadingY}
            layoutLeadRoom={layoutLeadRoom}
            emptyColumn={emptyColumn}
            ruleSentence={saysRuleOnce ? lowerOnlyRuleLabel : null}
            arriving={arriving}
          />
        ) : null}

        {usesLayerPlanes ? (
          <LayerPlanes
            graph={graph}
            arrival={arrival}
            pairedGutterW={pairedGutterW}
            contractBoxW={contractBoxW}
            observationBoxW={observationBoxW}
            boxH={boxH}
            planeRoom={planeRoom}
            placed={placed}
          />
        ) : null}

        {emptyPanels
          .filter((panel) => observationKnown && panel.layout === 'band')
          .map((panel) => (
            <ObservationEmptyBand
              key={panel.key}
              panel={panel}
              title={observationEmptyTitle}
              body={observationEmptyBody}
            />
          ))}

        <EdgeStrokes
          graph={graph}
          selected={selected}
          violatedPairs={violatedPairs}
          axis={axis}
          usesPairedDown={usesPairedDown}
          splitsEvidence={splitsEvidence}
          contractBoxW={contractBoxW}
          observationBoxW={observationBoxW}
          rowGap={rowGap}
          boxH={boxH}
          observationBoxH={observationBoxH}
          colGap={colGap}
          placed={placed}
          observedPlaced={observedPlaced}
          skipLane={skipLane}
          visibleEdges={visibleEdges}
          arriving={arriving}
        />

        {/* A sentence with no room, or a lower-only rule said once above, is held, never cropped; `data-edge-sentence` says why. */}
        <EdgeSentences
          graph={graph}
          selected={selected}
          violatedPairs={violatedPairs}
          sentences={sentences}
          visibleEdges={visibleEdges}
          arriving={arriving}
        />

        <RoleFaces
          graph={graph}
          selected={selected}
          roleInspectorOpen={roleInspectorOpen}
          onSelect={onSelect}
          roleLabel={roleLabel}
          moduleCountLabel={moduleCountLabel}
          conceptCountLabel={conceptCountLabel}
          moduleCounts={moduleCounts}
          conceptCounts={conceptCounts}
          ledgers={ledgers}
          roleSummary={roleSummary}
          ledgerStatusLabel={ledgerStatusLabel}
          ledgerImportsLabel={ledgerImportsLabel}
          deltaUnknownLabel={deltaUnknownLabel}
          observationMissingLabel={observationMissingLabel}
          axis={axis}
          usesPairedDown={usesPairedDown}
          splitsEvidence={splitsEvidence}
          observationEmpty={observationEmpty}
          pairedGutterW={pairedGutterW}
          contractBoxW={contractBoxW}
          observationBoxW={observationBoxW}
          boxH={boxH}
          observationBoxH={observationBoxH}
          summaryLineCount={summaryLineCount}
          observationOffset={observationOffset}
          arrival={arrival}
          hovered={hovered}
          setHovered={setHovered}
          pressed={pressed}
          setPressed={setPressed}
          focus={focus}
          placed={placed}
          observedPlaced={observedPlaced}
          swallowClick={swallowClick}
          visibleEdges={visibleEdges}
        />
        </svg>
        {columnPresence.mounted && columnShown && columnPanel ? (
          <ObservationEmptyColumn
            panel={columnPanel}
            title={observationEmptyTitle}
            body={observationEmptyBody}
            deltaLabel={deltaTrackLabel}
            deltaUnknownLabel={deltaUnknownLabel}
            action={observationEmptyAction}
            exiting={columnPresence.exiting}
          />
        ) : null}
        </div>
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
