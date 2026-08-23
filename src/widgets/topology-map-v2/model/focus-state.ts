/**
 * Focus / ego-state machine + hover-ripple emphasis — ported from the B2+
 * prototype's `nodeEgoState()`/`edgeEgoState()`/`startRipple()`/
 * `updateEmphasis()` (`docs/prototypes/topology-b2plus.html` §9, §11, §13).
 *
 * Contract (`docs/TOPOLOGY-V2-DESIGN.md` §3.2 "State Contract Mapping" — the state
 * contract mapping, §3.6 "Click=Safe Contract" — click is a safe action):
 * - **Click** sets a *durable* focus (`focusedNode`) — the ego-set (focused
 *   node + its 1-hop neighbors) reads as `"center"`/`"neighbor"`, everything
 *   else as `"dim"` (opaque dim tokens, never alpha — see
 *   `--topology-v2-node-fill-dim`/`node-stroke-dim`).
 * - **Hover** only raises `emphasis` (ripple) — it never touches focus/camera,
 *   and is suppressed entirely while a focus is active: focus takes exclusive
 *   ownership of emphasis (prototype: `if (focusedNode) return;` in pointermove).
 * - `emphasis` per node is a scalar 0..1 that exponentially rises toward 1
 *   while the node is in the active hover's ego-set AND its ripple delay has
 *   elapsed, and decays toward 0 otherwise:
 *   ```
 *   rising:  emphasis += (1 - emphasis) * (1 - exp(-dt / riseTau))   // riseTau  = --topology-v2-emphasis-rise-tau  (0.09s)
 *   falling: emphasis += (0 - emphasis) * (1 - exp(-dt / decayTau))  // decayTau = --topology-v2-emphasis-decay-tau (0.15s)
 *   ```
 * - Ripple stagger: hovering node N schedules its own ramp to start
 *   immediately, and each 1-hop neighbor's ramp to start
 *   `baseDelayMs + i*perNeighborDelayMs` later (`--topology-v2-ripple-stagger-ms`
 *   = 55, `+12`/neighbor — both numbers live under that one token in the
 *   design doc's §2.4 table, the prototype's `startRipple()`).
 *
 * Pure state — no DOM/pointer-event/canvas knowledge. `interaction/pointer-state-machine.ts`
 * owns translating raw pointer events into `focusedNodeId`/`hoveredNodeId`
 * changes that this module reacts to.
 */

import { DEFAULT_EXPAND } from "@/shared/lib/appearance-preferences";

export type NodeEgoState = "center" | "neighbor" | "dim" | "normal";
export type EdgeEgoState = "ego" | "dim" | "normal";

/**
 * Selective ego. When a focused node has more 1-hop neighbours than this — a hub
 * with 87 of them, say — lighting them all up drives a bundle straight across
 * the screen and nothing is readable. Only the top `EGO_NEIGHBOR_LIMIT` by DOI
 * rank light up fully; the rest are **hidden, not dimmed**, folded into a
 * `neighbours +N` chip beside the focused node. Clicking the chip
 * reveals the next batch.
 *
 * **The single source of this value is the settings screen** — "Expand → how many to open at once"
 * (Expand → how many to open at once, default 24) feeds straight into
 * it. This file used to write 24 itself and the settings screen had to repeat it;
 * a value written in two places has already begun to drift (Carbon).
 * `use-topology-loop` reads the live value each frame, and this constant is both
 * its default and the fallback for pure functions that cannot see the settings.
 */
export const EGO_NEIGHBOR_LIMIT = DEFAULT_EXPAND.batchSize;

/**
 * Synthetic parentId used by selective ego's `neighbours +N` chip. It
 * is a reserved word so it can never collide with a real node id; the pointer
 * handler branches on it to reveal the next neighbour batch rather than toggling
 * the URL.
 */
export const EGO_NEIGHBOR_CHIP_ID = "__ego_neighbors__";

/**
 * Synthetic parentId prefix for the `+N show more` chip that stands
 * in for the **remaining batches** of an expanded cluster parent. It mirrors the
 * `neighbours +N` chip (`EGO_NEIGHBOR_CHIP_ID`), but several parents can be expanded at
 * once, so a single reserved word is not enough: wrapping the real parent id in a
 * reserved prefix keeps each parent's remainder chip distinct. The pointer
 * handler branches on the prefix to reveal **that parent's** next batch instead
 * of toggling the URL to collapse it.
 */
export const CLUSTER_MORE_CHIP_PREFIX = "__cluster_more__:";

/** Real parent id → the synthetic id of its `+N show more` chip. */
export function clusterMoreChipId(parentId: string): string {
  return CLUSTER_MORE_CHIP_PREFIX + parentId;
}

/** Synthetic chip id → the real parent id, else null. Shared by draw, hit-testing, and pointer handling. */
export function parseClusterMoreChipId(chipId: string): string | null {
  return chipId.startsWith(CLUSTER_MORE_CHIP_PREFIX) ? chipId.slice(CLUSTER_MORE_CHIP_PREFIX.length) : null;
}

export interface EgoNeighborRankEntry {
  id: string;
  kind: string;
  /** Total degree — surfaces hubs first within one kind. */
  degree: number;
  /**
   * The **original relation type** of the edge joining this neighbour to the
   * focused node (`WorldEdge.relationType`, i.e. the value before it is collapsed
   * into the binary contains|depends kind). It ranks just below kind in the DOI
   * order, reflecting the relation hierarchy contains > depends > relates.
   * Callers with no relation context — layout disc ordering, for instance — may
   * omit it; unknown counts as weight 1.
   */
  relationType?: string;
}

/**
 * Relation-hierarchy weight, so the DOI rank carries the same hierarchy the
 * render ink already does (solid contains > dashed depends > faint relates):
 * containment (contains, belongs_to) 3 > dependency (depends_on) 2 > everything
 * else (relates, related_to, describes, …) and unknown 1. A pure mapping, so
 * determinism is preserved.
 */
function relationTypeWeight(relationType: string | undefined): number {
  if (relationType === "contains" || relationType === "belongs_to") return 3;
  if (relationType === "depends_on") return 2;
  return 1;
}

/**
 * Degree-of-interest rank, deterministic in four keys: kind weight (domain 3 >
 * capability 2 > element and the rest 1) descending, then relation-type weight
 * (contains 3 > depends 2 > relates and the rest 1) descending, then degree
 * descending, then slug (id) alphabetically. Like Furnas (1986) DOI, it shows the
 * structurally important neighbours first — domains and hubs lead, and at equal
 * kind and degree a contains child outranks a passing relates neighbour, which
 * aligns the rank hierarchy with the render hierarchy. Kind weight always
 * outranks relation type.
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
  /** Neighbours lit fully this time — the top `revealedBatches × limit` by rank. */
  visibleNeighbors: Set<string>;
  /** Neighbours folded away; their edges and labels are hidden too. */
  hiddenNeighbors: Set<string>;
  /** How many are hidden — the N on the `neighbours +N` chip. At 0 the chip disappears. */
  hiddenCount: number;
}

/**
 * Reveals ranked neighbours one batch at a time. `revealedBatches` starts at 1
 * (the top `limit`) and grows by one per chip click, adding the next `limit`. The
 * top `revealedBatches × limit` are visible and the rest hidden. Session-only
 * state — nothing is written to the URL.
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

/**
 * `"center"` if `nodeId === focusedNodeId`, `"neighbor"` if `nodeId` is a
 * 1-hop neighbor of the focused node, `"dim"` otherwise — but only when a
 * focus is active at all; with no focus, every node is `"normal"`.
 */
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

/** `"ego"` if the edge touches the focused node, `"dim"` otherwise; `"normal"` with no focus. */
export function resolveEdgeEgoState(
  edgeTouchesFocusedNode: boolean,
  focusedNodeId: string | null,
): EdgeEgoState {
  if (focusedNodeId === null) return "normal";
  return edgeTouchesFocusedNode ? "ego" : "dim";
}

/**
 * Selecting an edge focuses the pair. Owner request: "when clicking a line, show only the nodes connected by that line"
 * (clicking a line should show only the nodes that line connects). While an edge is selected and no node is focused:
 * - both endpoints read as `"neighbor"` — the line is the subject, so neither
 *   gets the center ring
 * - every other node and edge reads as `"dim"`
 * - the selected edge itself reads as `"ego"`; its separate selected stroke is
 *   the drawer's business
 * A node focus takes precedence, which preserves the click-is-safe contract.
 */
export interface EdgePairFocus {
  sourceId: string;
  targetId: string;
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
 * The trail lens — a **replacement** ego classification, valid only while the
 * trail popover is open.
 *
 * Why it swaps the keep-set instead of adding a new mark: the moment you open the
 * popover to read the map as a *path*, the map is still speaking about
 * *relations* (the focused node's indigo edges). The two readings competed on one
 * screen closely enough that the owner misread a relation edge as part of the
 * path walked. So rather than drawing a new path line — in this product a line
 * *is* a relation — only the kept set changes: visited nodes are kept instead of
 * 1-hop neighbours, and everything else recedes to **the existing dim values**.
 * "Glowing" here is value contrast against a darkened field, not glow.
 *
 * Visited nodes are `"normal"` rather than `"neighbor"` because neighbor adds a
 * second pale indigo ring outside the node, and a visited node already carries the
 * footprint ring three orbits out — two same-coloured hairlines in adjacent orbits
 * read as a braid, against the one-signal-per-orbit discipline. The footprint ring
 * already marks the visit, so the lens adds no ink.
 *
 * The currently focused node stays `"center"`, keeping the selection ring above
 * the footprint ring in the hierarchy.
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
 * How much **trail ink** this node takes while the lens is on (0 = none,
 * 1 = full).
 *
 * Owner, 2026-08-02: *"this is the screen after clicking the walked-path control — the
 * nodes should be selected and glowing"
 * (this is the screen after clicking the walked-path control — the
 * nodes should be selected and glowing). The lens previously only *kept* visited
 * nodes at `"normal"`. Everything else being dim gave relative contrast, but the
 * only visit marker was the footprint *beside* the node, so turning the path on
 * left the nodes along it saying nothing with their own bodies.
 *
 * **What "glowing" means inside the charter.** Not glow. Bloom
 * (`ctx.shadowBlur`) exists only as the opt-in, default-0 exception inside the
 * single file `shared/lib/footprint-glyph.ts`, and never leaves it
 * (`.claude/rules/forbidden.md`). All that happens here is that the colour of the
 * stroke channel the node **already has** moves toward the trail ink — no fourth
 * ring, no new orbit, no new hue. On this map, glowing means value and colour
 * contrast against a darkened field.
 *
 * Three rules:
 * 1. **Lens-only.** `ramp` rises to 1 only while the popover is open and falls to
 *    0 when it closes. That is what guarantees this is not a standing expansion of
 *    amber, and it is the same structure as the two prior exceptions (the agent
 *    focus ring and the recent-change spotlight).
 * 2. **Visited only.** An unvisited node is 0 and recedes to dim as before.
 * 3. **The selected node takes none**, keeping the indigo selection ring above the
 *    footprint. Letting it take ink would paint the node the user just picked the
 *    same colour as the places they walked, and the screen would stop separating
 *    "here now" from "been there".
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
 * Ambient comet-tail advance speed for one `depends` edge (`world.edges[].t +=
 * dt * speed`). When a node is clicked ("powered"), its own incident edges carry
 * *more current* — the pulse advances at `egoSpeed` instead of the ambient
 * `baseSpeed`, so the selected subgraph visibly reads as energized (B2+ circuit
 * metaphor, lead spec §2). Every other edge keeps the ambient `baseSpeed`.
 *
 * Pure — the caller decides `edgeTouchesFocusedNode` from
 * `edge.sourceId/targetId === focusedNodeId`. Speeds are tokens
 * (`--topology-v2-edge-pulse-speed` / `-ego`).
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
 * Whether a node may ramp its `emphasis` (hover-ripple) this frame.
 *
 * - **No focus:** hover owns the ripple — the hovered node and its 1-hop
 *   neighbors (`isHoverEgoMember`) ramp.
 * - **Focus active:** hover is suppressed (focus owns attention), EXCEPT the one
 *   node the user is hovering in the detail panel's "connected nodes"
 *   list (`panelEmphasisNodeId`). That single neighbor still ramps so the panel row
 *   and the on-canvas node/edge light up together ("emphasis ripple" linkage,
 *   lead spec §4). `panelEmphasisNodeId` is null until the panel-hover API feeds
 *   it in.
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
  /** Absolute ms timestamp (same clock as `performance.now()`) when this node's ramp may begin. */
  startAtMs: number;
}

/**
 * Schedules the hovered node's own immediate ramp plus each neighbor's
 * staggered ramp. `baseDelayMs`/`perNeighborDelayMs` = 55/12 per
 * `--topology-v2-ripple-stagger-ms`.
 */
export function scheduleRipple(
  hoveredNodeId: string,
  nowMs: number,
  neighborIds: readonly string[],
  baseDelayMs: number,
  perNeighborDelayMs: number,
  maxTotalStaggerMs: number = Number.POSITIVE_INFINITY,
): readonly RippleSchedule[] {
  const own: RippleSchedule = { nodeId: hoveredNodeId, startAtMs: nowMs };
  // A7 — the stagger has a TOTAL budget (`--topology-v2-ripple-stagger-max-ms`).
  // Uncapped, a 40-neighbor hub started its last neighbor 523ms in — a slow
  // enumeration, while a 3-neighbor node finished in 91ms. The ripple says
  // "these are the neighbors"; it doesn't count them. High-degree nodes
  // compress the per-neighbor delay so every ripple ends inside the budget.
  const perDelay =
    neighborIds.length > 0 ? Math.min(perNeighborDelayMs, maxTotalStaggerMs / neighborIds.length) : perNeighborDelayMs;
  const neighbors = neighborIds.map((nodeId, i) => ({
    nodeId,
    startAtMs: nowMs + baseDelayMs + i * perDelay,
  }));
  return [own, ...neighbors];
}

/**
 * One exponential-smoothing step of a single node's emphasis value.
 *
 * @param currentEmphasis 0..1
 * @param isInActiveEgoSet true if this node is the hovered node or one of its
 *   1-hop neighbors AND no focus is currently suppressing hover
 * @param rippleHasStarted true once `nowMs >= scheduledStartAtMs` for this
 *   node (ignored when `isInActiveEgoSet` is false)
 * @param dt elapsed seconds since the last step
 * @param riseTau `--topology-v2-emphasis-rise-tau` = 0.09
 * @param decayTau `--topology-v2-emphasis-decay-tau` = 0.15
 */
export function stepEmphasis(
  currentEmphasis: number,
  isInActiveEgoSet: boolean,
  rippleHasStarted: boolean,
  dt: number,
  riseTau: number,
  decayTau: number,
): number {
  if (isInActiveEgoSet) {
    if (!rippleHasStarted) return currentEmphasis;
    return currentEmphasis + (1 - currentEmphasis) * (1 - Math.exp(-dt / riseTau));
  }
  return currentEmphasis + (0 - currentEmphasis) * (1 - Math.exp(-dt / decayTau));
}

/**
 * One exponential-smoothing step of a single node's **focus ramp** — a scalar
 * 0..1 that rises toward 1 while ANY focus is active (a clicked node OR a
 * selected edge-pair) and falls toward 0 when none is. It is the shared time
 * base for the click-focus signature: `topology-frame-draw.ts#resolveNodeVisual`
 * lerps each node's normal color toward its dim/ego target by this factor (and
 * eases the center node's radius 1→1.12), so the dim/neighbor/center color swap
 * a click triggers ramps IN with the camera dive instead of hard-cutting, and a
 * deselect ramps it back OUT (owner headline: "must not read as a hard cut" — it must
 * not read as a hard cut). One
 * symmetric τ (`--topology-v2-focus-dim-tau`) — the color transition should feel
 * the same entering and leaving. Sibling to `stepEmphasis` (hover ripple) and
 * the ego-reveal ramp; kept separate because those gate on narrower conditions
 * (hover ego-set / tier exemption) than "is the scene focused at all".
 *
 * @param current 0..1 previous ramp value
 * @param focusActive true if a node OR edge-pair focus is live this frame
 * @param dt elapsed seconds since the last step
 * @param tau `--topology-v2-focus-dim-tau` (≈0.16s)
 */
export function stepFocusRamp(current: number, focusActive: boolean, dt: number, tau: number): number {
  const target = focusActive ? 1 : 0;
  return current + (target - current) * (1 - Math.exp(-dt / tau));
}
