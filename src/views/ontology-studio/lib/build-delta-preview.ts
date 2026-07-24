/**
 * 공방 (Compass Stage) Slice 5 — 그래프 델타 미니뷰 (save-preview) model.
 *
 * At the confirm moment the user wants to SEE what the disk write does to the
 * map: "저장하면 지도가 이렇게 변해요". This module turns the same staged-changes
 * story (`StudioChange[]`) into a small, LAYOUT-READY mini-graph structure —
 * the focal node's EXISTING neighborhood as achromatic context, and only the
 * nodes/edges that WILL be created / moved / cut marked as the delta.
 *
 * Pure + deterministic (no Date / random) so the whole "what the map becomes"
 * diagram is unit-tested independent of the SVG that renders it. The component
 * (`DeltaPreviewModal`) reads this structure and does pixel layout only.
 *
 * Encoding (mirrors the compass bearings):
 *   UP isA · RIGHT dependsOn · DOWN contains · LEFT relates.
 *   existing → achromatic (unchanged neighborhood, context only)
 *   added    → indigo solid (a NEW neighbor + its strut)
 *   moved    → indigo at its NEW bearing, `fromBearing` carries the old one
 *   removed  → dashed / struck (the edge that gets cut)
 *
 * ONE `changes` list feeds this AND `summarizeStudioChanges` (the plain sentence
 * list shown below the graph), so the picture and the words never disagree.
 */

import type { StudioBearing, StudioRelation, StudioSatellite } from "./build-studio-item";
import type { StudioChange } from "./build-studio-changes";

/** Relation → compass bearing (inverse of BEARING_RELATION). */
const RELATION_BEARING: Record<StudioRelation, StudioBearing> = {
  isA: "up",
  dependsOn: "right",
  contains: "down",
  relates: "left",
};

const BEARING_ORDER: readonly StudioBearing[] = ["up", "right", "down", "left"] as const;

/** How each satellite reads against the existing neighborhood. */
export type DeltaSatelliteState = "existing" | "added" | "moved" | "removed";

export interface DeltaSatellite {
  node: StudioSatellite;
  /** Where this satellite renders (the NEW bearing for a moved node). */
  bearing: StudioBearing;
  state: DeltaSatelliteState;
  /** moved only — the bearing it came FROM (component may ghost the old strut). */
  fromBearing?: StudioBearing;
}

export interface DeltaPreviewCenter {
  title: string;
  kind: string;
  domainLabel: string | null;
  /** create mode → the center itself is newly born (indigo "새로 생겨요"). */
  isNew: boolean;
}

export interface DeltaPreviewLayout {
  center: DeltaPreviewCenter;
  /** Ordered [up, right, down, left]; within a bearing, delta first then context. */
  satellites: DeltaSatellite[];
  /** Neighbors hidden by the per-bearing cap → the lane's "+N" chip. */
  overflowByBearing: Record<StudioBearing, number>;
  counts: { added: number; moved: number; removed: number };
  /** True when at least one add/move/remove is staged (drives the affordance). */
  hasDelta: boolean;
}

export interface BuildDeltaPreviewInput {
  center: DeltaPreviewCenter;
  /** Existing neighbors per relation BEFORE the staged changes. */
  baseNeighborsByRelation: Record<StudioRelation, readonly StudioSatellite[]>;
  changes: readonly StudioChange[];
  /** Max satellites rendered per bearing before "+N". Default 3 (compact). */
  capPerBearing?: number;
}

const DEFAULT_CAP = 3;

/** Stable state priority so the delta stays visible when a bearing overflows. */
const STATE_RANK: Record<DeltaSatelliteState, number> = {
  added: 0,
  moved: 1,
  removed: 2,
  existing: 3,
};

/**
 * Reconcile the base neighborhood against the staged changes into a compact,
 * cap-limited mini-graph. A base neighbor targeted by a `remove` becomes
 * `removed` in place; targeted by a `retype` it relocates to the `to` bearing as
 * `moved`; an `add` introduces a brand-new `added` neighbor. Everything else is
 * unchanged `existing` context.
 */
export function buildDeltaPreview(input: BuildDeltaPreviewInput): DeltaPreviewLayout {
  const cap = Math.max(1, input.capPerBearing ?? DEFAULT_CAP);

  const changeByTarget = new Map<string, StudioChange>();
  for (const c of input.changes) changeByTarget.set(c.target.id, c);

  const byBearing: Record<StudioBearing, DeltaSatellite[]> = {
    up: [],
    right: [],
    down: [],
    left: [],
  };

  // 1) Walk the existing neighborhood — keep unchanged context, mark cuts, and
  //    drop nodes that are relocating (they re-appear at their new bearing).
  const relations: StudioRelation[] = ["isA", "dependsOn", "contains", "relates"];
  for (const relation of relations) {
    const bearing = RELATION_BEARING[relation];
    for (const node of input.baseNeighborsByRelation[relation]) {
      const change = changeByTarget.get(node.id);
      if (change?.op === "remove" && change.relation === relation) {
        byBearing[bearing].push({ node, bearing, state: "removed" });
      } else if (change?.op === "retype" && change.from === relation) {
        // relocating — placed below when we walk the changes.
        continue;
      } else {
        byBearing[bearing].push({ node, bearing, state: "existing" });
      }
    }
  }

  // 2) Walk the changes for the additive/relocating deltas (adds + moves).
  let added = 0;
  let moved = 0;
  let removed = 0;
  for (const c of input.changes) {
    if (c.op === "add") {
      added += 1;
      const bearing = RELATION_BEARING[c.relation];
      byBearing[bearing].push({ node: c.target, bearing, state: "added" });
    } else if (c.op === "retype") {
      moved += 1;
      const bearing = RELATION_BEARING[c.to];
      byBearing[bearing].push({
        node: c.target,
        bearing,
        state: "moved",
        fromBearing: RELATION_BEARING[c.from],
      });
    } else {
      removed += 1;
    }
  }

  // 3) Delta-first ordering + per-bearing cap so a busy lane overflows its
  //    unchanged context first — the delta is never hidden behind a "+N".
  const satellites: DeltaSatellite[] = [];
  const overflowByBearing: Record<StudioBearing, number> = { up: 0, right: 0, down: 0, left: 0 };
  for (const bearing of BEARING_ORDER) {
    const lane = stableSortByRank(byBearing[bearing]);
    satellites.push(...lane.slice(0, cap));
    overflowByBearing[bearing] = Math.max(0, lane.length - cap);
  }

  return {
    center: input.center,
    satellites,
    overflowByBearing,
    counts: { added, moved, removed },
    hasDelta: added + moved + removed > 0,
  };
}

/** Stable sort by state rank (delta before context), preserving source order. */
function stableSortByRank(lane: DeltaSatellite[]): DeltaSatellite[] {
  return lane
    .map((sat, i) => ({ sat, i }))
    .sort((a, b) => STATE_RANK[a.sat.state] - STATE_RANK[b.sat.state] || a.i - b.i)
    .map((x) => x.sat);
}
