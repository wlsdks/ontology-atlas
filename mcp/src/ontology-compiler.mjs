import { collectNeighborRefs } from './vault.mjs';

const COMPILER_VERSION = 1;

export function compileOntology(docs, options = {}) {
  const includeIndexes = options.includeIndexes === true;
  const nodeMap = new Map();
  const aliasEntries = new Map();

  for (const doc of docs) {
    nodeMap.set(doc.slug, doc);
    addAlias(aliasEntries, doc.slug, doc.slug);
    const tail = doc.slug.split('/').pop();
    if (tail && tail !== doc.slug) addAlias(aliasEntries, tail, doc.slug);
    const frontmatterSlug = doc.frontmatter?.slug;
    if (typeof frontmatterSlug === 'string' && frontmatterSlug.trim()) {
      addAlias(aliasEntries, frontmatterSlug.trim(), doc.slug);
    }
  }

  const aliases = [];
  const ambiguousAliases = [];
  const aliasToSlug = new Map();
  for (const [alias, slugs] of [...aliasEntries].sort(([a], [b]) => a.localeCompare(b))) {
    const sortedSlugs = [...slugs].sort();
    if (sortedSlugs.length === 1) {
      aliasToSlug.set(alias, sortedSlugs[0]);
      aliases.push({ alias, slug: sortedSlugs[0] });
    } else {
      ambiguousAliases.push({ alias, slugs: sortedSlugs });
    }
  }

  const issues = ambiguousAliases.map(({ alias, slugs }) => ({
    code: 'ambiguous-alias',
    severity: 'warning',
    alias,
    slugs,
    message: `Alias "${alias}" resolves to multiple nodes: ${slugs.join(', ')}`,
  }));

  const edges = [];
  const edgeKeys = new Set();
  for (const doc of docs) {
    for (const { key, ref } of collectNeighborRefs(doc)) {
      const resolved = aliasToSlug.get(ref) || null;
      const external = !resolved && key === 'elements' && isPathLikeGraphRef(ref);
      const to = resolved || ref;
      const edgeKey = `${doc.slug}\0${to}\0${key}\0${ref}`;
      if (edgeKeys.has(edgeKey)) continue;
      edgeKeys.add(edgeKey);
      const edge = {
        id: `${doc.slug}->${to}:${key}:${ref}`,
        from: doc.slug,
        to,
        via: key,
        ref,
        resolved: Boolean(resolved),
        external,
      };
      edges.push(edge);
      if (!resolved && !external) {
        issues.push({
          code: 'dangling-graph-reference',
          severity: 'warning',
          slug: doc.slug,
          via: key,
          ref,
          message: `Graph reference "${ref}" from "${doc.slug}" via "${key}" does not resolve to a vault node.`,
        });
      }
    }
  }
  edges.sort((a, b) =>
    `${a.from}:${a.via}:${a.to}:${a.ref}`.localeCompare(`${b.from}:${b.via}:${b.to}:${b.ref}`),
  );

  const nodes = [...docs]
    .map((doc) => ({
      slug: doc.slug,
      kind: doc.frontmatter?.kind,
      title: doc.frontmatter?.title || doc.frontmatter?.name || doc.slug,
      domain: doc.frontmatter?.domain,
      mtime: doc.mtime,
      outDegree: 0,
      inDegree: 0,
    }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
  const nodeBySlug = new Map(nodes.map((node) => [node.slug, node]));
  const out = {};
  const incoming = {};
  for (const edge of edges) {
    if (!out[edge.from]) out[edge.from] = [];
    out[edge.from].push(edge.id);
    const fromNode = nodeBySlug.get(edge.from);
    if (fromNode) fromNode.outDegree += 1;
    if (!edge.resolved) continue;
    if (!incoming[edge.to]) incoming[edge.to] = [];
    incoming[edge.to].push(edge.id);
    const toNode = nodeBySlug.get(edge.to);
    if (toNode) toNode.inDegree += 1;
  }
  for (const edgeIds of Object.values(out)) edgeIds.sort();
  for (const edgeIds of Object.values(incoming)) edgeIds.sort();

  return {
    version: COMPILER_VERSION,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    resolvedEdgeCount: edges.filter((edge) => edge.resolved).length,
    externalEdgeCount: edges.filter((edge) => edge.external).length,
    unresolvedEdgeCount: edges.filter((edge) => !edge.resolved && !edge.external).length,
    nodes,
    edges,
    aliases,
    ambiguousAliases,
    issues,
    indexes: includeIndexes ? { out, in: incoming } : undefined,
  };
}

function isPathLikeGraphRef(ref) {
  return (
    ref.startsWith('src/') ||
    ref.startsWith('mcp/') ||
    ref.startsWith('cli/') ||
    ref.startsWith('app/') ||
    ref.startsWith('tests/') ||
    ref.startsWith('scripts/') ||
    ref.includes('.')
  );
}

function addAlias(aliasEntries, alias, slug) {
  if (typeof alias !== 'string' || !alias.trim()) return;
  const key = alias.trim();
  if (!aliasEntries.has(key)) aliasEntries.set(key, new Set());
  aliasEntries.get(key).add(slug);
}
