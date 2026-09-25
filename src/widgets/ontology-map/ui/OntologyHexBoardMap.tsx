"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MAP_CANVAS_SURFACE_ROLE } from "@/shared/lib/focus-map-canvas";
import { Chip } from "@/shared/ui/controls";
import type { OntologyMapEdge, OntologyMapNode } from "./OntologyMap";
import { collectCanvasObstacles, computeFreeArea, type Rect } from "../interaction/free-area";
import { computeWheelZoomFactor, normalizeWheelDeltaY } from "../interaction/wheel";
import {
  computeHexBoard,
  fitHexRadius,
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
  type HexMeasure,
  type HexPlacementRecord,
  type HexTextRole,
  type HexWalkDirection,
  hexGutter,
} from "../model/hex-board";
import { SQRT3 } from "../model/hex-grid";
import { buildHexLattice, closedNodes, HexRouter, pickPillSpot } from "../model/hex-router";
import {
  drawHexBoard,
  hexArrivalDuration,
  hexFonts,
  type HexDrawRoute,
  type HexEvidenceState,
  type HexTextBox,
} from "../render/hex-board";
import { readHexBoardTokensOrNull } from "../tokens/read-hex-board-tokens";

/**
 * **Hex board** — the flat map as a board of hexagonal tiles (owner decision, 2026-09-25; spec
 * "F2"). One capability is one tile, a domain a region of tiles round its title tile, the
 * project the centre. `model/hex-board.ts` owns placement and labels, `model/hex-router.ts`
 * the routes, `render/hex-board.ts` the paint. This component owns the canvas, the camera
 * (drag pans, the wheel scales the cell about the pointer, 8–96 px), hit testing, the arrow-key
 * walk, the stale-only and names-off states, the hover tooltip, and a DOM list that mirrors
 * every tile for assistive technology and for measurement.
 *
 * Selection is the page's: a click calls `onSelect` with the node id, as the flat map does, so
 * the same inspector opens beside the map. The board draws the ego focus — the selected tile
 * and what it needs and what uses it, routed through the moat; everything else recedes.
 */

export interface HexBoardLabels {
  staleOnly: (count: number) => string;
  regionsOnly: string;
  /** Said once when the board had to widen (a region overflowed). */
  widened: string;
  /** One line for the hover tooltip. */
  tooltip: (facts: { name: string; stale: boolean; needs: number; users: number; elements: number }) => string;
  domainMeta: (facts: { capabilities: number; elements: number }) => string;
  domainStale: (count: number | null) => string | null;
  projectMeta: string | null;
  /** The far band's plate sub-line: capability count, and stale count when measured. */
  plateSub: (facts: { capabilities: number; stale: number | null }) => string;
}

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
  /** The legend, composed by the page for the state the board is in. */
  legend?: (state: { staleOnly: boolean; focused: boolean }) => ReactNode;
  reducedMotion?: boolean;
}

const DIM_MS = 180;
const CAMERA_MS = 240;
const SWEEP_MS = 420;
const PAN_KEEP = 160;
/** Room the chrome leaves free at rest: below the tool lane, above the legend. */
const ROOM_TOP = 96;
/** The board's top edge keeps at least this much air under the tool lane's real bottom. */
const ROOM_UNDER_TOOLBAR = 24;
const ROOM_BOTTOM = 96;
const ROOM_RIGHT = 72;
const ROOM_LEFT_PAD = 16;
/** Canals shown in the far band (spec §7). */
const FAR_CANALS = 14;

const arrivedKeys = new Set<string>();

let measureContext: CanvasRenderingContext2D | null = null;
function measureText(text: string, role: HexTextRole): number {
  if (typeof document === "undefined") return text.length * 7;
  measureContext ??= document.createElement("canvas").getContext("2d");
  if (!measureContext) return text.length * 7;
  measureContext.font = hexFonts()[role];
  return measureContext.measureText(text).width;
}

/**
 * The board's text measure, as a new function once the product face it measures in has loaded
 * (see `hexFonts`). Until then the names are measured in the system stack behind it; the new
 * identity re-measures the names floor and repaints, so the band is decided in the face drawn.
 */
function useHexMeasure(): HexMeasure {
  const [ready, setReady] = useState(() => typeof document === "undefined" || !document.fonts || document.fonts.check(hexFonts().capability));
  useEffect(() => {
    if (ready || typeof document === "undefined" || !document.fonts) return;
    let live = true;
    const done = () => {
      if (live) setReady(true);
    };
    const fonts = hexFonts();
    void Promise.all([fonts.capability, fonts.capabilityStrong, fonts.domain, fonts.plate].map((font) => document.fonts.load(font))).then(done, done);
    return () => {
      live = false;
    };
  }, [ready]);
  return useMemo<HexMeasure>(() => (ready ? (text, role) => measureText(text, role) : measureText), [ready]);
}

/** A route keeps this far (CSS px) from the free map's edges and from every piece of chrome. */
const ROUTE_CLEAR = 10;
/** Chrome whose top is this close to the canvas's top edge belongs to the top lane. */
const TOP_LANE_REACH = 48;
/** Chrome whose left is this close to the free map's left edge is attached to it (the INDEX tab). */
const EDGE_REACH = 8;

interface MapChrome {
  /** The free map, canvas-relative. */
  free: Rect;
  /** Every other piece of chrome over the canvas, canvas-relative. */
  blocks: Rect[];
}

/**
 * The free map and the chrome over it, measured from the DOM (`interaction/free-area`).
 *
 * `computeFreeArea` subtracts panels and bars: INDEX open, the inspector, the dock, the footer.
 * The pieces too small to count as a panel still cover the map, and a route must not run
 * under them: the tool lane is a bar only while it spans 60 % of the canvas (with INDEX open
 * it may not), and the folded INDEX tab is 26 px wide. So the top edge also comes down to the
 * lowest chrome in the top lane, the left edge moves right of chrome attached to it, and every
 * piece of chrome is returned as a block for the router to keep out of.
 */
function mapChromeOf(canvas: HTMLCanvasElement | null): MapChrome | null {
  if (!canvas) return null;
  const r = canvas.getBoundingClientRect();
  const canvasRect = { x: r.x, y: r.y, width: r.width, height: r.height };
  const free = computeFreeArea(canvasRect, collectCanvasObstacles(canvas, canvasRect));
  const small = collectCanvasObstacles(canvas, canvasRect, { minSide: 12 });
  let left = free.x;
  let top = free.y;
  const right = free.x + free.width;
  const bottom = free.y + free.height;
  for (const b of small) {
    if (b.height >= canvasRect.height * 0.6 || b.width >= canvasRect.width * 0.6) continue;
    if (b.y <= canvasRect.y + TOP_LANE_REACH) top = Math.max(top, b.y + b.height);
  }
  for (const b of small) {
    if (b.height >= canvasRect.height * 0.6 || b.width >= canvasRect.width * 0.6) continue;
    if (b.y + b.height <= top) continue;
    if (b.x <= left + EDGE_REACH && b.x + b.width > left) left = Math.max(left, b.x + b.width);
  }
  const rel = (b: Rect): Rect => ({ x: b.x - r.x, y: b.y - r.y, width: b.width, height: b.height });
  const out =
    right - left > 80 && bottom - top > 80 ? { x: left, y: top, width: right - left, height: bottom - top } : free;
  return { free: rel(out), blocks: small.map(rel) };
}

function freeAreaOf(canvas: HTMLCanvasElement | null): Rect | null {
  return mapChromeOf(canvas)?.free ?? null;
}

/** Where routes may run, in the board's unit space, for one camera. */
interface RouteFrame {
  key: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  blocks: { x0: number; y0: number; x1: number; y1: number }[];
}

function routeFrameOf(canvas: HTMLCanvasElement | null, cam: Camera): RouteFrame | null {
  const chrome = mapChromeOf(canvas);
  if (!chrome) return null;
  const ux = (px: number) => (px - cam.ox) / cam.R;
  const uy = (py: number) => (py - cam.oy) / cam.R;
  const f = chrome.free;
  const frame = {
    x0: ux(f.x + ROUTE_CLEAR),
    y0: uy(f.y + ROUTE_CLEAR),
    x1: ux(f.x + f.width - ROUTE_CLEAR),
    y1: uy(f.y + f.height - ROUTE_CLEAR),
    blocks: chrome.blocks
      // Chrome wholly outside the free map is already kept out by its edges.
      .filter((b) => b.x < f.x + f.width && b.x + b.width > f.x && b.y < f.y + f.height && b.y + b.height > f.y)
      .map((b) => ({ x0: ux(b.x - ROUTE_CLEAR), y0: uy(b.y - ROUTE_CLEAR), x1: ux(b.x + b.width + ROUTE_CLEAR), y1: uy(b.y + b.height + ROUTE_CLEAR) })),
  };
  const q = (v: number) => Math.round(v * 20);
  const key = [frame.x0, frame.y0, frame.x1, frame.y1, ...frame.blocks.flatMap((b) => [b.x0, b.y0, b.x1, b.y1])].map(q).join(",");
  return { key, ...frame };
}

interface Camera {
  R: number;
  ox: number;
  oy: number;
}

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
}: OntologyHexBoardMapProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [room, setRoom] = useState<Rect | null>(null);
  const [staleOnly, setStaleOnly] = useState(false);
  const [regionsOnly, setRegionsOnly] = useState(false);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [band, setBand] = useState<HexBand>("names");
  /** The cell size last drawn, rounded — mirrored onto the root for measurement. */
  const [drawnR, setDrawnR] = useState<number | null>(null);
  const selectedRef = useRef(selectedId);
  const camRef = useRef<Camera | null>(null);
  const restRef = useRef<Camera | null>(null);
  const animRef = useRef<{ from: Camera; to: Camera; start: number } | null>(null);
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
  const measure = useHexMeasure();
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
  /**
   * Where routes may run for the camera the board is resting on (or moving to): the free map
   * less its chrome, in unit space. Set when the camera is decided, not on every frame, so a
   * route does not re-route while the camera travels.
   */
  const [routeFrame, setRouteFrame] = useState<RouteFrame | null>(null);
  const frameRoutes = useCallback((cam: Camera | null) => {
    if (!cam) return;
    const next = routeFrameOf(canvasRef.current, cam);
    if (next) setRouteFrame((prev) => (prev && prev.key === next.key ? prev : next));
  }, []);
  const frameRoutesRef = useRef(frameRoutes);
  const blocked = useMemo(() => {
    if (!lattice || !routeFrame) return null;
    const { x0, y0, x1, y1, blocks } = routeFrame;
    return closedNodes(
      lattice,
      (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1 && !blocks.some((b) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1),
    );
  }, [lattice, routeFrame]);

  /** Canals at rest, routed once per board. */
  const canalRoutes = useMemo(() => {
    if (!layout || !lattice) return [];
    const router = new HexRouter(lattice, 1.8, blocked);
    const regionById = new Map(layout.regions.map((r) => [r.domainId, r] as const));
    const out: HexDrawRoute[] = [];
    for (const canal of layout.canals) {
      const a = regionById.get(canal.fromDomain);
      const b = regionById.get(canal.toDomain);
      if (!a || !b) continue;
      const route = router.route([a.domainId, ...a.capabilityIds], [b.domainId, ...b.capabilityIds], `${a.domainId}>${b.domainId}`);
      if (!route) continue;
      out.push({ points: route.points, nodes: route.nodes, sourceId: route.sourceId, targetId: route.targetId, role: "canal", count: canal.count, twoWay: canal.twoWay, stub: route.stub });
    }
    return out;
  }, [layout, lattice, blocked]);

  /** Edge ticks: a capability's notch toward each region it relies on. */
  const ports = useMemo(() => {
    const m = new Map<string, number[]>();
    if (!layout) return m;
    for (const dep of layout.dependencies) {
      const from = layout.byId.get(dep.from);
      const to = layout.byId.get(dep.to);
      if (!from || !to || from.kind !== "capability" || !to.domainId || to.domainId === from.domainId) continue;
      const seed = layout.byId.get(to.domainId);
      if (!seed) continue;
      const a = Math.atan2(seed.y - from.y, seed.x - from.x);
      const side = (((Math.round((a - Math.PI / 6) / (Math.PI / 3)) % 6) + 6) % 6);
      const list = m.get(from.id) ?? [];
      if (!list.includes(side)) list.push(side);
      m.set(from.id, list);
    }
    return m as ReadonlyMap<string, readonly number[]>;
  }, [layout]);

  /** Who stays lit, and the focus routes, for the selection (or the hover when nothing is selected). */
  const focus = useMemo(() => {
    if (!layout || !lattice) return { lit: null as Set<string> | null, routes: [] as HexDrawRoute[], region: null as string | null };
    const id = selectedId && layout.byId.has(selectedId) ? selectedId : null;
    const subject = id ?? hoverId;
    if (staleOnly && !id) {
      const lit = new Set<string>();
      for (const c of layout.capabilities)
        if (evidence.get(c.id) === "stale") {
          lit.add(c.id);
          if (c.domainId) lit.add(c.domainId);
        }
      return { lit, routes: [], region: null };
    }
    if (!subject) return { lit: null, routes: [], region: null };
    const tile = layout.byId.get(subject);
    if (!tile) return { lit: null, routes: [], region: null };
    const router = new HexRouter(lattice, 1.15, blocked);
    const routes: HexDrawRoute[] = [];
    const lit = new Set<string>([subject]);
    if (tile.kind === "capability") {
      if (tile.domainId) lit.add(tile.domainId);
      const needs = layout.dependencies.filter((d) => d.from === subject).sort((a, b) => ((layout.byId.get(a.to)?.domainId ?? "") < (layout.byId.get(b.to)?.domainId ?? "") ? -1 : 1));
      for (const d of needs) {
        lit.add(d.to);
        const r = router.route([subject], [d.to], `need:${layout.byId.get(d.to)?.domainId}`);
        if (r) routes.push({ points: r.points, sourceId: r.sourceId, targetId: r.targetId, role: "need", stub: r.stub });
      }
      for (const d of layout.dependencies.filter((x) => x.to === subject)) {
        lit.add(d.from);
        const r = router.route([d.from], [subject], "use");
        if (r) routes.push({ points: r.points, sourceId: r.sourceId, targetId: r.targetId, role: "use", stub: r.stub });
      }
    } else if (tile.kind === "domain") {
      const region = layout.regions.find((r) => r.domainId === subject);
      const jobs: { from: string; to: string; inside: boolean }[] = [];
      for (const capId of region?.capabilityIds ?? []) {
        lit.add(capId);
        for (const d of layout.dependencies.filter((x) => x.from === capId)) {
          const inside = layout.byId.get(d.to)?.domainId === subject;
          jobs.push({ from: capId, to: d.to, inside });
          lit.add(d.to);
        }
      }
      jobs.sort((a, b) => Number(a.inside) - Number(b.inside));
      if (id) {
        for (const j of jobs) {
          const r = router.route([j.from], [j.to], j.inside ? "inside" : `need:${layout.byId.get(j.to)?.domainId}`);
          if (r) routes.push({ points: r.points, sourceId: r.sourceId, targetId: r.targetId, role: j.inside ? "need-inside" : "need", stub: r.stub });
        }
      }
      return { lit: id ? lit : null, routes, region: id ? subject : null };
    } else {
      return { lit: null, routes: [], region: null };
    }
    return { lit: id ? lit : null, routes, region: null };
  }, [layout, lattice, blocked, selectedId, hoverId, staleOnly, evidence]);

  /* ── camera ─────────────────────────────────────────────────────────── */
  const restCamera = useCallback((): Camera | null => {
    if (!layout || !room) return null;
    const b = layout.bounds;
    const R = fitHexRadius(b, { width: room.width, height: room.height });
    return {
      R,
      ox: room.x + room.width / 2 - ((b.minX + b.maxX) / 2) * R,
      oy: room.y + room.height / 2 - ((b.minY + b.maxY) / 2) * R,
    };
  }, [layout, room]);

  const clampCamera = useCallback(
    (c: Camera): Camera => {
      if (!size || !layout) return c;
      const b = layout.bounds;
      const R = Math.max(HEX_MIN_RADIUS, Math.min(HEX_MAX_RADIUS, c.R));
      const minX = PAN_KEEP - b.maxX * R;
      const maxX = size.w - PAN_KEEP - b.minX * R;
      const minY = PAN_KEEP - b.maxY * R;
      const maxY = size.h - PAN_KEEP - b.minY * R;
      return { R, ox: Math.min(maxX, Math.max(minX, c.ox)), oy: Math.min(maxY, Math.max(minY, c.oy)) };
    },
    [size, layout],
  );

  /* ── paint ──────────────────────────────────────────────────────────── */
  const writeMirror = useCallback(
    (cam: Camera, currentBand: HexBand, plateBoxes: HexTextBox[]) => {
      const list = listRef.current;
      const wrap = wrapRef.current;
      if (!list || !wrap || !layout) return;
      const key = `${Math.round(cam.ox)},${Math.round(cam.oy)},${cam.R.toFixed(2)}:${currentBand}:${textBoxesRef.current.length}:${layout.tiles.length}`;
      if (key === mirrorKeyRef.current) return;
      mirrorKeyRef.current = key;
      const byId = new Map<string, HTMLElement>();
      for (const el of list.querySelectorAll<HTMLElement>("[data-hex-id]")) byId.set(el.dataset.hexId!, el);
      const boxes = new Map(textBoxesRef.current.map((b) => [b.id, b] as const));
      const plates = new Map(plateBoxes.map((b) => [b.id, b] as const));
      const RI = cam.R - hexGutter(cam.R);
      for (const t of layout.tiles) {
        const el = byId.get(t.id);
        if (!el) continue;
        el.dataset.mark = `${Math.round(cam.ox + t.x * cam.R)},${Math.round(cam.oy + t.y * cam.R)},${Math.round(RI)}`;
        const b = boxes.get(t.id);
        el.dataset.labelBox = b ? `${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.w)},${Math.round(b.h)}` : "";
        const p = plates.get(t.id);
        el.dataset.plateBox = p ? `${Math.round(p.x)},${Math.round(p.y)},${Math.round(p.w)},${Math.round(p.h)}` : "";
      }
      wrap.dataset.hexReady = "true";
    },
    [layout],
  );

  const paint = useCallback(
    (now: number): boolean => {
      const canvas = canvasRef.current;
      const T = readHexBoardTokensOrNull();
      if (!canvas || !size || !T || !layout || !camRef.current) return false;
      let again = false;
      const anim = animRef.current;
      if (anim) {
        const t = Math.min(1, (now - anim.start) / CAMERA_MS);
        const e = 1 - Math.pow(1 - t, 3);
        camRef.current = {
          R: anim.from.R + (anim.to.R - anim.from.R) * e,
          ox: anim.from.ox + (anim.to.ox - anim.from.ox) * e,
          oy: anim.from.oy + (anim.to.oy - anim.from.oy) * e,
        };
        if (t < 1) again = true;
        else animRef.current = null;
      }
      const dim = dimRef.current;
      if (dim.t !== dim.target) {
        const step = reducedMotion ? 1 : 16 / DIM_MS;
        dim.t = dim.target > dim.t ? Math.min(dim.target, dim.t + step) : Math.max(dim.target, dim.t - step);
        if (dim.t !== dim.target) again = true;
      }
      // Reduced motion: the board is simply there — no assembly, no fade.
      if (reducedMotion && arrivalKey != null) arrivedKeys.add(arrivalKey);
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
      const currentBand = regionsOnly ? "regions" : hexBandFor(cam.R, namesFrom);
      const ctx = canvas.getContext("2d");
      if (!ctx) return false;
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const hovering = !selectedId && !!hoverId && !staleOnly;
      let routes: HexDrawRoute[] = [...focus.routes];
      if (!focus.lit && !hovering) {
        let canals = canalRoutes;
        if (currentBand === "regions") canals = canals.slice(0, FAR_CANALS);
        const pills: { x: number; y: number }[] = [];
        routes = canals.map((c) => {
          if (currentBand === "regions" || !lattice) return c;
          const pill = pickPillSpot(layout, lattice, { nodes: c.nodes ?? [] }, pills, 34 / cam.R, 14 / cam.R);
          if (pill) pills.push(pill);
          return { ...c, pill };
        });
      }
      const { stats, textBoxes, plateBoxes } = drawHexBoard(
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
          staleFiles,
          staleByDomain,
          domainMeta,
          projectMeta: labels.projectMeta,
          plateSub,
          routes,
          ports,
          arrivalMs,
          reducedMotion,
          sweep,
          measure,
        },
        T,
      );
      textBoxesRef.current = textBoxes;
      canvas.dataset.frame = JSON.stringify({ ...stats, namesFrom, staleOnly });
      // Every drawn route in canvas px, once the frame is still, so a check can hold each one
      // to the free map (`map-hex-routes-free-area.spec.ts`).
      if (!again)
        canvas.dataset.routePaths = JSON.stringify(
          routes.map((r) => ({ role: r.role, stub: r.stub === true, pts: r.points.map((p) => [Math.round(cam.ox + p.x * cam.R), Math.round(cam.oy + p.y * cam.R)]) })),
        );
      if (currentBand !== band) setBand(currentBand);
      if (Math.round(cam.R) !== drawnR) setDrawnR(Math.round(cam.R));
      if (!again) writeMirror(cam, currentBand, plateBoxes);
      if (hoverRef.current) placeTipRef.current(hoverRef.current);
      return again;
    },
    [size, layout, lattice, selectedId, hoverId, focus, staleOnly, regionsOnly, evidence, staleFiles, staleByDomain, domainMeta, labels.projectMeta, plateSub, canalRoutes, ports, namesFrom, measure, reducedMotion, arrivalKey, band, drawnR, writeMirror],
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

  // Size the backing store, and measure the room while nothing is selected.
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const read = () => {
      const r = wrap.getBoundingClientRect();
      setSize((prev) => (prev && prev.w === r.width && prev.h === r.height ? prev : { w: r.width, h: r.height }));
      if (selectedRef.current) return;
      const free = freeAreaOf(canvasRef.current) ?? { x: 0, y: 0, width: r.width, height: r.height };
      const x = free.x + ROOM_LEFT_PAD;
      // `free.y` is the tool lane's real bottom (it wraps to two lines on a narrow free map).
      const y = Math.max(free.y + ROOM_UNDER_TOOLBAR, ROOM_TOP);
      const right = Math.min(free.x + free.width, r.width - ROOM_RIGHT);
      const bottom = Math.min(free.y + free.height, r.height - ROOM_BOTTOM);
      const next = { x: Math.round(x), y: Math.round(y), width: Math.max(80, Math.round(right - x)), height: Math.max(80, Math.round(bottom - y)) };
      setRoom((prev) => (prev && prev.x === next.x && prev.y === next.y && prev.width === next.width && prev.height === next.height ? prev : next));
      setAspect((prev) => prev ?? next.width / Math.max(1, next.height));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(wrap);
    /*
     * INDEX folding or opening changes the free map without resizing the board (it floats
     * over it). Once its transition is over, re-read the room and lay the routes again.
     */
    let settle: number | null = null;
    const mo = new MutationObserver(() => {
      if (settle != null) window.clearTimeout(settle);
      settle = window.setTimeout(() => {
        settle = null;
        read();
        frameRoutesRef.current(animRef.current?.to ?? camRef.current);
      }, 450);
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-topology-index"] });
    return () => {
      ro.disconnect();
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

  // Rest camera: the board fitted to the room. A new room or board re-rests unless focused.
  useEffect(() => {
    const rest = restCamera();
    if (!rest) return;
    restRef.current = rest;
    if (!selectedRef.current || !camRef.current) {
      camRef.current = rest;
      frameRoutes(rest);
    }
    requestDraw();
  }, [restCamera, requestDraw, frameRoutes]);

  const moveCamera = useCallback(
    (to: Camera) => {
      const from = camRef.current;
      if (!from) return;
      // Routes are laid for where the camera is going, so they do not re-route on arrival.
      frameRoutes(to);
      if (Math.abs(from.ox - to.ox) < 0.5 && Math.abs(from.oy - to.oy) < 0.5 && Math.abs(from.R - to.R) < 0.01) return;
      if (reducedMotion) camRef.current = to;
      else animRef.current = { from, to, start: performance.now() };
      requestDraw();
    },
    [reducedMotion, requestDraw, frameRoutes],
  );

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
      return;
    }
    const makeRoom = () => {
      const cam = camRef.current;
      const free = freeAreaOf(canvasRef.current);
      if (!cam || !free || !layout) return;
      const ids = [selectedId, ...(focus.lit ?? [])];
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      const sel = layout.byId.get(selectedId);
      for (const id of ids) {
        const t = layout.byId.get(id);
        if (!t) continue;
        x0 = Math.min(x0, t.x - 1);
        x1 = Math.max(x1, t.x + 1);
        y0 = Math.min(y0, t.y - SQRT3 / 2);
        y1 = Math.max(y1, t.y + SQRT3 / 2);
      }
      if (!Number.isFinite(x0) || !sel) return;
      const margin = 16;
      const shift = (lo: number, hi: number, freeLo: number, freeLen: number, must: [number, number]) => {
        // Keep the whole focus in view when it fits; otherwise at least the selected tile.
        const [a, b] = hi - lo <= freeLen - 2 * margin ? [lo, hi] : must;
        if (a < freeLo + margin) return freeLo + margin - a;
        if (b > freeLo + freeLen - margin) return freeLo + freeLen - margin - b;
        return 0;
      };
      const R = cam.R;
      const sx = (u: number) => cam.ox + u * R;
      const sy = (u: number) => cam.oy + u * R;
      const dx = shift(sx(x0), sx(x1), free.x, free.width, [sx(sel.x - 1), sx(sel.x + 1)]);
      const dy = shift(sy(y0), sy(y1), free.y, free.height, [sy(sel.y - 1), sy(sel.y + 1)]);
      if (dx !== 0 || dy !== 0) moveCamera(clampCamera({ R, ox: cam.ox + dx, oy: cam.oy + dy }));
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
  }, [selectedId, staleOnly, layout, clampCamera, moveCamera, requestDraw, frameRoutes]);

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

  /* ── input ──────────────────────────────────────────────────────────── */
  const hitTest = useCallback(
    (px: number, py: number): string | null => {
      const cam = camRef.current;
      if (!cam || !layout) return null;
      const ux = (px - cam.ox) / cam.R;
      const uy = (py - cam.oy) / cam.R;
      const q = ux / 1.5;
      const r = uy / SQRT3 - q / 2;
      // Nearest occupied cell whose hexagon contains the point.
      const rq = Math.round(q);
      const rr = Math.round(r);
      let best: string | null = null;
      let bestD = Infinity;
      for (let dq = -1; dq <= 1; dq += 1)
        for (let dr = -1; dr <= 1; dr += 1) {
          const id = layout.occupied.get(`${rq + dq},${rr + dr}`);
          if (!id) continue;
          const t = layout.byId.get(id)!;
          const d = Math.hypot(t.x - ux, t.y - uy);
          if (d < bestD) {
            bestD = d;
            best = id;
          }
        }
      return bestD <= SQRT3 / 2 + 0.02 ? best : null;
    },
    [layout],
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
      tip.textContent = labels.tooltip({ name: t.name, stale: evidence.get(t.id) === "stale", needs, users, elements: t.elementCount });
      tip.hidden = false;
      const W = tip.offsetWidth;
      const H = tip.offsetHeight;
      const x = cam.ox + t.x * cam.R;
      const y = cam.oy + t.y * cam.R;
      const R = cam.R;
      const gap = 8;
      const free = freeAreaOf(canvasRef.current) ?? { x: 0, y: 0, width: size.w, height: size.h };
      // Beside the tile first (right, left, below, above), then the same sides swept outward in
      // 6 px steps; the nearest spot that covers no name wins.
      const cands: { x: number; y: number; d: number }[] = [];
      const apo = (R * SQRT3) / 2;
      for (let dy = -2 * R; dy <= 2 * R; dy += 6) {
        cands.push({ x: x + R + gap, y: y - H / 2 + dy, d: Math.abs(dy) });
        cands.push({ x: x - R - gap - W, y: y - H / 2 + dy, d: Math.abs(dy) + 1 });
      }
      for (let dx = -W; dx <= 0; dx += 12) {
        for (let dy = 0; dy <= 2 * R; dy += 6) {
          cands.push({ x: x + dx, y: y + apo + gap + dy, d: 2 + dy + Math.abs(dx + W / 2) * 0.25 });
          cands.push({ x: x + dx, y: y - apo - gap - H - dy, d: 3 + dy + Math.abs(dx + W / 2) * 0.25 });
        }
      }
      cands.sort((a, b) => a.d - b.d);
      const boxes = textBoxesRef.current;
      const inside = (c: { x: number; y: number }) =>
        c.x >= free.x + 8 && c.y >= free.y + 8 && c.x + W <= free.x + free.width - 8 && c.y + H <= free.y + free.height - 8;
      const clear = (c: { x: number; y: number }) => !boxes.some((b) => b.x < c.x + W && c.x < b.x + b.w && b.y < c.y + H && c.y < b.y + b.h);
      // Never over the hovered tile itself either.
      const offTile = (c: { x: number; y: number }) => !(c.x < x + R && x - R < c.x + W && c.y < y + apo && y - apo < c.y + H);
      const pick = cands.find((c) => inside(c) && clear(c) && offTile(c)) ?? cands.find((c) => inside(c) && offTile(c)) ?? cands[0]!;
      tip.style.transform = `translate(${Math.round(pick.x)}px, ${Math.round(pick.y)}px)`;
    },
    [layout, size, labels, evidence],
  );
  useLayoutEffect(() => {
    hoverRef.current = hoverId;
    placeTipRef.current = placeTip;
  }, [hoverId, placeTip]);

  useEffect(() => {
    placeTip(hoverId);
  }, [hoverId, selectedId, placeTip]);

  const dragRef = useRef<{ x: number; y: number; cam: Camera; moved: boolean; id: number } | null>(null);
  const wheelFrameRef = useRef<number | null>(null);
  const local = (e: { clientX: number; clientY: number; currentTarget: Element }) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 || !camRef.current) return;
    const p = local(e);
    animRef.current = null;
    dragRef.current = { x: p.x, y: p.y, cam: camRef.current, moved: false, id: e.pointerId };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
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
        camRef.current = clampCamera({ R: drag.cam.R, ox: drag.cam.ox + dx, oy: drag.cam.oy + dy });
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
  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const cam = camRef.current;
    if (!cam) return;
    animRef.current = null;
    const p = local(e);
    const factor = computeWheelZoomFactor(normalizeWheelDeltaY(e.deltaY, e.deltaMode, size?.h ?? 800));
    const R = Math.max(HEX_MIN_RADIUS, Math.min(HEX_MAX_RADIUS, cam.R * factor));
    const k = R / cam.R;
    camRef.current = clampCamera({ R, ox: p.x - (p.x - cam.ox) * k, oy: p.y - (p.y - cam.oy) * k });
    setHoverId(null);
    requestDraw();
    if (wheelFrameRef.current != null) window.clearTimeout(wheelFrameRef.current);
    wheelFrameRef.current = window.setTimeout(() => {
      wheelFrameRef.current = null;
      frameRoutes(camRef.current);
    }, 160);
  };
  const onDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const hit = hitTest(local(e).x, local(e).y);
    const t = hit ? layout?.byId.get(hit) : null;
    const region = t?.domainId ? layout?.regions.find((r) => r.domainId === t.domainId) : null;
    const free = freeAreaOf(canvasRef.current);
    if (!region || !free) return;
    const xs = region.cells.map(([q]) => 1.5 * q);
    const ys = region.cells.map(([q, r]) => SQRT3 * (r + q / 2));
    const b = { minX: Math.min(...xs) - 1, maxX: Math.max(...xs) + 1, minY: Math.min(...ys) - SQRT3 / 2, maxY: Math.max(...ys) + SQRT3 / 2 };
    const R = Math.min(HEX_MAX_RADIUS, Math.floor(Math.min((free.width - 64) / (b.maxX - b.minX), (free.height - 64) / (b.maxY - b.minY))));
    moveCamera(clampCamera({ R, ox: free.x + free.width / 2 - ((b.minX + b.maxX) / 2) * R, oy: free.y + free.height / 2 - ((b.minY + b.maxY) / 2) * R }));
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (!layout) return;
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
        }}
        onPointerLeave={() => setHoverId(null)}
        onWheel={onWheel}
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
      <div
        data-testid="hex-board-footer"
        className="absolute bottom-4 left-[calc(var(--map-safe-inset-left)*1px)] right-[calc(var(--map-safe-inset-right)*1px)] flex flex-col items-center gap-2"
      >
        {/* The board's two states, on a surface of their own so they read over any tile. */}
        <div className="pointer-events-auto flex gap-1 rounded-chip bg-[color:var(--chrome-surface)] p-1">
          <Chip
            size="md"
            tone={staleOnly ? "warning" : "secondary"}
            active={staleOnly}
            hoverSurface="lift"
            data-testid="hex-board-stale-only"
            aria-pressed={staleOnly}
            disabled={!evidenceMeasured}
            onClick={toggleStale}
          >
            {labels.staleOnly(staleTotal)}
          </Chip>
          <Chip
            size="md"
            tone={regionsOnly ? "strong" : "secondary"}
            active={regionsOnly}
            hoverSurface="lift"
            data-testid="hex-board-regions-only"
            aria-pressed={regionsOnly}
            onClick={() => setRegionsOnly((on) => !on)}
          >
            {labels.regionsOnly}
          </Chip>
        </div>
        {legend?.({ staleOnly, focused: !!selectedId })}
      </div>
      {/* Every tile, in reading order, for assistive technology and measurement. Screen positions
          are written onto these after each still frame. */}
      <ul ref={listRef} className="sr-only" aria-label={listLabel} data-testid="hex-board-list">
        {(layout?.tiles ?? []).map((t) => (
          <li key={t.id}>
            <button
              type="button"
              tabIndex={-1}
              data-hex-id={t.id}
              data-hex-kind={t.kind}
              data-hex-domain={t.domainId ?? ""}
              data-hex-cell={`${t.q},${t.r}`}
              data-evidence={t.kind === "capability" ? (evidence.get(t.id) ?? "unknown") : undefined}
              aria-pressed={selectedId === t.id}
              onClick={() => onSelect?.(t.id)}
            >
              {t.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
