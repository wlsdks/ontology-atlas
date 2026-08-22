import type { SVGProps } from 'react';

/**
 * HexMark — the brand's hex-rhythm primitive.
 *
 * A single pointy-top hexagon outline: the same silhouette the v2 canvas draws
 * for a project node (`TopologyV2KindGlyph kind="project"`) and the shell of
 * the `BrandMark`. It exists so surfaces WITHOUT a big brand mark (Docs /
 * Builder / Insights / Projects headers) can still echo the hex form language
 * at their identity anchor — the page title or the breadcrumb's current-section
 * label — as a subtle rhythm, not a logo.
 *
 * Deliberately achromatic: stroke is `currentColor` so callers tone it with a
 * neutral text token (quaternary by default). It NEVER fills and NEVER uses
 * amber — the amber budget is reserved for the map hub + Layer 0 container
 * (design.md), and this mark must not spend it. No hardcoded color lives here;
 * the only literals are geometry.
 */

// Pointy-top hexagon (vertex at 12 o'clock), matching BrandMark's HEXAGON_PATH
// and TopologyV2KindGlyph's `hexPoints` orientation. r = 11 inside a 24 viewBox
// leaves room for a 1.6px screen-space stroke without clipping.
const HEX_POINTS = ((): string => {
  const pts: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    const a = ((i * 60 - 90) * Math.PI) / 180;
    pts.push(`${(12 + 11 * Math.cos(a)).toFixed(2)},${(12 + 11 * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
})();

export interface HexMarkProps
  extends Omit<SVGProps<SVGSVGElement>, 'width' | 'height' | 'viewBox' | 'children'> {
  /** Render size in px, square. Default 12 — the small rhythm glyph beside a title or breadcrumb. */
  size?: number;
}

export function HexMark({ size = 12, className, ...rest }: HexMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-hidden="true"
      className={className}
      {...rest}
    >
      <polygon
        data-mark-part="hexagon"
        points={HEX_POINTS}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.7}
        strokeWidth={1.6}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
