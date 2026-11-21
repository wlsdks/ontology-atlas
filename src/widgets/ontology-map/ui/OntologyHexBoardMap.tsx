"use client";

import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MAP_CANVAS_SURFACE_ROLE } from "@/shared/lib/map-canvas/focus-map-canvas";
import { copyCanvasAtCssSize, isMapLayoutMorphArmed, publishMapLayoutSnapshot } from "@/shared/lib/map-canvas/map-layout-morph-store";
import type { OntologyMapEdge, OntologyMapNode } from "./OntologyMap";
import type { Rect } from "../interaction/free-area";
import { DEFAULT_MAP_NAVIGATION_SPEED, type MapNavigationSpeed } from "@/shared/lib/preferences/appearance-preferences";
import { listenForGesturePinch } from "../interaction/gesture-pinch";
import { keyboardZoomIntent } from "../interaction/keyboard-zoom";
import { computeWheelZoomFactor, createPinchWheelStream, normalizeWheelDeltaY, readPinchWheel, shouldIgnoreWheelGlide } from "../interaction/wheel";
import { easeZoomScale, VIEW_CAMERA_MS, VIEW_DIM_MS, zoomStepProgress } from "../model/motion-physics";
import { hexFreeArea as freeAreaOf, hexMapChrome as mapChromeOf, hexMarks, readHexRoom, roomMovesRest, type HexCamera as Camera, type MapChrome } from "../morph/hex-marks";
import {
  computeHexBoard,
  hexBandFor,
  hexLineSpills,
  hexNeighborInDirection,
  hexTileLines,
  minNamesRadius,
  HEX_BAND_NAMES,
  HEX_BAND_PIPS,
  HEX_MAX_RADIUS,
  HEX_MIN_RADIUS,
  type HexBand,
  type HexBoardLayout,
  type HexPlacementRecord,
  type HexTile,
  type HexWalkDirection,
  hexGutter,
} from "../model/board/hex-board";
import { clampHexCamera, focusShift, regionFitCamera, restCameraAboveFooter, routeFrameOf, type RouteFrame } from "../model/board/hex-camera";
import { computeFocusPlan, planCanals, type FocusJob } from "../model/board/hex-focus-plan";
import { pickFlatTile, placeHexTooltip } from "../model/board/hex-hover";
import { useHexMeasure } from "../model/board/use-hex-measure";
import { buildHexLattice, closedNodes, HexFocusRoutes, type HexRoute } from "../model/board/hex-router";
import { buildBoardScene, isSlabBand, reliefLiftPx } from "../board/board-scene";
import { drawBoard } from "../board/board-paint";
import type { PaintedFace } from "../board/board-geometry";
import { declaredDependents } from "../board/relief-metric";
import { pickReliefTile } from "../board/relief-pick";
import { draggedPitch, ReliefPose, restingPitch } from "../board/relief-pose";
import { reliefRiseAt, RELIEF_PITCH_REST, type ReliefView } from "../board/relief-projection";
import {
  hexArrivalDuration,
  type HexDrawRoute,
  type HexEvidenceState,
  type HexTextBox,
} from "../render/hex-board";
import { readHexBoardTokensOrNull } from "../tokens/read-hex-board-tokens";
import { HexBoardFooter } from "./hex-board/HexBoardFooter";
import type { HexBoardLabels } from "./hex-board/hex-board-labels";
import { HexTileList } from "./hex-board/HexTileList";

export interface OntologyHexBoardMapProps {
  nodes: readonly OntologyMapNode[];
  edges: readonly OntologyMapEdge[];
  selectedId: string | null;
  /** node id → evidence state; absent ids are unknown. */
  evidence: ReadonlyMap<string, HexEvidenceState>;
  evidenceMeasured: boolean;
  /** Capability → the moved file's path, for the stale-only mode's second line. */
  staleFiles: ReadonlyMap<string, string>;
  labels: HexBoardLabels;
  /** The placement kept for this vault. Handed back; the board never moves what it placed. */
  placement: HexPlacementRecord | null;
  onPlacement?: (record: HexPlacementRecord) => void;
  /** The assembly motion plays once per key (the vault); later mounts arrive still. */
  arrivalKey?: string | null;
  onSelect?: (id: string) => void;
  onPaneClick?: () => void;
  onDrawnCountChange?: (drawn: number) => void;
  canvasLabel?: string;
  listLabel?: string;
  legend?: (state: { focused: boolean; canals: boolean; relief: boolean; dependentsMax: number }) => ReactNode;
  reducedMotion?: boolean;
  arrivedByMorph?: boolean;
  navigationSpeed?: MapNavigationSpeed;
  relief?: boolean;
  onReliefChange?: (on: boolean) => void;
}

const SWEEP_MS = 420;
/** Chrome that moves with a selection (INDEX folding or opening, the inspector) has settled by then. */
const CHROME_SETTLE_MS = 450;
const MIRROR_REST_MS = 120;
const ROUTE_BUDGET_MS = 4;
/** Canals avoid each other's lanes harder than focus routes do, as `layCanals` lays them. */
const CANAL_OTHER_PENALTY = 1.8;

const arrivedKeys = new Set<string>();
const risenKeys = new Set<string>();

export function OntologyHexBoardMap({
  nodes,
  edges,
  selectedId,
  evidence,
  evidenceMeasured,
  staleFiles,
  labels,
  placement,
  onPlacement,
  arrivalKey = null,
  onSelect,
  onPaneClick,
  onDrawnCountChange,
  canvasLabel,
  listLabel,
  legend,
  reducedMotion = false,
  arrivedByMorph = false,
  navigationSpeed = DEFAULT_MAP_NAVIGATION_SPEED,
  relief = false,
  onReliefChange,
}: OntologyHexBoardMapProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const footerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [room, setRoom] = useState<Rect | null>(null);
  const [footerTop, setFooterTop] = useState<number | null>(null);
  const [staleOnlyPressed, setStaleOnly] = useState(false);
  const staleOnly = evidenceMeasured && staleOnlyPressed;
  const [regionsOnly, setRegionsOnly] = useState(false);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [band, setBand] = useState<HexBand>("names");
  /** The cell size last drawn, rounded — mirrored onto the root for measurement. */
  const [drawnR, setDrawnR] = useState<number | null>(null);
  const selectedRef = useRef(selectedId);
  const camRef = useRef<Camera | null>(null);
  const restRef = useRef<Camera | null>(null);
  const animRef = useRef<{ from: Camera; to: Camera; start: number } | null>(null);
  const zoomRef = useRef<{ from: Camera; toR: number; ax: number; ay: number; startMs: number } | null>(null);
  const pinchWheelRef = useRef(createPinchWheelStream());
  const dimRef = useRef({ t: selectedId ? 1 : 0, target: selectedId ? 1 : 0 });
  const sweepRef = useRef<number | null>(null);
  const arrivalRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const rowRef = useRef<number | null>(null);
  const textBoxesRef = useRef<HexTextBox[]>([]);
  /** The hovered tile and the tooltip placer, for the frame loop (which outlives a render). */
  const hoverRef = useRef<string | null>(null);
  const placeTipRef = useRef<(id: string | null) => void>(() => {});
  const mirrorKeyRef = useRef("");
  /** Whether the room has been read yet, and whether a selection's chrome was up when it was. */
  const roomTakenRef = useRef<"none" | "rest" | "selection">("none");
  /** Asks for a reading of the room once the chrome has settled (see the room reader). */
  const readWhenSettledRef = useRef<() => void>(() => {});
  const [pose] = useState(() => {
    const settled = reducedMotion || arrivedByMorph || risenKeys.has(arrivalKey ?? "");
    if (relief && settled) risenKeys.add(arrivalKey ?? "");
    return new ReliefPose(relief && settled ? RELIEF_PITCH_REST : 0);
  });
  const bandRef = useRef<HexBand>("names");
  const pendingRiseRef = useRef(false);
  const pivotRef = useRef(0);
  const tiltRef = useRef<{ id: number; y: number; pitch: number } | null>(null);
  const dragRef = useRef<{ x: number; y: number; cam: Camera; moved: boolean; id: number } | null>(null);
  const facesRef = useRef<{ armed: boolean; last: PaintedFace[] }>({ armed: false, last: [] });
  const framesRef = useRef(0);
  const viewOf = useCallback((): ReliefView => ({ pitch: pose.pitch, pivotY: pivotRef.current }), [pose]);

  /* ── layout ─────────────────────────────────────────────────────────── */
  /*
   * The board is laid out once per graph, handed the latest placement record, so a concept
   * added later is appended to what was already placed (never re-sorted into it). The room's
   * shape is read once: it only steers a first placement, and a record fixes the seeds after.
   */
  const placementRef = useRef(placement);
  const [aspect, setAspect] = useState<number | null>(null);
  const [layout, setLayout] = useState<HexBoardLayout | null>(null);
  useEffect(() => {
    if (aspect == null) return;
    const next = computeHexBoard(
      nodes.map((n) => ({ id: n.id, label: n.label, kind: n.kind })),
      edges.map((e) => ({ source: e.source, target: e.target, kind: e.kind, relationType: e.relationType })),
      { prior: placementRef.current, aspect },
    );
    placementRef.current = next.record;
    setLayout(next);
    onPlacement?.(next.record);
  }, [nodes, edges, aspect, onPlacement]);

  const staleByDomain = useMemo(() => {
    if (!layout || !evidenceMeasured) return null;
    const m = new Map<string, number>();
    for (const c of layout.capabilities) if (evidence.get(c.id) === "stale" && c.domainId) m.set(c.domainId, (m.get(c.domainId) ?? 0) + 1);
    return m as ReadonlyMap<string, number>;
  }, [layout, evidence, evidenceMeasured]);

  const domainMeta = useMemo(() => {
    const m = new Map<string, { meta: string; stale: string | null }>();
    if (!layout) return m;
    for (const region of layout.regions) {
      m.set(region.domainId, {
        meta: labels.domainMeta({ capabilities: region.capabilityIds.length, elements: region.elementCount }),
        stale: labels.domainStale(staleByDomain ? (staleByDomain.get(region.domainId) ?? 0) : null),
      });
    }
    return m;
  }, [layout, labels, staleByDomain]);

  const plateSub = useMemo(() => {
    const m = new Map<string, string>();
    if (!layout) return m;
    for (const region of layout.regions)
      m.set(region.domainId, labels.plateSub({ capabilities: region.capabilityIds.length, stale: staleByDomain ? (staleByDomain.get(region.domainId) ?? 0) : null }));
    return m;
  }, [layout, labels, staleByDomain]);

  /**
   * Names are drawn from the smallest cell size at which every name fits its face. A title
   * tile's counts are not part of that floor: they join the name when there is room.
   */
  const boardText = useMemo(
    () => [...nodes.map((n) => n.label), ...[...domainMeta.values()].flatMap((m) => [m.meta, m.stale ?? ""]), ...plateSub.values()].join(" "),
    [nodes, domainMeta, plateSub],
  );
  const measure = useHexMeasure(boardText);
  const namesFrom = useMemo(() => (layout ? (minNamesRadius(layout, measure) ?? HEX_BAND_NAMES) : HEX_BAND_NAMES), [layout, measure]);
  /** Which names set that floor (they would spill one pixel below it) — for measurement. */
  const namesDrivers = useMemo(() => {
    if (!layout || namesFrom <= HEX_BAND_NAMES) return "";
    const R = namesFrom - 1;
    return layout.tiles
      .filter((t) => hexLineSpills(hexTileLines(t, R, measure), R, measure).length > 0)
      .map((t) => t.id)
      .join(" ");
  }, [layout, namesFrom, measure]);

  const lattice = useMemo(() => (layout ? buildHexLattice(layout) : null), [layout]);
  const metric = useMemo(
    () =>
      declaredDependents(
        nodes.map((n) => ({ id: n.id, label: n.label, kind: n.kind })),
        edges.map((e) => ({ source: e.source, target: e.target, kind: e.kind, relationType: e.relationType })),
      ),
    [nodes, edges],
  );
  const scene = useMemo(() => (layout ? buildBoardScene(layout, metric) : null), [layout, metric]);
  const liftPx = useCallback(
    (t: { id: string; domainId: string | null }, R: number): number => {
      if (!scene || !layout) return 0;
      return reliefLiftPx(scene, layout, t, R, isSlabBand(bandRef.current, R));
    },
    [scene, layout],
  );
  /**
   * Where routes may run for the camera the board is resting on (or moving to): the free map
   * less its chrome, in unit space. Set when the camera is decided, not on every frame, so a
   * route does not re-route while the camera travels.
   */
  const [routeFrame, setRouteFrame] = useState<RouteFrame | null>(null);
  const chromeRef = useRef<MapChrome | null>(null);
  const frameRoutes = useCallback((cam: Camera | null) => {
    if (!cam) return;
    const chrome = mapChromeOf(canvasRef.current);
    if (chrome) chromeRef.current = chrome;
    const next = routeFrameOf(chrome, cam, { pitch: pose.target, pivotY: pivotRef.current });
    if (next) setRouteFrame((prev) => (prev && prev.key === next.key ? prev : next));
  }, [pose]);
  const frameRoutesRef = useRef(frameRoutes);
  const blocked = useMemo(() => {
    if (!lattice || !routeFrame) return null;
    const { x0, y0, x1, y1, blocks } = routeFrame;
    return closedNodes(
      lattice,
      (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1 && !blocks.some((b) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1),
    );
  }, [lattice, routeFrame]);

  /** The resting canals as routing jobs, laid a few per frame inside the routing budget. */
  const canalPlan = useMemo(() => planCanals(layout), [layout]);
  const canalsRef = useRef(new HexFocusRoutes<"canal">());
  const canalOf = useCallback(
    (route: HexRoute): HexDrawRoute => {
      const domainOf = (id: string) => layout?.byId.get(id)?.domainId ?? id;
      const flow = canalPlan.flows.get(`${domainOf(route.sourceId)}>${domainOf(route.targetId)}`);
      return { points: route.points, nodes: route.nodes, sourceId: route.sourceId, targetId: route.targetId, role: "canal", count: flow?.count ?? 1, twoWay: flow?.twoWay ?? false, stub: route.stub };
    },
    [layout, canalPlan],
  );

  /** Who stays lit, and the focus routes, for the selection (or the hover when nothing is selected). */
  const focus = useMemo(() => computeFocusPlan(layout, selectedId, hoverId, staleOnly, evidence), [layout, selectedId, hoverId, staleOnly, evidence]);
  const focusRoutesRef = useRef(new HexFocusRoutes<FocusJob["role"]>());

  useLayoutEffect(() => {
    pivotRef.current = room ? room.y + room.height / 2 : (size?.h ?? 0) / 2;
  }, [room, size]);

  /* ── camera ─────────────────────────────────────────────────────────── */
  const restCamera = useCallback(
    (): Camera | null => (layout && room ? restCameraAboveFooter(layout, room, footerTop, relief ? RELIEF_PITCH_REST : 0) : null),
    [layout, room, footerTop, relief],
  );

  const clampCamera = useCallback(
    (c: Camera): Camera => (size && layout ? clampHexCamera(c, layout.bounds, size.w, size.h) : c),
    [size, layout],
  );

  /* ── paint ──────────────────────────────────────────────────────────── */
  const mirrorTimerRef = useRef<number | null>(null);
  const writeMirror = useCallback(
    (cam: Camera, currentBand: HexBand, plateBoxes: HexTextBox[]) => {
      const list = listRef.current;
      const wrap = wrapRef.current;
      if (!list || !wrap || !layout) return;
      const view = viewOf();
      const key = `${Math.round(cam.ox)},${Math.round(cam.oy)},${cam.R.toFixed(2)},${view.pitch.toFixed(3)}:${currentBand}:${textBoxesRef.current.length}:${layout.tiles.length}`;
      if (mirrorTimerRef.current != null) window.clearTimeout(mirrorTimerRef.current);
      mirrorTimerRef.current = null;
      if (key === mirrorKeyRef.current) {
        if (wrap.dataset.hexReady !== "true") wrap.dataset.hexReady = "true";
        return;
      }
      if (wrap.dataset.hexReady !== "false") wrap.dataset.hexReady = "false";
      const textBoxes = textBoxesRef.current;
      mirrorTimerRef.current = window.setTimeout(() => {
        mirrorTimerRef.current = null;
        mirrorKeyRef.current = key;
        const byId = new Map<string, HTMLElement>();
        for (const el of list.querySelectorAll<HTMLElement>("[data-hex-id]")) byId.set(el.dataset.hexId!, el);
        const boxes = new Map(textBoxes.map((b) => [b.id, b] as const));
        const plates = new Map(plateBoxes.map((b) => [b.id, b] as const));
        const RI = cam.R - hexGutter(cam.R);
        for (const t of layout.tiles) {
          const el = byId.get(t.id);
          if (!el) continue;
          const yt = view.pivotY + (cam.oy + t.y * cam.R - view.pivotY) * Math.cos(view.pitch) - liftPx(t, cam.R) * Math.sin(view.pitch);
          el.dataset.mark = `${Math.round(cam.ox + t.x * cam.R)},${Math.round(yt)},${Math.round(RI)}`;
          const b = boxes.get(t.id);
          el.dataset.labelBox = b ? `${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.w)},${Math.round(b.h)}` : "";
          const p = plates.get(t.id);
          el.dataset.plateBox = p ? `${Math.round(p.x)},${Math.round(p.y)},${Math.round(p.w)},${Math.round(p.h)}` : "";
        }
        wrap.dataset.hexReady = "true";
      }, MIRROR_REST_MS);
    },
    [layout, viewOf, liftPx],
  );
  useEffect(
    () => () => {
      if (mirrorTimerRef.current != null) window.clearTimeout(mirrorTimerRef.current);
      mirrorTimerRef.current = null;
    },
    [],
  );

  const paint = useCallback(
    (now: number): boolean => {
      const canvas = canvasRef.current;
      const T = readHexBoardTokensOrNull();
      if (!canvas || !size || !T || !layout || !scene || !camRef.current) return false;
      let again = false;
      const anim = animRef.current;
      if (anim) {
        // The frame's timestamp can precede the moment the move was asked for in the same
        // frame; below 0 the ease runs backwards and the board steps the wrong way first.
        const t = Math.max(0, Math.min(1, (now - anim.start) / VIEW_CAMERA_MS));
        const e = 1 - Math.pow(1 - t, 3);
        camRef.current = {
          R: anim.from.R + (anim.to.R - anim.from.R) * e,
          ox: anim.from.ox + (anim.to.ox - anim.from.ox) * e,
          oy: anim.from.oy + (anim.to.oy - anim.from.oy) * e,
        };
        if (t < 1) again = true;
        else animRef.current = null;
      }
      const zoom = zoomRef.current;
      if (zoom) {
        const progress = zoomStepProgress(now - zoom.startMs);
        const R = easeZoomScale(zoom.from.R, zoom.toR, progress);
        const k = R / zoom.from.R;
        camRef.current = clampCamera({ R, ox: zoom.ax - (zoom.ax - zoom.from.ox) * k, oy: zoom.ay - (zoom.ay - zoom.from.oy) * k });
        if (progress < 1) again = true;
        else zoomRef.current = null;
      }
      const dim = dimRef.current;
      if (dim.t !== dim.target) {
        const step = reducedMotion ? 1 : 16 / VIEW_DIM_MS;
        dim.t = dim.target > dim.t ? Math.min(dim.target, dim.t + step) : Math.max(dim.target, dim.t - step);
        if (dim.t !== dim.target) again = true;
      }
      if (pendingRiseRef.current) {
        pendingRiseRef.current = false;
        if (arrivalKey != null) arrivedKeys.add(arrivalKey);
        pose.begin(RELIEF_PITCH_REST, { now, animate: true, rise: true });
      }
      const { riseClock } = pose.step(now);
      if (pose.animating) again = true;
      if ((reducedMotion || arrivedByMorph) && arrivalKey != null) arrivedKeys.add(arrivalKey);
      if (arrivalRef.current == null && arrivalKey != null && !arrivedKeys.has(arrivalKey)) arrivalRef.current = now;
      const maxRing = layout.tiles.reduce((m, t) => Math.max(m, t.ring), 0);
      let arrivalMs: number | null = null;
      if (arrivalRef.current != null && arrivalKey != null && !arrivedKeys.has(arrivalKey)) {
        arrivalMs = now - arrivalRef.current;
        if (arrivalMs >= hexArrivalDuration(maxRing, reducedMotion)) {
          arrivedKeys.add(arrivalKey);
          arrivalMs = null;
        } else again = true;
      }
      let sweep: number | null = null;
      if (sweepRef.current != null) {
        sweep = (now - sweepRef.current) / SWEEP_MS;
        if (sweep >= 1) {
          sweepRef.current = null;
          sweep = null;
        } else again = true;
      }
      const cam = camRef.current;
      const wrap = wrapRef.current;
      const pitchText = pose.pitch.toFixed(3);
      if (wrap && wrap.dataset.hexReliefPitch !== pitchText) wrap.dataset.hexReliefPitch = pitchText;
      const record = facesRef.current.armed ? ([] as PaintedFace[]) : null;
      framesRef.current += 1;
      const currentBand = regionsOnly ? "regions" : hexBandFor(cam.R, namesFrom);
      bandRef.current = currentBand;
      const ctx = canvas.getContext("2d");
      if (!ctx) return false;
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      let routes: HexDrawRoute[] = [];
      const routeDeadline = performance.now() + ROUTE_BUDGET_MS;
      if (lattice && focus.jobs.length > 0) {
        const laid = focusRoutesRef.current.lay(lattice, focus, focus.jobs, blocked, 1.15, routeDeadline);
        routes = [...laid.routes];
        if (laid.pending) again = true;
      } else focusRoutesRef.current.clear();
      // The resting canals fade with the dim, so a selection or stale-only lets them step back.
      if (lattice && dim.t < 1) {
        const laid = canalsRef.current.lay(lattice, canalPlan, canalPlan.jobs, blocked, CANAL_OTHER_PENALTY, routeDeadline);
        routes = [...routes, ...laid.routes.map(canalOf)];
        if (laid.pending) again = true;
      }
      const { stats, textBoxes, plateBoxes } = drawBoard(
        ctx,
        layout,
        {
          width: size.w,
          height: size.h,
          R: cam.R,
          ox: cam.ox,
          oy: cam.oy,
          band: currentBand,
          selectedId,
          hoverId,
          focusId: null,
          lit: focus.lit,
          staleOnly,
          focusRegion: focus.region,
          dimT: dim.t,
          evidence,
          evidenceMeasured,
          staleFiles,
          staleByDomain,
          domainMeta,
          projectMeta: labels.projectMeta,
          plateSub,
          routes,
          arrivalMs,
          reducedMotion,
          sweep,
          measure,
        },
        T,
        scene,
        {
          pitch: pose.pitch,
          pivotY: pivotRef.current,
          rise: riseClock == null ? null : (id) => reliefRiseAt(riseClock, scene.riseDelay.get(id) ?? 0),
          record,
        },
      );
      if (record) facesRef.current.last = record;
      textBoxesRef.current = textBoxes;
      canvas.dataset.frame = JSON.stringify({ ...stats, namesFrom, staleOnly });
      // Every drawn route in canvas px, once the frame is still, so a check can hold each one
      // to the free map.
      if (!again) {
        const c = Math.cos(pose.pitch);
        const pv = pivotRef.current;
        canvas.dataset.routePaths = JSON.stringify(
          routes.map((r) => ({ role: r.role, stub: r.stub === true, pts: r.points.map((p) => [Math.round(cam.ox + p.x * cam.R), Math.round(pv + (cam.oy + p.y * cam.R - pv) * c)]) })),
        );
      }
      if (currentBand !== band) setBand(currentBand);
      if (Math.round(cam.R) !== drawnR) setDrawnR(Math.round(cam.R));
      writeMirror(cam, currentBand, plateBoxes);
      if (hoverRef.current) placeTipRef.current(hoverRef.current);
      return again;
    },
    [size, layout, scene, lattice, blocked, selectedId, hoverId, focus, staleOnly, regionsOnly, evidence, evidenceMeasured, staleFiles, staleByDomain, domainMeta, labels.projectMeta, plateSub, canalPlan, canalOf, namesFrom, measure, reducedMotion, arrivedByMorph, arrivalKey, band, drawnR, writeMirror, clampCamera, pose],
  );

  const paintRef = useRef(paint);
  const requestDraw = useCallback(() => {
    if (rafRef.current != null) return;
    const frame = (now: number) => {
      rafRef.current = null;
      if (paintRef.current(now)) rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
  }, []);
  useLayoutEffect(() => {
    mirrorKeyRef.current = "";
  }, [layout]);
  useLayoutEffect(() => {
    paintRef.current = paint;
    selectedRef.current = selectedId;
    requestDraw();
  }, [paint, selectedId, requestDraw]);

  useEffect(() => {
    const key = arrivalKey ?? "";
    if (relief && !risenKeys.has(key)) {
      risenKeys.add(key);
      if (!reducedMotion) {
        pendingRiseRef.current = true;
        requestDraw();
        return;
      }
    }
    pose.begin(relief ? RELIEF_PITCH_REST : 0, { now: performance.now(), animate: !reducedMotion, rise: false });
    requestDraw();
    frameRoutesRef.current(animRef.current?.to ?? camRef.current);
    // A change of motion preference alone does not tilt the board.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relief, pose, requestDraw]);

  /*
   * Size the backing store and measure the room (the map at rest). The first reading is taken
   * whatever is selected, since a board opening with a selection would otherwise have no layout or
   * camera; a reading taken under a selection is redone once the selection clears.
   */
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    // The legend resizing is not a new room: it only moves the footer's top.
    const readFooter = () => {
      const footer = footerRef.current?.getBoundingClientRect();
      setFooterTop(footer ? Math.round(footer.top - wrap.getBoundingClientRect().top) : null);
    };
    const read = () => {
      const chrome = mapChromeOf(canvasRef.current);
      chromeRef.current = chrome;
      const r = wrap.getBoundingClientRect();
      setSize((prev) => (prev && prev.w === r.width && prev.h === r.height ? prev : { w: r.width, h: r.height }));
      readFooter();
      if (selectedRef.current && roomTakenRef.current !== "none") return;
      roomTakenRef.current = selectedRef.current ? "selection" : "rest";
      const next = readHexRoom(canvasRef.current, r.width, r.height, wrap);
      setRoom((prev) => (roomMovesRest(prev, next) ? next : prev));
      setAspect((prev) => prev ?? next.width / Math.max(1, next.height));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(wrap);
    const footerObserver = new ResizeObserver(readFooter);
    if (footerRef.current) footerObserver.observe(footerRef.current);
    /*
     * INDEX folding or opening changes the free map without resizing the board (it floats
     * over it). Once its transition is over, re-read the room and lay the routes again. A
     * selection clearing asks through the same timer, so the two land as one reading and the
     * camera takes one path to rest.
     */
    let settle: number | null = null;
    const readWhenSettled = () => {
      if (settle != null) window.clearTimeout(settle);
      settle = window.setTimeout(() => {
        settle = null;
        read();
        frameRoutesRef.current(animRef.current?.to ?? camRef.current);
      }, CHROME_SETTLE_MS);
    };
    readWhenSettledRef.current = readWhenSettled;
    const mo = new MutationObserver(readWhenSettled);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-topology-index"] });
    return () => {
      ro.disconnect();
      footerObserver.disconnect();
      mo.disconnect();
      if (settle != null) window.clearTimeout(settle);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    requestDraw();
  }, [size, requestDraw]);

  const moveCamera = useCallback(
    (to: Camera) => {
      // A late room/layout reading must not reset the camera held by a pointer.
      if (dragRef.current) return;
      const from = camRef.current;
      if (!from) return;
      // Routes are laid for where the camera is going, so they do not re-route on arrival.
      frameRoutes(to);
      if (Math.abs(from.ox - to.ox) < 0.5 && Math.abs(from.oy - to.oy) < 0.5 && Math.abs(from.R - to.R) < 0.01) return;
      zoomRef.current = null;
      if (reducedMotion) camRef.current = to;
      else animRef.current = { from, to, start: performance.now() };
      requestDraw();
    },
    [reducedMotion, requestDraw, frameRoutes],
  );

  /*
   * Rest camera: the board fitted to the room. A new room or board re-rests unless focused. A
   * board already on screen travels there on the camera's own easing rather than cutting: the
   * room moves when INDEX folds or opens, and when a room first read under a selection is read
   * again at rest.
   */
  useEffect(() => {
    const rest = restCamera();
    if (!rest) return;
    restRef.current = rest;
    if (!camRef.current) {
      camRef.current = rest;
      frameRoutes(rest);
    } else if (!selectedRef.current) moveCamera(rest);
    requestDraw();
  }, [restCamera, requestDraw, frameRoutes, moveCamera]);

  /*
   * Selection: dim the rest, and bring the selected tile (and what it touches) clear of the
   * inspector. Positions never change — only the camera moves.
   */
  useEffect(() => {
    dimRef.current.target = selectedId || staleOnly ? 1 : 0;
    requestDraw();
    if (!selectedId) {
      if (restRef.current && camRef.current && !staleOnly) {
        const cur = camRef.current;
        // Only return to rest if the reader had not zoomed away on their own.
        if (Math.abs(cur.R - restRef.current.R) < 0.5) moveCamera(restRef.current);
      }
      chromeRef.current = null;
      // A room read with a selection's chrome up is not the map at rest: read it again once
      // that chrome has gone (INDEX may not change, so its observer cannot be relied on).
      readWhenSettledRef.current();
      return;
    }
    const makeRoom = () => {
      const cam = camRef.current;
      const free = freeAreaOf(canvasRef.current);
      if (!cam || !free || !layout) return;
      const view = viewOf();
      const shift = focusShift(layout, cam, free, view, selectedId, focus.lit ?? [], liftPx);
      if (!shift) return;
      if (shift.dx !== 0 || shift.dy !== 0) moveCamera(clampCamera({ R: cam.R, ox: cam.ox + shift.dx, oy: cam.oy + shift.dy / Math.cos(view.pitch) }));
      // The chrome changed with the selection (inspector in, INDEX folded) even when the
      // camera did not move: lay the routes in the free map as it is now.
      else frameRoutes(animRef.current?.to ?? cam);
    };
    const first = window.setTimeout(makeRoom, 60);
    const settled = window.setTimeout(makeRoom, 420);
    return () => {
      window.clearTimeout(first);
      window.clearTimeout(settled);
    };
    // `focus.lit` follows `selectedId`; reading it here must not re-run on hover.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, staleOnly, layout, clampCamera, moveCamera, requestDraw, frameRoutes, viewOf, liftPx]);

  useEffect(() => {
    if (!layout) return;
    onDrawnCountChange?.(layout.tiles.length);
  }, [layout, onDrawnCountChange]);

  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    },
    [],
  );

  const snapshotRef = useRef<() => void>(() => {});
  useLayoutEffect(() => {
    snapshotRef.current = () => {
      const T = readHexBoardTokensOrNull();
      const cam = camRef.current;
      if (!T || !cam || !layout) return;
      const rest = 1 - dimRef.current.t * (1 - (staleOnly ? T.dimFarAlpha : T.dimAlpha));
      const view = viewOf();
      const relief = view.pitch > 0 ? { ...view, heightOf: (t: HexTile) => liftPx(t, cam.R) } : undefined;
      const marks = hexMarks(layout, cam, T, (id) => (!focus.lit || focus.lit.has(id) ? 1 : rest), relief);
      publishMapLayoutSnapshot({ marks, bitmap: copyCanvasAtCssSize(canvasRef.current), ground: T.ground });
    };
  }, [layout, focus.lit, staleOnly, viewOf, liftPx]);
  useLayoutEffect(
    () => () => {
      if (isMapLayoutMorphArmed()) snapshotRef.current();
    },
    [],
  );

  /* ── input ──────────────────────────────────────────────────────────── */
  const hitTest = useCallback(
    (px: number, py: number): string | null => {
      const cam = camRef.current;
      if (!cam || !layout) return null;
      if (pose.pitch > 0 && scene) {
        const slabs = isSlabBand(bandRef.current, cam.R);
        const max = slabs ? Math.max(...scene.regionShare.values(), scene.maxHeightShare) * Math.max(1, layout.reg) * cam.R : scene.maxHeightShare * cam.R;
        return pickReliefTile(px, py, scene, cam, viewOf(), (t) => liftPx(t, cam.R), max);
      }
      return pickFlatTile(layout, cam, px, py);
    },
    [layout, scene, pose, viewOf, liftPx],
  );

  /*
   * The hover tooltip: one line beside the tile, inside the free map (never under the chrome),
   * and never over any drawn name. It stands down while something is selected — the inspector
   * names the selection — and follows the camera, so it never points at where a tile was.
   */
  const placeTip = useCallback(
    (id: string | null) => {
      const tip = tipRef.current;
      const cam = camRef.current;
      if (!tip) return;
      const t = id && layout ? layout.byId.get(id) : undefined;
      if (!t || !cam || !size || t.kind !== "capability" || selectedRef.current) {
        tip.hidden = true;
        return;
      }
      const needs = layout!.dependencies.filter((d) => d.from === t.id).length;
      const users = layout!.dependencies.filter((d) => d.to === t.id).length;
      const view = viewOf();
      const c = Math.cos(view.pitch);
      const dependents = view.pitch > 0 ? (metric.capability.get(t.id) ?? 0) : null;
      const text = labels.tooltip({ name: t.name, stale: evidence.get(t.id) === "stale", needs, users, elements: t.elementCount, dependents });
      if (tip.textContent !== text) tip.textContent = text;
      tip.hidden = false;
      const W = tip.offsetWidth;
      const H = tip.offsetHeight;
      const x = cam.ox + t.x * cam.R;
      const y = view.pivotY + (cam.oy + t.y * cam.R - view.pivotY) * c - liftPx(t, cam.R) * Math.sin(view.pitch);
      chromeRef.current ??= mapChromeOf(canvasRef.current);
      const free = chromeRef.current?.free ?? { x: 0, y: 0, width: size.w, height: size.h };
      const pick = placeHexTooltip(x, y, cam.R, c, W, H, free, textBoxesRef.current);
      tip.style.transform = `translate(${Math.round(pick.x)}px, ${Math.round(pick.y)}px)`;
    },
    [layout, size, labels, evidence, viewOf, liftPx, metric],
  );
  useLayoutEffect(() => {
    hoverRef.current = hoverId;
    placeTipRef.current = placeTip;
  }, [hoverId, placeTip]);

  useEffect(() => {
    placeTip(hoverId);
  }, [hoverId, selectedId, placeTip]);

  const wheelFrameRef = useRef<number | null>(null);
  const local = (e: { clientX: number; clientY: number; currentTarget: Element }) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 || !camRef.current) return;
    if (e.shiftKey) {
      tiltRef.current = { id: e.pointerId, y: e.clientY, pitch: pose.pitch };
      pose.hold(pose.pitch);
      e.currentTarget.setPointerCapture(e.pointerId);
      setHoverId(null);
      return;
    }
    const p = local(e);
    animRef.current = null;
    zoomRef.current = null;
    dragRef.current = { x: p.x, y: p.y, cam: camRef.current, moved: false, id: e.pointerId };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const tilt = tiltRef.current;
    if (tilt && tilt.id === e.pointerId) {
      pose.hold(draggedPitch(tilt.pitch, tilt.y - e.clientY));
      requestDraw();
      return;
    }
    const p = local(e);
    const drag = dragRef.current;
    if (drag && drag.id === e.pointerId) {
      const dx = p.x - drag.x;
      const dy = p.y - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) > 4) {
        drag.moved = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        setHoverId(null);
      }
      if (drag.moved) {
        const gain = navigationSpeed.drag;
        camRef.current = clampCamera({ R: drag.cam.R, ox: drag.cam.ox + dx * gain, oy: drag.cam.oy + (dy * gain) / Math.cos(pose.pitch) });
        requestDraw();
        return;
      }
    }
    const hit = hitTest(p.x, p.y);
    const hoverable = hit && layout?.byId.get(hit)?.kind === "capability" ? hit : null;
    e.currentTarget.style.cursor = hit ? "pointer" : "grab";
    if (hoverable !== hoverId) setHoverId(hoverable);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const tilt = tiltRef.current;
    if (tilt && tilt.id === e.pointerId) {
      tiltRef.current = null;
      const target = restingPitch(pose.pitch);
      if (target > 0) risenKeys.add(arrivalKey ?? "");
      pose.begin(target, { now: performance.now(), animate: !reducedMotion, rise: false });
      requestDraw();
      frameRoutes(camRef.current);
      if (target > 0 !== relief) onReliefChange?.(target > 0);
      return;
    }
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag && drag.id === e.pointerId && drag.moved) frameRoutes(camRef.current);
    if (!drag || drag.id !== e.pointerId || drag.moved) return;
    const p = local(e);
    const hit = hitTest(p.x, p.y);
    rowRef.current = null;
    if (hit) onSelect?.(hit);
    else onPaneClick?.();
  };
  const zoomAbout = (ax: number, screenY: number, factor: number, eased: boolean, startMs: number) => {
    const cam = camRef.current;
    if (!cam) return;
    const view = viewOf();
    const ay = (screenY - view.pivotY) / Math.cos(view.pitch) + view.pivotY;
    animRef.current = null;
    const pending = eased ? zoomRef.current : null;
    const R = Math.max(HEX_MIN_RADIUS, Math.min(HEX_MAX_RADIUS, (pending?.toR ?? cam.R) * factor));
    const k = R / cam.R;
    const destination = clampCamera({ R, ox: ax - (ax - cam.ox) * k, oy: ay - (ay - cam.oy) * k });
    if (eased) zoomRef.current = { from: cam, toR: R, ax, ay, startMs };
    else {
      zoomRef.current = null;
      camRef.current = destination;
    }
    setHoverId(null);
    requestDraw();
    if (wheelFrameRef.current != null) window.clearTimeout(wheelFrameRef.current);
    wheelFrameRef.current = window.setTimeout(() => {
      wheelFrameRef.current = null;
      frameRoutes(destination);
    }, 160);
  };
  const onWheel = useEffectEvent((e: WheelEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas || !camRef.current) return;
    const pixelDeltaY = normalizeWheelDeltaY(e.deltaY, e.deltaMode, size?.h ?? 800);
    if (shouldIgnoreWheelGlide(pixelDeltaY, e.ctrlKey)) return;
    const r = canvas.getBoundingClientRect();
    const pinch = readPinchWheel(pinchWheelRef.current, e);
    const factor = computeWheelZoomFactor(pixelDeltaY, { pinch, speed: navigationSpeed.zoom });
    zoomAbout(e.clientX - r.left, e.clientY - r.top, factor, !pinch, Math.min(performance.now(), e.timeStamp > 0 ? e.timeStamp : Infinity));
  });
  const onGesturePinch = useEffectEvent((ratio: number, clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !camRef.current) return;
    const r = canvas.getBoundingClientRect();
    zoomAbout(clientX - r.left, clientY - r.top, ratio ** navigationSpeed.zoom, false, performance.now());
  });
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const listener = (e: WheelEvent) => onWheel(e);
    canvas.addEventListener("wheel", listener, { passive: false });
    const stopGesturePinch = listenForGesturePinch(canvas, (ratio, clientX, clientY) => onGesturePinch(ratio, clientX, clientY));
    return () => {
      canvas.removeEventListener("wheel", listener);
      stopGesturePinch();
    };
  }, []);
  const onDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const hit = hitTest(local(e).x, local(e).y);
    const t = hit ? layout?.byId.get(hit) : null;
    const region = t?.domainId ? layout?.regions.find((r) => r.domainId === t.domainId) : null;
    const free = freeAreaOf(canvasRef.current);
    if (!region || !free) return;
    const view = viewOf();
    moveCamera(clampCamera(regionFitCamera(region.cells, free, view.pivotY, view.pitch)));
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (!layout) return;
    const zoomIntent = keyboardZoomIntent(e, navigationSpeed.zoom);
    if (zoomIntent) {
      e.preventDefault();
      if (zoomIntent.kind === "fit") {
        if (restRef.current) moveCamera(restRef.current);
        return;
      }
      if (size) zoomAbout(size.w / 2, size.h / 2, zoomIntent.factor, true, Math.min(performance.now(), e.timeStamp > 0 ? e.timeStamp : Infinity));
      return;
    }
    if (e.key === "Escape") {
      rowRef.current = null;
      onPaneClick?.();
      e.preventDefault();
      return;
    }
    const dir: HexWalkDirection | null =
      e.key === "ArrowUp" ? "up" : e.key === "ArrowDown" ? "down" : e.key === "ArrowLeft" ? "left" : e.key === "ArrowRight" ? "right" : null;
    if (!dir) return;
    e.preventDefault();
    const from = selectedId && layout.byId.has(selectedId) ? selectedId : (layout.project?.id ?? layout.tiles[0]?.id ?? null);
    if (!from) return;
    if (!selectedId) {
      onSelect?.(from);
      return;
    }
    const fromTile = layout.byId.get(from)!;
    if (dir === "left" || dir === "right") rowRef.current ??= fromTile.y;
    else rowRef.current = null;
    const next = hexNeighborInDirection(layout, from, dir, rowRef.current);
    if (next) onSelect?.(next);
  };

  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("e2e")) return;
    const w = window as unknown as { __atlasHexRelief?: unknown };
    w.__atlasHexRelief = {
      setPitch: (pitch: number, opts?: { animate?: boolean }) => {
        pose.begin(pitch, { now: performance.now(), animate: opts?.animate === true && !reducedMotion, rise: false });
        requestDraw();
      },
      state: () => ({ pitch: pose.pitch, target: pose.target, animating: pose.animating, frames: framesRef.current, pivotY: pivotRef.current }),
      paintedFaces: () => {
        if (!facesRef.current.armed) {
          facesRef.current.armed = true;
          requestDraw();
        }
        return facesRef.current.last;
      },
    };
    return () => {
      delete w.__atlasHexRelief;
    };
  }, [pose, reducedMotion, requestDraw]);

  const toggleStale = () => {
    setStaleOnly((on) => {
      const next = !on;
      sweepRef.current = next && !reducedMotion ? performance.now() : null;
      return next;
    });
  };

  useEffect(() => {
    requestDraw();
  }, [staleOnly, regionsOnly, hoverId, requestDraw]);

  const staleTotal = layout ? layout.capabilities.filter((c) => evidence.get(c.id) === "stale").length : 0;

  const tileList = useMemo(
    () => (
      <HexTileList
        ref={listRef}
        layout={layout}
        evidence={evidence}
        selectedId={selectedId}
        onSelect={onSelect}
        listLabel={listLabel}
        metric={metric}
        relief={relief}
        labels={labels}
      />
    ),
    [layout, evidence, selectedId, onSelect, listLabel, metric, relief, labels],
  );

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0"
      data-testid="hex-board-map"
      data-hex-band={band}
      data-hex-names-from={namesFrom}
      data-hex-names-drivers={namesDrivers || undefined}
      data-hex-pips-from={HEX_BAND_PIPS}
      data-hex-r={drawnR ?? undefined}
      data-hex-room={room ? `${room.x},${room.y},${room.width},${room.height}` : undefined}
      data-hex-capabilities={layout?.capabilities.length ?? 0}
      data-hex-stale={evidenceMeasured ? staleTotal : undefined}
      data-hex-evidence={evidenceMeasured ? "measured" : "unknown"}
      data-hex-stale-only={staleOnly ? "true" : "false"}
      data-hex-reflowed={layout?.reflowed ? "true" : "false"}
      data-hex-relief={relief ? "on" : "off"}
    >
      <canvas
        ref={canvasRef}
        data-role={MAP_CANVAS_SURFACE_ROLE}
        role={canvasLabel ? "img" : undefined}
        aria-label={canvasLabel}
        tabIndex={0}
        className="absolute inset-0 h-full w-full touch-none outline-none"
        style={{ cursor: "grab" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          dragRef.current = null;
          if (tiltRef.current) {
            tiltRef.current = null;
            pose.begin(relief ? RELIEF_PITCH_REST : 0, { now: performance.now(), animate: !reducedMotion, rise: false });
            requestDraw();
          }
        }}
        onPointerLeave={() => setHoverId(null)}
        onDoubleClick={onDoubleClick}
        onKeyDown={onKeyDown}
      />
      <div
        ref={tipRef}
        hidden
        role="tooltip"
        data-testid="hex-board-tooltip"
        className="pointer-events-none absolute left-0 top-0 max-w-[22rem] truncate rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--chrome-surface)] px-2.5 py-1.5 text-label text-[color:var(--map-panel-text-secondary)] shadow-[var(--shadow-elevation-2)]"
      />
      {layout?.reflowed ? (
        <p role="status" className="sr-only" data-testid="hex-board-widened">
          {labels.widened}
        </p>
      ) : null}
      <HexBoardFooter
        ref={footerRef}
        labels={labels}
        evidenceMeasured={evidenceMeasured}
        staleOnly={staleOnly}
        staleTotal={staleTotal}
        regionsOnly={regionsOnly}
        relief={relief}
        onToggleStale={toggleStale}
        onToggleRegions={() => setRegionsOnly((on) => !on)}
        onToggleRelief={() => onReliefChange?.(!relief)}
        legend={legend?.({ focused: !!selectedId, canals: canalPlan.jobs.length > 0 && !staleOnly, relief, dependentsMax: metric.capabilityMax })}
      />
      {tileList}
    </div>
  );
}
