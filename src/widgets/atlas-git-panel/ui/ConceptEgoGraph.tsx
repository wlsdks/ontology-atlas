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

export function ConceptEgoGraph({
  ego,
  bearingLabel,
  moreLabel,
  onSelect,
  className,
}: {
  ego: ConceptEgo;
  /** Bearing names — i18n belongs to the caller; the widget never composes copy. */
  bearingLabel: (bearing: EgoBearing) => string;
  moreLabel: (count: number) => string;
  onSelect?: (nodeId: string) => void;
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
  );
  if (!layout) return null;
  const { cx, cy, selfRadius, selfLabel, slots } = layout;

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
        {slots.map((slot) => (
          <path
            key={`edge-${slot.bearing}-${slot.index}`}
            d={`M${cx},${cy} L${slot.x.toFixed(1)},${slot.y.toFixed(1)}`}
            fill="none"
            stroke={slot.dashed ? "var(--map-edge-depends)" : "var(--map-edge-contains)"}
            strokeWidth={1}
            strokeDasharray={slot.dashed ? "3.5 3.5" : undefined}
            className="git-fade-in"
            style={{ ["--git-row-index" as string]: Math.min(slot.index, 7) }}
          />
        ))}
        {slots.map((slot) =>
          slot.type === "more" ? (
            <g key={`more-${slot.bearing}`}>
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
              onClick={onSelect ? () => onSelect(slot.id) : undefined}
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
              className={cn("git-fade-in group/ego", onSelect && "cursor-pointer")}
              style={{ ["--git-row-index" as string]: Math.min(slot.index, 7) }}
            >
              <title>{slot.fullLabel}</title>
              <NodeShape kind={slot.kind} x={slot.x} y={slot.y} r={slot.r} />
              <text
                x={slot.label.x}
                y={slot.label.y}
                textAnchor={slot.label.anchor}
                /* Secondary ink (round three): tertiary grey at the drawing's old 0.88 scale read
                   as a faint afterthought beside the reading table's own names. */
                className="fill-[color:var(--color-text-secondary)] text-label group-hover/ego:fill-[color:var(--color-text-primary)]"
              >
                {slot.label.text}
              </text>
              {onSelect ? <circle cx={slot.x} cy={slot.y} r={slot.r + 9} fill="transparent" /> : null}
            </g>
          ),
        )}
        <g>
          <circle
            cx={cx}
            cy={cy}
            r={selfRadius + 6}
            fill="none"
            stroke="var(--map-selection-ring-hairline)"
          />
          <NodeShape kind={ego.kind} x={cx} y={cy} r={selfRadius} selected />
          <text
            x={selfLabel.x}
            y={selfLabel.y}
            textAnchor="middle"
            className="fill-[color:var(--color-text-primary)] text-body-lg font-[var(--font-weight-emphasis)]"
          >
            {selfLabel.text}
          </text>
        </g>
      </svg>
    </div>
  );
}
