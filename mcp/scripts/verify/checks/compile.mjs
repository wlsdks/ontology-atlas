import { GRAPH_ARRAY_KEYS } from '../../../src/vault/graph/relation-refs.mjs';

import { NODE_UID_RE, countMapFailure, numericFieldsFailure } from '../value-checks.mjs';

const GRAPH_ARRAY_KEY_SET = new Set(GRAPH_ARRAY_KEYS);

export function compileSummaryFailure(parsed) {
  if (!Number.isInteger(parsed?.version) || parsed.version < 1) {
    return 'compile_ontology response missing version';
  }
  if (typeof parsed.graphHash !== 'string' || parsed.graphHash.length === 0) {
    return 'compile_ontology response missing graphHash';
  }
  if (!Number.isFinite(parsed.maxMtime) || parsed.maxMtime < 0) {
    return 'compile_ontology response missing maxMtime';
  }
  const countFailure = numericFieldsFailure('compile_ontology', parsed, [
    'nodeCount',
    'edgeCount',
    'resolvedEdgeCount',
    'externalEdgeCount',
    'unresolvedEdgeCount',
    'aliasCount',
    'ambiguousAliasCount',
    'issueCount',
    'canonicalizationActionCount',
  ]);
  if (countFailure) return countFailure;
  const byKindFailure = countMapFailure('compile_ontology', 'byKind', parsed.byKind);
  if (byKindFailure) return byKindFailure;
  const byDomainFailure = countMapFailure('compile_ontology', 'byDomain', parsed.byDomain);
  if (byDomainFailure) return byDomainFailure;
  const byKindTotal = Object.values(parsed.byKind).reduce((sum, count) => sum + count, 0);
  if (byKindTotal !== parsed.nodeCount) {
    return `compile_ontology response byKind mismatch: nodeCount ${parsed.nodeCount}, byKind ${byKindTotal}`;
  }
  const edgeTotal =
    parsed.resolvedEdgeCount + parsed.externalEdgeCount + parsed.unresolvedEdgeCount;
  if (edgeTotal !== parsed.edgeCount) {
    return `compile_ontology response edge count mismatch: edgeCount ${parsed.edgeCount}, resolved+external+unresolved ${edgeTotal}`;
  }
  return null;
}

export function compileFullArtifactFailure(parsed) {
  const summaryFailure = compileSummaryFailure(parsed);
  if (summaryFailure) return summaryFailure;
  if (!Array.isArray(parsed.nodes)) {
    return 'compile_ontology full response missing nodes array';
  }
  if (!Array.isArray(parsed.edges)) {
    return 'compile_ontology full response missing edges array';
  }
  const nodesPaginationFailure = paginationMetaFailure('compile_ontology.nodesPagination', parsed.nodesPagination, parsed.nodeCount, parsed.nodes.length);
  if (nodesPaginationFailure) return nodesPaginationFailure;
  const edgesPaginationFailure = paginationMetaFailure('compile_ontology.edgesPagination', parsed.edgesPagination, parsed.edgeCount, parsed.edges.length);
  if (edgesPaginationFailure) return edgesPaginationFailure;
  const node = parsed.nodes[0];
  if (node && (
    typeof node.uid !== 'string' ||
    !NODE_UID_RE.test(node.uid) ||
    (node.merged_uids != null && (
      !Array.isArray(node.merged_uids) ||
      node.merged_uids.some((uid) => typeof uid !== 'string' || !NODE_UID_RE.test(uid))
    )) ||
    typeof node.slug !== 'string' ||
    typeof node.kind !== 'string' ||
    typeof node.title !== 'string' ||
    !Number.isFinite(node.mtime) ||
    !Number.isInteger(node.outDegree) ||
    node.outDegree < 0 ||
    !Number.isInteger(node.inDegree) ||
    node.inDegree < 0
  )) {
    return 'compile_ontology full response malformed node row';
  }
  const edge = parsed.edges[0];
  if (edge && (
    typeof edge.id !== 'string' ||
    typeof edge.from !== 'string' ||
    typeof edge.to !== 'string' ||
    typeof edge.via !== 'string' ||
    typeof edge.ref !== 'string' ||
    typeof edge.resolved !== 'boolean' ||
    typeof edge.external !== 'boolean'
  )) {
    return 'compile_ontology full response malformed edge row';
  }
  if (!Array.isArray(parsed.aliases)) {
    return 'compile_ontology full response missing aliases array';
  }
  if (!Array.isArray(parsed.ambiguousAliases)) {
    return 'compile_ontology full response missing ambiguousAliases array';
  }
  if (!Array.isArray(parsed.issues)) {
    return 'compile_ontology full response missing issues array';
  }
  if (!Array.isArray(parsed.canonicalizationActions)) {
    return 'compile_ontology full response missing canonicalizationActions array';
  }
  const arrayCountFailure = fullArtifactArrayCountFailure(parsed);
  if (arrayCountFailure) return arrayCountFailure;
  const canonicalizationFailure = canonicalizationActionsFailure(parsed.canonicalizationActions);
  if (canonicalizationFailure) return canonicalizationFailure;
  if (!parsed.summary || typeof parsed.summary !== 'object' || Array.isArray(parsed.summary)) {
    return 'compile_ontology full response missing summary';
  }
  const fullSummaryFailure = numericFieldsFailure('compile_ontology.summary', parsed.summary, [
    'nodes',
    'edges',
    'resolvedEdges',
    'externalEdges',
    'unresolvedEdges',
    'aliases',
    'ambiguousAliases',
    'issues',
  ]);
  if (fullSummaryFailure) return fullSummaryFailure;
  if (parsed.summary.nodes !== parsed.nodeCount || parsed.summary.edges !== parsed.edgeCount) {
    return `compile_ontology full response summary mismatch: summary ${parsed.summary.nodes}/${parsed.summary.edges}, counts ${parsed.nodeCount}/${parsed.edgeCount}`;
  }
  if (
    parsed.summary.aliases !== parsed.aliasCount ||
    parsed.summary.ambiguousAliases !== parsed.ambiguousAliasCount ||
    parsed.summary.issues !== parsed.issueCount
  ) {
    return `compile_ontology full response summary count mismatch: summary aliases/ambiguous/issues ${parsed.summary.aliases}/${parsed.summary.ambiguousAliases}/${parsed.summary.issues}, counts ${parsed.aliasCount}/${parsed.ambiguousAliasCount}/${parsed.issueCount}`;
  }
  if (parsed.summary.graphHash !== parsed.graphHash) {
    return 'compile_ontology full response summary graphHash mismatch';
  }
  return null;
}

function canonicalizationActionsFailure(actions) {
  for (const [index, action] of actions.entries()) {
    const label = `compile_ontology canonicalizationActions[${index}]`;
    if (!action || typeof action !== 'object' || Array.isArray(action)) {
      return `${label} must be an object`;
    }
    if (typeof action.slug !== 'string' || action.slug.trim() === '') {
      return `${label}.slug must be a non-empty string`;
    }
    if (!Array.isArray(action.keys) || action.keys.some((key) => typeof key !== 'string' || key.trim() === '')) {
      return `${label}.keys must be an array of non-empty strings`;
    }
    if (!action.frontmatter || typeof action.frontmatter !== 'object' || Array.isArray(action.frontmatter)) {
      return `${label}.frontmatter must be an object`;
    }
    if (!Number.isFinite(action.expected_mtime) || action.expected_mtime < 0) {
      return `${label}.expected_mtime must be a non-negative finite number`;
    }
    const frontmatterKeys = Object.keys(action.frontmatter);
    const declaredKeys = new Set(action.keys);
    for (const key of action.keys) {
      if (!GRAPH_ARRAY_KEY_SET.has(key)) {
        return `${label}.keys contains unsupported relation-array key "${key}"`;
      }
      if (!Object.prototype.hasOwnProperty.call(action.frontmatter, key)) {
        return `${label}.keys declares "${key}" but frontmatter does not include it`;
      }
    }
    for (const key of frontmatterKeys) {
      if (!GRAPH_ARRAY_KEY_SET.has(key)) {
        return `${label}.frontmatter.${key} is not a compiler relation-array key`;
      }
      if (!declaredKeys.has(key)) {
        return `${label}.frontmatter.${key} is missing from keys`;
      }
      const value = action.frontmatter[key];
      if (!Array.isArray(value) || value.some((ref) => typeof ref !== 'string' || ref.trim() === '')) {
        return `${label}.frontmatter.${key} must be an array of non-empty strings`;
      }
    }
  }
  return null;
}

function fullArtifactArrayCountFailure(parsed) {
  const checks = [
    ['aliases', 'aliasCount'],
    ['ambiguousAliases', 'ambiguousAliasCount'],
    ['issues', 'issueCount'],
    ['canonicalizationActions', 'canonicalizationActionCount'],
  ];
  for (const [arrayName, countName] of checks) {
    if (parsed[arrayName].length !== parsed[countName]) {
      return `compile_ontology full response ${arrayName} count mismatch: ${arrayName} ${parsed[arrayName].length}, ${countName} ${parsed[countName]}`;
    }
  }
  return null;
}

function paginationMetaFailure(label, meta, total, returned) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    return `${label} missing`;
  }
  for (const key of ['offset', 'limit', 'total', 'returned']) {
    if (!Number.isInteger(meta[key]) || meta[key] < 0) {
      return `${label} missing ${key}`;
    }
  }
  if (meta.total !== total) {
    return `${label} total mismatch: meta ${meta.total}, count ${total}`;
  }
  if (meta.returned !== returned) {
    return `${label} returned mismatch: meta ${meta.returned}, array ${returned}`;
  }
  if (typeof meta.hasMore !== 'boolean') {
    return `${label} missing hasMore`;
  }
  if (meta.nextOffset !== null && (!Number.isInteger(meta.nextOffset) || meta.nextOffset < 0)) {
    return `${label} missing nextOffset`;
  }
  if (meta.hasMore && meta.nextOffset === null) {
    return `${label} hasMore without nextOffset`;
  }
  return null;
}

function stringArrayMapFailure(label, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return `${label} missing`;
  }
  for (const [key, row] of Object.entries(value)) {
    if (!key || !Array.isArray(row) || row.some((entry) => typeof entry !== 'string' || !entry)) {
      return `${label} malformed row`;
    }
  }
  return null;
}

function stringArrayMapReferenceFailure(label, value, knownValues, noun) {
  for (const row of Object.values(value)) {
    for (const entry of row) {
      if (!knownValues.has(entry)) {
        return `${label} references unknown ${noun}`;
      }
    }
  }
  return null;
}

function groupedIndexCountFailure(label, value, counts) {
  const keys = new Set([...Object.keys(value), ...Object.keys(counts || {})]);
  for (const key of keys) {
    const actual = value[key]?.length ?? 0;
    const expected = counts?.[key] ?? 0;
    if (actual !== expected) {
      return `${label} count mismatch: ${key}`;
    }
  }
  return null;
}

function indexedEdgeMembershipCountFailure(label, value, expected, expectedLabel) {
  const actual = Object.values(value).reduce((sum, row) => sum + row.length, 0);
  if (actual !== expected) {
    return `${label} count mismatch: index ${actual}, ${expectedLabel} ${expected}`;
  }
  return null;
}

export function compileIndexesFailure(parsed) {
  const fullFailure = compileFullArtifactFailure(parsed);
  if (fullFailure) return fullFailure;
  const indexes = parsed.indexes;
  if (!indexes || typeof indexes !== 'object' || Array.isArray(indexes)) {
    return 'compile_ontology indexes response missing indexes';
  }
  for (const name of ['out', 'in', 'byKind', 'byDomain']) {
    const failure = stringArrayMapFailure(`compile_ontology.indexes.${name}`, indexes[name]);
    if (failure) return failure;
  }
  if (!indexes.edgeById || typeof indexes.edgeById !== 'object' || Array.isArray(indexes.edgeById)) {
    return 'compile_ontology.indexes.edgeById missing';
  }
  const edgeIds = Object.keys(indexes.edgeById);
  if (edgeIds.length !== parsed.edgeCount) {
    return `compile_ontology.indexes.edgeById count mismatch: index ${edgeIds.length}, edgeCount ${parsed.edgeCount}`;
  }
  for (const [id, edge] of Object.entries(indexes.edgeById)) {
    if (
      edge?.id !== id ||
      typeof edge.from !== 'string' ||
      typeof edge.to !== 'string' ||
      typeof edge.via !== 'string' ||
      typeof edge.ref !== 'string' ||
      typeof edge.resolved !== 'boolean' ||
      typeof edge.external !== 'boolean'
    ) {
      return 'compile_ontology.indexes.edgeById malformed edge row';
    }
  }
  const edgeIdSet = new Set(edgeIds);
  for (const name of ['out', 'in']) {
    const failure = stringArrayMapReferenceFailure(`compile_ontology.indexes.${name}`, indexes[name], edgeIdSet, 'edge id');
    if (failure) return failure;
  }
  const outCountFailure = indexedEdgeMembershipCountFailure('compile_ontology.indexes.out', indexes.out, parsed.edgeCount, 'edgeCount');
  if (outCountFailure) return outCountFailure;
  const inCountFailure = indexedEdgeMembershipCountFailure('compile_ontology.indexes.in', indexes.in, parsed.resolvedEdgeCount, 'resolvedEdgeCount');
  if (inCountFailure) return inCountFailure;
  const indexedResolved = Object.values(indexes.edgeById).filter((edge) => edge.resolved).length;
  const indexedExternal = Object.values(indexes.edgeById).filter((edge) => edge.external).length;
  const indexedUnresolved = Object.values(indexes.edgeById).filter((edge) => !edge.resolved && !edge.external).length;
  if (
    indexedResolved !== parsed.resolvedEdgeCount ||
    indexedExternal !== parsed.externalEdgeCount ||
    indexedUnresolved !== parsed.unresolvedEdgeCount
  ) {
    return `compile_ontology.indexes.edgeById edge breakdown mismatch: index ${indexedResolved}/${indexedExternal}/${indexedUnresolved}, counts ${parsed.resolvedEdgeCount}/${parsed.externalEdgeCount}/${parsed.unresolvedEdgeCount}`;
  }
  for (const [id, edge] of Object.entries(indexes.edgeById)) {
    if (!indexes.out[edge.from]?.includes(id)) {
      return 'compile_ontology.indexes.out missing edgeById edge';
    }
    if (edge.resolved && !indexes.in[edge.to]?.includes(id)) {
      return 'compile_ontology.indexes.in missing resolved edge';
    }
  }
  if (!indexes.aliasToSlug || typeof indexes.aliasToSlug !== 'object' || Array.isArray(indexes.aliasToSlug)) {
    return 'compile_ontology.indexes.aliasToSlug missing';
  }
  const aliasKeys = Object.keys(indexes.aliasToSlug);
  if (aliasKeys.length !== parsed.aliasCount) {
    return `compile_ontology.indexes.aliasToSlug count mismatch: index ${aliasKeys.length}, aliasCount ${parsed.aliasCount}`;
  }
  for (const [alias, slug] of Object.entries(indexes.aliasToSlug)) {
    if (!alias || typeof slug !== 'string' || !slug) {
      return 'compile_ontology.indexes.aliasToSlug malformed row';
    }
  }
  for (const name of ['uidToSlug', 'slugToUid', 'mergedUidToSlug']) {
    if (!indexes[name] || typeof indexes[name] !== 'object' || Array.isArray(indexes[name])) {
      return `compile_ontology.indexes.${name} missing`;
    }
  }
  const primaryUidRows = parsed.nodes.map((node) => [node.uid, node.slug]);
  if (Object.keys(indexes.uidToSlug).length !== parsed.nodeCount) {
    return `compile_ontology.indexes.uidToSlug count mismatch: index ${Object.keys(indexes.uidToSlug).length}, nodeCount ${parsed.nodeCount}`;
  }
  if (Object.keys(indexes.slugToUid).length !== parsed.nodeCount) {
    return `compile_ontology.indexes.slugToUid count mismatch: index ${Object.keys(indexes.slugToUid).length}, nodeCount ${parsed.nodeCount}`;
  }
  for (const [uid, slug] of Object.entries(indexes.uidToSlug)) {
    if (!NODE_UID_RE.test(uid) || typeof slug !== 'string' || !slug) {
      return 'compile_ontology.indexes.uidToSlug malformed row';
    }
  }
  for (const [slug, uid] of Object.entries(indexes.slugToUid)) {
    if (!slug || typeof uid !== 'string' || !NODE_UID_RE.test(uid)) {
      return 'compile_ontology.indexes.slugToUid malformed row';
    }
  }
  for (const [uid, slug] of primaryUidRows) {
    if (indexes.uidToSlug[uid] !== slug || indexes.slugToUid[slug] !== uid) {
      return `compile_ontology identity indexes mismatch: ${slug}`;
    }
  }
  const historicalUidRows = parsed.nodes.flatMap((node) =>
    (node.merged_uids || []).map((uid) => [uid, node.slug]),
  );
  if (parsed.nodes.length === parsed.nodeCount && Object.keys(indexes.mergedUidToSlug).length !== historicalUidRows.length) {
    return `compile_ontology.indexes.mergedUidToSlug count mismatch: index ${Object.keys(indexes.mergedUidToSlug).length}, merged_uids ${historicalUidRows.length}`;
  }
  for (const [uid, slug] of Object.entries(indexes.mergedUidToSlug)) {
    if (!NODE_UID_RE.test(uid) || typeof slug !== 'string' || !slug) {
      return 'compile_ontology.indexes.mergedUidToSlug malformed row';
    }
  }
  for (const [uid, slug] of historicalUidRows) {
    if (indexes.mergedUidToSlug[uid] !== slug) {
      return `compile_ontology.indexes.mergedUidToSlug mismatch: ${uid}`;
    }
  }
  const knownSlugs = new Set([
    ...parsed.nodes.map((node) => node.slug),
    ...parsed.aliases.map((alias) => alias.slug),
  ]);
  for (const [alias, slug] of Object.entries(indexes.aliasToSlug)) {
    if (!knownSlugs.has(slug)) {
      return `compile_ontology.indexes.aliasToSlug references unknown slug: ${alias}`;
    }
  }
  for (const name of ['byKind', 'byDomain']) {
    const failure = stringArrayMapReferenceFailure(`compile_ontology.indexes.${name}`, indexes[name], knownSlugs, 'node slug');
    if (failure) return failure;
  }
  const byKindCountFailure = groupedIndexCountFailure('compile_ontology.indexes.byKind', indexes.byKind, parsed.byKind);
  if (byKindCountFailure) return byKindCountFailure;
  const byDomainCountFailure = groupedIndexCountFailure('compile_ontology.indexes.byDomain', indexes.byDomain, parsed.byDomain);
  if (byDomainCountFailure) return byDomainCountFailure;
  return null;
}

export function compileIndexesSummary(parsed) {
  const indexes = parsed?.indexes;
  return [
    `out ${objectKeyCount(indexes?.out)}`,
    `in ${objectKeyCount(indexes?.in)}`,
    `edgeById ${objectKeyCount(indexes?.edgeById)}`,
    `aliases ${objectKeyCount(indexes?.aliasToSlug)}`,
    `edges ${edgeBreakdownSummary(parsed)}`,
  ].join(', ');
}

function objectKeyCount(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'n/a';
  return Object.keys(value).length;
}

function edgeBreakdownSummary(parsed) {
  const counts = [
    parsed?.resolvedEdgeCount,
    parsed?.externalEdgeCount,
    parsed?.unresolvedEdgeCount,
  ];
  return counts.map((count) => (Number.isInteger(count) ? count : 'n/a')).join('/');
}
