"use client";

import type { ExpandPreference } from "@/shared/lib/appearance-preferences";
import {
  useCallback,
  useRef
} from "react";
import type { ClusterChip } from "../model/density-gate";
import { type GrowthReplay } from "../model/growth-replay";

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
  const prevExpandedParentsRef = useRef<ReadonlySet<string>>(expandedParents);

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
   * High-fan-out batch reveal — lit batches per expanded cluster parent
   * (parentId → count, default 1 = the top 24 children). Each "+N more" chip
   * click increments that parent only; not persisted to the URL. Collapsed
   * parents are pruned in the frame's batch section. This generalises
   * `egoRevealBatchesRef` per parent, because several parents can be expanded
   * at once.
   */
  const clusterRevealBatchesRef = useRef<Map<string, number>>(new Map());

  /**
   * High-fan-out batch reveal — appearance ramp for children a batch just
   * revealed (childId → 0..1), converging 0→1 with a DOI-ordered centre-out
   * stagger (start times in `batchAppearStartRef`). `drawTopologyFrame`
   * multiplies it into the child's draw alpha and a slight appearScale (0.6→1).
   * It **replaces** the expand group fade (chipReveal) rather than stacking on
   * it, so alphas never double-fade. Snaps to 1 under reduced-motion.
   */
  const batchAppearRef = useRef<Map<string, number>>(new Map());

  /**
   * High-fan-out batch reveal — absolute start time per batched child (childId →
   * ms on the same `performance.now()` clock). Filled in DOI rank order by
   * `scheduleRipple` (base 0 + i·rippleStaggerMs, reusing the
   * rippleStaggerMaxMs budget cap). Before its start the ramp stays at 0, so
   * the stagger compresses inside the total budget instead of reading as a slow
   * enumeration.
   */
  const batchAppearStartRef = useRef<Map<string, number>>(new Map());

  /** High-fan-out batch reveal — children visible via a batch last frame, for the newly-revealed diff. */
  const prevBatchVisibleRef = useRef<Set<string>>(new Set());

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
   * Cluster chip expand/collapse reveal ramp (parentId → 0..1), converging
   * exponentially at `--map-cluster-reveal-tau` toward 1 when expanded
   * and 0 when collapsed. Stepped every frame by the loop (reusing
   * focus-state's `stepEmphasis`); `drawTopologyFrame` multiplies it into the
   * expanded disc children's draw alpha and into `drawClusterChip`'s pill/badge
   * fade-in. Snaps under reduced-motion.
   */
  const chipRevealRef = useRef<Map<string, number>>(new Map());

  /**
   * The fifth tier-piercing channel — a 0..1 ramp for **children a chip expand
   * revealed**, in the same grammar as edge selection, footprints, ego and
   * spotlight.
   *
   * Uses `clusterRevealTau` (0.17), the value the chip's own pill/badge fade
   * uses, because the input producing this channel is a chip click. The first
   * attempt borrowed `egoRevealRiseTau` (0.22), the rhythm of a *different*
   * event (an ego click) — see `.claude/rules/design.md` "One input = one event"
   * (one input, one event).
   *
   * ⚠️ In the draw this channel **replaces** the group fade
   * (`topology-frame-draw.ts`'s `revealMul`); applying both makes alpha the
   * product of two exponentials. Measured: the chip reached 90% at 391 ms while
   * its children took 621 ms — a 230 ms gap, past the 120 ms threshold. That
   * file guards `batchAppear` against double fades; this channel was added
   * later and missed the guard.
   */
  const expandRevealRef = useRef<Map<string, number>>(new Map());

  /**
   * New-node appearance ramp (nodeId → 0..1). On a world rebuild the id set is
   * diffed and only **new** nodes are seeded at 0 (existing ones stay at 1, so
   * nothing regresses); the frame loop converges them to 1.
   * `drawTopologyFrame` multiplies it into effRadius (a slight 0.6→1 scale) and
   * globalAlpha so a node swells into view instead of popping. Snaps to 1 under
   * reduced-motion. The first build has no previous set, so everything is
   * seeded at 1 and this cannot collide with the initial-load choreography.
   */
  const appearRef = useRef<Map<string, number>>(new Map());

  /**
   * Growth replay in flight (`model/growth-replay.ts`), or null. While it runs
   * the draw reads `growthReplayAppearRef` instead of `appearRef`, so the
   * physics step's own appear ramp is untouched and resumes the moment the
   * replay ends or is cancelled by input.
   */
  const growthReplayRef = useRef<GrowthReplay | null>(null);

  const growthReplayAppearRef = useRef<Map<string, number>>(new Map());

  const growthReplayTokenSeenRef = useRef(growthReplayToken);

  const onGrowthReplayingChangeRef = useRef<typeof onGrowthReplayingChange>(onGrowthReplayingChange);

  /**
   * Ends the replay and announces it once. Every exit — the second press, Esc, a
   * node click, a canvas drag, and reaching the end — funnels through here, so
   * the control's active tone can never outlive the motion it describes.
   */
  const endGrowthReplay = useCallback(() => {
    if (growthReplayRef.current === null) return;
    growthReplayRef.current = null;
    onGrowthReplayingChangeRef.current?.(false);
  }, []);

  const prevNodeIdsRef = useRef<Set<string>>(new Set());

  /**
   * Ids of nodes **born during this session**. The appearance ramp
   * (`appearRef`) alone is not enough: at overview zoom a new capability's tier
   * alpha is 0, so the ramp is multiplied by zero — an agent could create a
   * node and all the screen showed was the domain's child count going 2 → 3
   * (measured 2026-08-17, fixed on the owner's instruction). Nodes in this set
   * get the same class of tier exemption as an ego click or a chip expand, so
   * they are actually drawn.
   *
   * **It persists for the session.** Appearing and then vanishing is exactly
   * the flicker the owner said not to do. A reload returns to the ordinary tier
   * rules.
   */
  const bornNodeIdsRef = useRef<Set<string>>(new Set());

  /**
   * Per-label LOD presence ramp (nodeId → 0..1), turning label flicker into a
   * fade. `drawTopologyFrame` knows the layout result, so it steps and consumes
   * this in place; the loop owns only its lifetime.
   */
  const labelPresentRef = useRef<Map<string, number>>(new Map());

  /**
   * Click-focus signature — the focus classification the COLOR ramp reads from,
   * held for the ~160ms fade after a deselect so the dim/ego target the colors
   * ease FROM persists instead of snapping to normal. Mirrors the live
   * focus while a selection is active, then lingers until the retained subject's
   * ramp decays to ~0 (see the per-frame update after `stepTopologyPhysics`).
   */
  const colorFocusRef = useRef<{ focusedNodeId: string | null; selectedEdge: { sourceId: string; targetId: string; relationType?: string; } | null; } | null>(null);

  const rippleStartRef = useRef<Map<string, number>>(new Map());
  return {
    expandPrefRef, expandedParentsRef, prevExpandedParentsRef, clusterChipsRef, clusteredIdsRef,
    hoveredClusterIdRef, egoRevealBatchesRef, clusterRevealBatchesRef, batchAppearRef, batchAppearStartRef,
    prevBatchVisibleRef, emphasisRef, egoRevealRef, focusRampRef, chipRevealRef, expandRevealRef, appearRef,
    growthReplayRef, growthReplayAppearRef, growthReplayTokenSeenRef, onGrowthReplayingChangeRef,
    endGrowthReplay, prevNodeIdsRef, bornNodeIdsRef, labelPresentRef, colorFocusRef, rippleStartRef,
  };
}
