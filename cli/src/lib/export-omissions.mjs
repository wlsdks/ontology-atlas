// Counts and states **what an export did not carry**.
//
// **Why** (measured 2026-08-17): the status line of `export --format jsonld` read
// `80 nodes · 174 edges`. Nodes and relations really do all go out (174 = 174,
// confirmed). But none of our vault's **7 relation rationales**
// (`relation_notes`) went, and neither did the implementation paths (`path`) or
// the descriptions.
//
// This repository wrote the rule itself: *"an edge with no rationale is a
// mind-map line, not an ontology claim."* Someone moving to Protégé sees
// "80 nodes · 174 relations" and believes the whole ontology came across — while
// what makes this product this product is missing.
//
// Same degradation discipline as `.claude/rules/surfaces.md`: **say plainly what
// cannot be done.**
//
// **The list is never hand-written.** A constant naming "what gets dropped" rots
// silently as the schema grows, so this compares **the fields actually present in
// the vault** against **the fields the format carries**. A new field the format
// does not carry is reported from the day it appears.

/**
 * Graph-internal derived fields — attached by the compiler, not written by the
 * user. Reporting these as "lost" makes the status line noisy every time and
 * buries the real losses.
 */
const DERIVED_KEYS = new Set([
  'mtime',
  'filePath',
  'path_exists',
  'degree',
  'inDegree',
  'outDegree',
  'projectIds',
  'aliases',
  'merged_uids',
]);

/** Does the field actually hold a value — an empty one is never reported as lost. */
function hasValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

/**
 * @param {object} input
 * @param {Array<Record<string, unknown>>} input.nodes compiled nodes.
 * @param {Array<Record<string, unknown>>} [input.edges] compiled edges.
 *   **A relation's rationale lives here**, not on the node. It is the value that
 *   separates a mind-map line from an ontology claim, so its absence must be stated.
 * @param {readonly string[]|null} input.carriedKeys the node fields this format
 *   actually carries. `null` means the format is lossless, so nothing is counted.
 * @param {boolean} [input.carriesEdgeRationale] does this format carry edge rationales.
 * @returns {{omitted: string[], counts: Record<string, number>, sentence: string|null}}
 */
export function describeExportOmissions({ nodes, edges, carriedKeys, carriesEdgeRationale = false }) {
  // `null` means the format is lossless — nothing to count.
  if (carriedKeys === null || carriedKeys === undefined) return { omitted: [], counts: {}, sentence: null };
  const carried = new Set(carriedKeys);
  const counts = {};
  for (const node of Array.isArray(nodes) ? nodes : []) {
    if (!node || typeof node !== 'object') continue;
    for (const [key, value] of Object.entries(node)) {
      if (carried.has(key) || DERIVED_KEYS.has(key)) continue;
      if (!hasValue(value)) continue;
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  if (!carriesEdgeRationale) {
    const withRationale = (Array.isArray(edges) ? edges : []).filter((edge) =>
      hasValue(edge?.rationale),
    ).length;
    if (withRationale > 0) counts['relation rationale'] = withRationale;
  }
  const omitted = Object.keys(counts).sort();
  if (omitted.length === 0) return { omitted, counts, sentence: null };
  const parts = omitted.map((key) => `${key} (${counts[key]})`);
  return {
    omitted,
    counts,
    sentence: `not carried by this format: ${parts.join(' · ')}`,
  };
}
