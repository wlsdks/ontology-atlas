import { assertQueryOperation } from './query-operation.mjs';
import {
  hasNonEmptyString,
  isPlainObject,
  sumCountBucket,
  validCount,
  validCountBucket,
} from './value-checks.mjs';

const ALL_PATHS_EVIDENCE_STATUSES = new Set(['complete', 'partial']);
const ALL_PATHS_EVIDENCE_REASONS = new Set(['complete', 'limit', 'search_budget']);
const ALL_PATHS_EVIDENCE_NEXT_STEPS = new Set(['use', 'narrow']);

export function assertCyclesShape(result) {
  assertQueryOperation(result, 'cycles');
  if (!Array.isArray(result.cycles)) {
    throw new Error('cycles query cycles must be an array');
  }
  const total = result.totalCycles ?? result.cycles.length;
  if (!validCount(total)) {
    throw new Error('cycles query totalCycles must be a non-negative integer when present');
  }
  for (let index = 0; index < result.cycles.length; index += 1) {
    if (!validCycle(result.cycles[index])) {
      throw new Error(`cycles query cycles[${index}] has an invalid cycle shape`);
    }
  }
  return result;
}

export function assertPathShape(result) {
  if (!isPlainObject(result)) {
    throw new Error('find_path response must be an object');
  }
  if (result.found === false) return result;
  if (!Array.isArray(result.hops) || result.hops.length === 0) {
    throw new Error('find_path response hops must be a non-empty array when found');
  }
  if (result.hops.some((hop) => !hasNonEmptyString(hop))) {
    throw new Error('find_path response hops must contain non-empty strings');
  }
  if (typeof result.hopCount === 'number' && result.hopCount !== result.hops.length - 1) {
    throw new Error('find_path response hopCount must match hops length');
  }
  if (!Array.isArray(result.edges)) {
    throw new Error('find_path response edges must be an array when found');
  }
  if (result.edges.length !== result.hops.length - 1) {
    throw new Error('find_path response edges length must match hops length');
  }
  for (let index = 0; index < result.edges.length; index += 1) {
    if (!validPathEdge(result.edges[index], result.hops[index], result.hops[index + 1])) {
      throw new Error(`find_path response edges[${index}] has an invalid path-edge shape`);
    }
  }
  if (result.nodes !== undefined) {
    if (!Array.isArray(result.nodes) || result.nodes.length !== result.hops.length) {
      throw new Error('find_path response nodes length must match hops length');
    }
    for (let index = 0; index < result.nodes.length; index += 1) {
      if (!validPathNode(result.nodes[index], result.hops[index])) {
        throw new Error(`find_path response nodes[${index}] has an invalid path-node shape`);
      }
    }
  }
  return result;
}

export function assertAllPathsShape(result) {
  assertQueryOperation(result, 'all_paths');
  for (const field of ['from', 'to', 'direction']) {
    if (!hasNonEmptyString(result[field])) {
      throw new Error(`all_paths ${field} must be a non-empty string`);
    }
  }
  for (const field of ['maxHops', 'limit', 'searchBudget', 'expandedStates', 'totalPaths']) {
    if (!validCount(result[field])) {
      throw new Error(`all_paths ${field} must be a non-negative integer`);
    }
  }
  if (result.limit < 1 || result.searchBudget < 1) {
    throw new Error('all_paths limit and searchBudget must be positive integers');
  }
  if (result.expandedStates > result.searchBudget) {
    throw new Error('all_paths expandedStates must not exceed searchBudget');
  }
  for (const field of ['found', 'exhaustive', 'truncatedByBudget', 'totalPathsExact', 'limited']) {
    if (typeof result[field] !== 'boolean') {
      throw new Error(`all_paths ${field} must be a boolean`);
    }
  }
  if (result.exhaustive === result.truncatedByBudget) {
    throw new Error('all_paths exhaustive/truncatedByBudget mismatch');
  }
  if (result.totalPathsExact !== result.exhaustive) {
    throw new Error('all_paths totalPathsExact must match exhaustive');
  }
  if (result.shortestHopCount !== null && !validCount(result.shortestHopCount)) {
    throw new Error('all_paths shortestHopCount must be null or a non-negative integer');
  }
  if (!validCountBucket(result.byLength)) {
    throw new Error('all_paths byLength must be an object of non-negative integer counts');
  }
  if (!Array.isArray(result.paths)) {
    throw new Error('all_paths paths must be an array');
  }
  if (result.paths.length > result.limit) {
    throw new Error('all_paths paths length must not exceed limit');
  }
  if (result.totalPathsExact && result.paths.length > result.totalPaths) {
    throw new Error('all_paths paths length must not exceed totalPaths when exact');
  }
  if (result.found === false && result.totalPaths !== 0) {
    throw new Error('all_paths found=false must have totalPaths 0');
  }
  if (result.found === false && result.paths.length !== 0) {
    throw new Error('all_paths found=false must not include path rows');
  }
  if (result.found === true && result.paths.length === 0 && result.totalPathsExact) {
    throw new Error('all_paths found=true must include at least one path when totals are exact');
  }
  for (let index = 0; index < result.paths.length; index += 1) {
    const failure = allPathsRowFailure(result.paths[index], index);
    if (failure) throw new Error(failure);
  }
  if (result.totalPathsExact && sumCountBucket(result.byLength) !== result.totalPaths) {
    throw new Error('all_paths byLength total must equal totalPaths when exact');
  }
  if (!validAllPathsEvidence(result.evidence, result)) {
    throw new Error('all_paths evidence has an invalid completeness shape');
  }
  return result;
}

export function cyclesResultExitCode(result) {
  if (!Array.isArray(result?.cycles)) return 1;
  const cycles = result.cycles;
  const total = numberValue(result?.totalCycles, cycles.length);
  if (!Number.isInteger(total) || total < 0) return 1;
  if (cycles.some((cycle) => !validCycle(cycle))) return 1;
  return total === 0 ? 0 : 1;
}

export function pathResultExitCode(result) {
  if (result?.found === false) return 1;
  if (!Array.isArray(result?.hops) || result.hops.length === 0) return 1;
  if (result.hops.some((hop) => !hasNonEmptyString(hop))) return 1;
  if (typeof result.hopCount === 'number' && result.hopCount !== result.hops.length - 1) return 1;
  if (!Array.isArray(result.edges) || result.edges.length !== result.hops.length - 1) return 1;
  if (result.edges.some((edge, index) => !validPathEdge(edge, result.hops[index], result.hops[index + 1]))) {
    return 1;
  }
  return 0;
}

export function allPathsResultExitCode(result) {
  return result?.found === false ? 1 : 0;
}

export function validPathNode(row, expectedSlug) {
  return Boolean(
    isPlainObject(row)
    && row.slug === expectedSlug
    && hasNonEmptyString(row.kind)
    && hasNonEmptyString(row.title)
    && (row.domain === undefined || typeof row.domain === 'string')
  );
}

function allPathsRowFailure(row, index) {
  const label = `all_paths paths[${index}]`;
  if (!isPlainObject(row)) return `${label} must be an object`;
  if (!validCount(row.hopCount)) return `${label}.hopCount must be a non-negative integer`;
  if (!Array.isArray(row.hops) || row.hops.length === 0) return `${label}.hops must be a non-empty array`;
  if (row.hops.some((hop) => !hasNonEmptyString(hop))) return `${label}.hops must contain non-empty strings`;
  if (row.hopCount !== row.hops.length - 1) return `${label}.hopCount must match hops length`;
  if (!Array.isArray(row.edges)) return `${label}.edges must be an array`;
  if (row.edges.length !== row.hops.length - 1) return `${label}.edges length must match hops length`;
  for (let edgeIndex = 0; edgeIndex < row.edges.length; edgeIndex += 1) {
    if (!validUndirectedPathEdge(row.edges[edgeIndex], row.hops[edgeIndex], row.hops[edgeIndex + 1])) {
      return `${label}.edges[${edgeIndex}] has an invalid path-edge shape`;
    }
  }
  if (!Array.isArray(row.nodes) || row.nodes.length !== row.hops.length) {
    return `${label}.nodes length must match hops length`;
  }
  for (let nodeIndex = 0; nodeIndex < row.nodes.length; nodeIndex += 1) {
    if (!validPathNode(row.nodes[nodeIndex], row.hops[nodeIndex])) {
      return `${label}.nodes[${nodeIndex}] has an invalid path-node shape`;
    }
  }
  if (!validCountBucket(row.byRelation)) {
    return `${label}.byRelation must be an object of non-negative integer counts`;
  }
  if (sumCountBucket(row.byRelation) !== row.edges.length) {
    return `${label}.byRelation total must equal edge count`;
  }
  return null;
}

export function validUndirectedPathEdge(edge, a, b) {
  return validPathEdge(edge, a, b) || validPathEdge(edge, b, a);
}

function validAllPathsEvidence(evidence, result) {
  return Boolean(
    isPlainObject(evidence)
    && ALL_PATHS_EVIDENCE_STATUSES.has(evidence.status)
    && ALL_PATHS_EVIDENCE_REASONS.has(evidence.reason)
    && evidence.totalPathsExact === result.totalPathsExact
    && typeof evidence.pathsComplete === 'boolean'
    && ALL_PATHS_EVIDENCE_NEXT_STEPS.has(evidence.nextStep)
    && hasNonEmptyString(evidence.recommendation)
    && validAllPathsSuggestedQuery(evidence.suggestedQuery)
    && (evidence.saferQuery === undefined || validAllPathsSuggestedQuery(evidence.saferQuery))
    && ((evidence.pathsComplete && evidence.status === 'complete' && evidence.nextStep === 'use')
      || (!evidence.pathsComplete && evidence.status === 'partial' && evidence.nextStep === 'narrow'))
  );
}

function validAllPathsSuggestedQuery(query) {
  if (!isPlainObject(query)) return false;
  if (query.operation === 'all_paths') return true;
  return query.operation === 'query_plan' && query.targetOperation === 'all_paths';
}

function validCycle(cycle) {
  if (!cycle || typeof cycle !== 'object' || Array.isArray(cycle)) return false;
  const nodes = Array.isArray(cycle.nodes) ? cycle.nodes : cycle.slugs;
  if (!Array.isArray(nodes) || nodes.length < 2) return false;
  if (!nodes.every((slug) => hasNonEmptyString(slug))) return false;
  if (cycle.nodeSummaries !== undefined) {
    if (!Array.isArray(cycle.nodeSummaries) || cycle.nodeSummaries.length !== nodes.length) return false;
    for (let index = 0; index < cycle.nodeSummaries.length; index += 1) {
      if (!validPathNode(cycle.nodeSummaries[index], nodes[index])) return false;
    }
  }
  if (cycle.edges === undefined) return true;
  return Array.isArray(cycle.edges) && cycle.edges.length === nodes.length - 1;
}

function validPathEdge(edge, from, to) {
  return Boolean(
    edge
    && typeof edge === 'object'
    && !Array.isArray(edge)
    && edge.from === from
    && edge.to === to
    && hasNonEmptyString(edge.via)
  );
}

function numberValue(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
