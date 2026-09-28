/**
 * Kind silhouettes and relation trace marks drawn as shrunk copies of the canvas nodes and
 * edges, with the `--map-node-*` tokens. In `shared/ui` so several widgets reuse one rendering.
 * The single facade for DOM kind glyphs: it reads `useGlyphSet()`, and only the render style
 * changes between sets, never the kind-to-silhouette mapping. A kind the map does not draw
 * takes the vault tree's page mark, not a borrowed silhouette.
 */

import { FileText } from "lucide-react";

import { useGlyphSet, type GlyphSet } from "@/shared/lib/appearance-preferences";

export type OntologyMapRenderableKind = "project" | "domain" | "capability" | "element";

export function isOntologyMapRenderableKind(kind: string): kind is OntologyMapRenderableKind {
  return (
    kind === "project" ||
    kind === "domain" ||
    kind === "capability" ||
    kind === "element"
  );
}

function hexPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    const a = ((i * 60 - 90) * Math.PI) / 180;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(" ");
}

export function OntologyMapKindGlyph({
  kind,
  size = 15,
  className,
  glyphSet,
}: {
  kind: string;
  size?: number;
  className?: string;
  /** Test and preview override; omitted, the app-wide setting is read. */
  glyphSet?: GlyphSet;
}) {
  const preferredSet = useGlyphSet();
  const activeSet = glyphSet ?? preferredSet;
  const line = activeSet === "line";
  if (!isOntologyMapRenderableKind(kind)) {
    return (
      <FileText
        size={size}
        strokeWidth={1}
        absoluteStrokeWidth
        color="var(--color-text-quaternary)"
        aria-hidden="true"
        data-kind-glyph="document"
        data-glyph-set={activeSet}
        className={className ?? "shrink-0"}
      />
    );
  }
  const resolved: OntologyMapRenderableKind = kind;
  const strokeColor = `var(--map-node-stroke-${resolved})`;
  const common = {
    fill: line ? "none" : `var(--map-node-fill-${resolved})`,
    stroke: strokeColor,
    strokeWidth: line ? 1 : 1.25,
    vectorEffect: "non-scaling-stroke" as const,
  };
  const s = size;
  const c = s / 2;
  return (
    <svg
      width={s}
      height={s}
      viewBox={`0 0 ${s} ${s}`}
      aria-hidden="true"
      data-kind-glyph={resolved}
      data-glyph-set={activeSet}
      className={className ?? "shrink-0"}
    >
      {resolved === "project" ? (
        <polygon points={hexPoints(c, c, c - 1.2)} {...common} />
      ) : resolved === "domain" ? (
        <rect x={1} y={3.4} width={s - 2} height={s - 6.8} rx={1.6} {...common} />
      ) : resolved === "capability" ? (
        <circle cx={c} cy={c} r={c - 1.6} {...common} />
      ) : (
        <g>
          <rect x={2.4} y={2.4} width={s - 4.8} height={s - 4.8} rx={1.4} {...common} />
          {/* The via-hole dot: filled in the geometric set, stroked in the line set. */}
          {line ? (
            <circle cx={c} cy={c} r={1.5} fill="none" stroke={strokeColor} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ) : (
            <circle cx={c} cy={c} r={1.5} fill="var(--map-node-hole-fill)" stroke="none" />
          )}
        </g>
      )}
    </svg>
  );
}

/**
 * Solid hairline for containment, dashed for depends, one per row (see the `map-datasheet.ts`
 * module doc).
 */
export function OntologyMapTraceMark({ containment }: { containment: boolean }) {
  const stroke = containment
    ? "var(--map-edge-contains-mark)"
    : "var(--map-edge-depends-mark)";
  return (
    <svg width={14} height={6} viewBox="0 0 14 6" aria-hidden="true" className="shrink-0">
      <line
        x1={1}
        y1={3}
        x2={13}
        y2={3}
        stroke={stroke}
        strokeWidth={1.4}
        strokeDasharray={containment ? undefined : "3 3"}
        strokeLinecap="round"
      />
    </svg>
  );
}
