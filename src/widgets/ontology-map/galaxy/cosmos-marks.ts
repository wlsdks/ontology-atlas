import type { MapLayoutTarget } from "../morph/MapLayoutMorphOverlay";
import type { OntologyMapEdge, OntologyMapNode } from "../ui/OntologyMap";
import type { CosmosPlacementRecord } from "./layout/cosmos-layout";
import type { CosmosInks, CosmosPaintRecord } from "./cosmos-types";

export function predictCosmosMarks(_input: {
  nodes: readonly OntologyMapNode[];
  edges: readonly OntologyMapEdge[];
  placement: CosmosPlacementRecord | null;
  host: HTMLCanvasElement;
}): MapLayoutTarget | null {
  return null;
}

export function publishCosmosSnapshot(_input: { marks: readonly CosmosPaintRecord[]; canvas: HTMLCanvasElement; inks: CosmosInks }): void {}
