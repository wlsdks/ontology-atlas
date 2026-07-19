/**
 * Indigo-intensity scale for relation TYPE distribution (탭2 관계 — insights
 * visual diversity pass). Same hue as `--color-indigo-brand` (#5e6ad2 =
 * rgb(94,106,210)), alpha only varies per type — identical "same hue, alpha
 * only" precedent already used by `--topology-v2-selection-ring-hairline` /
 * `--topology-v2-hover-ring` in `app/globals.css` ("둘 이상의 채색 시스템
 * 금지 위반 아님(단일 인디고 유지)"). This does not add a second coloring
 * system; it reuses the one indigo the design charter allows.
 *
 * Containment relations (contains/belongs_to) get the strongest alpha to
 * match `TopologyV2TraceMark`'s solid-line = containment convention;
 * depends_on is next-strongest (dashed in the trace mark); everything else
 * fades toward a neutral-ish floor so unknown/rare types stay legible
 * without competing for attention.
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

/** `rgba(94, 106, 210, alpha)` for a relation type — indigo hue, type-scaled alpha. */
export function relationTypeIndigo(type: string): string {
  return `rgba(94, 106, 210, ${relationTypeAlpha(type)})`;
}
