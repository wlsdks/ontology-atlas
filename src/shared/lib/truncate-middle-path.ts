/**
 * Truncates a long file path in the middle, keeping both the leading
 * directory context and the trailing filename visible — a tail-only
 * truncation (`…lo/foo/bar.ts`) hides which top-level folder a code-location
 * row lives in, which is exactly the context a reader needs when scanning a
 * list of paths. Pure/deterministic — fixed character budget, no DOM
 * measurement.
 *
 * Used by the "코드 위치" (code location) rows across the topology datasheet,
 * the full-detail surface, and the docs frontmatter block so all three read
 * the same shortened form for the same path.
 */
export function truncateMiddlePath(path: string, maxLength = 44): string {
  const trimmed = path.trim();
  if (trimmed.length <= maxLength) return trimmed;
  const ellipsis = "…";
  const budget = Math.max(maxLength - ellipsis.length, 2);
  const tailLength = Math.max(Math.floor(budget * 0.55), 8);
  const headLength = Math.max(budget - tailLength, 4);
  return `${trimmed.slice(0, headLength)}${ellipsis}${trimmed.slice(trimmed.length - tailLength)}`;
}
