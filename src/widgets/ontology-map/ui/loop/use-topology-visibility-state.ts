"use client";

import type { ExpandPreference } from "@/shared/lib/preferences/expand-preferences";
import {
  useCallback,
  useRef
} from "react";
import type { ClusterChip } from "../../model/layout/density-gate";
import { settleGrowthReplay, type GrowthReplay } from "../../model/ambient/growth-replay";

const EMPTY_EXPANDED_SET: ReadonlySet<string> = new Set();

interface Dependencies {
  expand: ExpandPreference;
  expandedParents: ReadonlySet<string>;
  growthReplayToken: number;
  onGrowthReplayingChange: ((running: boolean) => void) | undefined;
}

/** Own clustering, reveal ramps, growth replay, and node appearance state. */
export function useTopologyVisibilityState({
  expand,
  expandedParents,
  growthReplayToken,
  onGrowthReplayingChange,
}: Dependencies) {

  /**
   * Expansion preference, mirrored for the same reason. A settings change is
   * picked up by an effect below and takes effect **from the next frame**.
   */
  const expandPrefRef = useRef<ExpandPreference>(expand);

  /** Density gate — expanded-parents Set mirror, shared by the rAF and pointer closures. */
  const expandedParentsRef = useRef<ReadonlySet<string>>(expandedParents);

  /** Previous expanded set, diffed to find newly expanded parents for the camera dive. */
  const previousExpandedParentsRef = useRef<ReadonlySet<string>>(expandedParents);

  /** Density gate — this frame's cluster chips (world-anchored). Hit-testing reads it. */
  const clusterChipsRef = useRef<readonly ClusterChip[]>([]);

  /**
   * The nodes this frame did **not** draw: density-gate collapsed ones plus
   * neighbours hidden by selective ego. Pointer hit-testing reads it to exclude
   * them — what is not drawn must not be clickable or hoverable.
   */
  const clusteredIdsRef = useRef<ReadonlySet<string>>(EMPTY_EXPANDED_SET);

  /** Density gate — the cluster parent under hover (chip border emphasis + cursor). */
  const hoveredClusterIdRef = useRef<string | null>(null);

  /**
   * How many batches of selective-ego neighbours are lit (session-only). 1 is
   * the top 24; each "neighbours +N" chip click adds one. Reset to 1 whenever
   * focus changes (see the focus effect below).
   */
  const egoRevealBatchesRef = useRef(1);

  /**
   * High-fan-out batch reveal: lit batches per expanded cluster parent (parentId → count, default 1 = the top 24 children). Each "+N more"
   * chip click increments that parent only, not persisted to the URL; collapsed parents are pruned in the frame's batch section.
   */
  const clusterRevealBatchesRef = useRef<Map<string, number>>(new Map());

  /**
   * Appearance ramp for children a batch just revealed (childId → 0..1), 0→1 with a DOI-ordered centre-out stagger (`batchAppearStartRef`);
   * `drawTopologyFrame` multiplies it into draw alpha and a 0.6→1 appearScale. It replaces the expand group fade (chipReveal), so alphas
   * never double-fade. Snaps to 1 under reduced motion.
   */
  const batchAppearRef = useRef<Map<string, number>>(new Map());

  /**
   * Absolute start time per batched child (ms, the `performance.now()` clock), filled in DOI rank order by `scheduleRipple`
   * (`i·rippleStaggerMs`, capped by `rippleStaggerMaxMs`): the ramp stays 0 until its start, so the stagger compresses into the budget.
   */
  const batchAppearStartRef = useRef<Map<string, number>>(new Map());

  /** High-fan-out batch reveal — children visible via a batch last frame, for the newly-revealed diff. */
  const previousBatchVisibleRef = useRef<Set<string>>(new Set());

  const emphasisRef = useRef<Map<string, number>>(new Map());

  /** Ego tier-reveal ramp, stepped in `stepTopologyPhysics`, consumed by `drawTopologyFrame`. */
  const egoRevealRef = useRef<Map<string, number>>(new Map());

  /**
   * Click-focus signature — per-node 0..1 color ramp, stepped in
   * `stepTopologyPhysics`, consumed by `drawTopologyFrame` to lerp normal↔dim/
   * ego color + ease the center radius. Sibling to `emphasisRef`/`egoRevealRef`.
   */
  const focusRampRef = useRef<Map<string, number>>(new Map());

  /**
   * Cluster chip expand/collapse reveal ramp (parentId → 0..1), converging at `--map-cluster-reveal-tau` toward 1 expanded and 0 collapsed,
   * stepped every frame (`stepEmphasis`); `drawTopologyFrame` multiplies it into the expanded children's alpha and the chip's fade. Snaps under reduced motion.
   */
  const chipRevealRef = useRef<Map<string, number>>(new Map());

  /**
   * The fifth tier-piercing channel: a 0..1 ramp for children a chip expand revealed. It uses `clusterRevealTau` (0.17), the chip's own fade,
   * because the input is a chip click (`design.md` "One input = one event"). In the draw it replaces the group fade (`paint-nodes.ts` `revealMul`),
   * since both would multiply two exponentials: measured, the chip hit 90% at 391 ms and its children at 621 ms, past the 120 ms threshold.
   */
  const expandRevealRef = useRef<Map<string, number>>(new Map());

  /**
   * New-node appearance ramp (nodeId → 0..1): on a world rebuild only new nodes are seeded at 0 (existing stay 1) and the frame loop converges them to 1;
   * `drawTopologyFrame` multiplies it into effRadius (0.6→1) and globalAlpha. Snaps to 1 under reduced motion; the first build seeds everything at 1.
   */
  const appearRef = useRef<Map<string, number>>(new Map());

  /**
   * Growth replay in flight (`model/ambient/growth-replay.ts`), or null. While it runs
   * the draw reads `growthReplayAppearRef` instead of `appearRef`, so the
   * physics step's own appear ramp is untouched and resumes the moment the
   * replay ends or is cancelled by input.
   */
  const growthReplayRef = useRef<GrowthReplay | null>(null);

  const growthReplayAppearRef = useRef<Map<string, number>>(new Map());

  const growthReplayTokenSeenRef = useRef(growthReplayToken);

  const onGrowthReplayingChangeRef = useRef<typeof onGrowthReplayingChange>(onGrowthReplayingChange);

  /**
   * Every exit funnels through here: the second press, Esc, a node click, a canvas drag and reaching
   * the end. A stop before the end announces at once and lets the map rise back, so the control's
   * active tone never outlives the growth and no node cuts in.
   */
  const endGrowthReplay = useCallback(() => {
    const replay = growthReplayRef.current;
    if (replay === null) return;
    const now = performance.now();
    if (now >= replay.endMs) {
      growthReplayRef.current = null;
      if (!replay.settling) onGrowthReplayingChangeRef.current?.(false);
      return;
    }
    if (replay.settling) return;
    growthReplayRef.current = settleGrowthReplay(replay, now, growthReplayAppearRef.current);
    onGrowthReplayingChangeRef.current?.(false);
  }, []);

  const previousNodeIdsRef = useRef<Set<string>>(new Set());

  /**
   * Ids of nodes born during this session. At overview zoom a new capability's tier alpha is 0, so the
   * appearance ramp alone shows nothing; these get the tier exemption, and persist for the session.
   */
  const bornNodeIdsRef = useRef<Set<string>>(new Set());

  /**
   * Per-label LOD presence ramp (nodeId → 0..1), turning label flicker into a
   * fade. `drawTopologyFrame` knows the layout result, so it steps and consumes
   * this in place; the loop owns only its lifetime.
   */
  const labelPresentRef = useRef<Map<string, number>>(new Map());

  /**
   * Click-focus signature: the classification the COLOR ramp reads, held for the ~160 ms fade after a deselect so the dim/ego target the colours ease
   * from persists instead of snapping to normal; it lingers until the retained subject's ramp decays to ~0.
   */
  const colorFocusRef = useRef<{ focusedNodeId: string | null; selectedEdge: { sourceId: string; targetId: string; relationType?: string; } | null; } | null>(null);

  const rippleStartRef = useRef<Map<string, number>>(new Map());
  return {
    expandPrefRef, expandedParentsRef, previousExpandedParentsRef, clusterChipsRef, clusteredIdsRef,
    hoveredClusterIdRef, egoRevealBatchesRef, clusterRevealBatchesRef, batchAppearRef, batchAppearStartRef,
    previousBatchVisibleRef, emphasisRef, egoRevealRef, focusRampRef, chipRevealRef, expandRevealRef, appearRef,
    growthReplayRef, growthReplayAppearRef, growthReplayTokenSeenRef, onGrowthReplayingChangeRef,
    endGrowthReplay, previousNodeIdsRef, bornNodeIdsRef, labelPresentRef, colorFocusRef, rippleStartRef,
  };
}
