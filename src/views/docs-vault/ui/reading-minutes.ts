/** Under a minute's reading a time estimate says nothing the word count does not. */
export const READING_TIME_MIN_WORDS = 200;

/** About 200 words per minute, at least one minute; rough for mixed English and Korean. */
export function estimateReadingMinutes(wordCount: number): number {
  return Math.max(1, Math.round(wordCount / 200));
}
