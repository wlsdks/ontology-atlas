import type { CSSProperties } from "react";

import { cn } from "@/shared/lib/cn";
import type { WorkPhase } from "./work-glyph";

const WIDTH = 160;
const HEIGHT = 20;
const INSET = 10;
/** Heights the nodes take in turn, so the row reads as a constellation and not a ruler. */
const NODE_HEIGHTS = [12, 6, 13, 5, 11, 7, 12];
const UNKNOWN_LENGTH_NODES = 5;
const MAX_NODES = NODE_HEIGHTS.length;
/** One trip of the signal along the row, in `--motion-settle` beats. */
const TRIP_BEATS = 9;

/** When part `index` of `parts` evenly spaced along the trip lights, as a phase the animation starts already inside. */
const hopDelay = (index: number, parts: number): CSSProperties => ({
  animationDelay: `calc(var(--motion-settle) * ${((index / parts - 1) * TRIP_BEATS).toFixed(3)})`,
});

/**
 * Work drawn as a small constellation. With a known total each node is a step and the done ones
 * stay lit; with none, a signal hops node to node and claims no fraction.
 */
export function WorkTrail({
  phase,
  done,
  total,
  label,
}: {
  phase: WorkPhase;
  done: number;
  total: number | null;
  label: string;
}) {
  const finished = phase === "done";
  const known = total != null && total > 0;
  const determinate = finished || known;
  const ratio = finished ? 1 : known ? Math.min(1, done / total) : 0;
  const count = known ? Math.min(MAX_NODES, Math.max(2, total)) : UNKNOWN_LENGTH_NODES;
  const lit = determinate ? Math.floor(ratio * count + 1e-6) : 0;
  const nodes = Array.from({ length: count }, (_, index) => ({
    x: INSET + (index * (WIDTH - INSET * 2)) / (count - 1),
    y: NODE_HEIGHTS[index]!,
  }));
  const ink = finished ? "var(--color-status-success)" : "var(--color-indigo-accent)";
  /** Hops are spaced over the nodes and the edges between them, in the order the signal meets them. */
  const hops = count * 2;

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={determinate ? 0 : undefined}
      aria-valuemax={determinate ? 100 : undefined}
      aria-valuenow={determinate ? Math.round(ratio * 100) : undefined}
      data-work-trail={phase}
      data-work-trail-lit={determinate ? lit : undefined}
      className="w-full"
    >
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden className="mx-auto block h-5 w-full max-w-40 overflow-visible">
        {nodes.slice(1).map((node, index) => {
          const from = nodes[index]!;
          const reached = determinate && index + 1 < lit;
          return (
            <g key={`edge-${index}`}>
              <line x1={from.x} y1={from.y} x2={node.x} y2={node.y} strokeWidth={1.5} strokeLinecap="round" stroke="var(--color-indigo-accent-a12)" />
              <line
                x1={from.x}
                y1={from.y}
                x2={node.x}
                y2={node.y}
                strokeWidth={1.5}
                strokeLinecap="round"
                stroke={ink}
                className={cn("motion-work-trail-part", !determinate && "motion-work-hop")}
                style={determinate ? { opacity: reached ? 1 : 0 } : hopDelay(index * 2 + 1, hops)}
              />
            </g>
          );
        })}
        {nodes.map((node, index) => {
          const reached = determinate && index < lit;
          const current = determinate && !finished && index === lit;
          return (
            <g key={`node-${index}`}>
              <circle cx={node.x} cy={node.y} r={2.5} fill="var(--color-indigo-accent-a32)" />
              <g
                data-work-trail-node={reached ? "lit" : current ? "current" : "ahead"}
                className={cn("motion-work-trail-part", (!determinate || current) && "motion-work-hop")}
                style={determinate ? (current ? undefined : { opacity: reached ? 1 : 0 }) : hopDelay(index * 2, hops)}
              >
                <circle cx={node.x} cy={node.y} r={7} fill="var(--color-indigo-accent-a12)" />
                <circle cx={node.x} cy={node.y} r={3} fill={ink} />
              </g>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
