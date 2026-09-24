"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MAP_CANVAS_SURFACE_ROLE } from "@/shared/lib/focus-map-canvas";
import type { OntologyMapEdge, OntologyMapNode } from "./OntologyMap";
import { readOntologyMapTokensOrNull } from "./topology-read-tokens";
import { collectCanvasObstacles, computeFreeArea, type Rect } from "../interaction/free-area";
import {
  computeTerritoryLayout,
  territorySatellites,
  type Box,
  type TerritoryLayout,
  type TerritoryTextRole,
} from "../model/territories-layout";
import {
  drawTerritories,
  focusCapability as focusCapabilityOf,
  TERRITORY_FONTS,
  type TerritoryEvidenceState,
  type TerritoryInks,
} from "../render/territories";

/**
 * **Territories** — the flat map with nothing folded (owner decision, 2026-09-24). Every
 * capability is named around its domain; see `model/territories-layout.ts` for the rules and
 * `render/territories.ts` for the paint. This component owns only the canvas, the camera (pan,
 * never zoom: labels keep one size), hit testing, and a DOM list that mirrors every mark for
 * assistive technology and for measurement.
 *
 * Selection is the page's: a click calls `onSelect` with the node id, exactly as the flat map
 * does, so the same inspector opens beside the map. The view only draws the ego focus — the
 * selected node and what it touches at full strength, the rest at the map's rest alpha — and,
 * for a capability, its elements as satellites and its own dependency arrows.
 */
export interface OntologyTerritoriesMapProps {
  nodes: readonly OntologyMapNode[];
  edges: readonly OntologyMapEdge[];
  selectedId: string | null;
  /** node id → evidence state; absent ids are unknown. */
  evidence: ReadonlyMap<string, TerritoryEvidenceState>;
  /** The counts line under a domain's name, and whether it names a stale number. */
  domainStats: (domain: { capabilityCount: number; elementCount: number; staleCount: number | null }) => {
    text: string;
    staleSuffix: string;
  };
  /** Whether stale counts are known. When false no domain line claims a stale number. */
  evidenceMeasured: boolean;
  onSelect?: (id: string) => void;
  onPaneClick?: () => void;
  onDrawnCountChange?: (drawn: number) => void;
  canvasLabel?: string;
  listLabel?: string;
  /** Rendered over the canvas, bottom edge — the page composes the legend's words. */
  legend?: ReactNode;
  reducedMotion?: boolean;
}

const DIM_MS = 160;
const CAMERA_MS = 280;
/** How much of the drawing must stay on screen however far it is dragged. */
const PAN_KEEP = 160;
/** Room the chrome leaves free at rest: below the tool lane, above the legend, beside the tiles. */
const ROOM_TOP = 96;
const ROOM_BOTTOM = 64;
const ROOM_RIGHT = 80;
const ROOM_LEFT_PAD = 16;

let measureContext: CanvasRenderingContext2D | null = null;
function measureText(text: string, role: TerritoryTextRole): number {
  if (typeof document === "undefined") return text.length * 7;
  measureContext ??= document.createElement("canvas").getContext("2d");
  if (!measureContext) return text.length * 7;
  measureContext.font = TERRITORY_FONTS[role];
  return measureContext.measureText(text).width;
}

/**
 * Stale wears the product's one warning hue (`--color-status-warning`, the same amber the
 * insights brief marks stale with), read from the stylesheet like every map token.
 */
function readStaleInks(): TerritoryInks | null {
  if (typeof window === "undefined") return null;
  const style = getComputedStyle(document.documentElement);
  const stale = style.getPropertyValue("--color-status-warning").trim();
  const staleFill = style.getPropertyValue("--color-amber-source-a12").trim();
  return stale && staleFill ? { stale, staleFill } : null;
}

function freeAreaOf(canvas: HTMLCanvasElement | null): Rect | null {
  if (!canvas) return null;
  const r = canvas.getBoundingClientRect();
  const canvasRect = { x: r.x, y: r.y, width: r.width, height: r.height };
  const free = computeFreeArea(canvasRect, collectCanvasObstacles(canvas, canvasRect));
  return { x: free.x - r.x, y: free.y - r.y, width: free.width, height: free.height };
}

const boxAttr = (b: Box, o: { x: number; y: number }) =>
  `${Math.round(b.x + o.x)},${Math.round(b.y + o.y)},${Math.round(b.w)},${Math.round(b.h)}`;

export function OntologyTerritoriesMap({
  nodes,
  edges,
  selectedId,
  evidence,
  domainStats,
  evidenceMeasured,
  onSelect,
  onPaneClick,
  onDrawnCountChange,
  canvasLabel,
  listLabel,
  legend,
  reducedMotion = false,
}: OntologyTerritoriesMapProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  /**
   * The room the drawing is laid out to fit, in canvas px — measured at rest only. The INDEX
   * folds and the inspector opens on selection; laying out again then would move every mark
   * under the reader's cursor, and positions never change between states.
   */
  const [room, setRoom] = useState<Rect | null>(null);
  const selectedRef = useRef(selectedId);
  const offsetRef = useRef<{ x: number; y: number } | null>(null);
  /** Where the camera rests with nothing selected; deselecting returns here. */
  const restRef = useRef<{ x: number; y: number } | null>(null);
  const hoverRef = useRef<string | null>(null);
  const dimRef = useRef({ t: selectedId ? 1 : 0, target: selectedId ? 1 : 0 });
  const animRef = useRef<{ from: { x: number; y: number }; to: { x: number; y: number }; start: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  /** The mirror list's screen positions were last written for this camera and layout. */
  const mirrorKeyRef = useRef("");

  /* ── layout ─────────────────────────────────────────────────────────── */
  const hub = useMemo(() => (room ? { x: room.x + room.width / 2 - 10, y: room.y + room.height / 2 + 10 } : null), [room]);
  const { layout, staleDomains } = useMemo(() => {
    const stale = new Set<string>();
    const roomRel = room && hub ? { x: room.x - hub.x, y: room.y - hub.y, w: room.width, h: room.height } : null;
    const result: TerritoryLayout = computeTerritoryLayout(
      nodes.map((n) => ({ id: n.id, label: n.label, kind: n.kind })),
      edges.map((e) => ({ source: e.source, target: e.target, kind: e.kind, relationType: e.relationType })),
      {
        measure: measureText,
        domainStats: ({ id, capabilityIds, capabilityCount, elementCount }) => {
          const staleCount = evidenceMeasured ? capabilityIds.filter((c) => evidence.get(c) === "stale").length : null;
          const { text, staleSuffix } = domainStats({ capabilityCount, elementCount, staleCount });
          if (staleSuffix) stale.add(id);
          return text;
        },
        room: roomRel,
      },
    );
    return { layout: result, staleDomains: stale as ReadonlySet<string> };
  }, [nodes, edges, domainStats, evidence, evidenceMeasured, room, hub]);
  const projectCount = useMemo(() => nodes.find((n) => n.kind === "project")?.descendantCount ?? null, [nodes]);
  const elementNames = useMemo(() => new Map(nodes.filter((n) => n.kind === "element").map((n) => [n.id, n.label])), [nodes]);

  /** Who stays lit under the selection: itself, its territory's head, what it touches. */
  const lit = useMemo(() => {
    if (!selectedId) return null;
    const set = new Set<string>([selectedId]);
    const cap = focusCapabilityOf(layout, selectedId);
    const domain = layout.domains.find((d) => d.id === selectedId);
    if (cap) {
      set.add(cap.id);
      if (cap.domainId) set.add(cap.domainId);
      for (const e of cap.elementIds) set.add(e);
      for (const dep of layout.dependencies) {
        if (dep.from === cap.id) set.add(dep.to);
        if (dep.to === cap.id) set.add(dep.from);
      }
    } else if (domain) {
      for (const capId of domain.capabilityIds) {
        set.add(capId);
        const c = layout.capabilities.find((x) => x.id === capId);
        for (const e of c?.elementIds ?? []) set.add(e);
      }
      for (const dep of layout.dependencies) if (domain.capabilityIds.includes(dep.from)) set.add(dep.to);
    } else if (layout.project?.id === selectedId) {
      for (const d of layout.domains) set.add(d.id);
    }
    return set;
  }, [selectedId, layout]);

  /* ── paint ──────────────────────────────────────────────────────────── */
  /** The mirror list carries screen positions, written after the frame that moved them. */
  const writeMirror = useCallback((o: { x: number; y: number }) => {
    const list = listRef.current;
    const wrap = wrapRef.current;
    if (!list || !wrap) return;
    const key = `${Math.round(o.x)},${Math.round(o.y)}:${layout.bounds.x},${layout.bounds.y}`;
    if (key === mirrorKeyRef.current) return;
    mirrorKeyRef.current = key;
    const byId = new Map<string, HTMLElement>();
    for (const el of list.querySelectorAll<HTMLElement>("[data-territory-id]")) byId.set(el.dataset.territoryId!, el);
    for (const c of layout.capabilities) {
      const el = byId.get(c.id);
      if (!el) continue;
      el.dataset.labelBox = boxAttr(c.label.box, o);
      el.dataset.labelShown = c.labelReserved ? "always" : "on-focus";
      el.dataset.mark = `${Math.round(c.x + o.x)},${Math.round(c.y + o.y)},${Math.round(c.r)}`;
    }
    for (const d of layout.domains) {
      const el = byId.get(d.id);
      if (!el) continue;
      const top = Math.min(d.label.box.y, d.stats.box.y);
      const bottom = Math.max(d.label.box.y + d.label.box.h, d.stats.box.y + d.stats.box.h);
      const left = Math.min(d.label.box.x, d.stats.box.x);
      const right = Math.max(d.label.box.x + d.label.box.w, d.stats.box.x + d.stats.box.w);
      el.dataset.labelBox = boxAttr({ x: left, y: top, w: right - left, h: bottom - top }, o);
    }
    wrap.dataset.territoriesReady = "true";
    wrap.dataset.territoriesDense = layout.dense ? "true" : "false";
    wrap.dataset.territoriesFitsRoom = layout.fitsRoom ? "true" : "false";
  }, [layout]);

  const paint = useCallback(
    (now: number): boolean => {
      const canvas = canvasRef.current;
      const tokens = readOntologyMapTokensOrNull();
      const inks = readStaleInks();
      if (!canvas || !size || !tokens || !inks || !offsetRef.current) return false;
      let again = false;
      const anim = animRef.current;
      if (anim) {
        const t = Math.min(1, (now - anim.start) / CAMERA_MS);
        const e = 1 - Math.pow(1 - t, 3);
        offsetRef.current = { x: anim.from.x + (anim.to.x - anim.from.x) * e, y: anim.from.y + (anim.to.y - anim.from.y) * e };
        if (t < 1) again = true;
        else animRef.current = null;
      }
      const dim = dimRef.current;
      if (dim.t !== dim.target) {
        const step = reducedMotion ? 1 : 16 / DIM_MS;
        dim.t = dim.target > dim.t ? Math.min(dim.target, dim.t + step) : Math.max(dim.target, dim.t - step);
        if (dim.t !== dim.target) again = true;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return false;
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const stats = drawTerritories(
        ctx,
        layout,
        {
          width: size.w,
          height: size.h,
          offsetX: offsetRef.current.x,
          offsetY: offsetRef.current.y,
          selectedId,
          hoverId: hoverRef.current,
          lit,
          dimT: dim.t,
          evidence,
          staleDomains,
          elementNames,
          projectCount,
        },
        tokens,
        inks,
      );
      canvas.dataset.frame = JSON.stringify(stats);
      if (!again) writeMirror(offsetRef.current);
      return again;
    },
    [size, layout, selectedId, lit, evidence, staleDomains, elementNames, projectCount, reducedMotion, writeMirror],
  );

  /*
   * One frame, always with the latest props: the frame reads this ref rather than closing over
   * a render. A request made before a selection and painted after it must paint the selection
   * (a stale closure here once drew the previous state and swallowed the new request).
   */
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
    // A new layout renders new rows; their positions are written on the next still frame.
    mirrorKeyRef.current = "";
  }, [layout]);
  useLayoutEffect(() => {
    paintRef.current = paint;
    selectedRef.current = selectedId;
    requestDraw();
  }, [paint, selectedId, requestDraw]);

  // Size the backing store to the element, and measure the room while nothing is selected.
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const read = () => {
      const r = wrap.getBoundingClientRect();
      setSize((prev) => (prev && prev.w === r.width && prev.h === r.height ? prev : { w: r.width, h: r.height }));
      if (selectedRef.current) return;
      const free = freeAreaOf(canvasRef.current) ?? { x: 0, y: 0, width: r.width, height: r.height };
      const x = free.x + ROOM_LEFT_PAD;
      const y = Math.max(free.y, ROOM_TOP);
      const right = Math.min(free.x + free.width, r.width - ROOM_RIGHT);
      const bottom = Math.min(free.y + free.height, r.height - ROOM_BOTTOM);
      const next = { x: Math.round(x), y: Math.round(y), width: Math.round(right - x), height: Math.round(bottom - y) };
      setRoom((prev) =>
        prev && prev.x === next.x && prev.y === next.y && prev.width === next.width && prev.height === next.height ? prev : next,
      );
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    requestDraw();
  }, [size, requestDraw]);

  /* ── camera ─────────────────────────────────────────────────────────── */
  const clampOffset = useCallback(
    (o: { x: number; y: number }) => {
      if (!size) return o;
      const b = layout.bounds;
      const minX = PAN_KEEP - (b.x + b.w);
      const maxX = size.w - PAN_KEEP - b.x;
      const minY = PAN_KEEP - (b.y + b.h);
      const maxY = size.h - PAN_KEEP - b.y;
      return { x: Math.min(maxX, Math.max(minX, o.x)), y: Math.min(maxY, Math.max(minY, o.y)) };
    },
    [size, layout.bounds],
  );

  // Rest position: the project where the room put it, or — when the vault does not fit the room
  // — the drawing centred in it, its top in view if it is taller.
  useEffect(() => {
    if (!size) return;
    let rest: { x: number; y: number };
    if (layout.fitsRoom && hub) rest = { x: hub.x, y: hub.y };
    else {
      const free = room ?? { x: 0, y: 0, width: size.w, height: size.h };
      const b = layout.bounds;
      rest = {
        x: free.x + free.width / 2 - (b.x + b.w / 2),
        y: b.h > free.height ? free.y + 8 - b.y : free.y + free.height / 2 - (b.y + b.h / 2),
      };
    }
    restRef.current = rest;
    if (!selectedRef.current || !offsetRef.current) offsetRef.current = rest;
    requestDraw();
  }, [size, room, hub, layout, requestDraw]);

  const moveCamera = useCallback(
    (to: { x: number; y: number }) => {
      const from = offsetRef.current;
      if (!from || (Math.abs(from.x - to.x) < 0.5 && Math.abs(from.y - to.y) < 0.5)) return;
      if (reducedMotion) offsetRef.current = to;
      else animRef.current = { from, to, start: performance.now() };
      requestDraw();
    },
    [reducedMotion, requestDraw],
  );

  /*
   * Selection: dim the rest, and make room beside the inspector. The whole drawing slides out
   * from under it when the free area can hold it; otherwise only the selected mark is brought
   * into view. Deselecting returns to the resting position. Positions never change — only the
   * camera moves.
   */
  useEffect(() => {
    dimRef.current.target = selectedId ? 1 : 0;
    requestDraw();
    if (!selectedId) {
      if (restRef.current) moveCamera(restRef.current);
      return;
    }
    const target = focusCapabilityOf(layout, selectedId);
    const domain = layout.domains.find((d) => d.id === selectedId) ?? null;
    const focus = target
      ? { x: target.x, y: target.y, reach: target.r + 40 }
      : domain
        ? { x: domain.x, y: domain.y, reach: 60 }
        : null;
    const makeRoom = () => {
      const o = offsetRef.current;
      const free = freeAreaOf(canvasRef.current);
      if (!o || !free) return;
      const margin = 12;
      const b = layout.bounds;
      const shift = (lo: number, len: number, freeLo: number, freeLen: number, cur: number) => {
        const start = lo + cur;
        if (start < freeLo + margin) return freeLo + margin - start;
        if (start + len > freeLo + freeLen - margin) return freeLo + freeLen - margin - (start + len);
        return 0;
      };
      let dx = 0;
      let dy = 0;
      if (b.w <= free.width - 2 * margin) dx = shift(b.x, b.w, free.x, free.width, o.x);
      else if (focus) dx = shift(focus.x - focus.reach, 2 * focus.reach, free.x, free.width, o.x);
      if (b.h <= free.height - 2 * margin) dy = shift(b.y, b.h, free.y, free.height, o.y);
      else if (focus) dy = shift(focus.y - focus.reach, 2 * focus.reach, free.y, free.height, o.y);
      if (dx !== 0 || dy !== 0) moveCamera(clampOffset({ x: o.x + dx, y: o.y + dy }));
    };
    // Once the inspector has mounted, and again once the panels have finished moving.
    const first = window.setTimeout(makeRoom, 60);
    const settled = window.setTimeout(makeRoom, 420);
    return () => {
      window.clearTimeout(first);
      window.clearTimeout(settled);
    };
  }, [selectedId, layout, clampOffset, moveCamera, requestDraw]);

  useEffect(() => {
    onDrawnCountChange?.((layout.project ? 1 : 0) + layout.domains.length + layout.capabilities.length);
  }, [layout, onDrawnCountChange]);

  useEffect(
    () => () => {
      // Clear the handle too: StrictMode runs this cleanup and then keeps the component, and a
      // cancelled frame left in the ref would make every later request look already pending.
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    },
    [],
  );

  /* ── input ──────────────────────────────────────────────────────────── */
  const hitTest = useCallback(
    (sx: number, sy: number): string | null => {
      const o = offsetRef.current;
      if (!o) return null;
      const x = sx - o.x;
      const y = sy - o.y;
      const inBox = (b: Box) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
      const focusCap = focusCapabilityOf(layout, selectedId);
      if (focusCap) {
        for (const s of territorySatellites(focusCap)) if (Math.hypot(x - s.x, y - s.y) <= 7) return s.id;
      }
      for (const c of layout.capabilities) {
        if (Math.hypot(x - c.x, y - c.y) <= c.r + 4 || (c.labelReserved && inBox(c.label.box))) return c.id;
      }
      for (const d of layout.domains) {
        if (Math.abs(x - d.x) <= d.half + 4 && Math.abs(y - d.y) <= d.half + 4) return d.id;
        if (inBox(d.label.box) || inBox(d.stats.box)) return d.id;
      }
      const p = layout.project;
      if (p && (Math.hypot(x - p.x, y - p.y) <= p.r + 4 || inBox(p.label.box))) return p.id;
      return null;
    },
    [layout, selectedId],
  );

  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number; moved: boolean; id: number } | null>(null);
  const local = (e: { clientX: number; clientY: number; currentTarget: Element }) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 || !offsetRef.current) return;
    const p = local(e);
    animRef.current = null;
    dragRef.current = { x: p.x, y: p.y, ox: offsetRef.current.x, oy: offsetRef.current.y, moved: false, id: e.pointerId };
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
      }
      if (drag.moved) {
        offsetRef.current = clampOffset({ x: drag.ox + dx, y: drag.oy + dy });
        requestDraw();
        return;
      }
    }
    const hit = hitTest(p.x, p.y);
    if (hit !== hoverRef.current) {
      hoverRef.current = hit;
      e.currentTarget.style.cursor = hit ? "pointer" : "grab";
      requestDraw();
    }
  };
  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || drag.id !== e.pointerId || drag.moved) return;
    const p = local(e);
    const hit = hitTest(p.x, p.y);
    if (hit) onSelect?.(hit);
    else onPaneClick?.();
  };
  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const o = offsetRef.current;
    if (!o) return;
    animRef.current = null;
    offsetRef.current = clampOffset({ x: o.x - e.deltaX, y: o.y - e.deltaY });
    requestDraw();
  };

  const staleTotal = layout.capabilities.filter((c) => evidence.get(c.id) === "stale").length;

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0"
      data-testid="territories-map"
      data-territories-capabilities={layout.capabilities.length}
      data-territories-stale={evidenceMeasured ? staleTotal : undefined}
      data-territories-evidence={evidenceMeasured ? "measured" : "unknown"}
    >
      <canvas
        ref={canvasRef}
        data-role={MAP_CANVAS_SURFACE_ROLE}
        role={canvasLabel ? "img" : undefined}
        aria-label={canvasLabel}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ cursor: "grab" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
        onPointerLeave={() => {
          if (hoverRef.current) {
            hoverRef.current = null;
            requestDraw();
          }
        }}
        onWheel={onWheel}
      />
      {/* Every mark, in the order a reader meets them, for assistive technology and measurement.
          Screen positions are written onto these after each frame that moved the camera. */}
      <ul ref={listRef} className="sr-only" aria-label={listLabel} data-testid="territories-list">
        {layout.capabilities.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              tabIndex={-1}
              data-territory-id={c.id}
              data-territory-kind="capability"
              data-territory-domain={c.domainId ?? ""}
              data-evidence={evidence.get(c.id) ?? "unknown"}
              aria-pressed={selectedId === c.id}
              onClick={() => onSelect?.(c.id)}
            >
              {c.name}
            </button>
          </li>
        ))}
        {layout.domains.map((d) => (
          <li key={d.id}>
            <button
              type="button"
              tabIndex={-1}
              data-territory-id={d.id}
              data-territory-kind="domain"
              data-stats={d.stats.text}
              aria-pressed={selectedId === d.id}
              onClick={() => onSelect?.(d.id)}
            >
              {d.name} · {d.stats.text}
            </button>
          </li>
        ))}
      </ul>
      {legend}
    </div>
  );
}
