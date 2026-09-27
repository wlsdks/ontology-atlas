/**
 * Operational state baked into the node instead of a legend (`docs/design/ontology-map.md`
 * §3.4): fresh breathes and leans indigo, stale is dashed with dim tokens, and hub adds an
 * amber ring. The overlays combine (hub+fresh, hub+stale) and never replace the fill
 * colour. Returns what to draw; the per-frame sine stays in `render/node-shapes.ts`.
 */

export interface FreshnessFlags {
  fresh: boolean;
  stale: boolean;
  hub: boolean;
}

export interface FreshnessVisual {
  /** False under reduced motion or when not fresh. */
  breatheEnabled: boolean;
  /** 0.85 when fresh, 0 otherwise. */
  strokeIndigoLerp: number;
  dash: readonly number[];
  hubRingEnabled: boolean;
  useStaleFillStroke: boolean;
}

export function resolveFreshnessVisual(
  flags: FreshnessFlags,
  reducedMotion: boolean,
): FreshnessVisual {
  // Stale wins over fresh: "definitely not fresh" is the safer read of a contradictory node.
  const isFresh = flags.fresh && !flags.stale;
  return {
    breatheEnabled: isFresh && !reducedMotion,
    strokeIndigoLerp: isFresh ? 0.85 : 0,
    dash: flags.stale ? [3, 3] : [],
    hubRingEnabled: flags.hub,
    useStaleFillStroke: flags.stale,
  };
}
