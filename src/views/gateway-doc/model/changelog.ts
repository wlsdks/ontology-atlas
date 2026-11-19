/**
 * The changelog's entries are written once, in English; every locale renders them under its own
 * title. Only these locales' copies are pages of record: the others canonicalize to the first and
 * stay out of the sitemap and hreflang, so search engines see one changelog, not four duplicates.
 */
export const CHANGELOG_CONTENT_LOCALES: readonly string[] = ['en'];
