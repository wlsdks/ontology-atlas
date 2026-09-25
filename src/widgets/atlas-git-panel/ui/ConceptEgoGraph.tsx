"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/shared/lib/cn";
import type { ConceptEgo, EgoBearing } from "../model/build-concept-ego";
import {
  DEFAULT_EGO_GEOMETRY,
  DEFAULT_EGO_VIEW,
  layoutConceptEgo,
  type EgoGeometry,
  type EgoView,
} from "../lib/ego-layout";

/**
 * One concept and its **immediate neighbours** — a read-only preview, not the map.
 *
 * It reuses the map's **silhouettes**: hexagon = project · rounded square =
 * domain · circle = capability · square = element. Shape carries kind, colour
 * does not (charter: Kind = shape, not color). Two line styles: solid =
 * contains/belongs to, dashed = depends on/used by.
 *
 * The SVG is drawn by hand here because `OntologyMapKindGlyph` is a **DOM glyph**
 * and cannot be placed inside a coordinate system. That facade stays the source
 * of truth for the silhouettes; this file only ports the same mapping into
 * coordinates, and must not diverge from what the `node-kind-shape-parity`
 * contract holds.
 *
 * Where every mark and label sits is decided by `layoutConceptEgo` (pure, tested);
 * this component only draws it.
 *
 * ## The table carries names, the drawing carries structure (round four, 2026-09-25)
 *
 * Every neighbour's name was printed twice in one card, once in the relation table and again
 * as a label here (sixteen names twice for a dense concept), and the labels that stayed on the
 * drawing were struck through by the spokes of their neighbours. The relation table already
 * holds the names, grouped and clickable (2026-08-02: "names, not counts"), so the drawing
 * now draws only what the table cannot: kind by silhouette, relation by line, and the share
 * of each relation around the concept. A neighbour's name appears here only while it is
 * pointed at or focused, in the table or on its mark, and it wears a canvas halo so no line
 * crosses the one label on screen. The centre's name is the card's own header, so it is not
 * drawn a second time either.
 */

/**
 * The geometry is **decided by tokens** (`--git-ego-*`). Numbers held inside the
 * component leave the next person unable to find where the value came from.
 */
function readGeometry(el: Element | null): EgoGeometry {
  const fallback = DEFAULT_EGO_GEOMETRY;
  const read = (name: string, value: number) => {
    if (!el) return value;
    const raw = getComputedStyle(el).getPropertyValue(name).trim();
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : value;
  };
  return {
    self: {
      project: read("--git-ego-r-self-project", fallback.self.project),
      domain: read("--git-ego-r-self-domain", fallback.self.domain),
      capability: read("--git-ego-r-self-capability", fallback.self.capability),
      element: read("--git-ego-r-self-element", fallback.self.element),
    },
    neighbor: {
      project: read("--git-ego-r-nb-project", fallback.neighbor.project),
      domain: read("--git-ego-r-nb-domain", fallback.neighbor.domain),
      capability: read("--git-ego-r-nb-capability", fallback.neighbor.capability),
      element: read("--git-ego-r-nb-element", fallback.neighbor.element),
    },
    ringMin: read("--git-ego-ring-min", fallback.ringMin),
    ringMax: read("--git-ego-ring-max", fallback.ringMax),
    ex: read("--git-ego-ellipse-x", fallback.ex),
    ey: read("--git-ego-ellipse-y", fallback.ey),
  };
}

/** Same mapping as the map. Kinds the map has no shape for (`document`) fold into element. */
function NodeShape({
  kind,
  x,
  y,
  r,
  selected,
}: {
  kind: string;
  x: number;
  y: number;
  r: number;
  selected?: boolean;
}) {
  const resolved = ["project", "domain", "capability", "element"].includes(kind)
    ? kind
    : "element";
  const style = {
    fill: `var(--map-node-fill-${resolved})`,
    stroke: selected
      ? "var(--color-indigo-accent)"
      : `var(--map-node-stroke-${resolved})`,
    strokeWidth: selected ? 1.6 : 1.15,
  };
  if (resolved === "project") {
    const points = [0, 60, 120, 180, 240, 300]
      .map((deg) => {
        const t = ((deg - 90) * Math.PI) / 180;
        return `${(x + r * Math.cos(t)).toFixed(1)},${(y + r * Math.sin(t)).toFixed(1)}`;
      })
      .join(" ");
    return <polygon points={points} style={style} />;
  }
  if (resolved === "capability") {
    return <circle cx={x} cy={y} r={r} style={style} />;
  }
  const side = r * 1.72;
  return (
    <rect
      x={x - side / 2}
      y={y - side / 2}
      width={side}
      height={side}
      rx={resolved === "domain" ? r * 0.34 : r * 0.2}
      style={style}
    />
  );
}

/** A canvas-coloured outline painted under the glyphs, so a line behind a label never strikes it. */
const LABEL_HALO = {
  paintOrder: "stroke",
  stroke: "var(--color-canvas)",
  strokeWidth: 4,
  strokeLinejoin: "round",
} as const;

/** The point `inset` units from `(x2, y2)` back toward `(x1, y1)`. */
function pullBack(x1: number, y1: number, x2: number, y2: number, inset: number): [number, number] {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy) || 1;
  return [x2 - (dx / length) * inset, y2 - (dy / length) * inset];
}

export function ConceptEgoGraph({
  ego,
  bearingLabel,
  moreLabel,
  onSelect,
  activeId = null,
  onActive,
  className,
}: {
  ego: ConceptEgo;
  /** Bearing names — i18n belongs to the caller; the widget never composes copy. */
  bearingLabel: (bearing: EgoBearing) => string;
  moreLabel: (count: number) => string;
  onSelect?: (nodeId: string) => void;
  /** The neighbour pointed at or focused, here or in the relation table; its name is drawn. */
  activeId?: string | null;
  onActive?: (nodeId: string | null) => void;
  className?: string;
}) {
  const gradientId = useId();
  /*
   * The drawing is laid out in its cell's own pixels (round three, 2026-09-25): a fixed
   * 660x345 view scaled into the cell left about 60% of a 740x410 box blank and drew the
   * 11px labels at 9-10px. Until the cell is measured (first paint, tests without a
   * ResizeObserver) the default view is drawn scaled, exactly as before.
   */
  const boxRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<EgoView | null>(null);
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const read = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width < 1 || height < 1) return;
      const next = { w: Math.round(width), h: Math.round(height) };
      setView((prev) => (prev && prev.w === next.w && prev.h === next.h ? prev : next));
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const box = view ?? DEFAULT_EGO_VIEW;
  const layout = layoutConceptEgo(
    ego,
    readGeometry(typeof document === "undefined" ? null : document.documentElement),
    box,
    moreLabel,
  );
  if (!layout) return null;
  const { cx, cy, selfRadius, slots } = layout;

  return (
    <div
      ref={boxRef}
      className={cn("relative min-h-[var(--git-ego-min-h)] bg-[color:var(--color-canvas)]", className)}
    >
      <svg
        key={ego.id}
        viewBox={`0 0 ${box.w} ${box.h}`}
        role="img"
        aria-label={`${ego.label} · ${bearingLabel("contains")} ${ego.total}`}
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 block size-full"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--map-node-sheen-tint)" />
            <stop offset="1" stopColor="var(--map-node-fill-domain)" />
          </linearGradient>
        </defs>
        {slots.map((slot) => {
          /*
           * A spoke runs from the centre's ring to the edge of its neighbour's mark, not through
           * either shape: through the centre it crossed the selection ring, and through an
           * "and N more" pill it struck the pill's own words (round-four review).
           */
          const [x1, y1] = pullBack(slot.x, slot.y, cx, cy, selfRadius + 6);
          // A pill is a rect: the spoke stops where its direction meets the pill's edge.
          const angle = Math.atan2(slot.y - cy, slot.x - cx);
          const pillInset =
            slot.type === "more"
              ? Math.min(
                  slot.width / 2 / Math.max(Math.abs(Math.cos(angle)), 1e-3),
                  9 / Math.max(Math.abs(Math.sin(angle)), 1e-3),
                ) + 1
              : 0;
          const [x2, y2] = pullBack(cx, cy, slot.x, slot.y, slot.type === "more" ? pillInset : slot.r + 1);
          const lit = slot.type === "node" && slot.id === activeId;
          return (
            <path
              key={`edge-${slot.bearing}-${slot.index}`}
              d={`M${x1.toFixed(1)},${y1.toFixed(1)} L${x2.toFixed(1)},${y2.toFixed(1)}`}
              fill="none"
              stroke={slot.dashed ? "var(--map-edge-depends)" : "var(--map-edge-contains)"}
              strokeWidth={lit ? 1.6 : 1}
              strokeDasharray={slot.dashed ? "3.5 3.5" : undefined}
              className="git-fade-in"
              style={{ ["--git-row-index" as string]: Math.min(slot.index, 7) }}
            />
          );
        })}
        {slots.map((slot) =>
          slot.type === "more" ? (
            <g key={`more-${slot.bearing}`}>
              {/* Opaque backing: the overlay tint alone let the canvas lines show through. */}
              <rect
                x={slot.x - slot.width / 2}
                y={slot.y - 9}
                width={slot.width}
                height={18}
                rx={9}
                fill="var(--color-canvas)"
              />
              <rect
                x={slot.x - slot.width / 2}
                y={slot.y - 9}
                width={slot.width}
                height={18}
                rx={9}
                fill="var(--color-overlay-2)"
                stroke="var(--color-border-soft)"
              />
              <text
                x={slot.x}
                y={slot.y + 3.5}
                textAnchor="middle"
                className="fill-[color:var(--color-text-tertiary)] text-caption"
              >
                {moreLabel(slot.rest)}
              </text>
            </g>
          ) : (
            <g
              key={slot.id}
              role={onSelect ? "button" : undefined}
              tabIndex={onSelect ? 0 : undefined}
              aria-label={slot.fullLabel}
              data-testid="atlas-git-ego-mark"
              data-active={slot.id === activeId ? "true" : undefined}
              onClick={onSelect ? () => onSelect(slot.id) : undefined}
              onPointerEnter={onActive ? () => onActive(slot.id) : undefined}
              onPointerLeave={onActive ? () => onActive(null) : undefined}
              onFocus={onActive ? () => onActive(slot.id) : undefined}
              onBlur={onActive ? () => onActive(null) : undefined}
              onKeyDown={
                onSelect
                  ? (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelect(slot.id);
                      }
                    }
                  : undefined
              }
              className={cn("git-fade-in outline-none", onSelect && "cursor-pointer")}
              style={{ ["--git-row-index" as string]: Math.min(slot.index, 7) }}
            >
              <title>{slot.fullLabel}</title>
              <NodeShape kind={slot.kind} x={slot.x} y={slot.y} r={slot.r} selected={slot.id === activeId} />
              {slot.id === activeId ? (
                <text
                  data-testid="atlas-git-ego-label"
                  x={slot.label.x}
                  y={slot.label.y}
                  textAnchor={slot.label.anchor}
                  style={LABEL_HALO}
                  className="git-fade-in pointer-events-none fill-[color:var(--color-text-primary)] text-label"
                >
                  {slot.label.text}
                </text>
              ) : null}
              {onSelect ? <circle cx={slot.x} cy={slot.y} r={slot.r + 9} fill="transparent" /> : null}
            </g>
          ),
        )}
        {/* The centre is marked by its ring; its name is the card's header, not drawn twice. */}
        <g aria-hidden>
          <circle
            cx={cx}
            cy={cy}
            r={selfRadius + 6}
            fill="none"
            stroke="var(--map-selection-ring-hairline)"
          />
          <NodeShape kind={ego.kind} x={cx} y={cy} r={selfRadius} selected />
        </g>
      </svg>
    </div>
  );
}
