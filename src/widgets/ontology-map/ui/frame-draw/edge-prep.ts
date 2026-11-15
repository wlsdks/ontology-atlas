import { edgeTierAlpha } from "../../model/visibility/tier-visibility";
import type { RelationCaption } from "../../render/relation-captions";
import { selectAmbientDependsComets, selectEgoContainsComets } from "../../render/edge-fireflies";
import type { TopologyWorld, WorldEdge } from "../world/topology-world";
import { edgeRevealProgress } from "../../expressive/edge-reveal";
import { passState } from "./frame-state";
import type { FrameInputs } from "./frame-begin";
import type { NodeAlpha } from "./node-alpha";

const EMPTY_EGO_COMET_EDGES: ReadonlySet<WorldEdge> = new Set();
const ambientDependsCometsReused = new Set<string>();
const edgeAlphaByEdges = new WeakMap<readonly WorldEdge[], Float64Array>();

const edgeEndsByWorld = new WeakMap<TopologyWorld, {
  source: Int32Array; target: Int32Array;
}>();

function edgeEndsFor(world: TopologyWorld): {
  source: Int32Array; target: Int32Array;
} {
  const known = edgeEndsByWorld.get(world);
  if (known !== undefined && known.source.length === world.edges.length) return known;
  const indexOf = new Map<string, number>();
  world.nodes.forEach((node, i) => indexOf.set(node.id, i));
  const ends = {
    source: Int32Array.from(world.edges, (edge) => indexOf.get(edge.sourceId) ?? -1),
    target: Int32Array.from(world.edges, (edge) => indexOf.get(edge.targetId) ?? -1),
  };
  edgeEndsByWorld.set(world, ends);
  return ends;
}

const edgeLiftByEdges = new WeakMap<readonly WorldEdge[], Float64Array>();
const edgeRestDimByEdges = new WeakMap<readonly WorldEdge[], Float64Array>();

export function prepareEdges(frame: FrameInputs, alpha: NodeAlpha) {
  const { focusedNodeId, world, selectedEdge, focusRampById, egoRevealById, reducedMotion,
    clusteredIds, trailLensActive } = frame;
  const { effectiveAlphaByIndex } = alpha;
  const egoCometEdges =
    focusedNodeId === null
      ? EMPTY_EGO_COMET_EDGES
      : selectEgoContainsComets(world.edges, world.edgeIndexByNode.get(focusedNodeId)).edges;
  let edgeAlphaReused = edgeAlphaByEdges.get(world.edges);
  if (edgeAlphaReused === undefined) {
    edgeAlphaReused = new Float64Array(world.edges.length);
    edgeAlphaByEdges.set(world.edges, edgeAlphaReused);
  }
  let edgeLiftReused = edgeLiftByEdges.get(world.edges);
  if (edgeLiftReused === undefined) {
    edgeLiftReused = new Float64Array(world.edges.length);
    edgeLiftByEdges.set(world.edges, edgeLiftReused);
  }
  let edgeRestDimReused = edgeRestDimByEdges.get(world.edges);
  if (edgeRestDimReused === undefined) {
    edgeRestDimReused = new Float64Array(world.edges.length);
    edgeRestDimByEdges.set(world.edges, edgeRestDimReused);
  }
  const focusRampId = trailLensActive ? null : focusedNodeId ?? selectedEdge?.sourceId ?? null;
  const edgeFocusRamp = focusRampId !== null ? Math.min(1, Math.max(0, focusRampById.get(focusRampId) ?? 0)) : 1;
  const edgeRevealAt =
    focusedNodeId !== null && !trailLensActive
      ? edgeRevealProgress(egoRevealById.get(focusedNodeId) ?? 1, reducedMotion)
      : 1;
  const captionCandidates: RelationCaption[] = [];
  passState.drawnRelationCaptions = [];
  const edgeEnds = edgeEndsFor(world);
  for (let i = 0; i < world.edges.length; i += 1) {
    const edge = world.edges[i];
    const sourceIndex = edgeEnds.source[i];
    const targetIndex = edgeEnds.target[i];
    edgeAlphaReused[i] =
      clusteredIds.has(edge.sourceId) || clusteredIds.has(edge.targetId)
        ? -1
        : edgeTierAlpha(
          sourceIndex >= 0 ? effectiveAlphaByIndex[sourceIndex] : 1,
          targetIndex >= 0 ? effectiveAlphaByIndex[targetIndex] : 1);
  }
  const ambientDependsComets = selectAmbientDependsComets(
    world.edges,
    (i) => world.edges[i].kind === "depends" && edgeAlphaReused[i] > 0.02,
    ambientDependsCometsReused);
  return {
    egoCometEdges, edgeAlphaReused, edgeLiftReused, edgeRestDimReused, edgeFocusRamp, edgeRevealAt,
    captionCandidates, ambientDependsComets,
  };
}

export type EdgePrep = Readonly<ReturnType<typeof prepareEdges>>;
