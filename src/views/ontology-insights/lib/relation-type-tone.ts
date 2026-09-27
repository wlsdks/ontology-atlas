import { indigoRgba } from "@/shared/config/indigo-tokens";

/**
 * Relation type tones: one indigo hue varying only in alpha and texture, as `--map-selection-ring-hairline`
 * and `--map-hover-ring` do in `app/globals.css`. The floor is a contrast floor: the `highlight` indigo at 0.62
 * composites to 3.45:1 on the panel (WCAG 1.4.11 asks 3:1). Alpha alone gives only two readable steps, so the
 * families differ in kind: containment the strongest solid, depends_on the floor solid, everything else hatched
 * (`relationTypeFill`).
 */
const RELATION_TYPE_ALPHA: Readonly<Record<string, number>> = {
  contains: 0.95,
  belongs_to: 0.95,
  depends_on: 0.62,
  implements: 0.95,
  uses: 0.95,
  describes: 0.8,
  related_to: 0.8,
};

/** The alpha at which the highlight indigo still clears 3:1 on the panel (3.45:1). */
export const RELATION_TYPE_MIN_ALPHA = 0.62;
const MAX_ALPHA = 0.95;

/** The types drawn solid; everything else is hatched. */
const SOLID_TYPES = new Set(["contains", "belongs_to", "depends_on"]);

/** Alpha (0-1) for a relation type, clamped to the legible range. Deterministic. */
export function relationTypeAlpha(type: string): number {
  const alpha = RELATION_TYPE_ALPHA[type] ?? RELATION_TYPE_MIN_ALPHA;
  return Math.min(MAX_ALPHA, Math.max(RELATION_TYPE_MIN_ALPHA, alpha));
}

/** Whether a type is drawn hatched rather than solid. */
export function relationTypeHatched(type: string): boolean {
  return !SOLID_TYPES.has(type);
}

/**
 * The highlight indigo with the kind's alpha. The rgb comes from `shared/config/indigo-tokens.ts`, so this follows
 * a brand colour change.
 */
export function relationTypeIndigo(type: string): string {
  return indigoRgba("highlight", relationTypeAlpha(type));
}

/**
 * The CSS `background` for a share segment and its key swatch: solid indigo, or 2px diagonal stripes on the panel
 * for a hatched type, so the swatch is a literal sample of the segment.
 */
export function relationTypeFill(type: string): string {
  const ink = relationTypeIndigo(type);
  return relationTypeHatched(type) ? `repeating-linear-gradient(135deg, ${ink} 0 2px, transparent 2px 4px)` : ink;
}
