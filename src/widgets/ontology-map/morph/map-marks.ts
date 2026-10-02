import type { ExpandStructure } from "@/shared/lib/appearance-preferences";
import type { MapLayoutMark, MapLayoutMarkShape, MapLayoutView } from "@/shared/lib/map-layout-morph-store";
import type { CameraAxes } from "../engine/camera";
import { measureCanvasInsets, measureEdgeFitObstacle } from "../interaction/free-area";
import type { DomeNodeFrame, DomeRuntime } from "../model/dome-view";
import { predictCosmosMarks } from "../galaxy/cosmos-marks";
import type { CosmosPlacementRecord } from "../galaxy/layout/cosmos-layout";
import type { HexPlacementRecord } from "../model/hex-board";
import { HITTABLE_MIN_TIER_ALPHA } from "../model/tier-visibility";
import { readHexBoardTokensOrNull } from "../tokens/read-hex-board-tokens";
import type { OntologyMapTokens } from "../tokens/read-map-tokens";
import type { OntologyMapEdge, OntologyMapNode } from "../ui/OntologyMap";
import { computeOverviewCameraTarget } from "../ui/topology-camera-math";
import { lastDrawnNodeAlphas } from "../ui/topology-frame-draw";
import { overviewBoundsFor, overviewFitTokens } from "../ui/topology-overview-fit";
import { readOntologyMapTokensOrNull } from "../ui/topology-read-tokens";
import {
  buildTopologyWorld,
  computeFoldedIds,
  isSpineNode,
  radiusForKind,
  type TopologyWorld,
  type WorldNodeKind,
} from "../ui/topology-world";
import { predictHexMarks } from "./hex-marks";
import type { MapLayoutTarget } from "./MapLayoutMorphOverlay";
import { predictTerritoryTarget } from "./territories-marks";

const FLAT_SHAPE: Readonly<Record<WorldNodeKind, MapLayoutMarkShape>> = {
  project: "hex",
  domain: "square",
  capability: "disc",
  element: "square",
};

function markStyle(kind: WorldNodeKind, galaxy: boolean, tokens: OntologyMapTokens) {
  if (galaxy) {
    const ink = { project: tokens.galaxyProject, domain: tokens.galaxyDomain, capability: tokens.galaxyCapability, element: tokens.galaxyElement }[kind];
    return { shape: "disc" as const, fill: ink, stroke: ink };
  }
  const fill = { project: tokens.nodeFillProject, domain: tokens.nodeFillDomain, capability: tokens.nodeFillCapability, element: tokens.nodeFillElement }[kind];
  const stroke = { project: tokens.amberHub, domain: tokens.nodeStrokeDomain, capability: tokens.nodeStrokeCapability, element: tokens.nodeStrokeElement }[kind];
  return { shape: FLAT_SHAPE[kind], fill, stroke };
}

function ontologyMapMarks({
  world,
  camera,
  width,
  height,
  tokens,
  galaxy,
  alphaOf,
  domeFrame,
}: {
  world: TopologyWorld;
  camera: CameraAxes;
  width: number;
  height: number;
  tokens: OntologyMapTokens;
  galaxy: boolean;
  alphaOf: (id: string) => number;
  domeFrame: ReadonlyMap<string, DomeNodeFrame> | null;
}): MapLayoutMark[] {
  const scale = camera.scale.value;
  const marks: MapLayoutMark[] = [];
  for (const node of world.nodes) {
    const frame = domeFrame?.get(node.id);
    const alpha = alphaOf(node.id) * (frame ? frame.a : 1);
    if (alpha <= HITTABLE_MIN_TIER_ALPHA) continue;
    marks.push({
      id: node.id,
      x: (node.x + (frame?.dx ?? 0) - camera.x.value) * scale + width / 2,
      y: (node.y + (frame?.dy ?? 0) - camera.y.value) * scale + height / 2,
      size: radiusForKind(node.kind, tokens) * node.magnitudeScale * (frame?.s ?? 1) * scale,
      ...markStyle(node.kind, galaxy, tokens),
      alpha,
    });
  }
  return marks;
}

export function readOntologyMapMarks({
  worldRef,
  cameraRef,
  viewportRef,
  domeRuntimeRef,
  galaxyRampRef,
}: {
  worldRef: { current: TopologyWorld | null };
  cameraRef: { current: CameraAxes };
  viewportRef: { current: { width: number; height: number } };
  domeRuntimeRef: { current: DomeRuntime | null };
  galaxyRampRef: { current: number };
}): MapLayoutMark[] {
  const world = worldRef.current;
  const tokens = readOntologyMapTokensOrNull();
  const { width, height } = viewportRef.current;
  if (!world || !tokens || width <= 0) return [];
  const dome = domeRuntimeRef.current;
  const drawn = lastDrawnNodeAlphas();
  return ontologyMapMarks({
    world,
    camera: cameraRef.current,
    width,
    height,
    tokens,
    galaxy: galaxyRampRef.current > 0.5,
    alphaOf: (id) => drawn.get(id) ?? 0,
    domeFrame: dome !== null && dome.rampClock > 0 ? dome.frame : null,
  });
}

function measuredCameraTokens(
  host: HTMLCanvasElement,
  tokens: OntologyMapTokens,
): OntologyMapTokens & { obstacleInsetLeft: number; obstacleInsetRight: number } {
  const box = host.getBoundingClientRect();
  const measured = measureCanvasInsets(host, { x: box.x, y: box.y, width: box.width, height: box.height });
  return {
    ...tokens,
    safeInsetLeft: Math.max(tokens.safeInsetLeft, measured.left),
    safeInsetRight: Math.max(tokens.safeInsetRight, measured.right),
    obstacleInsetLeft: Math.max(measured.left, measureEdgeFitObstacle(host, "left")?.reach ?? 0),
    obstacleInsetRight: Math.max(measured.right, measureEdgeFitObstacle(host, "right")?.reach ?? 0),
  };
}

function predictOntologyMapMarks({
  nodes,
  edges,
  host,
  tokens,
  expandStructure,
  overviewFit,
  expandedParents,
}: {
  nodes: readonly OntologyMapNode[];
  edges: readonly OntologyMapEdge[];
  host: HTMLCanvasElement;
  tokens: OntologyMapTokens;
  expandStructure: ExpandStructure;
  overviewFit: "spine" | "full";
  expandedParents: ReadonlySet<string>;
}): MapLayoutMark[] | null {
  const box = host.getBoundingClientRect();
  if (box.width <= 0 || box.height <= 0 || nodes.length === 0) return null;
  const world = buildTopologyWorld(nodes, edges, tokens, expandStructure);
  const bounds = overviewBoundsFor(overviewFit, world, tokens, expandedParents, null);
  const target = computeOverviewCameraTarget(
    bounds,
    box.width,
    box.height,
    overviewFitTokens(measuredCameraTokens(host, tokens), false),
    world.nodes.length,
  );
  const camera: CameraAxes = {
    x: { value: target.tx, velocity: 0 },
    y: { value: target.ty, velocity: 0 },
    scale: { value: target.tscale, velocity: 0 },
  };
  const folded = computeFoldedIds(world, expandedParents);
  const drawn = (id: string) => {
    const node = world.nodeById.get(id);
    if (!node) return false;
    if (folded.has(id)) return false;
    return isSpineNode(node) || (node.parentId !== null && expandedParents.has(node.parentId));
  };
  return ontologyMapMarks({ world, camera, width: box.width, height: box.height, tokens, galaxy: false, alphaOf: (id) => (drawn(id) ? 1 : 0), domeFrame: null });
}

export interface MapLayoutTargetInput {
  nodes: readonly OntologyMapNode[];
  edges: readonly OntologyMapEdge[];
  territoryStats: (domain: { capabilityCount: number; elementCount: number; staleCount: number | null }) => { text: string };
  hexPlacement: HexPlacementRecord | null;
  cosmosPlacement?: CosmosPlacementRecord | null;
  expandStructure: ExpandStructure;
  overviewFit: "spine" | "full";
  expandedParents: ReadonlySet<string>;
}

export function predictMapLayoutTarget(view: MapLayoutView, input: MapLayoutTargetInput, host: HTMLCanvasElement): MapLayoutTarget | null {
  const tokens = readOntologyMapTokensOrNull();
  if (!tokens) return null;
  const { nodes, edges } = input;
  if (view === "hex") {
    const hexTokens = readHexBoardTokensOrNull();
    const marks = hexTokens ? predictHexMarks({ nodes, edges, prior: input.hexPlacement, host, tokens: hexTokens }) : null;
    return marks && hexTokens ? { marks, ground: hexTokens.ground } : null;
  }
  if (view === "territories") {
    const target = predictTerritoryTarget({
      nodes,
      edges,
      domainStats: ({ capabilityCount, elementCount }) => input.territoryStats({ capabilityCount, elementCount, staleCount: null }).text,
      host,
      tokens,
    });
    return target ? { ...target, ground: tokens.canvasBgNear } : null;
  }
  if (view === "galaxy") return predictCosmosMarks({ nodes, edges, placement: input.cosmosPlacement ?? null, host });
  const marks = view === "flat" ? predictOntologyMapMarks({ ...input, host, tokens }) : null;
  return marks ? { marks, ground: tokens.canvasBgNear } : null;
}
