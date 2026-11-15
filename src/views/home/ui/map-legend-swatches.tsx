/** A legend swatch: the mark's disc at the size that tells the kinds apart. */
export function KindDot({ radius, ink, ring = false }: { radius: number; ink: string; ring?: boolean }) {
  return (
    <svg aria-hidden width="14" height="14" viewBox="0 0 14 14">
      <circle cx="7" cy="7" r={radius} style={{ fill: ink, stroke: ring ? "var(--map-graph-halo)" : undefined }} strokeWidth={ring ? 1.4 : undefined} />
    </svg>
  );
}

/** `strength` is the stroke's opacity, as a CSS value, where the canvas draws the ink weaker. */
export function ArcSwatch({ ink, strength }: { ink: string; strength?: string }) {
  return (
    <svg aria-hidden width="22" height="14" viewBox="0 0 22 14">
      <path d="M2 11 Q11 1 20 11" fill="none" strokeWidth="1.6" strokeLinecap="round" style={{ stroke: ink, strokeOpacity: strength }} />
    </svg>
  );
}
