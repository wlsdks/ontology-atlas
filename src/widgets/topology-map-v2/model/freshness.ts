/**
 * Freshness derivation — the "powered/unpowered" metaphor
 * (`docs/TOPOLOGY-V2-DESIGN.md` §3.4, memory `owner-topology-taste`):
 * operational state is baked into the visual, not a separate legend.
 *
 * | state | visual (B2+) |
 * |---|---|
 * | fresh (powered on) | breathe (`1 + 0.04·sin(t·1.15+phase)`), stroke lerp 85% toward indigo |
 * | neutral            | tier color, no breathe |
 * | stale (unpowered)  | dash `[3,3]`, dim fill/stroke tokens, no breathe |
 * | hub                | +4px amber ring — orthogonal to the three above, can combine with any |
 *
 * These four are **not mutually exclusive** — `hub+fresh` and `hub+stale`
 * both occur in the fixture data (prototype `mcp-server` capability is
 * `hub+fresh`, `adapter-registry` is `hub+stale`). Each is applied as an
 * independent overlay, never a replacement color (design.md "carry state on a border or overlay rather than a new fill colour" — carry state on a border or overlay rather than a new
 * fill colour; extended from Sigma reducers to canvas-2D here).
 *
 * `reducedMotion` disables breathe unconditionally (prototype: `if (n.fresh
 * && !reduced) breathe = ...` — otherwise `breathe` stays `1`).
 *
 * Pure derivation — no canvas/token-string knowledge; returns *what* to draw,
 * not paint calls. `render/node-shapes.ts` consumes this to decide dash
 * pattern / stroke-lerp amount / ring presence; the sine itself (needing
 * `now`/`phase`) stays in the render layer since it's a per-frame animation
 * value, not a static classification.
 */

export interface FreshnessFlags {
  fresh: boolean;
  stale: boolean;
  hub: boolean;
}

export interface FreshnessVisual {
  /** Whether the size-breathe animation should run at all (false if reducedMotion or not fresh). */
  breatheEnabled: boolean;
  /** 0 (tier stroke as-is) to 1 (fully indigo) — 0.85 when fresh, 0 otherwise. */
  strokeIndigoLerp: number;
  /** `[]` normally, `[3, 3]` when stale (prototype dash pattern). */
  dash: readonly number[];
  /** Whether to draw the +4px amber hub ring overlay. */
  hubRingEnabled: boolean;
  /** Whether to use the dim/stale fill+stroke token pair instead of the tier fill+stroke. */
  useStaleFillStroke: boolean;
}

/**
 * Classifies a node's independent freshness/hub overlays into what
 * `render/node-shapes.ts` needs to draw. `fresh` and `stale` are expected to
 * be mutually exclusive inputs (a node's frontmatter should not mark both),
 * but this function does not need to validate that — it just maps flags to
 * visuals; if both happen to be true, `stale` should win visually (dash +
 * dim reads as "definitely not fresh" — see `freshness.test.ts`).
 */
export function resolveFreshnessVisual(
  flags: FreshnessFlags,
  reducedMotion: boolean,
): FreshnessVisual {
  // stale wins over fresh when a node's frontmatter somehow marks both —
  // "definitely not fresh" is the safer read of a contradictory node.
  const isFresh = flags.fresh && !flags.stale;
  return {
    breatheEnabled: isFresh && !reducedMotion,
    strokeIndigoLerp: isFresh ? 0.85 : 0,
    dash: flags.stale ? [3, 3] : [],
    hubRingEnabled: flags.hub,
    useStaleFillStroke: flags.stale,
  };
}
