/**
 * Picks the category/status label matching the screen language — a pure function.
 *
 * **The vault frontmatter is not the source of truth here.** These categories and
 * statuses are code constants (the defaults in `entities/category` and
 * `entities/status`), not vault data. A vault file holds only an **id** such as
 * `category: in-progress`, and turning that id into human words is the UI's job. So
 * holding per-language labels in code breaks no contract: this is not a machine
 * translating strings the user wrote, it is us writing our own strings in two
 * languages.
 *
 * Conversely, **an id absent from the defaults gets no invented label** — that value
 * belongs to the user's vault and is shown verbatim (`?? id` in `TaxonomyProvider`).
 *
 * 2026-07-28: the category and status dropdowns on `/project/new`, and the card
 * preview, rendered Korean even on the English screen. There was no single place
 * that picked a label, so every call site used `.label` (Korean) directly. This is
 * that place.
 */
export interface LocalizedTaxonomyLabel {
  /** The Korean label — the one required value. */
  label: string;
  /** The English label; falls back to `label` when absent, since showing the original beats inventing a translation. */
  labelEn?: string;
}

/** English label when the screen locale is `en`, Korean otherwise. */
export function pickTaxonomyLabel(
  entry: LocalizedTaxonomyLabel | undefined,
  locale: string,
): string | undefined {
  if (!entry) return undefined;
  if (locale === "en") return entry.labelEn ?? entry.label;
  return entry.label;
}
