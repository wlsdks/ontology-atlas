import type { SVGProps } from 'react';

/**
 * The ontology-atlas brand mark — "nested hexagons" (owner decision 2026-07-29,
 * council-enforced spec). **This file is the single source of truth for the
 * coordinates**; the OS icon, the favicon, and the master SVG all derive from it.
 *
 * The structure states the product's layers: outer hexagon (project boundary) → 3
 * nodes joined by spokes (major domains) → mid hexagon → core (the core ontology).
 * The dotted layer between them is the exploration path.
 *
 * **Stroke contrast is what makes this mark itself.** Outer 18, mid 13, core 19 —
 * **the core is the heaviest and the mid the lightest.** The first implementation
 * inverted that hierarchy (mid 18, core 15), the rhythm of the nesting collapsed,
 * and it read as wrong. The values here are measured off the original in pixels;
 * **do not "tidy" them into a uniform ramp** — uniformity was precisely what made
 * the first attempt fail.
 *
 * The geometry is a regular hexagon (the original generated image was stretched
 * 2.7% vertically). That stretch was a by-product, not intent, and it only grows
 * more visible at small sizes.
 *
 * **Size ramp — smaller drops layers.** `full` (≥64px) everything; `compact`
 * (20–48px) outer + mid + nodes; `micro` (≤18px) outer + a filled core. At 16px two
 * nested outlines clog with ink until it does not even read as a hexagon.
 *
 * The compact nodes sit **pinned on the mid hexagon's vertices** — three floating
 * dots become a generic molecule icon, which is how the discarded first compact
 * form failed.
 *
 * Dropping layers is not enough: the **stroke weights of the layers that remain
 * have to be re-decided at that size** (see `BRAND_STROKES`).
 */

/** The 512 coordinate space — every asset shares this viewBox. */
export const BRAND_MARK_VIEWBOX = 512;

const OUTER_HEX = 'M 256 56 L 429.2 156 L 429.2 356 L 256 456 L 82.8 356 L 82.8 156 Z';
const DASHED_HEX = 'M 256 100 L 391.1 178 L 391.1 334 L 256 412 L 120.9 334 L 120.9 178 Z';
const MID_HEX = 'M 256 144 L 353 200 L 353 312 L 256 368 L 159 312 L 159 200 Z';
/** The core, R=48 — the heaviest stroke in this mark. */
const CORE_HEX = 'M 256 208 L 297.6 232 L 297.6 280 L 256 304 L 214.4 280 L 214.4 232 Z';
/** `micro` only — a filled core instead of an outline. R=104. */
const MICRO_CORE = 'M 256 152 L 346.1 204 L 346.1 308 L 256 360 L 165.9 308 L 165.9 204 Z';

/** Spokes run outer vertex → mid vertex, at the mid hexagon's weight (13). */
const SPOKES: ReadonlyArray<readonly [number, number, number, number]> = [
  [256, 56, 256, 144],
  [429.2, 356, 353, 312],
  [82.8, 356, 159, 312],
];

/** Nodes at the mid hexagon's −90° / 30° / 150° vertices. `full` and `compact` share these positions. */
export const BRAND_MARK_NODES: ReadonlyArray<readonly [number, number]> = [
  [256, 144],
  [353, 312],
  [159, 312],
];

/**
 * Stroke weights. `full` is measured off the original, so **no uniformity pass**
 * (see the doc-block above).
 *
 * `compact`/`micro` follow a different discipline. They are derivatives the original
 * never had, and what decides their values is not taste but **device px at the
 * rendered size**. Once the gap between strokes falls below 1px the background stops
 * showing through and the nested layers merge; once a stroke falls below 1px
 * antialiasing turns it into grey mush. Both are measurable rather than "too small
 * to see", so a contract test locks the floor
 * (`tests/contract/brand-asset-parity.contract.test.ts`).
 *
 * The first values (micro 44; compact 36/28/42) measured out at a 1.03px stroke and
 * a 1.34px node-to-outer gap respectively — which is why 16px read as a clotted
 * blob and 32px as a hexagon swollen along its lower edge.
 */
export const BRAND_STROKES = {
  outer: 18,
  dashed: 6,
  mid: 13,
  core: 19,
  spoke: 13,
  node: 23,
  compactOuter: 34,
  compactMid: 24,
  compactNode: 34,
  microOuter: 64,
} as const;

/**
 * Circumradius of each hexagon layer in the 512 space, matching what the path
 * strings above draw. Exported because the gap calculations need it.
 */
export const BRAND_RADII = {
  outer: 200,
  dashed: 156,
  mid: 112,
  core: 48,
  microCore: 104,
} as const;

/** The dotted layer is **round dots**, not short dashes — the original used dense dots. */
export const BRAND_DASH_ARRAY = '0.1 16';

export type BrandMarkDetail = 'full' | 'compact' | 'micro';

export interface BrandMarkProps
  extends Omit<SVGProps<SVGSVGElement>, 'width' | 'height' | 'viewBox' | 'children'> {
  /** Rendered size in px, square. Default 24. */
  size?: number;
  /** "full" (≥64px) · "compact" (20–48px, default) · "micro" (≤18px). */
  detail?: BrandMarkDetail;
}

export function BrandMark({
  size = 24,
  detail = 'compact',
  'aria-label': ariaLabel = 'ontology-atlas',
  ...rest
}: BrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${BRAND_MARK_VIEWBOX} ${BRAND_MARK_VIEWBOX}`}
      role="img"
      aria-label={ariaLabel}
      {...rest}
    >
      {detail === 'micro' ? (
        <>
          <path
            data-mark-part="hexagon"
            d={OUTER_HEX}
            fill="none"
            stroke="currentColor"
            strokeWidth={BRAND_STROKES.microOuter}
            strokeLinejoin="round"
          />
          <path data-mark-part="core" d={MICRO_CORE} fill="currentColor" />
        </>
      ) : (
        <>
          <g fill="none" stroke="currentColor" strokeLinejoin="round" strokeLinecap="round">
            <path
              data-mark-part="hexagon"
              d={OUTER_HEX}
              strokeWidth={detail === 'full' ? BRAND_STROKES.outer : BRAND_STROKES.compactOuter}
            />
            {detail === 'full' ? (
              <path
                data-mark-part="path-layer"
                d={DASHED_HEX}
                strokeWidth={BRAND_STROKES.dashed}
                strokeDasharray={BRAND_DASH_ARRAY}
                strokeOpacity={0.62}
              />
            ) : null}
            <path
              data-mark-part="mid"
              d={MID_HEX}
              strokeWidth={detail === 'full' ? BRAND_STROKES.mid : BRAND_STROKES.compactMid}
            />
            {detail === 'full' ? (
              <>
                <path data-mark-part="core" d={CORE_HEX} strokeWidth={BRAND_STROKES.core} />
                {SPOKES.map(([x1, y1, x2, y2]) => (
                  <line
                    key={`spoke-${x1}-${y1}`}
                    data-mark-part="spoke"
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    strokeWidth={BRAND_STROKES.spoke}
                  />
                ))}
              </>
            ) : null}
          </g>
          <g fill="currentColor">
            {BRAND_MARK_NODES.map(([cx, cy]) => (
              <circle
                key={`node-${cx}-${cy}`}
                data-mark-part="node"
                cx={cx}
                cy={cy}
                r={detail === 'full' ? BRAND_STROKES.node : BRAND_STROKES.compactNode}
              />
            ))}
          </g>
        </>
      )}
    </svg>
  );
}
