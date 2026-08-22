/**
 * Shared kind-shape miniature + relation trace mark — the same silhouette
 * family the v2 canvas draws (hex = project, chip = domain, circle =
 * capability, via-pad = element), stroked/filled with the shared
 * `--topology-v2-node-*` kind tokens. Extracted from `TopologyV2DetailPanel`
 * (the compact datasheet) into `shared/ui` so a SECOND widget
 * (`full-detail-a1`) can reuse the EXACT same glyph/trace rendering instead
 * of forking a second copy — FSD forbids widget→widget imports, so shared UI
 * primitives live one layer down. The header miniature and per-row trace
 * marks must read as shrunk copies of the same node/edge the canvas draws,
 * in both surfaces.
 *
 * Icon sets: this component is the **single facade** for DOM kind glyphs across the
 * app. It reads the current set with `useGlyphSet()` and changes only the render
 * style — the kind→silhouette mapping is **invariant** across sets (geometric =
 * fill + stroke, line = a thin stroke only). Changing the set in settings swaps INDEX,
 * the studio, popovers, and detail together, because they all go through here; the
 * canvas renderer reads the same store and stays in lockstep. The `glyphSet` prop is
 * an override for tests and previews.
 */

import { useGlyphSet, type GlyphSet } from "@/shared/lib/appearance-preferences";

export type TopologyV2RenderableKind = "project" | "domain" | "capability" | "element";

export function isTopologyV2RenderableKind(kind: string): kind is TopologyV2RenderableKind {
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

export function TopologyV2KindGlyph({
  kind,
  size = 15,
  className,
  glyphSet,
}: {
  kind: string;
  size?: number;
  className?: string;
  /** Test/preview override; omitted, the app-wide setting (`useGlyphSet`) is read. */
  glyphSet?: GlyphSet;
}) {
  const preferredSet = useGlyphSet();
  const activeSet = glyphSet ?? preferredSet;
  const line = activeSet === "line";
  const resolved: TopologyV2RenderableKind = isTopologyV2RenderableKind(kind)
    ? kind
    : "element";
  const strokeColor = `var(--topology-v2-node-stroke-${resolved})`;
  // Line set: same silhouette, different render style — no fill, a 1px outline only.
  // Geometric set: the kind fill plus a 1.25px outline.
  const common = {
    fill: line ? "none" : `var(--topology-v2-node-fill-${resolved})`,
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
          {/* via-hole: a hole-fill dot in the geometric set, a stroke-only dot in the line set — same silhouette (square + centre dot) */}
          {line ? (
            <circle cx={c} cy={c} r={1.5} fill="none" stroke={strokeColor} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ) : (
            <circle cx={c} cy={c} r={1.5} fill="var(--topology-v2-node-hole-fill)" stroke="none" />
          )}
        </g>
      )}
    </svg>
  );
}

/**
 * Trace mini-line matching the canvas edge style: contains = solid hairline,
 * depends = dashed. One per row — relation TYPE (containment vs depends) is
 * a per-row marker, not a group-header marker (R+ decision, see
 * `topology-v2-datasheet.ts` module doc).
 */
export function TopologyV2TraceMark({ containment }: { containment: boolean }) {
  const stroke = containment
    ? "var(--topology-v2-edge-contains-mark)"
    : "var(--topology-v2-edge-depends-mark)";
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
