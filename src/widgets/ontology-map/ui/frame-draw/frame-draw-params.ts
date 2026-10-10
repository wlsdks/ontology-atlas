import type { CameraAxes } from "../../engine/camera";
import type { EdgePairFocus } from "../../model/focus-state";
import type { TopologyMapLensKind } from "../../model/path-lens";
import type { FootprintInk } from "@/shared/lib/footprint-glyph";
import type { ExpandPreference, FootprintPreference } from "@/shared/lib/appearance-preferences";
import type { DomeNodeFrame, DomeViewKind } from "../../model/dome-view";
import type { DomeLightFrame } from "../../render/dome-light";
import type { TierRevealConfig } from "../../model/tier-visibility";
import type { CanvasBackgroundVariant } from "../../render/grid";
import type { ClusterBarLabels } from "../../render/cluster-chips";
import type { ClusterChip } from "../../model/density-gate";
import type { DustPoint } from "../../render/starfield";
import type { Pulse } from "../../render/edge-fireflies";
import type { OntologyMapTokens } from "../../tokens/read-map-tokens";
import type { TopologyWorld, WorldEdge } from "../topology-world";
import type { FlatDialFrameProps } from "../topology-loop-contract";

export interface FrameDrawParams {
  ctx: CanvasRenderingContext2D;
  world: TopologyWorld;
  camera: CameraAxes;
  farT: number;
  neuralRamp?: number;
  zoomRatio: number;
  now: number;
  viewportWidth: number;
  viewportHeight: number;
  panelInsets?: {
    left: number;
    right: number;
  } | null;
  devicePixelRatio?: number;
  gridPattern: CanvasPattern | null;
  dustPoints: readonly DustPoint[];
  tokens: OntologyMapTokens;
  focusedNodeId: string | null;
  hoveredNodeId: string | null;
  hoverReleasedNodeId?: string | null;
  hoverStartedAt?: number | null;
  emphasizedNeighborId: string | null;
  hoveredEdge: {
    sourceId: string;
    targetId: string;
    relationType: string;
  } | null;
  selectedEdge: EdgePairFocus | null;
  relationCaptions?: ReadonlyMap<string, string> | null;
  captionFoldedIds?: ReadonlySet<string> | null;
  reviewQuestionIds?: ReadonlySet<string> | null;
  previewEdge: {
    sourceId: string;
    targetId: string;
    relationType: string;
    phase: "draft" | "committing";
    alpha: number;
    commitProgress: number;
  } | null;
  emphasisById: ReadonlyMap<string, number>;
  egoRevealById: ReadonlyMap<string, number>;
  focusRampById: ReadonlyMap<string, number>;
  appearById?: ReadonlyMap<string, number>;
  bornNodeIds?: ReadonlySet<string> | null;
  chipRevealById?: ReadonlyMap<string, number>;
  batchAppearById?: ReadonlyMap<string, number>;
  labelPresentById?: Map<string, number>;
  colorFocusedNodeId: string | null;
  colorSelectedEdge: EdgePairFocus | null;
  reducedMotion: boolean;
  pulses: readonly Pulse[];
  selectionPulse: {
    nodeId: string;
    startAtMs: number;
  } | null;
  agentFocusNodeId: string | null;
  clusteredIds: ReadonlySet<string>;
  clusterChips: readonly ClusterChip[];
  hoveredClusterId: string | null;
  wardingRing: {
    centerX: number;
    centerY: number;
    radius: number;
    drawProgress: number;
    caption: string | null;
  } | null;
  realmTierKinds: ReadonlyMap<string, "project" | "domain" | "capability" | "element"> | null;
  expandRevealById?: ReadonlyMap<string, number> | null;
  realmDepthById: ReadonlyMap<string, number> | null;
  realmDepthParallax: {
    depth2: {
      x: number;
      y: number;
    };
    depth3: {
      x: number;
      y: number;
    };
  } | null;
  realmDustParallax: number;
  realmOutsideReturnAlphaById: ReadonlyMap<string, number> | null;
  footprintStepsById: ReadonlyMap<string, readonly number[]>;
  footprintPref?: FootprintPreference | null;
  walkedEdgeKeys?: ReadonlySet<string> | null;
  walkedEdgeDirections?: ReadonlyMap<string, boolean> | null;
  walkedEdgeArrivalStep?: ReadonlyMap<string, number> | null;
  footprintInk?: FootprintInk;
  footprintStepColor?: string;
  footprintNewestId?: string | null;
  footprintAppear?: number;
  trailStarInk?: string | null;
  footprintNewestStep?: number;
  trailLensOpenedAtMs?: number;
  trailLensIds?: ReadonlySet<string> | null;
  realmStarPoints: readonly DustPoint[] | null;
  spotlightIds: ReadonlySet<string> | null;
  mapLensKind: TopologyMapLensKind;
  pathEdgeIds: ReadonlySet<string> | null;
  spotlightRamp: number;
  spotlightDashOffset: number;
  tierReveal?: TierRevealConfig;
  glyphStyle?: "fill" | "line";
  backgroundVariant?: CanvasBackgroundVariant;
  paintAnimatedBackground?: ((ctx: CanvasRenderingContext2D, width: number, height: number) => void) | null;
  nodeLayer?: ((ctx: CanvasRenderingContext2D) => CanvasRenderingContext2D) | null;
  depthDotPatterns?: readonly (CanvasPattern | null)[];
  expand?: ExpandPreference;
  clusterBarLabels?: ClusterBarLabels | null;
  domeFrame?: ReadonlyMap<string, DomeNodeFrame> | null;
  domeRamp?: number;
  domeRings?: readonly {
    kind: DomeViewKind;
    a: number;
    points: readonly {
      wx: number;
      wy: number;
      u: number;
    }[];
    label?: {
      wx: number;
      wy: number;
    } | null;
  }[] | null;
  domeRingAlpha?: number;
  tierNameBoxes?: readonly {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  }[] | null;
  domeTierRaisedKind?: DomeViewKind | null;
  domeControlFor?: ((edge: WorldEdge) => {
    x: number;
    y: number;
  } | null) | null;
  domeLight?: DomeLightFrame | null;
  trailLensRamp?: number;
  dial?: Pick<FlatDialFrameProps, "labels" | "evidence" | "impactLens"> | null;
}
