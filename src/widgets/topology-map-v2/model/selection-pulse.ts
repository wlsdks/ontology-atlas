/**
 * One-shot "commit pulse" for a just-selected node — the charter-compliant
 * substitute for a glow/halo (`.claude/rules/design.md` forbids glow pulse ·
 * neon · halo animation). Instead of a perpetual glow, a click plays a single
 * ring-expansion + fade-out over `--topology-v2-select-pulse-duration-ms`
 * (180ms default, well under the owner's ≤200ms ceiling) and then stops for
 * good — the PERMANENT selection indicator is the static double ring
 * (`render/node-shapes.ts`'s `strokeKindOutline` calls under
 * `egoState === "center"`), which this pulse only decorates for its brief
 * window.
 *
 * Pure — no `Date.now()`/`performance.now()` inside. The caller
 * (`ui/use-topology-loop.ts`) captures the commit timestamp once (when
 * `focusedSlug` changes to a non-null id) and passes `now - startAtMs` in
 * every frame; this function only maps that elapsed duration to a
 * scale/alpha pair, so it stays trivially deterministic and unit-testable.
 */
export interface SelectionPulseVisual {
  /** 1.0 at commit, rising to 1.15 as the pulse completes. */
  scaleFactor: number;
  /** 1.0 at commit, fading to 0 as the pulse completes. */
  alpha: number;
}

const PULSE_MAX_SCALE_DELTA = 0.15;

/**
 * `null` before commit (negative elapsed) or once the pulse has fully played
 * out (`elapsedMs >= durationMs`) — the caller then draws nothing extra,
 * leaving only the permanent static ring. Never loops: there is no modulo,
 * so a stale ref that stops updating just stays expired.
 */
export function computeSelectionPulse(elapsedMs: number, durationMs: number): SelectionPulseVisual | null {
  if (elapsedMs < 0 || elapsedMs >= durationMs) return null;
  const t = elapsedMs / durationMs;
  return {
    scaleFactor: 1 + PULSE_MAX_SCALE_DELTA * t,
    alpha: 1 - t,
  };
}
