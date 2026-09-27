// Relevance order for find_evidence, local and deterministic (no embeddings).
// A doc is included iff a substring matched (score > 0); the score only orders
// the results.

const TOKEN_RE = /[a-z0-9]+/g;
function tokenize(s) {
  return String(s ?? '').toLowerCase().match(TOKEN_RE) ?? [];
}

/**
 * Relevance of one doc: by where the substring matched (exact title 1.0, title
 * prefix 0.9, title substring 0.75, frontmatter ref 0.5, body 0.3), plus a title
 * token-overlap tiebreaker of at most 0.1. score > 0 iff a substring matched.
 *
 * @param {string} query
 * @param {{title?:string, frontmatterHaystack?:string, body?:string}} fields
 * @returns {{score:number, matchedIn:('frontmatter'|'body'|null)}}
 */
export function scoreEvidence(query, { title = '', frontmatterHaystack = '', body = '' } = {}) {
  const needle = String(query ?? '').toLowerCase().trim();
  if (!needle) return { score: 0, matchedIn: null };

  const t = String(title ?? '').toLowerCase();
  const fm = String(frontmatterHaystack ?? '').toLowerCase();
  const b = String(body ?? '').toLowerCase();

  let base = 0;
  let matchedIn = null;
  if (t === needle) {
    base = 1.0;
    matchedIn = 'frontmatter';
  } else if (t.startsWith(needle)) {
    base = 0.9;
    matchedIn = 'frontmatter';
  } else if (t.includes(needle)) {
    base = 0.75;
    matchedIn = 'frontmatter';
  } else if (fm.includes(needle)) {
    base = 0.5;
    matchedIn = 'frontmatter';
  } else if (b.includes(needle)) {
    base = 0.3;
    matchedIn = 'body';
  } else {
    return { score: 0, matchedIn: null }; // no substring match: excluded
  }

  const qTokens = [...new Set(tokenize(needle))];
  let titleOverlapTiebreak = 0;
  if (qTokens.length > 0) {
    const titleTokens = new Set(tokenize(t));
    const queryTokensInTitle = qTokens.filter((tok) => titleTokens.has(tok)).length;
    titleOverlapTiebreak = (queryTokensInTitle / qTokens.length) * 0.1;
  }

  const score = Math.round((base + titleOverlapTiebreak) * 1000) / 1000;
  return { score, matchedIn };
}
