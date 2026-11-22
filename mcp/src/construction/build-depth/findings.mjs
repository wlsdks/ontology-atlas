import { citedSymbol } from './line-cites.mjs';
import { citeRepair, measureRules, readCall } from './read-depth.mjs';
import { hasCode, nearbyFiles, readSmallSource } from './source-files.mjs';
import { dependencyEdges, kindOf, pathOf, refsOf, saysOutlinedOnly, slugResolver } from './node-fields.mjs';

const SHARED_PATH_LIMIT = 5;
const PATH_KINDS = new Set(['capability', 'element']);

const NOTE_KEYS = ['dependencies', 'depends_on', 'relates', 'elements', 'capabilities'];
const TYPE_OF_KEY = { dependencies: 'depends_on', depends_on: 'depends_on', relates: 'relates', elements: 'elements', capabilities: 'capabilities' };

/**
 * Whether a node's subject was left unread: with this session's reads, a node
 * whose `path:` file was never served; without them (a restarted server, the
 * CLI), a node whose `## Uncertainty` says so.
 */
function unreadBy(reads) {
  if (reads && reads.size > 0) return (node) => Boolean(pathOf(node)) && !reads.has(pathOf(node));
  return (node) => saysOutlinedOnly(node.body);
}

function relationNoteFindings(docs, reads) {
  const isUnread = unreadBy(reads);
  const resolve = slugResolver(docs);
  const bySlug = new Map(docs.map((doc) => [doc.slug, doc]));
  const findings = [];
  for (const doc of docs) {
    const notes = doc?.frontmatter?.relation_notes;
    if (!notes || typeof notes !== 'object' || Array.isArray(notes)) continue;
    const typeOf = new Map();
    for (const key of NOTE_KEYS) for (const ref of refsOf(doc, [key])) if (!typeOf.has(ref)) typeOf.set(ref, TYPE_OF_KEY[key]);
    for (const [ref, note] of Object.entries(notes)) {
      if (typeof note !== 'string' || !note.trim() || !typeOf.has(ref)) continue;
      const target = bySlug.get(resolve(ref));
      if (!target) continue;
      const unread = [doc, target].filter(isUnread);
      if (unread.length === 0) continue;
      const type = typeOf.get(ref);
      const selectors = unread.map((node) => pathOf(node)).filter(Boolean)
        .map((path) => ({ path, symbol: citedSymbol(unread.find((node) => pathOf(node) === path), path) }));
      const rewrite = `replace_relation(${JSON.stringify({ from: doc.slug, oldTo: target.slug, oldType: type, newTo: target.slug, newType: type, why: '<what the read shows>', confirm: true })})`;
      findings.push({
        slug: doc.slug,
        code: 'relation-note-on-unread',
        message: `The why on ${doc.slug} -> ${target.slug} says how they work together, but ${unread.map((node) => node.slug).join(' and ')} ${reads && reads.size > 0 ? `${unread.length > 1 ? 'were' : 'was'} never read this session` : 'says it was not read'}. Repair in two calls: ${selectors.length > 0 ? readCall(selectors) : 'read the entry with analyze_repo_structure sourceReads'}, then ${rewrite}, and patch_concept any ## Uncertainty line that said it was not read. Without the read, make the same replace_relation call with a why that says only what the outline shows.`,
      });
    }
  }
  return findings;
}

function twoWayDependencyFindings(docs) {
  const edges = new Set(dependencyEdges(docs).map(([from, to]) => `${from}\0${to}`));
  const findings = [];
  for (const key of edges) {
    const [from, to] = key.split('\0');
    if (from > to || !edges.has(`${to}\0${from}`)) continue;
    findings.push({
      slug: from,
      code: 'dependency-both-ways',
      message: `${from} and ${to} each depend on the other. A dependency runs from consumer to provider: a caller depends on the interface it calls, an implementation does not depend on its interface, and a composition root depends on what it wires. Keep the direction the code shows and remove_relation the other.`,
    });
  }
  return findings;
}

function entryPathFindings(docs, repoRoot, collection) {
  const findings = [];
  const byPath = new Map();
  for (const doc of docs) {
    if (!PATH_KINDS.has(kindOf(doc))) continue;
    const path = pathOf(doc);
    if (!path) continue;
    byPath.set(path, [...(byPath.get(path) ?? []), doc.slug]);
    const text = readSmallSource(repoRoot, path);
    if (text === null || hasCode(text, path)) continue;
    const nearby = collection ? nearbyFiles(collection, path) : [];
    findings.push({
      slug: doc.slug,
      code: 'path-without-code',
      message: `path: ${path} holds no code (only comments, a docstring, imports or re-exports), so "where does this live" lands on nothing. Point path at the file the ability starts in${nearby.length > 0 ? `, such as ${nearby.join(', ')}` : ''}, with patch_concept.`,
    });
  }
  for (const [path, slugs] of byPath) {
    if (slugs.length <= SHARED_PATH_LIMIT) continue;
    const nearby = collection ? nearbyFiles(collection, path) : [];
    const listed = slugs.slice(0, 6).join(', ') + (slugs.length > 6 ? ` and ${slugs.length - 6} more` : '');
    for (const slug of slugs) {
      findings.push({
        slug,
        code: 'path-shared',
        message: `${slugs.length} nodes share path: ${path} (${listed}), so a drift check cannot tell them apart. Give each node the more specific file its ability enters through${nearby.length > 0 ? ` (for example ${nearby.join(', ')})` : ''} with patch_concept, and keep one element for this file's role.`,
      });
    }
  }
  return findings;
}

function ruleCiteFindings(docs, reads, repoRoot) {
  return measureRules(docs, reads, repoRoot).uncited.map((row) => ({
    slug: row.slug,
    code: 'rule-without-read-lines',
    message: `${row.slug} states a rule but cites no ${reads ? 'read ' : ''}lines that hold its condition${row.cited ? ' (its cites name lines that were not served or hold no condition)' : ''}. A reader cannot check it, and a rule taken from a body without its guard or default can be backwards. Repair: ${citeRepair([row])}.`,
  }));
}

/**
 * The validate_vault warnings this module owns; `repoRoot` null skips the file
 * checks, and `reads` (this session's served lines) makes the relation-note and
 * rule checks judge reads instead of wording.
 */
export function buildDepthFindings(docs, { repoRoot, collection, reads } = {}) {
  return [
    ...relationNoteFindings(docs, reads),
    ...ruleCiteFindings(docs, reads, repoRoot ?? null),
    ...twoWayDependencyFindings(docs),
    ...(repoRoot ? entryPathFindings(docs, repoRoot, collection) : []),
  ];
}
