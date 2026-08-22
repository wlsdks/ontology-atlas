/**
 * Estimated reading time at ≈200 words per minute. Korean averages differently per character, so
 * for mixed English and Korean this is a rough sense only. Under a minute floors to one minute.
 */
export function estimateReadingMinutes(wordCount: number): number {
  return Math.max(1, Math.round(wordCount / 200));
}
