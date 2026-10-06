/**
 * Focus and ego state plus hover-ripple emphasis (`docs/design/ontology-map.md` §3.2, §3.6;
 * prototype `docs/prototypes/topology-b2plus.html` §9, §11, §13). A click sets a durable
 * focus: the ego set reads `center`/`neighbor` and the rest `dim`, drawn with opaque dim
 * tokens, never alpha. Hover only raises emphasis and is suppressed while a focus holds, so
 * a click is always safe. `interaction/pointer-state-machine.ts` turns pointer events into
 * the focus and hover ids this module reads.
 */

import { DEFAULT_EXPAND } from "@/shared/lib/appearance-preferences";

export type NodeEgoState = "center" | "neighbor" | "dim" | "normal";
export type EdgeEgoState = "ego" | "dim" | "normal";

/**
 * Past this many neighbours only the top by DOI rank light up; the rest are hidden, not
 * dimmed, behind a `neighbours +N` chip. The settings screen (Expand, how many to open at
 * once) is the single source; `use-topology-loop` reads the live value each frame and this
 * is its default for pure callers.
 */
export const EGO_NEIGHBOR_LIMIT = DEFAULT_EXPAND.batchSize;

/** A reserved word no node id can take; the pointer handler reveals the next batch on it. */
export const EGO_NEIGHBOR_CHIP_ID = "__ego_neighbors__";

/**
 * Several parents can be expanded at once, so the real parent id is wrapped in a reserved
 * prefix to keep each remainder chip distinct; the handler reveals that parent's next batch.
 */
export const CLUSTER_MORE_CHIP_PREFIX = "__cluster_more__:";

export function clusterMoreChipId(parentId: string): string {
  return CLUSTER_MORE_CHIP_PREFIX + parentId;
}

/** Shared by draw, hit-testing, and pointer handling. */
export function parseClusterMoreChipId(chipId: string): string | null {
  return chipId.startsWith(CLUSTER_MORE_CHIP_PREFIX) ? chipId.slice(CLUSTER_MORE_CHIP_PREFIX.length) : null;
}

export interface EgoNeighborRankEntry {
  id: string;
  kind: string;
  degree: number;
  /**
   * The relation type before it collapses to contains|depends; ranks just below kind.
   * Callers without relation context may omit it (weight 1).
   */
  relationType?: string;
}

/** contains/belongs_to 3 > depends_on 2 > everything else and unknown 1, matching the ink hierarchy. */
function relationTypeWeight(relationType: string | undefined): number {
  if (relationType === "contains" || relationType === "belongs_to") return 3;
  if (relationType === "depends_on") return 2;
  return 1;
}

/**
 * Degree-of-interest rank (after Furnas, 1986), deterministic on four keys: kind weight,
 * relation-type weight, degree descending, then id. Kind always outranks relation type.
 * O(n log n) sort.
 */
export function rankEgoNeighborsByDOI(neighbors: readonly EgoNeighborRankEntry[]): string[] {
  const weight = (kind: string): number => (kind === "domain" ? 3 : kind === "capability" ? 2 : 1);
  return [...neighbors]
    .sort(
      (a, b) =>
        weight(b.kind) - weight(a.kind) ||
        relationTypeWeight(b.relationType) - relationTypeWeight(a.relationType) ||
        b.degree - a.degree ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )
    .map((n) => n.id);
}

export interface SelectiveEgoResult {
  visibleNeighbors: Set<string>;
  /** Their edges and labels are hidden too. */
  hiddenNeighbors: Set<string>;
  /** The N on the `neighbours +N` chip; at 0 the chip disappears. */
  hiddenCount: number;
}

/**
 * The `revealedBatches` count starts at 1 and grows by one per chip click; session-only, never
 * written to the URL.
 */
export function selectiveEgoNeighbors(
  rankedIds: readonly string[],
  revealedBatches: number,
  limit: number = EGO_NEIGHBOR_LIMIT,
): SelectiveEgoResult {
  const shown = Math.max(0, revealedBatches) * Math.max(1, limit);
  const visibleNeighbors = new Set<string>();
  const hiddenNeighbors = new Set<string>();
  rankedIds.forEach((id, i) => {
    if (i < shown) visibleNeighbors.add(id);
    else hiddenNeighbors.add(id);
  });
  return { visibleNeighbors, hiddenNeighbors, hiddenCount: hiddenNeighbors.size };
}

export function resolveNodeEgoState(
  nodeId: string,
  focusedNodeId: string | null,
  neighborsOfFocused: ReadonlySet<string>,
): NodeEgoState {
  if (focusedNodeId === null) return "normal";
  if (nodeId === focusedNodeId) return "center";
  if (neighborsOfFocused.has(nodeId)) return "neighbor";
  return "dim";
}

export function resolveEdgeEgoState(
  edgeTouchesFocusedNode: boolean,
  focusedNodeId: string | null,
): EdgeEgoState {
  if (focusedNodeId === null) return "normal";
  return edgeTouchesFocusedNode ? "ego" : "dim";
}

/**
 * Selecting an edge focuses its pair: both ends read `neighbor` (the line is the subject,
 * so neither gets the center ring), the edge `ego`, and the rest `dim`. A node focus takes
 * precedence, preserving the click-is-safe contract.
 */
export interface EdgePairFocus {
  sourceId: string;
  targetId: string;
  relationType?: string;
}

export function resolveNodeEgoStateWithPair(
  nodeId: string,
  focusedNodeId: string | null,
  neighborsOfFocused: ReadonlySet<string>,
  pair: EdgePairFocus | null,
): NodeEgoState {
  if (focusedNodeId === null && pair !== null) {
    return nodeId === pair.sourceId || nodeId === pair.targetId ? "neighbor" : "dim";
  }
  return resolveNodeEgoState(nodeId, focusedNodeId, neighborsOfFocused);
}

export function resolveEdgeEgoStateWithPair(
  edgeTouchesFocusedNode: boolean,
  focusedNodeId: string | null,
  pair: EdgePairFocus | null,
  isSelectedEdge: boolean,
): EdgeEgoState {
  if (focusedNodeId === null && pair !== null) {
    return isSelectedEdge ? "ego" : "dim";
  }
  return resolveEdgeEgoState(edgeTouchesFocusedNode, focusedNodeId);
}

/**
 * While the trail popover is open the kept set swaps from 1-hop neighbours to visited
 * nodes instead of adding a path line, because on this map a line is a relation. Visited
 * nodes read `normal`, not `neighbor`, since the footprint ring already marks them and a
 * second indigo ring would braid with it; the focused node stays `center`.
 */
export function resolveTrailLensNodeEgoState(
  nodeId: string,
  focusedNodeId: string | null,
  trailIds: ReadonlySet<string>,
): NodeEgoState {
  if (focusedNodeId !== null && nodeId === focusedNodeId) return "center";
  return trailIds.has(nodeId) ? "normal" : "dim";
}

/**
 * Trail ink (0 to 1) a node takes while the lens is on: its existing stroke moves toward the
 * trail ink and adds no ring, orbit, hue or bloom, so no effect needs a token under the rules
 * in `.claude/rules/forbidden.md`. Only while the lens ramps, only visited nodes, and never
 * the selected node, so "here now" stays apart from "been there".
 */
export function trailNodeInkStrength(input: {
  kept: boolean;
  ramp: number;
  colorEgoState: NodeEgoState;
}): number {
  if (!input.kept || input.colorEgoState === "center") return 0;
  if (!Number.isFinite(input.ramp)) return 0;
  return Math.min(1, Math.max(0, input.ramp));
}

/**
 * A `depends` edge touching the focused node runs its comet at `egoSpeed`, so the selected
 * subgraph reads as energised; every other edge keeps `baseSpeed`.
 */
export function resolveEdgePulseSpeed(
  edgeTouchesFocusedNode: boolean,
  focusedNodeId: string | null,
  baseSpeed: number,
  egoSpeed: number,
): number {
  return focusedNodeId !== null && edgeTouchesFocusedNode ? egoSpeed : baseSpeed;
}

/**
 * With no focus the hover ego set ramps. With a focus, hover is suppressed except the
 * neighbour hovered in the detail panel list (`panelEmphasisNodeId`), so the row and the
 * canvas light together.
 */
export function isNodeEmphasisActive(
  nodeId: string,
  focusedNodeId: string | null,
  isHoverEgoMember: boolean,
  panelEmphasisNodeId: string | null,
): boolean {
  if (focusedNodeId !== null) return nodeId === panelEmphasisNodeId;
  return isHoverEgoMember;
}

export interface RippleSchedule {
  nodeId: string;
  /** Absolute ms on the `performance.now()` clock. */
  startAtMs: number;
}

/** The hovered node ramps at once; each neighbour follows `--map-ripple-stagger-ms` (55, +12 each). */
export function scheduleRipple(
  hoveredNodeId: string,
  nowMs: number,
  neighborIds: readonly string[],
  baseDelayMs: number,
  perNeighborDelayMs: number,
  maxTotalStaggerMs: number = Number.POSITIVE_INFINITY,
): readonly RippleSchedule[] {
  const own: RippleSchedule = { nodeId: hoveredNodeId, startAtMs: nowMs };
  // The stagger has a total budget (`--map-ripple-stagger-max-ms`): the ripple says "these
  // are the neighbours", it does not count them, so a hub compresses the per-neighbour delay.
  const perDelay =
    neighborIds.length > 0 ? Math.min(perNeighborDelayMs, maxTotalStaggerMs / neighborIds.length) : perNeighborDelayMs;
  const neighbors = neighborIds.map((nodeId, i) => ({
    nodeId,
    startAtMs: nowMs + baseDelayMs + i * perDelay,
  }));
  return [own, ...neighbors];
}

/**
 * One exponential-smoothing step: rises toward 1 while in the active ego set with the
 * ripple started, else decays. Taus are `--map-emphasis-rise-tau` (0.09)
 * and `--map-emphasis-decay-tau` (0.15).
 */
export function stepEmphasis(
  currentEmphasis: number,
  isInActiveEgoSet: boolean,
  rippleHasStarted: boolean,
  dt: number,
  riseTau: number,
  decayTau: number,
): number {
  if (isInActiveEgoSet && !rippleHasStarted) return currentEmphasis;
  const target = isInActiveEgoSet ? 1 : 0;
  const tau = isInActiveEgoSet ? riseTau : decayTau;
  if (currentEmphasis === target && Number.isFinite(dt) && dt >= 0 && tau > 0) return target;
  return currentEmphasis + (target - currentEmphasis) * (1 - Math.exp(-dt / tau));
}

/** Rides the same ramp as the dim colour, so ink and presence move as one. */
export function egoRestSink(focusRamp: number, restAlpha: number): number {
  const ramp = Math.min(1, Math.max(0, focusRamp));
  return 1 - ramp * (1 - restAlpha);
}

/**
 * Rises toward 1 while any node or edge-pair focus is live and falls otherwise; the frame
 * draw lerps colours by it so a click ramps in with the camera dive instead of a hard cut.
 * One symmetric τ (`--map-focus-dim-tau`, about 0.16 s) for entering and leaving.
 */
export function stepFocusRamp(current: number, focusActive: boolean, dt: number, tau: number): number {
  const target = focusActive ? 1 : 0;
  if (current === target && Number.isFinite(dt) && dt >= 0 && tau > 0) return target;
  return current + (target - current) * (1 - Math.exp(-dt / tau));
}

export function createFocusRampClock(): (focusKey: string, dt: number, now: number, previousDrawnAt: number) => number {
  let last: string | null = null;
  let afterFirst = false;
  return (focusKey, dt, now, previousDrawnAt) => {
    if (focusKey !== last) {
      last = focusKey;
      afterFirst = true;
      return 0;
    }
    if (!afterFirst) return dt;
    afterFirst = false;
    const since = (now - previousDrawnAt) / 1000;
    return Number.isFinite(since) ? Math.min(dt, Math.max(0, since)) : dt;
  };
}
