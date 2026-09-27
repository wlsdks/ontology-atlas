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

  // Merges every changed node's ancestor chain as a derived expansion, or a changed node hides in
  // a cluster chip.
  // Derived from `?recent=` without touching `?open=`, so links stay reproducible and lens-off
  // restores the user's own.
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

  // The canvas wants a node id; project deep links send a bare slug, so projects resolve through
  // the same rule.
  // Without a node the bare slug is kept and the canvas drops it to "nothing selected".
  // A selection confirmed to exist (`../lib/resolve-canvas-selection.ts`): `canvasSelectedSlug`
  // holds the raw
  // slug while undecided, so anything that writes a permanent record, like the first-visit hint,
  // reads this.
  const drawerProject = selectedProject;

  // A hand-typed bare `?realm=` slug is promoted to its canonical id; null hides the chip.

  // Derives the collapsed ancestors of a `?p=` target into `open=`, at most once per slug (ref
  // guard),
  // so a parent the user collapses later stays collapsed. With zero edges the ref stays unset to
  // retry.
  const deeplinkExpandedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!canvasSelectedSlug) return;
    if (deeplinkExpandedForRef.current === canvasSelectedSlug) return;
    if (ontologyMapGraph.edges.length === 0) return;
    const parentOf = buildContainmentParentMap(ontologyMapGraph.edges);
    deeplinkExpandedForRef.current = canvasSelectedSlug;
    // `replace`: normalising the arrival link must not add a Back entry the user never made.
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
