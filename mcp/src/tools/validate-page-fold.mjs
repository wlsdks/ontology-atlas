/**
 * One validate page repeats a code's repair guidance for every node that has it.
 * After a code's first issue on the page, each later one keeps the sentence that
 * names its node and points back at the first; O(total message length).
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

/**
 * @param {{ slug: string, issues: { code: string, severity: string, message: string }[] }[]} problems one page
 */
export function foldRepeatedGuidance(problems) {
  const explained = new Set();
  return problems.map((row) => ({
    ...row,
    issues: (row.issues ?? []).map((issue) => {
      if (!explained.has(issue.code)) {
        explained.add(issue.code);
        return issue;
      }
      const named = firstSentence(String(issue.message ?? ''));
      if (named.length === String(issue.message ?? '').length) return issue;
      return { ...issue, message: `${named} Repair as the first ${issue.code} on this page says.` };
    }),
  }));
}
