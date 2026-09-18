const DEFAULT_MAX_DESCRIPTION_CHARS = 160;
const MIN_SENTENCE_CHARS = 20;

/**
 * A wikilink read as the words a reader would see: `[[a/b|Label]]` is *Label*, `[[a/b]]`
 * is *a/b*, and a `#section` on the target stays out of the sentence. Every caller of this
 * compactor prints plain text — a card's one sentence, a topology label, a drawer summary
 * — and none of them renders a link, so the brackets came through raw: the Library card
 * for a page whose Summary opened *About [[capabilities/payments]].* said exactly that
 * (dev, 2026-09-19). The reader shows the label or the target; so does the sentence.
 */
function readWikilinks(text: string): string {
  return text.replace(/\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g, (_, target: string, label?: string) =>
    (label ?? target.split('#')[0]).trim(),
  );
}

export function compactOntologyDescription(
  value: string | null | undefined,
  maxChars = DEFAULT_MAX_DESCRIPTION_CHARS,
): string | undefined {
  const text = readWikilinks(String(value ?? '')).replace(/\s+/g, ' ').trim();
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
