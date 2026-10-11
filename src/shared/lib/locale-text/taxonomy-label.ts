/**
 * Picks the category/status label matching the screen language. These are code constants, not vault
 * data: a vault holds only an id. An id absent from the defaults gets no invented label; it is shown
 * verbatim (`?? id` in `TaxonomyProvider`).
 */
export interface LocalizedTaxonomyLabel {
  /** The Korean label — the one required value. */
  label: string;
  /** The English label; falls back to `label` when absent, since showing the original beats inventing a translation. */
  labelEn?: string;
  labels?: Partial<Record<string, string>>;
}

export function pickTaxonomyLabel(
  entry: LocalizedTaxonomyLabel | undefined,
  locale: string,
): string | undefined {
  if (!entry) return undefined;
  if (locale === "ko") return entry.label;
  if (locale === "en") return entry.labelEn ?? entry.label;
  return entry.labels?.[locale] ?? entry.labelEn ?? entry.label;
}
