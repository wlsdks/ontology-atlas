// evidence-rank — Atlas roadmap Track A #4 (planner team 2026-05-31).
//
// find_evidence is the front-door "where does X live in the vault?" query, but
// it was a flat substring sweep returning matches in vault-walk order — the
// best node buried among incidental body mentions. This adds a deterministic
// relevance score so the caller (the agent) gets the best match first. Local +
// deterministic — no embeddings, no backend (stays local-first). INCLUSION is
// unchanged: score>0 iff a substring matched, exactly as before — purely additive
// ordering, so the result SET is identical, only re-sorted.

const TOKEN_RE = /[a-z0-9]+/g;
function tokenize(s) {
  return String(s ?? '').toLowerCase().match(TOKEN_RE) ?? [];
}

/**
 * Relevance score for one doc against a query.
 * Base signal (by where the substring matched, best→worst):
 *   exact title 1.0 · title prefix 0.9 · title substring 0.75 · frontmatter ref 0.5 · body 0.3
 * Plus a small title token-overlap tiebreaker (≤0.1) so a title containing more
 * of the query's words ranks above one containing fewer. score>0 ⟺ a substring
 * matched somewhere (same inclusion as the old flat sweep).
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
    return { score: 0, matchedIn: null }; // no substring match → excluded (unchanged)
  }

  // Tiebreaker: fraction of the query's distinct tokens present in the title.
  const qTokens = [...new Set(tokenize(needle))];
  let bonus = 0;
  if (qTokens.length > 0) {
    const titleTokens = new Set(tokenize(t));
    const present = qTokens.filter((tok) => titleTokens.has(tok)).length;
    bonus = (present / qTokens.length) * 0.1;
  }

  const score = Math.round((base + bonus) * 1000) / 1000;
  return { score, matchedIn };
}
