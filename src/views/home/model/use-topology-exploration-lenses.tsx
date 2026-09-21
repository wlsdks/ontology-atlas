import type { useTopologyGraphProjection } from "./use-topology-graph-projection";
import type { useTopologyRouteControls } from "./use-topology-route-controls";
import type { useTopologyVaultReadModel } from "./use-topology-vault-read-model";

import { resolveNodeDocument } from "@/entities/knowledge-graph";
import { type ConstellationCandidate } from "@/features/saved-constellations";
import { computeGalaxyLayout } from "@/widgets/ontology-map";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildContainmentParentMap, deriveDeeplinkAncestorExpansion } from "./url-state";

interface Options {
  routeState: import("@/views/home/model/url-state").HomeRouteState;
  setRouteState: (updater: Partial<import("@/views/home/model/url-state").HomeRouteState> | ((current: import("@/views/home/model/url-state").HomeRouteState) => import("@/views/home/model/url-state").HomeRouteState), options?: import("@/views/home/model/use-home-route-state").HomeRouteStateUpdateOptions | undefined) => void;
  topologyRouteControls: Pick<ReturnType<typeof useTopologyRouteControls>, "expandedParentSet" | "selectedProject">;
  topologyGraphProjection: Pick<ReturnType<typeof useTopologyGraphProjection>, "ontologyMapGraph" | "spotlightIds" | "canvasSelectedSlug">;
  topologyVaultReadModel: Pick<ReturnType<typeof useTopologyVaultReadModel>, "vault" | "ontologyInsight">;
}
export function useTopologyExplorationLenses({ routeState, setRouteState, topologyVaultReadModel, topologyGraphProjection, topologyRouteControls }: Options) {
  const { vault, ontologyInsight } = topologyVaultReadModel;
  const { ontologyMapGraph, spotlightIds, canvasSelectedSlug } = topologyGraphProjection;
  const { expandedParentSet, selectedProject } = topologyRouteControls;

  const constellationCandidates = useMemo<ConstellationCandidate[]>(() => {
    if (vault.status !== 'loaded' || !vault.manifest || !ontologyInsight) return [];
    const containmentParentById = new Map(
      ontologyMapGraph.edges
        .filter((edge) => edge.kind === 'contains')
        .map((edge) => [edge.target, edge.source]),
    );
    const galaxyLayout = computeGalaxyLayout(
      ontologyMapGraph.nodes.map((node) => ({
        id: node.id,
        kind: node.kind,
        parentId: containmentParentById.get(node.id) ?? null,
      })),
      { domain: 250, capability: 145, element: 90 },
    );
    const insightById = new Map(ontologyInsight.nodes.map((node) => [node.id, node]));
    const docsBySlug = new Map(vault.manifest.docs.map((document) => [document.slug, document]));
    return ontologyMapGraph.nodes.flatMap((mapNode) => {
      const insightNode = insightById.get(mapNode.id);
      const ownSlug = insightNode ? resolveNodeDocument(insightNode).ownSlug : null;
      const document = ownSlug ? docsBySlug.get(ownSlug) : null;
      if (!document || typeof document.frontmatter.uid !== 'string') return [];
      const uid = document.frontmatter.uid;
      const mergedUids = Array.isArray(document.frontmatter.merged_uids)
        ? document.frontmatter.merged_uids.filter((value): value is string => typeof value === 'string')
        : [];
      return [{
        uid,
        mergedUids,
        mapId: mapNode.id,
        lastKnownPath: document.path,
        label: mapNode.label,
        kind: mapNode.kind,
        galaxyPoint: galaxyLayout.points.get(mapNode.id) ?? { x: 0, y: 0 },
      }];
    });
  }, [ontologyInsight, ontologyMapGraph.edges, ontologyMapGraph.nodes, vault]);
  const [activeConstellation, setActiveConstellation] = useState<{
    id: string;
    memberSlugs: ReadonlySet<string>;
  } | null>(null);
  const routedConstellation =
    activeConstellation?.id === routeState.constellationIntent ? activeConstellation : null;
  const [constellationFitToken, setConstellationFitToken] = useState(0);

  // Spotlight auto-expansion. Owner, 2026-07-23: *"If the change is somewhere you would have to
  // click into, just expand it all — everything connected"* (if the change is somewhere you would have to
  // click into, just expand it all). A changed node collapsed inside a cluster chip
  // makes the lens a lie, so every changed node's containment ancestor chain is
  // merged in as a **derived** expansion. `?open=` is untouched: this is derived
  // deterministically from `?recent=`, so shared links stay reproducible and turning
  // the lens off returns to the user's own expansion with no contamination.
  const spotlightExpandedParents = useMemo(() => {
    if (!spotlightIds || spotlightIds.size === 0 || ontologyMapGraph.edges.length === 0) return null;
    const parentOf = buildContainmentParentMap(ontologyMapGraph.edges);
    const merged = new Set(expandedParentSet);
    for (const id of spotlightIds) {
      for (const ancestor of deriveDeeplinkAncestorExpansion(id, parentOf, [])) {
        merged.add(ancestor);
      }
    }
    return merged;
  }, [spotlightIds, ontologyMapGraph, expandedParentSet]);

  /*
   * ⚠️ **The canvas wants a graph node id, not a slug** (found from an owner report,
   * 2026-08-17).
   *
   * Node ids are `${kind}:${slug}` (`derive-ontology-from-vault.ts`), but project
   * deep links send a bare slug (`topology-href.ts`: `kind: project` →
   * `/topology/?p=<slug>`, while other kinds send the node id). So **projects alone**
   * never matched a node on the canvas, and the map translated "something is selected
   * but it is nowhere" into "dim everything" — measured at 1.40:1 against a 3:1 floor
   * for shapes.
   *
   * Projects now go through the same rule as every other kind. If the graph has no
   * such node (the compile emitted no project), the bare slug is kept and the
   * canvas's own safety net drops it to "nothing selected" rather than dying.
   *
   * Focusing never happens on a ghost slug (2026-08-01); the reasoning and the old
   * defect are in `../lib/resolve-canvas-selection.ts`.
   */
  /**
   * **A selection confirmed to exist.** `canvasSelectedSlug` below deliberately
   * keeps holding the raw slug while the answer is still undecidable (so deep links
   * do not flicker), so anywhere that has to ask "did the user really open a node?"
   * reads this one instead — above all when that answer writes a **permanent
   * record**.
   *
   * Measured 2026-08-01: the first-visit hint watched `canvasSelectedSlug`, so
   * arriving on a link carrying a slug that does not exist made it true for **one
   * tick before the decision settled**, and that tick dismissed the hint in
   * localStorage forever. It was recorded as learned without the user ever pressing
   * anything.
   */
  const drawerProject = selectedProject;

  // A user can hand-type `?realm=` as a bare slug (`ai-agent-partner`), but node ids
  // live in `kind:slug` space, so it silently matched nothing and rendered a raw chip
  // over the whole map. Promote it to the canonical node id
  // (`capability:ai-agent-partner`); when nothing matches, `null` hides the chip.

  // Deep-link ancestor expansion. When a `?p=slug` target sits inside a parent
  // subtree the density gate (`model/density-gate.ts`) has collapsed, its `contains`
  // ancestor chain is derived into `open=` so the target becomes visible; the
  // existing focus dive then fires once with the same easing as a click. Guarded by a
  // ref to run at most once per target slug, so a parent the user collapses
  // afterwards is not force-expanded again. Before the graph is built (zero edges)
  // the ref is left unset so the next render can try.
  const deeplinkExpandedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!canvasSelectedSlug) return;
    if (deeplinkExpandedForRef.current === canvasSelectedSlug) return;
    if (ontologyMapGraph.edges.length === 0) return;
    const parentOf = buildContainmentParentMap(ontologyMapGraph.edges);
    deeplinkExpandedForRef.current = canvasSelectedSlug;
    // `replace`, because this write normalises the deep link the user arrived on
    // rather than navigating. A push would add a history entry the user never made,
    // so their first Back would undo nothing.
    setRouteState((current) => {
      const nextExpanded = deriveDeeplinkAncestorExpansion(
        canvasSelectedSlug,
        parentOf,
        current.expandedParents,
      );
      if (nextExpanded.length === current.expandedParents.length) return current;
      return { ...current, expandedParents: nextExpanded };
    }, { replace: true });
  }, [canvasSelectedSlug, ontologyMapGraph, setRouteState]);
  return {
    routedConstellation, setActiveConstellation, drawerProject, constellationCandidates,
    setConstellationFitToken, constellationFitToken, spotlightExpandedParents
  };
}
