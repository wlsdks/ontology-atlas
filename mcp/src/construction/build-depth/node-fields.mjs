

/** Wording a node uses for a subject it only outlined; read under `## Uncertainty` alone. */
const OUTLINED_ONLY = /\b(?:outlined only|only outlined|outline only|outlined,? (?:but )?(?:the )?(?:body |bodies )?(?:not read|unread)|bod(?:y|ies) (?:was |were |is |are )?(?:not read|unread)|unread|not opened)\b/i;

function uncertaintySection(body) {
  const match = /^##\s+Uncertainty\s*$([\s\S]*?)(?=^##\s|(?![\s\S]))/im.exec(String(body ?? ''));
  return match ? match[1] : '';
}

export function saysOutlinedOnly(body) {
  return OUTLINED_ONLY.test(uncertaintySection(body));
}

export function kindOf(doc) {
  return typeof doc?.frontmatter?.kind === 'string' ? doc.frontmatter.kind.trim() : '';
}

export function pathOf(doc) {
  const path = doc?.frontmatter?.path;
  return typeof path === 'string' && path.trim() ? path.trim().replace(/^\.\//, '') : null;
}

export function refsOf(doc, keys) {
  const refs = [];
  for (const key of keys) {
    const value = doc?.frontmatter?.[key];
    if (Array.isArray(value)) refs.push(...value.filter((ref) => typeof ref === 'string' && ref.trim()).map((ref) => ref.trim()));
  }
  return refs;
}

const DEPENDENCY_KEYS = ['dependencies', 'depends_on'];

/** A ref as an exact slug, or the unique node whose slug ends with it. */
export function slugResolver(docs) {
  const bySlug = new Set(docs.map((doc) => doc.slug));
  const byTail = new Map();
  for (const doc of docs) {
    const tail = doc.slug.split('/').pop();
    byTail.set(tail, byTail.has(tail) ? null : doc.slug);
  }
  return (ref) => (bySlug.has(ref) ? ref : byTail.get(ref) ?? null);
}

/** Every `depends_on` edge as [from, to] slugs that resolve. */
export function dependencyEdges(docs) {
  const resolve = slugResolver(docs);
  const edges = [];
  for (const doc of docs) {
    for (const ref of refsOf(doc, DEPENDENCY_KEYS)) {
      const to = resolve(ref);
      if (to && to !== doc.slug) edges.push([doc.slug, to]);
    }
  }
  return edges;
}

export function sectionOf(body, heading) {
  const match = new RegExp(`^##\\s+${heading}\\s*$([\\s\\S]*?)(?=^##\\s|(?![\\s\\S]))`, 'im').exec(String(body ?? ''));
  return match ? match[1] : '';
}
