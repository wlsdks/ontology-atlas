import { indigoRgba } from "@/shared/config/indigo-tokens";

/**
 * Indigo-intensity scale for the relation TYPE distribution. One indigo hue; only the alpha
 * varies per type, the same "one hue, alpha only" precedent `--map-selection-ring-hairline` and
 * `--map-hover-ring` use in `app/globals.css`. This does not add a second colouring system.
 *
 * Containment relations (contains/belongs_to) get the strongest alpha, matching
 * `OntologyMapTraceMark`'s solid-line = containment convention; depends_on is next strongest
 * (dashed in the trace mark); everything else steps down toward the floor.
 *
 * ⚠️ **The floor is a contrast floor, not a taste.** The scale used to run on the brand indigo
 * (#5e6ad2) from 0.85 down to 0.3. On the panel (#0f1011) a related_to segment at 0.3 composited
 * to about rgb(39,44,77), 1.39:1, so the stacked bar's widest light segment read as the empty
 * track and the bar seemed to fill to 76% (review, 2026-09-25). WCAG 1.4.11 asks 3:1 of a
 * graphic a reader needs. Even the brand indigo at full opacity only reaches 4.05:1 there, so
 * the scale moved to the `highlight` variant (#8b97ff, 7.23:1 opaque) and its floor to 0.62,
 * which composites to 3.45:1. Adjacent segments are told apart by the panel-coloured seam
 * between them and by the key, not by the alpha step alone.
 */
const RELATION_TYPE_ALPHA: Readonly<Record<string, number>> = {
  contains: 0.95,
  belongs_to: 0.95,
  depends_on: 0.85,
  implements: 0.76,
  uses: 0.76,
  describes: 0.68,
  related_to: 0.62,
};

/** The alpha at which the highlight indigo still clears 3:1 on the panel (3.45:1). */
export const RELATION_TYPE_MIN_ALPHA = 0.62;
const MAX_ALPHA = 0.95;

/** Alpha (0-1) for a relation type, clamped to the legible range. Deterministic. */
export function relationTypeAlpha(type: string): number {
  const alpha = RELATION_TYPE_ALPHA[type] ?? RELATION_TYPE_MIN_ALPHA;
  return Math.min(MAX_ALPHA, Math.max(RELATION_TYPE_MIN_ALPHA, alpha));
}

/**
 * The indigo for a relation kind — the hue is fixed to the highlight indigo and only the alpha
 * is decided by the kind.
 *
 * The rgb triplet is not written by hand here. The single source of truth for the value is
 * `shared/config/indigo-tokens.ts`, and copying it here means this file alone fails to follow when
 * the brand colour moves (audit 2026-08-04: the colour gate could not see this line).
 */
export function relationTypeIndigo(type: string): string {
  return indigoRgba("highlight", relationTypeAlpha(type));
}
