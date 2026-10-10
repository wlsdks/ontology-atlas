import { assertQueryOperation } from './query-operation.mjs';
import {
  hasNonEmptyString,
  isPlainObject,
  sumCountBucket,
  validCompiledEdgeRow,
  validCount,
  validCountBucket,
  validNodeSummary,
  validPage,
} from './value-checks.mjs';

export function assertOverviewShape(result) {
  assertQueryOperation(result, 'overview');
  if (!isPlainObject(result.graph)) {
    throw new Error('overview graph must be an object');
  }
  for (const field of ['nodes', 'edges']) {
    if (!validCount(result.graph[field])) {
      throw new Error(`overview graph.${field} must be a non-negative integer`);
    }
  }
  for (const field of ['resolvedEdges', 'externalEdges', 'unresolvedEdges', 'issues']) {
    if (result.graph[field] !== undefined && !validCount(result.graph[field])) {
      throw new Error(`overview graph.${field} must be a non-negative integer when present`);
    }
  }
  for (const field of ['byKind', 'byDomain', 'byRelation']) {
    if (!validCountBucket(result[field])) {
      throw new Error(`overview ${field} must be an object of non-negative integer counts`);
    }
  }
  if (!Array.isArray(result.hubs)) {
    throw new Error('overview hubs must be an array');
  }
  for (let index = 0; index < result.hubs.length; index += 1) {
    if (!validHubRow(result.hubs[index])) {
      throw new Error(`overview hubs[${index}] has an invalid hub shape`);
    }
  }
  return result;
}

export function assertDomainMatrixShape(result) {
  assertQueryOperation(result, 'domain_matrix');
  if (result.project !== null && result.project !== undefined && !hasNonEmptyString(result.project)) {
    throw new Error('domain_matrix project must be null or a non-empty string');
  }
  if (!isPlainObject(result.summary)) {
    throw new Error('domain_matrix summary must be an object');
  }
  for (const field of [
    'domains',
    'nodes',
    'assignedNodes',
    'unassignedNodes',
    'crossDomainEdges',
    'selfDomainEdges',
    'externalEdges',
    'unresolvedEdges',
  ]) {
    if (!validCount(result.summary[field])) {
      throw new Error(`domain_matrix summary.${field} must be a non-negative integer`);
    }
  }
  if (result.summary.assignedNodes + result.summary.unassignedNodes !== result.summary.nodes) {
    throw new Error('domain_matrix assignedNodes + unassignedNodes must equal nodes');
  }
  if (!Array.isArray(result.domains)) {
    throw new Error('domain_matrix domains must be an array');
  }
  if (result.domains.length > result.summary.domains) {
    throw new Error('domain_matrix domains length must not exceed summary.domains');
  }
  for (let index = 0; index < result.domains.length; index += 1) {
    if (!validDomainMatrixDomainRow(result.domains[index])) {
      throw new Error(`domain_matrix domains[${index}] has an invalid domain row shape`);
    }
  }
  if (!validPage(result.connections, validDomainMatrixConnectionRow)) {
    throw new Error('domain_matrix connections must be a page with valid connection rows');
  }
  return result;
}

export function assertCentralityShape(result) {
  assertQueryOperation(result, 'centrality');
  if (!isPlainObject(result.rankings)) {
    throw new Error('centrality rankings must be an object');
  }
  for (const section of ['pageRank', 'bridges', 'authorities', 'hubs']) {
    const rows = result.rankings[section];
    if (!Array.isArray(rows)) {
      throw new Error(`centrality rankings.${section} must be an array`);
    }
    for (let index = 0; index < rows.length; index += 1) {
      if (!validCentralityRow(rows[index])) {
        throw new Error(`centrality rankings.${section}[${index}] has an invalid ranking shape`);
      }
    }
  }
  return result;
}

function validHubRow(row) {
  return Boolean(
    isPlainObject(row)
    && hasNonEmptyString(row.slug)
    && hasNonEmptyString(row.kind)
    && hasNonEmptyString(row.title)
    && validCount(row.inDegree)
    && validCount(row.outDegree)
    && validCount(row.degree)
  );
}

function validDomainMatrixDomainRow(row) {
  return Boolean(
    isPlainObject(row)
    && hasNonEmptyString(row.slug)
    && validNodeSummary(row.node)
    && row.node.slug === row.slug
    && validCount(row.nodes)
    && validCount(row.outgoing)
    && validCount(row.incoming)
    && validCount(row.selfEdges)
    && validCount(row.externalEdges)
    && validCount(row.unresolvedEdges)
  );
}

function validDomainMatrixConnectionRow(row) {
  return Boolean(
    isPlainObject(row)
    && hasNonEmptyString(row.from)
    && hasNonEmptyString(row.to)
    && validCount(row.count)
    && row.count > 0
    && validCountBucket(row.byRelation)
    && sumCountBucket(row.byRelation) === row.count
    && validNodeSummary(row.fromNode)
    && row.fromNode.slug === row.from
    && validNodeSummary(row.toNode)
    && row.toNode.slug === row.to
    && Array.isArray(row.examples)
    && row.examples.length <= row.count
    && row.examples.every(validCompiledEdgeRow)
  );
}

function validCentralityRow(row) {
  return Boolean(
    validHubRow(row)
    && Number.isFinite(row.pageRank)
    && row.pageRank >= 0
    && validCount(row.bridgeScore)
  );
}

const BLAST_RADIUS_RISKS = new Set(['unknown', 'low', 'medium', 'high']);

export const BLAST_RADIUS_QUALIFICATION_STATUSES = new Set([
  'unknown',
  'review_required',
  'declared_with_rationale',
]);

export function assertBlastRadiusShape(result) {
  assertQueryOperation(result, 'blast_radius');
  if (!hasNonEmptyString(result.center)) {
    throw new Error('blast_radius center must be a non-empty string');
  }
  if (!BLAST_RADIUS_RISKS.has(result.risk)) {
    throw new Error(`blast_radius risk must be one of: ${[...BLAST_RADIUS_RISKS].join(', ')}`);
  }
  if (!isPlainObject(result.summary)) {
    throw new Error('blast_radius summary must be an object');
  }
  if (
    !isPlainObject(result.qualification)
    || !BLAST_RADIUS_QUALIFICATION_STATUSES.has(result.qualification.status)
    || result.qualification.basis !== 'declared_dependencies'
    || result.qualification.completeness !== 'unknown'
    || result.qualification.sourceBacked !== false
  ) {
    throw new Error('blast_radius qualification must report declared dependency evidence and unknown completeness');
  }
  for (const field of [
    'declaredEdges',
    'declaredWithRationaleEdges',
    'reviewRequiredEdges',
    'sourceBackedEdges',
  ]) {
    if (!validCount(result.qualification[field])) {
      throw new Error(`blast_radius qualification.${field} must be a non-negative integer`);
    }
  }
  for (const field of ['affectedNodes', 'affectedEdges', 'affectedKinds', 'affectedDomains', 'crossDomainEdges']) {
    if (!validCount(result.summary[field])) {
      throw new Error(`blast_radius summary.${field} must be a non-negative integer`);
    }
  }
  for (const field of ['byKind', 'byDomain']) {
    if (!validCountBucket(result[field])) {
      throw new Error(`blast_radius ${field} must be an object of non-negative integer counts`);
    }
  }
  if (!validPage(result.nodes, validBlastRadiusNodeRow)) {
    throw new Error('blast_radius nodes must be a page with valid node rows');
  }
  if (!validPage(result.edges, validBlastRadiusEdgeRow)) {
    throw new Error('blast_radius edges must be a page with valid edge rows');
  }
  return result;
}

function validBlastRadiusNodeRow(row) {
  return Boolean(
    isPlainObject(row)
    && hasNonEmptyString(row.slug)
    && validCount(row.distance)
    && isPlainObject(row.node)
    && hasNonEmptyString(row.node.slug)
    && hasNonEmptyString(row.node.kind)
    && hasNonEmptyString(row.node.title)
    && (row.node.inDegree === undefined || validCount(row.node.inDegree))
    && (row.node.outDegree === undefined || validCount(row.node.outDegree))
  );
}

export function validBlastRadiusEdgeRow(row) {
  return Boolean(
    isPlainObject(row)
    && hasNonEmptyString(row.from)
    && hasNonEmptyString(row.to)
    && hasNonEmptyString(row.via)
    && (row.id === undefined || hasNonEmptyString(row.id))
    && (row.traversedFrom === undefined || hasNonEmptyString(row.traversedFrom))
    && (row.traversedTo === undefined || hasNonEmptyString(row.traversedTo))
    && (row.crossDomain === undefined || typeof row.crossDomain === 'boolean')
    && (row.rationale === undefined || row.rationale === null || hasNonEmptyString(row.rationale))
    && (row.qualification === undefined || BLAST_RADIUS_QUALIFICATION_STATUSES.has(row.qualification))
  );
}
