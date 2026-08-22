import { indigoRgba } from "@/shared/config/indigo-tokens";

/**
 * Indigo-intensity scale for the relation TYPE distribution. The same hue as
 * `--color-indigo-brand` (#5e6ad2 = rgb(94,106,210)); only the alpha varies per type — the same
 * "one hue, alpha only" precedent already used by `--topology-v2-selection-ring-hairline` and
 * `--topology-v2-hover-ring` in `app/globals.css`. This does not add a second colouring system; it
 * reuses the one indigo the design charter allows.
 *
 * Containment relations (contains/belongs_to) get the strongest alpha, matching
 * `TopologyV2TraceMark`'s solid-line = containment convention; depends_on is next strongest (dashed
 * in the trace mark); everything else fades toward a neutral-ish floor so unknown and rare types
 * stay legible without competing for attention.
 */
const RELATION_TYPE_ALPHA: Readonly<Record<string, number>> = {
  contains: 0.85,
  belongs_to: 0.85,
  depends_on: 0.62,
  implements: 0.52,
  uses: 0.52,
  describes: 0.4,
  related_to: 0.3,
};

const DEFAULT_ALPHA = 0.3;
const MIN_ALPHA = 0.2;
const MAX_ALPHA = 0.9;

/** Alpha (0-1) for a relation type, clamped to a legible range. Deterministic — same type always resolves to the same alpha. */
export function relationTypeAlpha(type: string): number {
  const alpha = RELATION_TYPE_ALPHA[type] ?? DEFAULT_ALPHA;
  return Math.min(MAX_ALPHA, Math.max(MIN_ALPHA, alpha));
}

/**
 * The indigo for a relation kind — the hue is fixed to the brand indigo and only the alpha is
 * decided by the kind.
 *
 * The rgb triplet is not written by hand here. The single source of truth for the value is
 * `shared/config/indigo-tokens.ts`, and copying it here means this file alone fails to follow when
 * the brand colour moves (audit 2026-08-04: the colour gate could not see this line).
 */
export function relationTypeIndigo(type: string): string {
  return indigoRgba("brand", relationTypeAlpha(type));
}
