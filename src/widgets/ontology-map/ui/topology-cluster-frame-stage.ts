import type { ExpandPreference } from "@/shared/lib/appearance-preferences";
import type { ClusterChip } from "../model/density-gate";
import {
  clusterMoreChipId,
  EGO_NEIGHBOR_CHIP_ID,
  rankEgoNeighborsByDOI,
  scheduleRipple,
  selectiveEgoNeighbors,
  type EgoNeighborRankEntry,
} from "../model/focus-state";
import type { OntologyMapTokens } from "../tokens/read-map-tokens";
import { computeTopologyClusterState } from "./topology-cluster-state";
import type { RealmRuntimeData } from "./topology-realm-runtime";
import { radiusForKind, type TopologyWorld } from "./topology-world";

type SourceRef<T> = { current: T; };

export interface ClusterFrameResult {
  effectiveExpanded: ReadonlySet<string>;
  frameClusteredIds: ReadonlySet<string>;
  frameChips: readonly ClusterChip[];
  batchAppearVisible: Set<string>;
}

export interface ClusterFrameStageSources {
  expandedParentsRef: SourceRef<ReadonlySet<string>>;
  overviewFitRef: SourceRef<"spine" | "full">;
  realmExpandChainRef: SourceRef<{
    rootId: string;
    chain: ReadonlySet<string>;
  } | null>;
  realmDataRef: SourceRef<RealmRuntimeData | null>;
  focusedSlugRef: SourceRef<string | null>;
  expandPrefRef: SourceRef<ExpandPreference>;
  egoRevealBatchesRef: SourceRef<number>;
  clusterRevealBatchesRef: SourceRef<Map<string, number>>;
  prevBatchVisibleRef: SourceRef<Set<string>>;
  batchAppearRef: SourceRef<Map<string, number>>;
  batchAppearStartRef: SourceRef<Map<string, number>>;
}

export function clusterBatchShownCount(
  rankedCount: number,
  overviewFit: "spine" | "full",
  revealedBatches: number | undefined,
  batchSize: number,
): number {
  return overviewFit === "full"
    ? rankedCount
    : Math.max(1, revealedBatches ?? 1) * batchSize;
}

export function createClusterFrameStage(sources: ClusterFrameStageSources) {
  const {
    expandedParentsRef,
    overviewFitRef,
    realmExpandChainRef,
    realmDataRef,
    focusedSlugRef,
    expandPrefRef,
    egoRevealBatchesRef,
    clusterRevealBatchesRef,
    prevBatchVisibleRef,
    batchAppearRef,
    batchAppearStartRef,
  } = sources;
  const result: ClusterFrameResult = {
    effectiveExpanded: new Set(),
    frameClusteredIds: new Set(),
    frameChips: [],
    batchAppearVisible: new Set(),
  };

  return function runClusterFrameStage(
    now: number,
    tokens: OntologyMapTokens,
    world: TopologyWorld,
  ): ClusterFrameResult {
    // frames).
    const liveRealmRootId = realmDataRef.current?.rootId ?? null;
    // Owner bug report 2026-07-23 (a capability realm rendered as an empty
    // ring): treating only the root as expanded is not enough. If the root is
    // itself a child the outer density gate collapsed — a capability under a
    // domain with 28 of them, say — the root and every member land in
    // clusteredIds and the realm looks empty. So the root's whole `contains`
    // ancestor chain is treated as expanded and the outer gate cannot hide
    // the realm's interior. The ancestors' other children are hard-culled as
    // realm outsiders anyway.
    let effectiveExpanded: ReadonlySet<string> = expandedParentsRef.current;
    if (liveRealmRootId) {
      // The ancestor chain is computed once per rootId and cached.
      if (realmExpandChainRef.current?.rootId !== liveRealmRootId) {
        const chain = new Set<string>([liveRealmRootId]);
        let cursor: string | null = liveRealmRootId;
        while (cursor) {
          let parent: string | null = null;
          for (const [pid, kids] of world.childrenByParent) {
            if (kids.includes(cursor)) {
              parent = pid;
              break;
            }
          }
          if (!parent || chain.has(parent)) break;
          chain.add(parent);
          cursor = parent;
        }
        realmExpandChainRef.current = { rootId: liveRealmRootId, chain };
      }
      const withRealm = new Set(expandedParentsRef.current);
      for (const id of realmExpandChainRef.current.chain) withRealm.add(id);
      effectiveExpanded = withRealm;
    }
    // The focused node's neighbours held by another parent stay drawn inside
    // that parent's fold, so the ego graph shows every relation the panel
    // lists. Its own children are not held: a domain's fold is its chip's job.
    let heldOpen: Set<string> | undefined;
    {
      const focusId = focusedSlugRef.current;
      const neighbors = focusId ? world.neighborMap.get(focusId) : undefined;
      if (focusId && neighbors) {
        for (const id of neighbors) {
          const parentId = world.nodeById.get(id)?.parentId ?? null;
          if (parentId === focusId) continue;
          (heldOpen ??= new Set<string>()).add(id);
        }
      }
    }
    const clusterState = computeTopologyClusterState(world, effectiveExpanded, heldOpen);

    // Selective ego: when a focused node has more neighbours than the batch
    // limit, keep the top (revealedBatches × limit) by DOI and collapse the
    // rest into clusteredIds, so their nodes, edges and labels hide through
    // the existing skip path. The "neighbours +N" chip is a ClusterChip with
    // `ego: true`, riding the same render and hit paths. Session-only state.
    let frameClusteredIds: ReadonlySet<string> = clusterState.clusteredIds;
    let frameChips: readonly ClusterChip[] = clusterState.chips;
    // While a realm is active, un-collapse members held by an **outside**
    // parent's density gate — the case where a shared element's primary owner
    // is a capability outside the realm. Gates from parents inside the realm
    // (the internal +N chips) are kept. This must match
    // `realmVisibleBounds`'s visible-member rule, or the warding ring and
    // framing diverge from what is drawn.
    if (liveRealmRootId && realmDataRef.current) {
      const memberIds = realmDataRef.current.memberIds;
      let needsFilter = false;
      for (const id of frameClusteredIds) {
        if (memberIds.has(id)) {
          const pid = world.nodeById.get(id)?.parentId ?? null;
          if (!pid || !memberIds.has(pid)) {
            needsFilter = true;
            break;
          }
        }
      }
      if (needsFilter) {
        const filtered = new Set<string>();
        for (const id of frameClusteredIds) {
          if (memberIds.has(id)) {
            const pid = world.nodeById.get(id)?.parentId ?? null;
            if (!pid || !memberIds.has(pid)) continue;
          }
          filtered.add(id);
        }
        frameClusteredIds = filtered;
      }
    }
    {
      const focusId = focusedSlugRef.current;
      const neighbors = focusId ? world.neighborMap.get(focusId) : undefined;
      if (focusId && neighbors && neighbors.size > expandPrefRef.current.batchSize) {
        // DOI relation hierarchy: collect each neighbour's original
        // `WorldEdge.relationType` — before it is flattened to the binary
        // contains|depends. When a pair has several edges the stronger wins
        // (contains > depends > relates), because DOI should rank by the
        // strongest structural tie. An O(E) scan, but this block runs only
        // while a hub with more neighbours than the batch limit is focused.
        const relTier = (t: string): number =>
          t === "contains" || t === "belongs_to" ? 3 : t === "depends_on" ? 2 : 1;
        const relByNeighbor = new Map<string, string>();
        for (const edge of world.edges) {
          const other =
            edge.sourceId === focusId ? edge.targetId : edge.targetId === focusId ? edge.sourceId : null;
          if (other === null) continue;
          const prevRel = relByNeighbor.get(other);
          if (prevRel === undefined || relTier(edge.relationType) > relTier(prevRel)) {
            relByNeighbor.set(other, edge.relationType);
          }
        }
        const entries: EgoNeighborRankEntry[] = [];
        for (const id of neighbors) {
          const n = world.nodeById.get(id);
          entries.push({
            id,
            kind: n?.kind ?? "element",
            degree: world.neighborMap.get(id)?.size ?? 0,
            relationType: relByNeighbor.get(id),
          });
        }
        const ranked = rankEgoNeighborsByDOI(entries);
        const sel = selectiveEgoNeighbors(
          ranked,
          egoRevealBatchesRef.current,
          expandPrefRef.current.batchSize,
        );
        if (sel.hiddenCount > 0) {
          // Merge onto `frameClusteredIds`, which already carries the realm
          // un-collapse filter. Re-using the original `clusterState` would
          // undo that correction.
          frameClusteredIds = new Set<string>([...frameClusteredIds, ...sel.hiddenNeighbors]);
          const focusNode = world.nodeById.get(focusId);
          if (focusNode) {
            // Anchored just below the focused node in world space, by its
            // radius plus clearance.
            const r = radiusForKind(focusNode.kind, tokens) * focusNode.magnitudeScale;
            frameChips = [
              ...clusterState.chips,
              {
                parentId: EGO_NEIGHBOR_CHIP_ID,
                count: sel.hiddenCount,
                expanded: false,
                anchor: { x: focusNode.x, y: focusNode.y + r + 26 },
                ego: true,
              },
            ];
          }
        }
      }
    }
    // --- High-fan-out batch reveal: expose an expanded cluster parent's
    //     children in DOI-ordered batches. The density gate exposes ALL of an
    //     expanded parent's gated children, so hundreds pour out at once and
    //     the labels and nodes mash together. This runtime post-pass instead
    //     ① ranks the gated children (with the same domain exemption the
    //     density gate uses) via `rankEgoNeighborsByDOI`, ② shows the top
    //     (batches × batch size), ③ folds the rest and their subtrees back
    //     into `frameClusteredIds`, and ④ places a "+N more" chip (a
    //     synthetic id) at the parent's expand-badge anchor. Clicking it
    //     increments that parent's batch count (`clusterRevealBatchesRef`,
    //     not persisted to the URL) — the same UX as the "neighbours +N"
    //     reveal, so it costs nothing to learn. The ego block may already
    //     have replaced `frameChips` with a new array, so this appends. ---
    const batchAppearVisible = new Set<string>();
    {
      const expandedNow = new Set<string>();
      const moreChips: ClusterChip[] = [];
      const hiddenFromBatch = new Set<string>();
      const prevVisible = prevBatchVisibleRef.current;
      // Batching applies only to parents the user expanded explicitly (URL
      // `?open=`). Expansions injected by realm entry (`realmExpandChain` —
      // that world's spine) are excluded, since re-collapsing them into
      // batches would empty the realm.
      const userExpanded = expandedParentsRef.current;
      const realmChain = realmExpandChainRef.current?.chain;
      for (const chip of clusterState.chips) {
        if (!chip.expanded || chip.ego) continue;
        const parentId = chip.parentId;
        if (!userExpanded.has(parentId) || realmChain?.has(parentId)) continue;
        expandedNow.add(parentId);
        // Same domain exemption as the density gate: spine children are not
        // batched.
        const gated = (world.childrenByParent.get(parentId) ?? []).filter(
          (c) => world.nodeById.get(c)?.kind !== "domain",
        );
        if (gated.length === 0) continue;
        const ranked = rankEgoNeighborsByDOI(
          gated.map((id) => ({
            id,
            kind: world.nodeById.get(id)?.kind ?? "element",
            degree: world.neighborMap.get(id)?.size ?? 0,
            // Derived from childrenByParent, so every entry is `contains`:
            // a uniform weight that leaves the order unchanged.
            relationType: "contains",
          })),
        );
        // shown = batches × batch size, the same arithmetic as
        // `selectiveEgoNeighbors`, sliced directly to preserve order. The
        // remainder collapses behind a "+N more" chip.
        const shown = clusterBatchShownCount(
          ranked.length,
          overviewFitRef.current,
          clusterRevealBatchesRef.current.get(parentId),
          expandPrefRef.current.batchSize,
        );
        const visibleOrdered = ranked.slice(0, shown);
        const hidden = ranked.slice(shown);
        for (const id of visibleOrdered) batchAppearVisible.add(id);
        if (hidden.length > 0) {
          // Collapse the remaining children and their subtrees, so no
          // grandchild floats without its parent — the same rule the density
          // gate applies to clusteredIds.
          const stack = [...hidden];
          while (stack.length > 0) {
            const id = stack.pop() as string;
            if (hiddenFromBatch.has(id)) continue;
            hiddenFromBatch.add(id);
            const kids = world.childrenByParent.get(id);
            if (kids) stack.push(...kids);
          }
          // The "+N more" chip stands at the expand-badge anchor, outward
          // from the child disc. `ego: true` exempts it from the expanded-
          // disc, group-reveal and chipReveal logic; the pointer resolves the
          // synthetic id back to the real parent for its tooltip and batch
          // reveal.
          moreChips.push({
            parentId: clusterMoreChipId(parentId),
            count: hidden.length,
            expanded: false,
            anchor: chip.anchor,
            ego: true,
          });
        }
        // Only newly revealed children (not visible last frame) get a
        // DOI-ordered centre-out stagger schedule and a ramp seeded at 0.
        // `scheduleRipple` reuses the rippleStaggerMaxMs budget cap, so even
        // a full batch compresses into roughly 180 ms total.
        const newly = visibleOrdered.filter((id) => !prevVisible.has(id));
        if (newly.length > 0) {
          const sched = scheduleRipple(parentId, now, newly, 0, tokens.rippleStaggerMs, tokens.rippleStaggerMaxMs);
          for (const s of sched) {
            if (s.nodeId === parentId) continue;
            batchAppearStartRef.current.set(s.nodeId, s.startAtMs);
            batchAppearRef.current.set(s.nodeId, 0);
          }
        }
      }
      // Prune batch counts for collapsed parents, so the next expand starts
      // from the top batch again.
      for (const pid of [...clusterRevealBatchesRef.current.keys()]) {
        if (!expandedNow.has(pid)) clusterRevealBatchesRef.current.delete(pid);
      }
      if (hiddenFromBatch.size > 0) {
        frameClusteredIds = new Set<string>([...frameClusteredIds, ...hiddenFromBatch]);
      }
      if (moreChips.length > 0) {
        frameChips = [...frameChips, ...moreChips];
      }
      prevBatchVisibleRef.current = batchAppearVisible;
    }

    result.effectiveExpanded = effectiveExpanded;
    result.frameClusteredIds = frameClusteredIds;
    result.frameChips = frameChips;
    result.batchAppearVisible = batchAppearVisible;
    return result;
  };
}
