/**
 * `validate_vault` states what to do about a code once, in `summary.byCode[code].remedy`,
 * and every issue keeps only the sentence that names its node. A code gets a remedy when
 * two or more of its issues exist and all carry the same guidance after their first
 * sentence, with the node's own slug written as `<slug>`; a code whose messages differ
 * after that sentence (a file to read, a suggested path) keeps every message whole.
 * O(total message length).
 */

const SENTENCE_MIN_CHARS = 40;
const OWN_SLUG = '\u0000';

/** The message up to its first sentence end outside code and quotes, or all of it. */
function firstSentence(message) {
  let inCode = false;
  let inQuote = false;
  for (let index = 0; index < message.length - 2; index += 1) {
    const char = message[index];
    if (char === '`') inCode = !inCode;
    else if (char === '"' && !inCode) inQuote = !inQuote;
    else if (
      char === '.' && !inCode && !inQuote && index >= SENTENCE_MIN_CHARS
      && message[index + 1] === ' ' && /[A-Z]/.test(message[index + 2])
    ) return message.slice(0, index + 1);
  }
  return message;
}

/**
 * @param {{ slug: string, issues: { code: string, severity: string, message: string }[] }[]} problems every problem file
 * @returns {{ problems: typeof problems, remedies: Record<string, string> }}
 */
export function splitRepeatedRemedies(problems) {
  const shared = new Map();
  const total = new Map();
  const split = problems.map((row) => ({
    row,
    issues: (row.issues ?? []).map((issue) => {
      const message = String(issue.message ?? '');
      const named = firstSentence(message);
      const guidance = message.slice(named.length).replaceAll(row.slug, OWN_SLUG).trim();
      return { issue, named, guidance };
    }),
  }));
  for (const { issues } of split) {
    for (const { issue, guidance } of issues) {
      total.set(issue.code, (total.get(issue.code) ?? 0) + 1);
      if (guidance === '') continue;
      const seen = shared.get(issue.code) ?? new Map();
      seen.set(guidance, (seen.get(guidance) ?? 0) + 1);
      shared.set(issue.code, seen);
    }
  }
  const remedies = {};
  for (const [code, seen] of shared) {
    const [[guidance, count]] = [...seen];
    if (seen.size === 1 && count >= 2 && count === total.get(code)) remedies[code] = guidance.replaceAll(OWN_SLUG, '<slug>');
  }
  const kept = split.map(({ row, issues }) => ({
    ...row,
    issues: issues.map(({ issue, named, guidance }) => (
      remedies[issue.code] !== undefined && guidance.replaceAll(OWN_SLUG, '<slug>') === remedies[issue.code]
        ? { ...issue, message: named }
        : issue
    )),
  }));
  return { problems: kept, remedies };
}
