import { assertQueryOperation } from './query-operation.mjs';
import {
  hasNonEmptyString,
  isPlainObject,
  validCount,
  validCountBucket,
  validPage,
} from './value-checks.mjs';

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
