const DEFAULT_MAX_DESCRIPTION_CHARS = 160;
const MIN_SENTENCE_CHARS = 20;

export function compactOntologyDescription(
  value: string | null | undefined,
  maxChars = DEFAULT_MAX_DESCRIPTION_CHARS,
): string | undefined {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return undefined;

  const sentenceMatch = text.match(/^.{20,}?[.!?。！？](?=\s|$)/u);
  const candidate =
    sentenceMatch && sentenceMatch[0].length >= MIN_SENTENCE_CHARS
      ? sentenceMatch[0]
      : text;

  if (candidate.length <= maxChars) return candidate;
  if (maxChars <= 3) return candidate.slice(0, maxChars);
  return `${candidate.slice(0, maxChars - 3).trimEnd()}...`;
}

export function pruneRuntimeRecentSlugs(
  current: ReadonlySet<string>,
  expired: Iterable<string>,
): ReadonlySet<string> {
  const next = new Set(current);
  for (const slug of expired) next.delete(slug);
  return next;
}
