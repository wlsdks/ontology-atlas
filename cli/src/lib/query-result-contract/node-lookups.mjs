import { assertQueryOperation } from './query-operation.mjs';
import {
  hasNonEmptyString,
  isPlainObject,
  validCount,
  validCountBucket,
  validNodeSummary,
} from './value-checks.mjs';

export function assertBacklinksShape(result) {
  if (!isPlainObject(result)) {
    throw new Error('find_backlinks response must be an object');
  }
  if (!hasNonEmptyString(result.target)) {
    throw new Error('find_backlinks target must be a non-empty string');
  }
  if (!Array.isArray(result.matches)) {
    throw new Error('find_backlinks matches must be an array');
  }
  const total = result.total ?? result.matches.length;
  if (!validCount(total)) {
    throw new Error('find_backlinks total must be a non-negative integer when present');
  }
  for (let index = 0; index < result.matches.length; index += 1) {
    if (!validBacklinkRow(result.matches[index])) {
      throw new Error(`find_backlinks matches[${index}] has an invalid backlink shape`);
    }
  }
  return result;
}

export function assertOrphansShape(result) {
  if (!isPlainObject(result)) {
    throw new Error('find_orphans response must be an object');
  }
  if (!Array.isArray(result.orphans)) {
    throw new Error('find_orphans orphans must be an array');
  }
  const total = result.total ?? result.orphans.length;
  if (!validCount(total)) {
    throw new Error('find_orphans total must be a non-negative integer when present');
  }
  for (let index = 0; index < result.orphans.length; index += 1) {
    if (!validNodeSummary(result.orphans[index])) {
      throw new Error(`find_orphans orphans[${index}] has an invalid orphan shape`);
    }
  }
  return result;
}

export function assertQueryConceptsShape(result) {
  if (!isPlainObject(result)) {
    throw new Error('query_concepts response must be an object');
  }
  if (!hasNonEmptyString(result.filter)) {
    throw new Error('query_concepts filter must be a non-empty string');
  }
  if (result.parsedAs !== undefined && !hasNonEmptyString(result.parsedAs)) {
    throw new Error('query_concepts parsedAs must be a non-empty string when present');
  }
  if (!Array.isArray(result.matches)) {
    throw new Error('query_concepts matches must be an array');
  }
  const total = result.total ?? result.matches.length;
  if (!validCount(total)) {
    throw new Error('query_concepts total must be a non-negative integer when present');
  }
  if (result.limited !== undefined && typeof result.limited !== 'boolean') {
    throw new Error('query_concepts limited must be a boolean when present');
  }
  for (let index = 0; index < result.matches.length; index += 1) {
    if (!validNodeSummary(result.matches[index])) {
      throw new Error(`query_concepts matches[${index}] has an invalid query-result shape`);
    }
  }
  return result;
}

export function assertNodeProfileShape(result) {
  assertQueryOperation(result, 'node_profile');
  if (!hasNonEmptyString(result.center)) {
    throw new Error('node_profile center must be a non-empty string');
  }
  if (!validNodeSummary(result.node)) {
    throw new Error('node_profile node must be a valid node summary');
  }
  if (!validDegree(result.degree)) {
    throw new Error('node_profile degree must contain non-negative in/out/total counts');
  }
  if (result.aliases !== undefined && (!Array.isArray(result.aliases) || result.aliases.some((alias) => !hasNonEmptyString(alias)))) {
    throw new Error('node_profile aliases must contain non-empty strings when present');
  }
  if (!isPlainObject(result.edges)) {
    throw new Error('node_profile edges must be an object');
  }
  for (const direction of ['incoming', 'outgoing']) {
    if (!validEdgeGroup(result.edges[direction], direction)) {
      throw new Error(`node_profile edges.${direction} must be a valid edge group`);
    }
  }
  if (result.lineage !== undefined && !validLineage(result.lineage)) {
    throw new Error('node_profile lineage must contain valid ancestor/descendant pages when present');
  }
  return result;
}

export function assertSimilarNodesShape(result) {
  assertQueryOperation(result, 'similar_nodes');
  if (!Array.isArray(result.matches)) {
    throw new Error('similar_nodes matches must be an array');
  }
  const total = result.totalMatches ?? result.matches.length;
  if (!validCount(total)) {
    throw new Error('similar_nodes totalMatches must be a non-negative integer when present');
  }
  if (result.limited !== undefined && typeof result.limited !== 'boolean') {
    throw new Error('similar_nodes limited must be a boolean when present');
  }
  for (let index = 0; index < result.matches.length; index += 1) {
    if (!validSimilarMatch(result.matches[index])) {
      throw new Error(`similar_nodes matches[${index}] has an invalid similar-node shape`);
    }
  }
  return result;
}

function validKindlessSummary(row) {
  return Boolean(
    isPlainObject(row)
    && hasNonEmptyString(row.slug)
    && row.kind === undefined
    && hasNonEmptyString(row.title)
    && (row.mtime === undefined || Number.isFinite(row.mtime))
  );
}

function validBacklinkRow(row) {
  if (!validNodeSummary(row) && !validKindlessSummary(row)) return false;
  if (row.matchedKeys !== undefined) {
    if (!Array.isArray(row.matchedKeys)) return false;
    if (!row.matchedKeys.every((key) => hasNonEmptyString(key))) return false;
  }
  if (row.matchedInBody !== undefined && typeof row.matchedInBody !== 'boolean') return false;
  const hasKeys = Array.isArray(row.matchedKeys) && row.matchedKeys.length > 0;
  return hasKeys || row.matchedInBody === true;
}

function validDegree(degree) {
  return Boolean(
    isPlainObject(degree)
    && validCount(degree.in)
    && validCount(degree.out)
    && validCount(degree.total)
  );
}

function validEdgeGroup(group, direction) {
  return Boolean(
    isPlainObject(group)
    && validCount(group.total)
    && (group.limited === undefined || typeof group.limited === 'boolean')
    && validCountBucket(group.byRelation ?? {})
    && Array.isArray(group.edges)
    && group.edges.every((edge) => validProfileEdge(edge, direction))
  );
}

function validProfileEdge(edge, direction) {
  const peerField = direction === 'incoming' ? 'from' : 'to';
  return Boolean(
    isPlainObject(edge)
    && hasNonEmptyString(edge.from)
    && hasNonEmptyString(edge.to)
    && hasNonEmptyString(edge.via)
    && (edge.id === undefined || hasNonEmptyString(edge.id))
    && (edge.ref === undefined || hasNonEmptyString(edge.ref))
    && (edge.resolved === undefined || typeof edge.resolved === 'boolean')
    && (edge.external === undefined || typeof edge.external === 'boolean')
    && hasNonEmptyString(edge[peerField])
    && (edge.otherKind === undefined || hasNonEmptyString(edge.otherKind))
    && (edge.otherNode === null || edge.otherNode === undefined || validNodeSummary(edge.otherNode))
  );
}

function validLineage(lineage) {
  if (!isPlainObject(lineage)) return false;
  for (const field of ['ancestors', 'descendants']) {
    if (lineage[field] !== undefined && !validLineagePage(lineage[field])) return false;
  }
  return true;
}

function validLineagePage(page) {
  return Boolean(
    isPlainObject(page)
    && validCount(page.total)
    && (page.limited === undefined || typeof page.limited === 'boolean')
    && Array.isArray(page.nodes)
    && page.nodes.every((row) => (
      isPlainObject(row)
      && hasNonEmptyString(row.slug)
      && validCount(row.distance)
      && (row.via === undefined || hasNonEmptyString(row.via))
      && validNodeSummary(row.node)
    ))
  );
}

function validSimilarMatch(match) {
  return Boolean(
    isPlainObject(match)
    && validNodeSummary(match.node)
    && Number.isFinite(match.score)
    && match.score >= 0
    && validSignalBucket(match.signals ?? {})
    && (match.sharedNeighbors === undefined || (
      Array.isArray(match.sharedNeighbors)
      && match.sharedNeighbors.every((slug) => hasNonEmptyString(slug))
    ))
  );
}

function validSignalBucket(value) {
  if (!isPlainObject(value)) return false;
  return Object.values(value).every((score) => Number.isFinite(score) && score >= 0);
}
