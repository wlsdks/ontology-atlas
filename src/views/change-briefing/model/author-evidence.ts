/** Conservative author markup recognition, not an assessment of present repository health. */
export type AuthorEvidenceKind = 'checks' | 'limits';
export interface AuthorExcerpt { id: string; text: string }

function category(label: string): AuthorEvidenceKind | null {
  if (/^(?:checks?|validation|verification|tests?|testing|test plan|test results)$/i.test(label)) return 'checks';
  if (/^(?:limits?|limitations?|remaining(?:\s+(?:(?:motion|performance)\s+)?(?:caveats?|limits?|limitations?|issues?|work))?|known issues?|open issues?|unresolved(?: issues?)?|caveats?)$/i.test(label)) return 'limits';
  return null;
}

/** Retains exact original lines and passage IDs; unrecognized conventions remain unexplained. */
export function authorEvidence(passages: readonly AuthorExcerpt[], kind: AuthorEvidenceKind): AuthorExcerpt[] {
  let section: AuthorEvidenceKind | null = null;
  return passages.flatMap(passage => {
    let inline: AuthorEvidenceKind | null = null;
    const selected: string[] = [];
    for (const line of passage.text.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
      const plain = line.trim().replace(/\*\*/g, '');
      const heading = /^(#{1,6})\s+(.+?)\s*#*$/.exec(plain);
      if (heading) {
        const next = category(heading[2].replace(/:$/, '').trim());
        section = next;
        inline = null;
        continue;
      }
      const marker = /^(?:[-*+]\s+)?([^:]+):\s*(.*)$/.exec(plain);
      const marked = marker ? category(marker[1].trim()) : null;
      if (marked) inline = marked;
      else if (/^[-*+]\s+/.test(plain)) inline = null;
      if (!plain) { inline = null; continue; }
      if ((inline ?? section) === kind) selected.push(line);
    }
    return selected.length ? [{ id: passage.id, text: selected.join('') }] : [];
  });
}
