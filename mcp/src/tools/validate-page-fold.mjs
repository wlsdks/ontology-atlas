/**
 * One validate page repeats a code's repair guidance for every node that has it.
 * After a code's first issue on the page, a later one keeps the sentence that
 * names its node and points back at the first, only when the guidance it drops
 * is the first one's with the node's own slug in it: a message that carries a
 * fact of its own (a file to read, a suggested path) stays whole.
 * O(total message length).
 */

const SENTENCE_MIN_CHARS = 40;

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

/** The guidance after the first sentence, with the node's own slug taken out so two nodes' copies compare equal. */
function guidanceOf(message, named, slug) {
  return message.slice(named.length).replaceAll(slug, '\u0000');
}

/**
 * @param {{ slug: string, issues: { code: string, severity: string, message: string }[] }[]} problems one page
 */
export function foldRepeatedGuidance(problems) {
  const firstGuidance = new Map();
  return problems.map((row) => ({
    ...row,
    issues: (row.issues ?? []).map((issue) => {
      const message = String(issue.message ?? '');
      const named = firstSentence(message);
      const guidance = guidanceOf(message, named, row.slug);
      if (!firstGuidance.has(issue.code)) {
        firstGuidance.set(issue.code, guidance);
        return issue;
      }
      if (guidance === '' || guidance !== firstGuidance.get(issue.code)) return issue;
      return { ...issue, message: `${named} Repair as the first ${issue.code} on this page says.` };
    }),
  }));
}
