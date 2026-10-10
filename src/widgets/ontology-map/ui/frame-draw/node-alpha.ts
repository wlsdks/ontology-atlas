import { egoRestSink } from "../../model/focus-state";
import { effectiveNodeAlpha, nodeTierAlpha } from "../../model/tier-visibility";
import { isPreviewEndpoint, isPreviewEndpointHidden } from "../../render/preview-edge";
import { S, domeNodeFrameReused, effectiveAlphaByIdReused, lodHoverEgoReused } from "./frame-state";
import { type FrameScope } from "./frame-scope";

let effectiveAlphaByIndexReused = new Float64Array(0);

export function computeNodeAlpha(F: FrameScope): void {
  const { world, previewEdge, clusteredIds, realmTierKinds, zoomRatio, tierReveal, focusedNodeId,
    selectedEdge, spotlightIds, spotlightRamp, expandRevealById, bornNodeIds, appearById,
    egoRevealById, realmOutsideReturnAlphaById, focusRampById, tokens, agentFocusNodeId,
    emphasisById, clusterChips, spotlightLensActive, trailLensActive, isTrailKept, domeOn,
    neighborsOfFocusedRaw, neighborsOfFocused, lod } = F;
  if (S.effectiveAlphaWorld?.deref() !== world) {
    effectiveAlphaByIdReused.clear();
    S.effectiveAlphaWorld = new WeakRef(world);
  }
  const effectiveAlphaById = effectiveAlphaByIdReused;
  if (effectiveAlphaByIndexReused.length < world.nodes.length) {
    effectiveAlphaByIndexReused = new Float64Array(world.nodes.length);
  }
  const effectiveAlphaByIndex = effectiveAlphaByIndexReused;
  for (let nodeIndex = 0; nodeIndex < world.nodes.length; nodeIndex += 1) {
    const node = world.nodes[nodeIndex];
    const previewEndpoint = isPreviewEndpoint(previewEdge, node.id);
    if (isPreviewEndpointHidden(clusteredIds.has(node.id), previewEdge, node.id)) {
      effectiveAlphaById.delete(node.id);
      effectiveAlphaByIndex[nodeIndex] = 1;
      continue;
    }
    const tierKind = realmTierKinds?.get(node.id) ?? node.kind;
    const tierAlpha = nodeTierAlpha(tierKind, node.isHub, zoomRatio, tierReveal);
    const isPairMember =
      focusedNodeId === null &&
      selectedEdge !== null &&
      (node.id === selectedEdge.sourceId || node.id === selectedEdge.targetId);
    const trailKept = isTrailKept(node.id);
    const isEgoMember =
      isPairMember ||
      trailKept ||
      previewEndpoint ||
      (focusedNodeId !== null && (node.id === focusedNodeId || neighborsOfFocused.has(node.id)));
    const spotlightReveal =
      spotlightLensActive && spotlightIds !== null && spotlightIds.has(node.id) ? spotlightRamp : 0;
    const chipExpandReveal = expandRevealById?.get(node.id) ?? 0;
    const bornReveal = bornNodeIds?.has(node.id)
      ? Math.min(1, Math.max(0, appearById?.get(node.id) ?? 1))
      : 0;
    const baseAlpha = effectiveNodeAlpha(
      tierAlpha,
      isEgoMember || chipExpandReveal > 0 || bornReveal > 0,
      Math.max(
        isPairMember || trailKept ? 1 : (egoRevealById.get(node.id) ?? 0),
        spotlightReveal,
        chipExpandReveal,
        bornReveal,
        previewEndpoint ? previewEdge?.alpha ?? 1 : 0));
    const returnAlpha = realmOutsideReturnAlphaById?.get(node.id);
    let outAlpha = returnAlpha !== undefined ? baseAlpha * returnAlpha : baseAlpha;
    if ((focusedNodeId !== null || selectedEdge !== null) && !isEgoMember && !trailLensActive) {
      outAlpha *= egoRestSink(focusRampById.get(node.id) ?? 0, tokens.egoRestAlpha);
    }
    if (domeOn) {
      const domeA = domeNodeFrameReused[nodeIndex].a;
      let presence = 1;
      if (lod !== null) {
        presence = lod.presence[nodeIndex] ?? 1;
        if (presence < 1) {
          const attended = Math.max(
            isPairMember || trailKept || previewEndpoint || node.id === agentFocusNodeId ? 1 : 0,
            focusedNodeId !== null && (node.id === focusedNodeId || neighborsOfFocusedRaw.has(node.id))
              ? (egoRevealById.get(node.id) ?? 0)
              : 0,
            lodHoverEgoReused.has(node.id) ? (emphasisById.get(node.id) ?? 0) : 0,
            spotlightReveal,
            bornReveal);
          if (attended > presence) presence = attended;
        }
        S.lodPresenceReused[nodeIndex] = presence;
      }
      if (domeA > 0) outAlpha = outAlpha + (presence - outAlpha) * domeA;
    }
    effectiveAlphaById.set(node.id, outAlpha);
    effectiveAlphaByIndex[nodeIndex] = outAlpha;
  }
  const expandedParentIds = new Set<string>();
  const expandedDiscIds = new Set<string>();
  const expandedChildIds = new Set<string>();
  for (const chip of clusterChips) {
    if (!chip.expanded || chip.ego) continue;
    expandedParentIds.add(chip.parentId);
    for (const childId of world.childrenByParent.get(chip.parentId) ?? []) {
      expandedChildIds.add(childId);
    }
    const stack = [chip.parentId];
    while (stack.length > 0) {
      const id = stack.pop() as string;
      if (expandedDiscIds.has(id)) continue;
      expandedDiscIds.add(id);
      const children = world.childrenByParent.get(id);
      if (children) stack.push(...children);
    }
  }
  const anyExpanded = expandedParentIds.size > 0;
  F.effectiveAlphaById = effectiveAlphaById;
  F.effectiveAlphaByIndex = effectiveAlphaByIndex;
  F.expandedParentIds = expandedParentIds;
  F.expandedDiscIds = expandedDiscIds;
  F.expandedChildIds = expandedChildIds;
  F.anyExpanded = anyExpanded;
}
