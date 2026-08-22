"use client";

import { useId } from "react";
import { cn } from "@/shared/lib/cn";
import { EGO_BEARINGS, type ConceptEgo, type EgoBearing } from "../model/build-concept-ego";

/**
 * One concept and its **immediate neighbours** — a read-only preview, not the map.
 *
 * It reuses the map's **silhouettes**: hexagon = project · rounded square =
 * domain · circle = capability · square = element. Shape carries kind, colour
 * does not (charter: Kind = shape, not color). Two line styles: solid =
 * contains/belongs to, dashed = depends on/used by.
 *
 * The SVG is drawn by hand here because `TopologyV2KindGlyph` is a **DOM glyph**
 * and cannot be placed inside a coordinate system. That facade stays the source
 * of truth for the silhouettes; this file only ports the same mapping into
 * coordinates, and must not diverge from what the `node-kind-shape-parity`
 * contract holds.
 */

/** Neighbours visible in one fan. Beyond it, an "and N more" pill. */
const FAN_CAP = 7;
/** More neighbours means more labels — truncate in step with density. */
function labelCap(slots: number): number {
  if (slots > 12) return 9;
  if (slots > 8) return 12;
  return 16;
}

const VIEW_W = 660;
const VIEW_H = 345;

type Geometry = {
  self: Record<string, number>;
  neighbor: Record<string, number>;
  ringMin: number;
  ringMax: number;
  ex: number;
  ey: number;
};

/**
 * The geometry is **decided by tokens** (`--git-ego-*`). Numbers held inside the
 * component leave the next person unable to find where the value came from.
 */
function readGeometry(el: Element | null): Geometry {
  const read = (name: string, fallback: number) => {
    if (!el) return fallback;
    const raw = getComputedStyle(el).getPropertyValue(name).trim();
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  return {
    self: {
      project: read("--git-ego-r-self-project", 25),
      domain: read("--git-ego-r-self-domain", 21),
      capability: read("--git-ego-r-self-capability", 16),
      element: read("--git-ego-r-self-element", 13.5),
    },
    neighbor: {
      project: read("--git-ego-r-nb-project", 14),
      domain: read("--git-ego-r-nb-domain", 12),
      capability: read("--git-ego-r-nb-capability", 9.5),
      element: read("--git-ego-r-nb-element", 8),
    },
    ringMin: read("--git-ego-ring-min", 74),
    ringMax: read("--git-ego-ring-max", 126),
    ex: read("--git-ego-ellipse-x", 1.52),
    ey: read("--git-ego-ellipse-y", 0.8),
  };
}

function radiusOf(map: Record<string, number>, kind: string): number {
  return map[kind] ?? map.element;
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
    fill: `var(--topology-v2-node-fill-${resolved})`,
    stroke: selected
      ? "var(--color-indigo-accent)"
      : `var(--topology-v2-node-stroke-${resolved})`,
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

const DASHED: readonly EgoBearing[] = ["dependsOn", "usedBy"];

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
  const geometry = readGeometry(
    typeof document === "undefined" ? null : document.documentElement,
  );

  const groups = EGO_BEARINGS.map((bearing) => {
    const all = ego.neighbors[bearing];
    const shown = all.slice(0, FAN_CAP);
    return {
      bearing,
      all,
      shown,
      rest: all.length - shown.length,
      slots: shown.length + (all.length > shown.length ? 1 : 0),
    };
  }).filter((g) => g.all.length > 0);

  if (groups.length === 0) return null;

  const slotTotal = groups.reduce((sum, g) => sum + g.slots, 0);
  const maxSlots = Math.max(...groups.map((g) => g.slots), 1);
  /*
   * Fixed bearings leave three quarters of the frame empty for a concept whose
   * neighbours are all one kind (measured: contains 17, everything else 0). So
   * the circle is **divided by share** — each relation gets a fan proportional
   * to its own count and the fans sum to the full circle. The order is fixed,
   * so switching concepts never shifts a direction.
   */
  const gap = groups.length > 1 ? 10 : 0;
  const usable = 360 - gap * groups.length;
  const ring = Math.max(
    geometry.ringMin,
    Math.min(geometry.ringMax, 58 + (slotTotal <= 2 ? 26 : 0) + maxSlots * 11),
  );
  const stagger = slotTotal > 12 ? 36 : slotTotal > 4 ? 22 : 0;
  const cx = VIEW_W / 2;
  const cy = VIEW_H / 2;

  const edges: React.ReactNode[] = [];
  const marks: React.ReactNode[] = [];
  let cursor = -90 - ((groups[0].slots / slotTotal) * usable + gap) / 2;

  for (const group of groups) {
    const span = (group.slots / slotTotal) * usable;
    const cap = labelCap(group.slots);
    /*
     * When a fan spans the **whole circle** (only one relation kind), its two
     * ends are the same angle. Dividing by `i/(slots-1)` puts the first and last
     * slot at exactly the same place, so one neighbour hides under another — the
     * screen said "contains 3" and drew two (measured 2026-08-02). A closed
     * circle divides by `slots`.
     */
    const closed = groups.length === 1;
    for (let i = 0; i < group.slots; i += 1) {
      const ratio =
        group.slots === 1 ? 0.5 : closed ? i / group.slots : i / (group.slots - 1);
      const angle =
        ((cursor + gap / 2 + (group.slots === 1 ? span / 2 : span * ratio)) * Math.PI) / 180;
      const isMore = group.rest > 0 && i === group.slots - 1;
      const radius = ring + (i % 2) * stagger + (isMore ? 34 : 0);
      const x = cx + radius * Math.cos(angle) * geometry.ex;
      const y = cy + radius * Math.sin(angle) * geometry.ey;
      const dashed = DASHED.includes(group.bearing);
      edges.push(
        <path
          key={`edge-${group.bearing}-${i}`}
          d={`M${cx},${cy} L${x.toFixed(1)},${y.toFixed(1)}`}
          fill="none"
          stroke={
            dashed ? "var(--topology-v2-edge-depends)" : "var(--topology-v2-edge-contains)"
          }
          strokeWidth={1}
          strokeDasharray={dashed ? "3.5 3.5" : undefined}
          className="git-fade-in"
          style={{ ["--git-row-index" as string]: Math.min(i, 7) }}
        />,
      );
      if (isMore) {
        const width = 26 + String(group.rest).length * 6;
        marks.push(
          <g key={`more-${group.bearing}`}>
            <rect
              x={x - width / 2}
              y={y - 9}
              width={width}
              height={18}
              rx={9}
              fill="var(--color-overlay-2)"
              stroke="var(--color-border-soft)"
            />
            <text
              x={x}
              y={y + 3.5}
              textAnchor="middle"
              className="fill-[color:var(--color-text-tertiary)] text-caption"
            >
              {moreLabel(group.rest)}
            </text>
          </g>,
        );
        continue;
      }
      const neighbor = group.shown[i];
      const r = radiusOf(geometry.neighbor, neighbor.kind);
      const cos = Math.cos(angle);
      /*
       * Near-vertical slots whose labels sit above or below the node (centre
       * aligned) stack two adjacent labels at the same height and overlap
       * (measured). Only the almost-vertical slots stay centred; the rest reach
       * left or right so they step around each other.
       */
      const right = cos > 0.04;
      const left = cos < -0.04;
      const label =
        neighbor.label.length > cap ? `${neighbor.label.slice(0, cap - 1)}…` : neighbor.label;
      marks.push(
        <g
          key={neighbor.id}
          role={onSelect ? "button" : undefined}
          tabIndex={onSelect ? 0 : undefined}
          aria-label={neighbor.label}
          onClick={onSelect ? () => onSelect(neighbor.id) : undefined}
          onKeyDown={
            onSelect
              ? (event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(neighbor.id);
                  }
                }
              : undefined
          }
          className={cn("git-fade-in group/ego", onSelect && "cursor-pointer")}
          style={{ ["--git-row-index" as string]: Math.min(i, 7) }}
        >
          <title>{neighbor.label}</title>
          <NodeShape kind={neighbor.kind} x={x} y={y} r={r} />
          <text
            x={x + (right ? r + 8 : left ? -(r + 8) : 0)}
            y={y + (right || left ? 3.5 : Math.sin(angle) > 0 ? r + 15 : -(r + 9))}
            textAnchor={right ? "start" : left ? "end" : "middle"}
            className="fill-[color:var(--color-text-tertiary)] text-label group-hover/ego:fill-[color:var(--color-text-primary)]"
          >
            {label}
          </text>
          {onSelect ? (
            <circle cx={x} cy={y} r={r + 9} fill="transparent" />
          ) : null}
        </g>,
      );
    }
    // Bearing names belong to the reading table outside the drawing — placing
    // them here widens the box, and a wider box shrinks the drawing.
    cursor += span + gap;
  }

  const selfRadius = radiusOf(geometry.self, ego.kind);

  return (
    <div className={cn("grid min-h-0 place-items-stretch bg-[color:var(--color-canvas)]", className)}>
      <svg
        key={ego.id}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        role="img"
        aria-label={`${ego.label} · ${bearingLabel("contains")} ${ego.total}`}
        preserveAspectRatio="xMidYMid meet"
        className="block h-[var(--git-ego-min-h)] w-full"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--topology-v2-node-sheen-tint)" />
            <stop offset="1" stopColor="var(--topology-v2-node-fill-domain)" />
          </linearGradient>
        </defs>
        {edges}
        {marks}
        <g>
          <circle
            cx={cx}
            cy={cy}
            r={selfRadius + 6}
            fill="none"
            stroke="var(--topology-v2-selection-ring-hairline)"
          />
          <NodeShape kind={ego.kind} x={cx} y={cy} r={selfRadius} selected />
          <text
            x={cx}
            y={cy + selfRadius + 18}
            textAnchor="middle"
            className="fill-[color:var(--color-text-primary)] text-body-lg font-[var(--font-weight-emphasis)]"
          >
            {ego.label.length > 22 ? `${ego.label.slice(0, 21)}…` : ego.label}
          </text>
        </g>
      </svg>
    </div>
  );
}
