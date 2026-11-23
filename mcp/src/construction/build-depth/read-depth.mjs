import { citedLinesDecide, citedLinesExist, citedSymbol, lineCites, preSectionParagraphs, servedLines, statesRule } from './line-cites.mjs';
import { kindOf, pathOf } from './node-fields.mjs';

const READ_CALL_SELECTORS = 16;

/** The exact call that reads the listed nodes' entry files, by symbol where the body names one. */
export function readCall(unread) {
  const seen = new Set();
  const selectors = [];
  for (const { path, symbol } of unread) {
    const key = `${path}\0${symbol ?? ''}`;
    if (seen.has(key) || selectors.length >= READ_CALL_SELECTORS) continue;
    seen.add(key);
    selectors.push(symbol ? { path, symbol } : { path, startLine: 1, maxLines: 200 });
  }
  return `analyze_repo_structure(${JSON.stringify({ sourceOnly: true, sourceReads: selectors })})`;
}

/**
 * A capability counts as read when its body cites lines this session served, under
 * the file's current stamp, and those lines hold a condition. Opening a file, or
 * line 1 of it, is not reading the rule. `uncited` is the part of `unread` whose
 * body cites no lines that exist, and `citedEarlier` counts the rest: a process
 * that served nothing can only say an earlier session recorded them. Null only
 * when no repository is grounded.
 */
export function measureReads(docs, reads, repoRoot) {
  if (!reads) return null;
  const capabilities = docs.filter((doc) => kindOf(doc) === 'capability' && pathOf(doc));
  const row = (doc) => ({ slug: doc.slug, path: pathOf(doc), symbol: citedSymbol(doc, pathOf(doc)) });
  const unreadDocs = capabilities
    .filter((doc) => !lineCites(doc.body, reads, repoRoot).some((cite) => servedLines(reads, cite) && citedLinesDecide(repoRoot, cite)))
    .sort((left, right) => (left.slug < right.slug ? -1 : 1));
  const uncitedDocs = unreadDocs.filter((doc) => !lineCites(doc.body, reads, repoRoot).some((cite) => citedLinesExist(repoRoot, cite)));
  return {
    capabilities: capabilities.length,
    read: capabilities.length - unreadDocs.length,
    unread: unreadDocs.map(row),
    uncited: uncitedDocs.map(row),
    citedEarlier: unreadDocs.length - uncitedDocs.length,
    served: reads.size,
  };
}

/**
 * Capabilities whose body states a rule (a paragraph after the definition with a
 * condition, order or default) but cites no read lines that hold a condition.
 * With this session's reads, a cite counts only when every cited line was served;
 * without any (a restarted server, or one that has served nothing yet), only the
 * cited lines are checked: no read exists to judge a cite against.
 */
export function measureRules(docs, reads, repoRoot) {
  const capabilities = docs.filter((doc) => kindOf(doc) === 'capability');
  const judgedAgainstReads = Boolean(reads && reads.size > 0);
  const uncited = [];
  for (const doc of capabilities) {
    const rules = preSectionParagraphs(doc.body).slice(1).filter(statesRule);
    if (rules.length === 0) continue;
    const cites = lineCites(doc.body, reads, repoRoot);
    const exact = cites.some((cite) => (!judgedAgainstReads || servedLines(reads, cite)) && citedLinesDecide(repoRoot, cite));
    if (exact) continue;
    const path = pathOf(doc);
    uncited.push({ slug: doc.slug, path, symbol: path ? citedSymbol(doc, path) : null, cited: cites.length > 0 });
  }
  return { capabilities: capabilities.length, uncited, judgedAgainstReads };
}

/** The read and patch that give each listed rule its exact cite. */
export function citeRepair(rows) {
  const readable = rows.filter((row) => row.path);
  return `${readable.length > 0 ? `${readCall(readable)}, then ` : ''}patch_concept each rule with the cite of the returned lines that hold its condition, as \`path:L12-L30\``;
}
