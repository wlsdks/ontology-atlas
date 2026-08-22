/**
 * Builds a URL-friendly slug: Hangul is preserved, spaces become hyphens, and
 * punctuation is dropped.
 */
export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '') // letters, digits, spaces and hyphens only
    .replace(/\s+/g, '-')              // spaces → hyphens
    .replace(/-+/g, '-');              // collapse repeated hyphens
}
