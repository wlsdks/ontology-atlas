// What a declared entry excuses. An entry names one path of an answer and excuses that path and
// everything below it: `result.content[0].text#/checks` excuses `.../text#/checks/2/status`, and
// `result.content[0].text` excuses the whole text. Another request, another case and another kind
// of difference are never excused.

const BELOW = new Set(['.', '[', '#', '/']);

/** Whether `declared` is `actual` or a path above it, cut at a path boundary (`#/2` is not `#/20`). */
export function pathCovers(declared, actual) {
  if (declared === actual) return true;
  return declared !== '' && actual.startsWith(declared) && BELOW.has(actual[declared.length]);
}

const sameId = (entry, difference) =>
  JSON.stringify(entry.id ?? null) === JSON.stringify(difference.where === 'answer' ? difference.id ?? null : null);

/** Whether a declared or known-difference entry excuses this difference of this case. */
export function entryExcuses(entry, caseName, difference) {
  if (entry.case !== caseName || entry.where !== difference.where || !sameId(entry, difference)) return false;
  const path = difference.path ?? '';
  return difference.where === 'answer' ? pathCovers(entry.path, path) : entry.path === path;
}

/** The paths that stand for a whole answer: its result, its content, its text, its structured content. */
const WHOLE_ANSWER = /^(?:result|error|result\.content|result\.content\[\d+\](?:\.text)?|result\.structuredContent)$/;

/**
 * An entry that names the whole text of an answer excuses every difference inside it. The path
 * alone cannot tell a text that holds JSON from a plain sentence (a refusal), so an entry for such
 * a sentence is counted too.
 */
export function isWholeAnswerEntry(entry) {
  return entry.where === 'answer' && WHOLE_ANSWER.test(entry.path);
}

/** One line for the check command: how many entries name a whole answer, and which cases. */
export function describeWholeAnswerEntries(entries) {
  const whole = entries.filter(isWholeAnswerEntry);
  const cases = new Set(whole.map((entry) => entry.case));
  const line = `${whole.length} of ${entries.length} declared entries are whole-answer entries (they excuse every difference inside the answer)`;
  return whole.length === 0 ? line : `${line}, in ${cases.size} ${cases.size === 1 ? 'case' : 'cases'}`;
}
