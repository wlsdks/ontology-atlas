import type { ClusterChip } from "../model/density-gate";
import { stepEmphasis } from "../model/focus-state";
import { relaxNewlyVisible } from "../model/layout";
import type { OntologyMapTokens } from "../tokens/read-map-tokens";
import {
  recomputeWorldGeometry,
  type TopologyWorld,
} from "./topology-world";

type SourceRef<T> = { current: T; };

export interface RevealFrameStageSources {
  chipRevealRef: SourceRef<Map<string, number>>;
  batchAppearRef: SourceRef<Map<string, number>>;
  batchAppearStartRef: SourceRef<Map<string, number>>;
  expandRevealRef: SourceRef<Map<string, number>>;
  clusteredIdsRef: SourceRef<ReadonlySet<string>>;
  reducedMotionRef: SourceRef<boolean>;
}

export function createRevealFrameStage(sources: RevealFrameStageSources) {
  const {
    chipRevealRef,
    batchAppearRef,
    batchAppearStartRef,
    expandRevealRef,
    clusteredIdsRef,
    reducedMotionRef,
  } = sources;

  return function runRevealFrameStage(
    now: number,
    dt: number,
    tokens: OntologyMapTokens,
    world: TopologyWorld,
    effectiveExpanded: ReadonlySet<string>,
    frameClusteredIds: ReadonlySet<string>,
    frameChips: readonly ClusterChip[],
    batchAppearVisible: ReadonlySet<string>,
  ): void {
    // Step the cluster chip reveal ramp: parents expanded this frame (and
    // not ego chips) converge to 1, other tracked parents to 0, at
    // `clusterRevealTau`. Keys that reach ~0 and are no longer expanded are
    // pruned. Reduced-motion snaps.
    {
      const revealMap = chipRevealRef.current;
      const expandedNow = new Set<string>();
      for (const ch of frameChips) {
        if (ch.expanded && !ch.ego) expandedNow.add(ch.parentId);
      }
      // Tracked = parents expanded now, plus parents whose ramp is still
      // fading out.
      const tracked = new Set<string>([...expandedNow, ...revealMap.keys()]);
      for (const pid of tracked) {
        const target = expandedNow.has(pid);
        const prev = revealMap.get(pid) ?? 0;
        const nextVal = reducedMotionRef.current
          ? (target ? 1 : 0)
          : stepEmphasis(prev, target, true, dt, tokens.clusterRevealTau, tokens.clusterRevealTau);
        if (!target && nextVal <= 0.02) revealMap.delete(pid);
        else revealMap.set(pid, nextVal);
      }
    }

    // Step the appearance ramp for batched children, using
    // `clusterRevealTau` (0.17) — the value the chip's own pill/badge fade
    // uses, since the input producing this ramp is a chip click.
    //
    // ★ **This line, not the fifth channel, is where that fix lands.** An
    // earlier attempt changed only `expandRevealRef`'s tau, and frame
    // measurement (design-motion, 2026-07-31) still found children rising at
    // τ 226–236 ms: children of a chip click are registered on **this batch
    // path without exception** (all of `visibleOrdered`, even when
    // `hidden.length === 0`), and `revealMul`'s ternary consults
    // `batchAppear` first, so the other channel's branch is never taken.
    //
    // Keys not visible in this frame's batch (collapsed, or with a collapsed
    // parent) are pruned. Reduced-motion snaps to 1 with no stagger.
    {
      const appearMap = batchAppearRef.current;
      const startMap = batchAppearStartRef.current;
      for (const id of [...appearMap.keys()]) {
        if (!batchAppearVisible.has(id)) {
          appearMap.delete(id);
          startMap.delete(id);
          continue;
        }
        if (reducedMotionRef.current) {
          appearMap.set(id, 1);
          startMap.delete(id);
          continue;
        }
        if (now < (startMap.get(id) ?? 0)) continue; // Before its stagger start — hold 0.
        const next = stepEmphasis(appearMap.get(id) ?? 0, true, true, dt, tokens.clusterRevealTau, tokens.clusterRevealTau);
        appearMap.set(id, next);
        if (next >= 0.999) startMap.delete(id);
      }
    }

    // Local re-relaxation for nodes that just **became visible** through an
    // expand (2026-07-31).
    //
    // `relaxScope` is fixed at world-build time, against a state where
    // nothing is expanded, so expanding a chip drops its children in at their
    // **seed positions**. Phyllotaxis spacing keeps one parent's children
    // apart (measured: zero overlap), but they **collide with other parents'
    // fans**: 5 overlaps at 3 expands, 18 at 6, 70 at 12.
    //
    // Re-relaxing everything both accumulates cost (341 ms at 24 expands) and
    // **moves nodes the user was already looking at** (up to 15 units). So
    // only the newly visible ones plus their bbox neighbours are solved,
    // which keeps items per click at 107–134 — **constant regardless of how
    // many clicks have happened**.
    //
    // It runs inside the frame because the collapsed set is computed per
    // frame, making this the only place that knows what just became visible.
    // It runs once per expand.
    {
      const prevClustered = clusteredIdsRef.current;
      const newlyVisible = new Set<string>();
      for (const id of prevClustered) if (!frameClusteredIds.has(id)) newlyVisible.add(id);
      if (newlyVisible.size > 0) {
        const alreadyPlaced = new Set<string>();
        for (const node of world.nodes) {
          if (!newlyVisible.has(node.id) && !frameClusteredIds.has(node.id)) {
            alreadyPlaced.add(node.id);
          }
        }
        // Solve the home (canonical) coordinates — that is where the springs
        // return to. The live x/y are shifted by the same delta below, which
        // preserves any drag or physics state.
        const homePoints = new Map(
          world.nodes.map((n) => [n.id, { id: n.id, x: n.homeX, y: n.homeY }]),
        );
        relaxNewlyVisible(
          homePoints,
          world.nodes.map((n) => ({ id: n.id, kind: n.kind, parentId: n.parentId })),
          newlyVisible,
          alreadyPlaced,
          {
            radii: {
              project: tokens.radiusProject,
              domain: tokens.radiusDomain,
              capability: tokens.radiusCapability,
              element: tokens.radiusElement,
            },
          },
        );
        for (const node of world.nodes) {
          if (!newlyVisible.has(node.id)) continue;
          const next = homePoints.get(node.id);
          if (!next) continue;
          const dx = next.x - node.homeX;
          const dy = next.y - node.homeY;
          if (dx === 0 && dy === 0) continue;
          node.homeX = next.x;
          node.homeY = next.y;
          node.x += dx;
          node.y += dy;
        }
        recomputeWorldGeometry(world, tokens);
      }
    }

    // Fifth-channel ramp step: children revealed by an expand (i.e. outside
    // the collapsed set) converge to 1, re-collapsed ones to 0. Nodes the
    // tier already revealed do not need this channel and are excluded, so no
    // ramp is applied twice.
    {
      const revealMap = expandRevealRef.current;
      const target = new Set<string>();
      for (const [parentId, childIds] of world.childrenByParent) {
        if (!effectiveExpanded.has(parentId)) continue;
        for (const id of childIds) if (!frameClusteredIds.has(id)) target.add(id);
      }
      const tracked = new Set<string>([...target, ...revealMap.keys()]);
      for (const id of tracked) {
        const prev = revealMap.get(id) ?? 0;
        const next = reducedMotionRef.current
          ? (target.has(id) ? 1 : 0)
          : stepEmphasis(prev, target.has(id), true, dt, tokens.clusterRevealTau, tokens.clusterRevealTau);
        if (!target.has(id) && next <= 0.02) revealMap.delete(id);
        else revealMap.set(id, next);
      }
    }

    // In 3D **every node is part of the shape**, so the density gate's
    // collapsed set and chips are emptied for this frame's consumers (draw,
    // hit-testing, instrumentation). The underlying computation
    // (`frameClusteredIds`) is left intact, so the collapsed state returns as
    // it was on the frame 2D resumes, and the relax/reveal bookkeeping cannot
    // misfire on a dome toggle.

  };
}

