// Backlink rules for the docs-vault manifest. A backlink map is
// `target slug -> [{ fromSlug, context, linkText }]`; body links fill it first
// (in the scan), then frontmatter references are added here.

const RELATION_REF_ARRAY_KEYS = [
  'domains',
  'capabilities',
  'elements',
  'dependencies',
  'relates',
  'contains',
  'describes',
];
const RELATION_REF_STRING_KEYS = ['domain'];

function relationRefStrings(frontmatter) {
  const out = [];
  for (const key of RELATION_REF_ARRAY_KEYS) {
    const value = frontmatter[key];
    if (Array.isArray(value)) {
      for (const item of value) if (typeof item === 'string' && item.trim()) out.push(item.trim());
    } else if (typeof value === 'string' && value.trim()) {
      out.push(value.trim());
    }
  }
  for (const key of RELATION_REF_STRING_KEYS) {
    const value = frontmatter[key];
    if (typeof value === 'string' && value.trim()) out.push(value.trim());
  }
  return out;
}

/**
 * Registers frontmatter relation-ref backlinks (mirrors `src/entities/docs-vault/lib/local-manifest/md-entry.ts`):
 * the body pass sees only markdown links, so a doc referenced purely through frontmatter showed no
 * backlinks. Same relation-key set as the MCP `find_backlinks`. A reference resolves to a slug, or to
 * the one slug with that tail; a tail shared by two slugs is ambiguous and resolves to nothing.
 * One entry per source and target; a self reference adds none.
 */
export function addFrontmatterRelationBacklinks(docs, backlinksDetailMap) {
  const slugSet = new Set(docs.map((doc) => doc.slug));
  const tailToSlug = new Map(); // tail -> slug | null (null = ambiguous)
  for (const doc of docs) {
    const tail = doc.slug.split('/').pop() ?? doc.slug;
    tailToSlug.set(tail, tailToSlug.has(tail) ? null : doc.slug);
  }
  const resolveRef = (ref) => {
    const normalized = ref.replace(/\.md$/i, '');
    if (slugSet.has(normalized)) return normalized;
    const tail = normalized.split('/').pop() ?? normalized;
    return tailToSlug.get(tail) ?? null;
  };
  for (const doc of docs) {
    const seenTargets = new Set();
    for (const ref of relationRefStrings(doc.frontmatter)) {
      const target = resolveRef(ref);
      if (!target || target === doc.slug || seenTargets.has(target)) continue;
      seenTargets.add(target);
      if (!backlinksDetailMap.has(target)) backlinksDetailMap.set(target, []);
      backlinksDetailMap.get(target).push({
        fromSlug: doc.slug,
        context: `frontmatter · **[${ref}]**`,
        linkText: ref,
      });
    }
  }
}

/**
 * Groups by fromSlug and keeps only the first context, so a document citing the target several
 * times still shows one line. Each target's list is sorted by fromSlug.
 */
export function groupBacklinksBySource(backlinksDetailMap) {
  const backlinksDetail = {};
  for (const [slug, list] of backlinksDetailMap) {
    const byFrom = new Map();
    for (const entry of list) {
      if (!byFrom.has(entry.fromSlug)) byFrom.set(entry.fromSlug, entry);
    }
    backlinksDetail[slug] = [...byFrom.values()].sort((a, b) =>
      a.fromSlug.localeCompare(b.fromSlug, 'ko'),
    );
  }
  return backlinksDetail;
}
