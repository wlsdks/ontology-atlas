import type { TopologyMapLensKind } from "../model/path-lens";

export interface CosmosCamera { x: number; y: number; scale: number }
export interface CosmosRoom { x: number; y: number; width: number; height: number }
export interface GalaxyPose { x: number; y: number; theta: number; wispTheta: number; wispLight: number; presence: number; condense: number; corePresence?: number }
export type CosmosBand = "spine" | "circuit" | "element";
export type CosmosArrivalMode = "replay" | "condense" | "none";

export interface CosmosInks {
  project: string; domain: string; capability: string; element: string; accent: string;
  bgNear: string; bgFar: string; filament: string; filamentHead: string; filamentDim: string;
  labelProject: string; labelDomain: string; labelCapability: string; labelElement: string; labelMeta: string;
  select: string; spotlightRestAlpha: number; pathRestAlpha: number;
}

export interface CosmosLens { kind: TopologyMapLensKind; memberIds: ReadonlySet<string>; edgeIds: ReadonlySet<string> | null }
export interface CosmosTrail { visitedIds: readonly string[] }
export interface CosmosRelation { id: string; source: string; target: string; relationType: string; directional: boolean }
export interface CosmosAttention { selectedId: string | null; hoverId: string | null; hoverGalaxy: number; focusGalaxy: number; revealMs: number }

export type CosmosLabelKind = "project" | "galaxy" | "cluster" | "element" | "count" | "hover" | "member";
export interface CosmosLabel { text: string; kind: CosmosLabelKind; id: string; x: number; y: number; width: number; height: number }
export interface LabelCandidate { text: string; kind: CosmosLabelKind; id: string; x: number; y: number; align: "center" | "left"; font: string; ink: string; meta?: string; priority: number }

export interface CosmosWebItem { from: string; to: string; count: number; twoWay: boolean; width: number; tone: "rest" | "lit" | "receded"; counted: boolean }
export interface CosmosRelationRow { source: string; target: string; dashed: boolean; progress: number; role: "selected" | "hovered" | "path" | "member" }
export interface CosmosPaintRecord { id: string; x: number; y: number; r: number }
export type CosmosPaintRecorder = ((id: string, x: number, y: number, r: number) => void) | null;

export interface CosmosFrameStats {
  impostorGalaxies: number; liveGalaxies: number; liveStars: number; culledGalaxies: number;
  labels: CosmosLabel[]; buildsStarted: number; pendingBuilds: number; firstDraws: number; zoomRatio: number;
  band: CosmosBand;
  web: { alpha: number; items: CosmosWebItem[] };
  relations: CosmosRelationRow[];
  lens: { kind: string | null; lit: number; restAlpha: number };
}
