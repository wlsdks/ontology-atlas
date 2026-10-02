import { copyCanvasAtCssSize, isMapLayoutMorphArmed, publishMapLayoutSnapshot, type MapLayoutMark } from "@/shared/lib/map-layout-morph-store";
import { readHexRoom } from "../morph/hex-marks";
import type { MapLayoutTarget } from "../morph/MapLayoutMorphOverlay";
import type { OntologyMapEdge, OntologyMapNode } from "../ui/OntologyMap";
import { readOntologyMapTokensOrNull } from "../ui/topology-read-tokens";
import { cosmosLayoutFor } from "./layout/cosmos-layout-cache";
import { MIN_STAR_SPACING, type CosmosPlacementRecord } from "./layout/cosmos-layout";
import { overviewCamera, worldToScreen } from "./cosmos-camera";
import type { CosmosInks, CosmosPaintRecord } from "./cosmos-types";

type Kind = OntologyMapNode["kind"];

const KIND_SIZE: Readonly<Record<Kind, number>> = { project: 8, domain: 8, capability: 4, element: 2.4 };

function disc(id: string, x: number, y: number, size: number, ink: string): MapLayoutMark {
  return { id, x, y, size, shape: "disc", fill: ink, stroke: ink, alpha: 1 };
}

export function predictCosmosMarks({
  nodes,
  edges,
  placement,
  host,
}: {
  nodes: readonly OntologyMapNode[];
  edges: readonly OntologyMapEdge[];
  placement: CosmosPlacementRecord | null;
  host: HTMLCanvasElement;
}): MapLayoutTarget | null {
  const tokens = readOntologyMapTokensOrNull();
  const box = host.getBoundingClientRect();
  if (!tokens || box.width <= 0 || box.height <= 0 || nodes.length === 0) return null;
  const layout = cosmosLayoutFor(nodes, edges, placement, false);
  const room = readHexRoom(host, box.width, box.height);
  const { camera } = overviewCamera(layout.bounds, room);
  const ink: Readonly<Record<Kind, string>> = {
    project: tokens.galaxyProject,
    domain: tokens.galaxyDomain,
    capability: tokens.galaxyCapability,
    element: tokens.galaxyElement,
  };
  const halo = Math.min(7, Math.max(1.2, MIN_STAR_SPACING * camera.scale * 0.45));
  const centres = new Map(layout.galaxies.map((g) => [g.id, { x: g.x, y: g.y }]));
  const marks: MapLayoutMark[] = [];
  for (const node of nodes) {
    const point = centres.get(node.id) ?? layout.points.get(node.id);
    if (!point) continue;
    const p = worldToScreen(camera, room, point.x, point.y);
    const inHalo = node.kind !== "project" && (layout.galaxyOf.get(node.id) ?? -1) < 0;
    marks.push(disc(node.id, p.x, p.y, inHalo ? halo : KIND_SIZE[node.kind], ink[node.kind]));
  }
  return { marks, ground: tokens.canvasBgFar };
}

export function publishCosmosSnapshot({
  marks,
  canvas,
  inks,
}: {
  marks: readonly (CosmosPaintRecord & { kind?: Kind })[];
  canvas: HTMLCanvasElement;
  inks: CosmosInks;
}): void {
  if (!isMapLayoutMorphArmed()) return;
  publishMapLayoutSnapshot({
    marks: marks.map((m) => disc(m.id, m.x, m.y, m.r, m.kind ? inks[m.kind] : inks.domain)),
    bitmap: copyCanvasAtCssSize(canvas),
    ground: inks.bgFar,
  });
}
