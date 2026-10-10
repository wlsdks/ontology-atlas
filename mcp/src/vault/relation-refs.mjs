/**
 * The frontmatter array keys read as graph edges. findOrphans, findPath and the
 * rest share this one list; a private copy is how they drifted before.
 */
const NEIGHBOR_KEYS = Object.freeze([
  'domains',
  'capabilities',
  'elements',
  'dependencies',
  'relates',
  'contains',
  'describes',
  'broader',
]);

const INLINE_NEIGHBOR_KEYS = Object.freeze(['domain']);
export const NEIGHBOR_KEY_ALIASES = Object.freeze({
  depends_on: 'dependencies',
});
export const GRAPH_ARRAY_KEYS = Object.freeze([
  ...NEIGHBOR_KEYS,
  ...Object.keys(NEIGHBOR_KEY_ALIASES),
]);
export const GRAPH_ARRAY_KEY_SET = new Set(GRAPH_ARRAY_KEYS);

/** Same edge set, same bytes on disk, whatever order the agent wrote them in. */
export function normalizeRelationRefs(values) {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  const refs = [];
  const passthrough = [];
  for (const value of values) {
    if (typeof value !== 'string') {
      passthrough.push(value);
      continue;
    }
    const ref = value.trim();
    if (!ref || seen.has(ref)) continue;
    seen.add(ref);
    refs.push(ref);
  }
  refs.sort((a, b) => a.localeCompare(b, 'en'));
  return [...refs, ...passthrough];
}

export function collectNeighborRefs(doc) {
  const refs = [];
  const seen = new Set();
  const pushRef = (key, ref) => {
    if (typeof ref !== 'string') return;
    const trimmed = ref.trim();
    if (!trimmed) return;
    const canonicalKey = NEIGHBOR_KEY_ALIASES[key] || key;
    const seenKey = `${canonicalKey}\0${trimmed}`;
    if (seen.has(seenKey)) return;
    seen.add(seenKey);
    refs.push({ key: canonicalKey, ref: trimmed });
  };
  for (const key of NEIGHBOR_KEYS) {
    const value = doc.frontmatter[key];
    if (!Array.isArray(value)) continue;
    for (const ref of value) {
      pushRef(key, ref);
    }
  }
  for (const key of Object.keys(NEIGHBOR_KEY_ALIASES)) {
    const value = doc.frontmatter[key];
    if (!Array.isArray(value)) continue;
    for (const ref of value) {
      pushRef(key, ref);
    }
  }
  for (const key of INLINE_NEIGHBOR_KEYS) {
    pushRef(key, doc.frontmatter[key]);
  }
  return refs;
}

/**
 * The `relation_notes: { <ref>: "why" }` sentence a document stores for one
 * relation. The raw ref is tried before the resolved slug, the compiler's order
 * for `edge.rationale`. `undefined` when absent: callers omit the key, since an
 * absent rationale is no claim, not a null one.
 */
export function relationNoteFor(doc, ref, resolvedSlug) {
  const notes = doc?.frontmatter?.relation_notes;
  if (!notes || typeof notes !== 'object' || Array.isArray(notes)) return undefined;
  for (const key of [ref, resolvedSlug]) {
    if (typeof key !== 'string') continue;
    const value = Object.prototype.hasOwnProperty.call(notes, key) ? notes[key] : undefined;
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

/**
 * Documents that name `ref` in a relation key. A concept named only in another
 * document's relations has no file, yet the map shows it; this lets get_concept
 * answer "who wrote this name, under which key" instead of "Doc not found".
 * It creates no nodes.
 */
export function findGraphReferences(docs, ref) {
  const target = String(ref ?? '').trim();
  if (!target) return [];
  const hits = [];
  for (const doc of docs ?? []) {
    if (doc.slug === target) continue;
    for (const { key, ref: candidate } of collectNeighborRefs(doc)) {
      if (candidate !== target) continue;
      hits.push({ slug: doc.slug, via: key });
      break;
    }
  }
  return hits.sort((a, b) => a.slug.localeCompare(b.slug));
}
