import type { Dispatch, RefObject, SetStateAction } from "react";

import type { LibraryWorkActivity } from "@/features/library";

import type { LibraryGraph, LibraryGraphNode } from "../../model/build-library-graph";
import type { LayoutPoint } from "../../model/library-graph-layout";
import type { FlowLayout } from "../../model/library-flow-layout";
import type { IslandsLayout } from "../../model/library-islands-layout";
import type { IslandField } from "../../model/library-islands-physics";
import {
  librarySimulationBounds,
  type LibrarySimulation,
} from "../../model/library-force-simulation";
import type { LibraryGraphView, LibraryPositionLookup } from "../../model/library-graph-view";
import type { LibraryGraphLabelBox, LibraryGraphGeometry } from "../../render/draw-library-graph";
import type { LibraryGraphInk } from "../../render/library-graph-ink";

import type { LibraryGraphCardBox, LibraryIslandPick, PointerState } from "./engine-types";

export interface LibraryGraphEngineScope {
  autoFitRef: RefObject<{
    on: boolean;
    converged: boolean;
  }>;
  boxRef: RefObject<{
    width: number;
    height: number;
    dpr: number;
  }>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  cardBoxRef: RefObject<LibraryGraphCardBox | null>;
  coarsePointer: () => boolean;
  coarseTapRef: RefObject<string | null>;
  columnsRef: RefObject<FlowLayout | null>;
  dimRef: RefObject<{
    value: number;
    target: number;
  }>;
  finishGesture: (timeStamp: number, commit?: LayoutPoint) => void;
  fitScaleRef: RefObject<number>;
  flowRef: RefObject<{
    edges: Set<string>;
    stale: Set<string>;
  }>;
  focusedIslandRef: RefObject<string | null>;
  frameRef: RefObject<number>;
  ghostsRef: RefObject<Map<string, {
    node: LibraryGraphNode;
    x: number;
    y: number;
    since: number;
  }>>;
  graphRef: RefObject<LibraryGraph>;
  hitTest: (point: LayoutPoint) => LibraryGraphNode | null;
  hoveredIslandRef: RefObject<string | null>;
  inkRef: RefObject<LibraryGraphInk | null>;
  islandFieldRef: RefObject<IslandField | null>;
  islandLabelsRef: RefObject<{
    unsorted: string;
    unread: string;
  }>;
  islandOffsetsRef: RefObject<Map<string, {
    island: string;
    dx: number;
    dy: number;
  }>>;
  islandReportRef: RefObject<string[] | null>;
  islandsRef: RefObject<IslandsLayout | null>;
  labelReportRef: RefObject<LibraryGraphLabelBox[] | null>;
  lastFocusRef: RefObject<ReadonlySet<string> | null>;
  lastKnownRef: RefObject<Map<string, LibraryGraphNode>>;
  lastOverviewRef: RefObject<boolean>;
  lastPaintRef: RefObject<number>;
  layoutRef: RefObject<"flow" | "force">;
  localeRef: RefObject<string | undefined>;
  motionRef: RefObject<{
    fast: number;
    base: number;
    settle: number;
    activityCycle: number;
  }>;
  neighboursRef: RefObject<Map<string, Set<string>>>;
  onDismiss: () => void;
  onHoverIslandRef: RefObject<((island: LibraryIslandPick | null) => void) | undefined>;
  onHoverRef: RefObject<(id: string | null) => void>;
  onLeaveIslandRef: RefObject<(() => void) | undefined>;
  onPressIslandRef: RefObject<((island: LibraryIslandPick) => void) | undefined>;
  onPressMark: (node: LibraryGraphNode) => void;
  overviewGeometryRef: RefObject<{
    nodes: LibrarySimulation["nodes"];
    ticks: number;
    radii: Map<string, number>;
    columns: FlowLayout | null;
    islands: IslandsLayout | null;
    moving: boolean;
    bounds: ReturnType<typeof librarySimulationBounds>;
    geometry: LibraryGraphGeometry;
  } | null>;
  overviewRef: RefObject<boolean>;
  /** `settling`: the loop paints another frame after this one. Returns whether a name is still fading. */
  paint: (now: number, settling: boolean) => boolean;
  paintCostRef: RefObject<{
    last: number;
    total: number;
    frames: number;
    worst: number;
  }>;
  pendingBoxRef: RefObject<{
    width: number;
    height: number;
    dpr: number;
  } | null>;
  pick: (island: IslandsLayout["islands"][number]) => LibraryIslandPick;
  pictureRef: RefObject<"flow" | "force" | "islands">;
  pinchRef: RefObject<{
    distance: number;
    mid: LayoutPoint;
  } | null>;
  placeCard: (openNow?: string | null) => void;
  pointerRef: RefObject<PointerState>;
  pointOf: (event: {
    clientX: number;
    clientY: number;
  }) => LayoutPoint;
  publishAspect: () => void;
  publishFramed: (next: boolean) => void;
  publishWalkOrder: (layout: FlowLayout | null) => void;
  pulseRef: RefObject<{
    homeAt: number | null;
    armed: boolean;
  }>;
  radiiRef: RefObject<Map<string, number>>;
  rectRef: RefObject<{
    left: number;
    top: number;
  }>;
  runningRef: RefObject<boolean>;
  screenPointsRef: RefObject<Map<string, LayoutPoint>>;
  screenRadiiRef: RefObject<Map<string, number>>;
  screenRadiusSourceRef: RefObject<{
    radii: Map<string, number>;
    scale: number;
  } | null>;
  screenRef: RefObject<LibraryPositionLookup>;
  setIslandsList: Dispatch<SetStateAction<readonly LibraryIslandPick[]>>;
  setPicture: Dispatch<SetStateAction<"flow" | "force" | "islands">>;
  simRef: RefObject<LibrarySimulation | null>;
  stalePagesRef: RefObject<Set<string>>;
  stateRef: RefObject<{
    selectedId: string | null;
    hoveredId: string | null;
    focusedId: string | null;
    highlight: ReadonlySet<string> | null;
    activeLabel: string | null;
    standingLabels: boolean;
    reducedMotion: boolean;
    activity: LibraryWorkActivity | undefined;
    visible: boolean;
    cardId: string | null;
  }>;
  stepRef: RefObject<(now: number) => void>;
  syncCostRef: RefObject<number>;
  syncSimulationRef: RefObject<() => void>;
  takeCamera: () => void;
  touchesRef: RefObject<Map<number, LayoutPoint>>;
  travelRef: RefObject<{
    from: Map<string, LayoutPoint>;
    since: number;
  } | null>;
  viewRef: RefObject<LibraryGraphView>;
  wake: () => void;
  wasSettlingRef: RefObject<boolean>;
  wheelReturnedAtRef: RefObject<number>;
  worldPositionsRef: RefObject<Map<string, LayoutPoint>>;
  zoomAimRef: RefObject<string | null>;
  zoomMaxRef: RefObject<number>;
}
