/**
 * The first prose paragraph, so get_concept previews a sentence a person wrote
 * rather than table or code syntax; falls back to the raw body when no prose exists.
 */
export function extractSummaryExcerpt(body, maxLen = 800) {
  if (typeof body !== 'string' || body.length === 0) return '';
  const lines = body.split('\n');
  const isBlockStart = (line) => {
    const trimmed = line.trim();
    if (trimmed === '') return false;
    if (trimmed.startsWith('```')) return true;
    if (trimmed.startsWith('|')) return true;
    if (trimmed.startsWith('#')) return true;
    if (trimmed.startsWith('![')) return true;
    if (/^([-*_])(?:\s*\1){2,}$/.test(trimmed)) return true; // thematic break
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) return true;
    if (/^\d+[.)]\s+/.test(trimmed)) return true; // ordered list
    if (trimmed.startsWith('> ')) return true;
    return false;
  };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === '' || isBlockStart(line)) {
      if (trimmed.startsWith('```')) {
        i += 1;
        while (i < lines.length && !lines[i].trim().startsWith('```')) i += 1;
      }
      i += 1;
      continue;
    }
    const para = [];
    while (i < lines.length) {
      const current = lines[i];
      if (current.trim() === '' || isBlockStart(current)) break;
      para.push(current.trim());
      i += 1;
    }
    if (para.length > 0) {
      const text = para.join(' ');
      return text.length > maxLen ? text.slice(0, maxLen).trimEnd() + '…' : text;
    }
  }
  const trimmedBody = body.trim();
  return trimmedBody.length > maxLen
    ? trimmedBody.slice(0, maxLen).trimEnd() + '…'
    : trimmedBody;
}

/**
 * Cap for `body: 'full'`: a vault `.md` can be a pasted log of hundreds of KB,
 * and one document must not fill an agent's context. Measured bodies run 1–3 KB;
 * anything cut is reported by {@link describeBodyDelivery}.
 */
export const FULL_BODY_MAX_CHARS = 40_000;

/**
 * Row cap for one `get_concepts({ body: "full" })`, narrower than the batch cap
 * of 50. Builders of runnable read workflows (meaning repair) must use this
 * value, or they emit a call the server rejects.
 */
export const GET_CONCEPTS_FULL_BODY_MAX = 20;

/**
 * Reports how much body was returned and what was withheld: the construction
 * rules put evidence and boundaries in the body, so a silent cut hides what an
 * agent must read. Only a cut response carries a `hint` naming the follow-up call.
 */
export function describeBodyDelivery(body, options = {}) {
  const { mode = 'excerpt', maxLen = 800, hint } = options;
  const source = typeof body === 'string' ? body : '';
  const totalChars = source.length;
  let text;
  if (mode === 'full') {
    text =
      totalChars > FULL_BODY_MAX_CHARS
        ? source.slice(0, FULL_BODY_MAX_CHARS)
        : source;
  } else {
    text = extractSummaryExcerpt(source, maxLen);
  }
  // An excerpt joins lines with spaces, so compare with whitespace normalised: a
  // one-paragraph body delivered whole must not read as truncated.
  const returnedChars = text.length;
  const flatten = (value) => value.replace(/\s+/g, ' ').trim();
  const truncated =
    mode === 'full'
      ? totalChars > FULL_BODY_MAX_CHARS
      : flatten(text) !== flatten(source);
  const info = { mode, totalChars, returnedChars, truncated };
  if (truncated) {
    info.omittedChars = Math.max(0, totalChars - returnedChars);
    if (hint) info.hint = hint;
  }
  return { text, info };
}
