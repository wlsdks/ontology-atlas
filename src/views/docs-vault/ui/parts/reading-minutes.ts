/** About 200 words per minute, at least one minute; rough for mixed English and Korean. */
export function estimateReadingMinutes(wordCount: number): number {
  return Math.max(1, Math.round(wordCount / 200));
}
