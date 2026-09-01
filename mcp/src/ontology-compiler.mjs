import { createHash } from 'node:crypto';

import { nodeUidIssue } from './schema.mjs';
import { GRAPH_ARRAY_KEYS, collectNeighborRefs, normalizeRelationRefs } from './vault.mjs';

const COMPILER_VERSION = 2;

/**
 * With `summary: true` the nodes / edges / aliases arrays are omitted and only
 * counts and aggregates are returned — a cheap call for an agent detecting a
 * graphHash change or judging size, which keeps a large vault (100+ nodes) under
 * the token limit.
 *
 * With `nodesLimit / nodesOffset` (or `edgesLimit / edgesOffset`) that array is
 * sliced and returned with `nodesPagination: { offset, limit, total, hasMore,
 * nextOffset }` metadata. `summary` wins when both are given.
 */
export function compileOntology(docs, options = {}) {
  const includeIndexes = optionalBoolean(options.includeIndexes, 'includeIndexes') ?? false;
  const summary = optionalBoolean(options.summary, 'summary') ?? false;
  const nodesLimit = optionalPositiveInt(options.nodesLimit, 'nodesLimit', { max: 500 });
  const nodesOffset = optionalNonNegativeInt(options.nodesOffset, 'nodesOffset') ?? 0;
  const edgesLimit = optionalPositiveInt(options.edgesLimit, 'edgesLimit', { max: 500 });
  const edgesOffset = optionalNonNegativeInt(options.edgesOffset, 'edgesOffset') ?? 0;
  const nodeMap = new Map();
  const aliasEntries = new Map();

  /**
   * **A `.md` without `kind:` is not a node** (measured 2026-07-29).
   *
   * `AGENTS.md` writes the contract as *"each `.md` with a frontmatter `kind:` is
   * an ontology node"*. `list`, `validate`, and the web runtime (`deriveDocNode`
   * returns `null` on an empty kind) all honoured it; only the compiler accepted
   * every `.md` as a node. So one ordinary memo in the vault produced:
   *
   *   list 97 · compile 98 · overview 98      ← same vault, different numbers
   *   compile --summary: nodeCount 4, byKind { domain: 1 }   ← self-contradictory in one artifact
   *
   * Worse, a kind-less node tripped the result contract of `overview` and `hubs`
   * (which require a non-empty `kind`) and killed **the whole command with exit
   * 2** — with an internal string that did not even name the file, on a vault
   * `validate` had just passed.
   *
   * The docs, the validator, and the web already stood on one side, so the
   * compiler moves there. This does not change what is counted; it **returns to
   * the scope the contract always had.**
   */
  const graphDocs = docs.filter((doc) => {
    const kind = doc?.frontmatter?.kind;
    return typeof kind === 'string' && kind.trim() !== '';
  });
  const skippedNonNodeCount = docs.length - graphDocs.length;
  const { uidToSlug, slugToUid, mergedUidToSlug } = validateGraphIdentity(graphDocs);

  for (const doc of graphDocs) {
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
  for (const doc of docs) {
    for (const diagnostic of doc?.diagnostics ?? []) {
      if (diagnostic?.code !== 'malformed-frontmatter-line') continue;
      issues.push({
        code: diagnostic.code,
        severity: 'error',
        slug: doc.slug,
        line: diagnostic.line,
        message: diagnostic.message,
      });
    }
  }
  // `compileOntology` is also a public library boundary: callers may provide
  // parsed frontmatter without carrying parser diagnostics. Never let a
  // scalar/object relation field disappear merely because that metadata was
  // omitted. The normal parser diagnostic is deduplicated by its exact
  // message; direct callers still get the same fail-closed issue.
  for (const doc of docs) {
    const frontmatter = doc?.frontmatter;
    if (!frontmatter || typeof frontmatter !== 'object') continue;
    const diagnostics = new Set(
      (doc?.diagnostics ?? [])
        .filter((diagnostic) => diagnostic?.code === 'malformed-frontmatter-line')
        .map((diagnostic) => diagnostic.message),
    );
    for (const key of GRAPH_ARRAY_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(frontmatter, key)) continue;
      if (Array.isArray(frontmatter[key])) continue;
      const message = `Frontmatter graph relation \`${key}:\` must be an array.`;
      const alreadyReported =
        diagnostics.has(message) ||
        [...diagnostics].some((item) => item?.includes(`graph relation \`${key}:\``));
      if (alreadyReported) continue;
      issues.push({
        code: 'malformed-frontmatter-line',
        severity: 'error',
        slug: doc.slug,
        message,
      });
    }
  }

  const edges = [];
  const edgeKeys = new Set();
  const canonicalizationActions = [];
  for (const doc of graphDocs) {
    const frontmatterPatch = {};
    const keys = [];
    for (const key of GRAPH_ARRAY_KEYS) {
      const value = doc.frontmatter?.[key];
      if (!Array.isArray(value)) continue;
      const canonical = normalizeRelationRefs(value);
      const alreadyCanonical =
        value.length === canonical.length &&
        value.every((item, index) => item === canonical[index]);
      if (alreadyCanonical) {
        continue;
      }
      frontmatterPatch[key] = canonical;
      keys.push(key);
    }
    if (keys.length > 0) {
      canonicalizationActions.push({
        slug: doc.slug,
        keys,
        frontmatter: frontmatterPatch,
        expected_mtime: doc.mtime,
      });
    }
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
      const relationNotes = doc.frontmatter?.relation_notes;
      if (relationNotes && typeof relationNotes === 'object' && !Array.isArray(relationNotes)) {
        const rawRationale = relationNotes[ref] ?? relationNotes[to];
        if (typeof rawRationale === 'string' && rawRationale.trim()) {
          edge.rationale = rawRationale.trim();
        }
      }
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

  const nodes = [...graphDocs]
    .map((doc) => {
      const uid = doc.frontmatter?.uid;
      const mergedUids = normalizeUidList(doc.frontmatter?.merged_uids);
      return {
        uid,
        ...(mergedUids.length > 0 ? { merged_uids: mergedUids } : {}),
        slug: doc.slug,
        kind: doc.frontmatter?.kind,
        title: doc.frontmatter?.title || doc.frontmatter?.name || doc.slug,
        domain: doc.frontmatter?.domain,
        ...(typeof doc.frontmatter?.path === 'string' && doc.frontmatter.path.trim()
          ? { path: doc.frontmatter.path }
          : {}),
        mtime: doc.mtime,
        outDegree: 0,
        inDegree: 0,
      };
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));
  const nodeBySlug = new Map(nodes.map((node) => [node.slug, node]));
  const out = {};
  const incoming = {};
  const edgeById = {};
  for (const edge of edges) {
    edgeById[edge.id] = edge;
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
  const byKind = groupNodes(nodes, 'kind');
  const byDomain = groupNodes(nodes, 'domain');
  const aliasToSlugIndex = Object.fromEntries(aliases.map(({ alias, slug }) => [alias, slug]));
  const graphHash = hashGraph({
    version: COMPILER_VERSION,
    nodes: nodes.map(({ uid, merged_uids, slug, kind, title, domain, outDegree, inDegree }) => ({
      uid,
      ...(merged_uids ? { merged_uids } : {}),
      slug,
      kind,
      title,
      domain,
      outDegree,
      inDegree,
    })),
    edges,
    aliases,
    ambiguousAliases,
    issues,
  });

  const nodeCount = nodes.length;
  const edgeCount = edges.length;
  const resolvedEdgeCount = edges.filter((edge) => edge.resolved).length;
  const externalEdgeCount = edges.filter((edge) => edge.external).length;
  const unresolvedEdgeCount = edges.filter(
    (edge) => !edge.resolved && !edge.external,
  ).length;
  const maxMtime = Math.max(0, ...nodes.map((node) => Number(node.mtime) || 0));
  // The count of concepts the vault names but that have no document, so never
  // became nodes. The web map and insights draw these as concepts too (96 dogfood
  // documents + 193 references = 289), so without this number the screen and the
  // CLI report different totals and neither explains the gap. They are not
  // promoted to nodes — inventory, centrality, and health still count only
  // concepts that have a document.
  const referencedOnlyCount = new Set(
    edges.filter((edge) => !edge.resolved).map((edge) => edge.ref),
  ).size;

  // Summary mode — omit every array, return counts and aggregates only, so an
  // agent on a large vault can read graphHash, detect change, and judge size
  // without exceeding the token limit. byKind / byDomain condense to a *count*
  // rather than a *slug list*. No marker in the response: the caller knows what it
  // asked for.
  if (summary) {
    return {
      version: COMPILER_VERSION,
      graphHash,
      maxMtime,
      nodeCount,
    skippedNonNodeCount,
      // How many `.md` files were passed over for not being nodes (no kind) — they
      // are not skipped silently. Ordinary memos mixing into a vault is normal, so
      // this is not an issue.
      skippedNonNodeCount,
      edgeCount,
      resolvedEdgeCount,
      externalEdgeCount,
      unresolvedEdgeCount,
      referencedOnlyCount,
      aliasCount: aliases.length,
      ambiguousAliasCount: ambiguousAliases.length,
      issueCount: issues.length,
      canonicalizationActionCount: canonicalizationActions.length,
      byKind: countByGroup(nodes, 'kind'),
      byDomain: countByGroup(nodes, 'domain'),
    };
  }

  // Pagination — slice plus metadata. Unspecified returns everything (backward compat).
  const slicedNodes = sliceWithMeta(nodes, nodesOffset, nodesLimit);
  const slicedEdges = sliceWithMeta(edges, edgesOffset, edgesLimit);

  return {
    version: COMPILER_VERSION,
    graphHash,
    maxMtime,
    nodeCount,
    edgeCount,
    resolvedEdgeCount,
    externalEdgeCount,
    unresolvedEdgeCount,
    referencedOnlyCount,
    aliasCount: aliases.length,
    ambiguousAliasCount: ambiguousAliases.length,
    issueCount: issues.length,
    canonicalizationActionCount: canonicalizationActions.length,
    byKind: countByGroup(nodes, 'kind'),
    byDomain: countByGroup(nodes, 'domain'),
    nodes: slicedNodes.items,
    edges: slicedEdges.items,
    ...(slicedNodes.paginated ? { nodesPagination: slicedNodes.meta } : {}),
    ...(slicedEdges.paginated ? { edgesPagination: slicedEdges.meta } : {}),
    aliases,
    ambiguousAliases,
    issues,
    canonicalizationActions,
    indexes: includeIndexes
      ? {
          out,
          in: incoming,
          byKind,
          byDomain,
          edgeById,
          aliasToSlug: aliasToSlugIndex,
          uidToSlug,
          slugToUid,
          mergedUidToSlug,
        }
      : undefined,
  };
}

function optionalNonNegativeInt(value, name) {
  if (value === undefined) return null;
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return value;
}

function optionalPositiveInt(value, name, options = {}) {
  if (value === undefined) return null;
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  if (options.max !== undefined && value > options.max) {
    throw new Error(`${name} must be <= ${options.max}`);
  }
  return value;
}

function optionalBoolean(value, name) {
  if (value === undefined) return null;
  if (typeof value !== 'boolean') {
    throw new Error(`${name} must be a boolean`);
  }
  return value;
}

function countByGroup(nodes, key) {
  const counts = {};
  for (const node of nodes) {
    const value = node[key];
    if (typeof value !== 'string' || !value.trim()) continue;
    counts[value] = (counts[value] || 0) + 1;
  }
  // Alphabetical sort — deterministic
  return Object.fromEntries(
    Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)),
  );
}

function sliceWithMeta(items, offset, limit) {
  const total = items.length;
  if (limit === null && offset === 0) {
    return { items, paginated: false };
  }
  const start = Math.min(offset, total);
  const end = limit === null ? total : Math.min(start + limit, total);
  const slice = items.slice(start, end);
  const hasMore = end < total;
  return {
    items: slice,
    paginated: true,
    meta: {
      offset: start,
      limit: limit ?? total - start,
      total,
      returned: slice.length,
      hasMore,
      nextOffset: hasMore ? end : null,
    },
  };
}

function groupNodes(nodes, key) {
  const grouped = {};
  for (const node of nodes) {
    const value = node[key];
    if (typeof value !== 'string' || !value.trim()) continue;
    if (!grouped[value]) grouped[value] = [];
    grouped[value].push(node.slug);
  }
  for (const slugs of Object.values(grouped)) slugs.sort();
  return Object.fromEntries(Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)));
}

function hashGraph(payload) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
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

function normalizeUidList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((uid) => typeof uid === 'string').map((uid) => uid.trim()).filter(Boolean))].sort();
}

function validateGraphIdentity(graphDocs) {
  const issues = [];
  const primaryUidSlugs = new Map();
  const mergedUidSlugs = new Map();
  const uidToSlug = {};
  const slugToUid = {};
  const mergedUidToSlug = {};

  for (const doc of graphDocs) {
    const uid = doc.frontmatter?.uid;
    if (uid === undefined || uid === null || uid === '') {
      issues.push({
        code: 'missing-uid',
        severity: 'error',
        slug: doc.slug,
        message: `Node "${doc.slug}" is missing required \`uid\`.`,
      });
      continue;
    }
    if (nodeUidIssue(uid)) {
      issues.push({
        code: 'invalid-uid',
        severity: 'error',
        slug: doc.slug,
        uid,
        message: `Node "${doc.slug}" has invalid \`uid\`; expected a lowercase UUIDv4.`,
      });
      continue;
    }
    if (!primaryUidSlugs.has(uid)) primaryUidSlugs.set(uid, []);
    primaryUidSlugs.get(uid).push(doc.slug);
  }

  for (const [uid, rawSlugs] of [...primaryUidSlugs].sort(([a], [b]) => a.localeCompare(b))) {
    const slugs = rawSlugs.sort();
    if (slugs.length > 1) {
      issues.push({
        code: 'duplicate-uid',
        severity: 'error',
        uid,
        slugs,
        message: `Primary UID "${uid}" is used by multiple nodes: ${slugs.join(', ')}.`,
      });
      continue;
    }
    uidToSlug[uid] = slugs[0];
    slugToUid[slugs[0]] = uid;
  }

  for (const doc of graphDocs) {
    const mergedUids = doc.frontmatter?.merged_uids;
    if (mergedUids === undefined) continue;
    if (!Array.isArray(mergedUids)) {
      issues.push({
        code: 'invalid-merged-uids',
        severity: 'error',
        slug: doc.slug,
        message: `Node "${doc.slug}" must store \`merged_uids\` as an array of lowercase UUIDv4 values.`,
      });
      continue;
    }
    for (const mergedUid of mergedUids) {
      if (nodeUidIssue(mergedUid)) {
        issues.push({
          code: 'invalid-merged-uid',
          severity: 'error',
          slug: doc.slug,
          uid: mergedUid,
          message: `Node "${doc.slug}" has invalid \`merged_uids\` entry "${String(mergedUid)}"; expected a lowercase UUIDv4.`,
        });
        continue;
      }
      if (!mergedUidSlugs.has(mergedUid)) mergedUidSlugs.set(mergedUid, []);
      mergedUidSlugs.get(mergedUid).push(doc.slug);
    }
  }
  for (const [uid, rawSlugs] of [...mergedUidSlugs].sort(([a], [b]) => a.localeCompare(b))) {
    const mergedSlugs = rawSlugs.sort();
    if (mergedSlugs.length > 1) {
      issues.push({
        code: 'duplicate-merged-uid',
        severity: 'error',
        uid,
        slugs: mergedSlugs,
        message: `Historical UID "${uid}" is claimed by multiple nodes: ${mergedSlugs.join(', ')}.`,
      });
    }
    const primarySlug = uidToSlug[uid];
    if (primarySlug) {
      issues.push({
        code: 'primary-merged-uid-collision',
        severity: 'error',
        uid,
        primarySlug,
        mergedSlugs,
        message: `UID "${uid}" is primary for "${primarySlug}" and historical for: ${mergedSlugs.join(', ')}.`,
      });
      continue;
    }
    if (mergedSlugs.length === 1) mergedUidToSlug[uid] = mergedSlugs[0];
  }

  if (issues.length > 0) throwIdentityIssues(issues);
  return { uidToSlug, slugToUid, mergedUidToSlug };
}

/**
 * One identity error **stops every graph command on the whole vault** — the
 * compile ends here, so `overview`, `health`, `agent-brief`, and `query_ontology`
 * all raise the same error. That verdict is correct in itself (half-drawing a
 * graph whose identity is unstable would be worse). But **a dead end has to name
 * the way out.**
 *
 * Measured 2026-08-08: a person writing a node in an editor without `uid:` hits
 * this error, and all the screen said was «what is wrong». With no «how to fix
 * it», one hand-authored node leaves the vault dead.
 */
const IDENTITY_REPAIR_HINT = Object.freeze({
  'missing-uid':
    'Hand-written nodes have no `uid:` yet. Any write repairs it: patch_concept(slug, {...}) mints one, ' +
    'or add the line yourself: `uid:` must be a lowercase UUIDv4.',
  'invalid-uid': '`uid:` must be a lowercase UUIDv4. Fix the value in the file, or let patch_concept rewrite it.',
});

function throwIdentityIssues(issues) {
  const hints = [...new Set(issues.map((issue) => IDENTITY_REPAIR_HINT[issue.code]).filter(Boolean))];
  const error = new Error(
    `Ontology compilation failed with ${issues.length} node identity error${issues.length === 1 ? '' : 's'}: ` +
      issues
        .map((issue) => {
          // duplicate-uid / duplicate-merged-uid carry `slugs` (plural) — the one
          // error that stops every graph command must name the offending files,
          // not print "(undefined)" (bug sweep 2026-09-01).
          const where = issue.slug ?? (Array.isArray(issue.slugs) ? issue.slugs.join(' + ') : 'unknown');
          return `${issue.code} (${where})`;
        })
        .join(', ') +
      (hints.length ? `\n  → ${hints.join('\n  → ')}` : ''),
  );
  error.name = 'OntologyIdentityError';
  error.code = 'invalid-ontology-identity';
  error.issues = issues;
  throw error;
}
