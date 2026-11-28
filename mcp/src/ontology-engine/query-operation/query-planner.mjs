import { formatAllowedValueError } from '../../suggestions.mjs';
import {
  DEFAULT_QUERY_LIMIT,
} from './query-values.mjs';
import {
  normalizeDepth,
  normalizeDirection,
  normalizeLimit,
  normalizeOptionalBoolean,
  normalizePathDirection,
  normalizeTypes,
} from './query-primitives.mjs';

export function createQueryPlanner({
  artifact,
  nodes,
  edges,
  resolve,
  filteredEdges,
  traversalEstimate,
  targetOperations,
  normalizeDependencyImpactTypes,
  normalizeNodeKind,
  normalizeNodeSort,
  normalizeOptionalString,
  normalizeTraversalDirection,
}) {
  function queryPlan(options = {}) {
    const targetOperation = normalizePlanTargetOperation(options.targetOperation, targetOperations);
    const limit = normalizeLimit(options.limit, DEFAULT_QUERY_LIMIT);
    const typeSet = targetOperation === 'impact' || targetOperation === 'blast_radius'
      ? normalizeDependencyImpactTypes(options.types)
      : normalizeTypes(options.types);
    const normalized = {
      targetOperation,
      types: typeSet ? [...typeSet].sort() : null,
      limit,
    };
    const indexesUsed = [];
    const warnings = [];
    let estimate;

    if (targetOperation === 'neighbors') {
      const slug = resolve(options.slug, 'slug');
      const direction = normalizeDirection(options.direction, 'both');
      const rows = filteredEdges(slug, { ...options, direction });
      normalized.slug = slug;
      normalized.direction = direction;
      indexesUsed.push(...adjacencyIndexesForDirection(direction));
      if (typeSet) indexesUsed.push('edge.type filter');
      estimate = {
        strategy: 'adjacency_lookup',
        edgeScans: rows.length,
        resultUpperBound: Math.min(rows.length, limit),
        costClass: queryCostClass(rows.length),
      };
    } else if (targetOperation === 'path' || targetOperation === 'explain_relation') {
      const from = resolve(options.from, 'from');
      const to = resolve(options.to, 'to');
      const direction = normalizePathDirection(options.direction);
      const maxHops = normalizeDepth(options.maxHops, 5);
      const traversal = traversalEstimate(from, direction, typeSet, maxHops);
      normalized.from = from;
      normalized.to = to;
      normalized.direction = direction;
      normalized.maxHops = maxHops;
      indexesUsed.push(...adjacencyIndexesForDirection(direction), 'aliasToSlug');
      if (typeSet) indexesUsed.push('edge.type filter');
      estimate = {
        strategy: 'bounded_bfs',
        edgeScans: traversal.edgeScans,
        reachableWithinDepth: traversal.reachableWithinDepth,
        frontierByDepth: traversal.frontierByDepth,
        potentialPathUpperBound: traversal.potentialPathUpperBound,
        resultUpperBound: 1,
        costClass: queryCostClass(traversal.edgeScans + traversal.potentialPathUpperBound),
      };
    } else if (
      targetOperation === 'reachability' ||
      targetOperation === 'impact' ||
      targetOperation === 'blast_radius' ||
      targetOperation === 'subgraph'
    ) {
      const slug = resolve(options.slug, 'slug');
      const defaultDirection =
        targetOperation === 'impact' || targetOperation === 'blast_radius' ? 'incoming' : 'outgoing';
      const direction = normalizeTraversalDirection(options.direction, defaultDirection);
      const defaultDepth = targetOperation === 'reachability' ? 3 : 2;
      const depth = normalizeDepth(options.depth, defaultDepth);
      const traversal = traversalEstimate(slug, direction, typeSet, depth);
      normalized.slug = slug;
      normalized.direction = direction;
      normalized.depth = depth;
      indexesUsed.push(...adjacencyIndexesForDirection(direction));
      if (typeSet) indexesUsed.push('edge.type filter');
      estimate = {
        strategy: 'bounded_graph_expansion',
        edgeScans: traversal.edgeScans,
        reachableWithinDepth: traversal.reachableWithinDepth,
        frontierByDepth: traversal.frontierByDepth,
        resultUpperBound: Math.min(traversal.reachableWithinDepth, limit),
        costClass: queryCostClass(traversal.edgeScans),
      };
    } else if (targetOperation === 'match_nodes') {
      const kind = normalizeNodeKind(options.kind, 'kind');
      const domain = normalizeOptionalString(options.domain, 'domain');
      const hasIncoming = normalizeOptionalBoolean(options.hasIncoming, 'hasIncoming', null);
      const hasOutgoing = normalizeOptionalBoolean(options.hasOutgoing, 'hasOutgoing', null);
      const sort = normalizeNodeSort(options.sort);
      const matchingNodes = nodes.filter((node) => {
        const inDegree = node.inDegree || 0;
        const outDegree = node.outDegree || 0;
        if (kind && node.kind !== kind) return false;
        if (domain && node.domain !== domain) return false;
        if (hasIncoming !== null && (inDegree > 0) !== hasIncoming) return false;
        if (hasOutgoing !== null && (outDegree > 0) !== hasOutgoing) return false;
        return true;
      });
      Object.assign(normalized, {
        kind,
        domain,
        hasIncoming,
        hasOutgoing,
        sort,
      });
      indexesUsed.push('nodes');
      estimate = {
        strategy: 'node_scan',
        nodeScans: nodes.length,
        totalMatches: matchingNodes.length,
        resultUpperBound: Math.min(matchingNodes.length, limit),
        costClass: queryCostClass(nodes.length),
      };
    } else {
      indexesUsed.push('compiled_artifact');
      estimate = {
        strategy: 'aggregate_scan',
        nodeScans: nodes.length,
        edgeScans: edges.length,
        costClass: queryCostClass(nodes.length + edges.length),
      };
    }

    const execution = queryPlanExecutionAdvice(targetOperation, normalized, estimate, warnings);

    return {
      operation: 'query_plan',
      targetOperation,
      sideEffect: false,
      graph: {
        nodes: nodes.length,
        edges: edges.length,
        resolvedEdges: edges.filter((edge) => edge.resolved).length,
        graphHash: artifact?.graphHash,
      },
      normalized,
      indexesUsed: [...new Set(indexesUsed)].sort(),
      estimate,
      warnings,
      execution,
    };
  }

  return queryPlan;
}

function normalizePlanTargetOperation(value, targetOperations) {
  const allowed = new Set(targetOperations);
  if (typeof value === 'string' && allowed.has(value)) return value;
  if (value === undefined || value === null || value === '') {
    throw new Error('targetOperation is required for query_plan and must name a supported query.');
  }
  throw new Error(formatAllowedValueError('targetOperation', value, targetOperations));
}

function adjacencyIndexesForDirection(direction) {
  if (direction === 'incoming') return ['in'];
  if (direction === 'outgoing') return ['out'];
  return ['in', 'out'];
}

function queryCostClass(score) {
  if (score >= 1000) return 'high';
  if (score >= 100) return 'medium';
  return 'low';
}

function queryPlanExecutionAdvice(targetOperation, normalized, estimate, warnings = []) {
  const suggestedQuery = buildPlannedQuery(targetOperation, normalized);
  const costClass = estimate?.costClass ?? 'low';
  const highCost = costClass === 'high';
  const hasWarnings = Array.isArray(warnings) && warnings.length > 0;
  const shouldRun = !highCost && !hasWarnings;
  const nextStep = shouldRun ? 'run' : highCost ? 'narrow' : 'review';
  const advice = {
    shouldRun,
    nextStep,
    recommendation: shouldRun
      ? 'Run suggestedQuery as planned.'
      : highCost
        ? 'Narrow the query before running it; reduce depth/hops, add relation types, or lower limit.'
        : 'Review warnings before running suggestedQuery.',
    suggestedQuery,
  };

  const saferQuery = buildSaferPlannedQuery(targetOperation, normalized, estimate, hasWarnings);
  if (saferQuery) advice.saferQuery = saferQuery;
  return advice;
}

function buildPlannedQuery(targetOperation, normalized) {
  const query = { operation: targetOperation };
  for (const key of [
    'slug',
    'from',
    'to',
    'project',
    'direction',
    'depth',
    'maxHops',
    'searchBudget',
    'limit',
    'kind',
    'domain',
    'hasIncoming',
    'hasOutgoing',
    'sort',
    'includeExternal',
    'includeUnresolved',
  ]) {
    if (normalized[key] !== undefined && normalized[key] !== null) query[key] = normalized[key];
  }
  if (Array.isArray(normalized.types) && normalized.types.length > 0) {
    query.types = normalized.types;
  }
  return query;
}

function buildSaferPlannedQuery(targetOperation, normalized, estimate, hasWarnings) {
  const costClass = estimate?.costClass ?? 'low';
  if (costClass !== 'high' && !hasWarnings) return null;
  const safer = buildPlannedQuery(targetOperation, normalized);

  if (targetOperation === 'path' || targetOperation === 'explain_relation') {
    if (typeof safer.maxHops === 'number') safer.maxHops = Math.max(1, Math.min(safer.maxHops - 1, 3));
    if (!Array.isArray(safer.types) || safer.types.length === 0) safer.types = ['depends_on', 'relates'];
    return safer;
  }

  if (
    targetOperation === 'reachability' ||
    targetOperation === 'impact' ||
    targetOperation === 'blast_radius' ||
    targetOperation === 'subgraph'
  ) {
    if (typeof safer.depth === 'number') safer.depth = Math.max(1, Math.min(safer.depth - 1, 2));
    if (!Array.isArray(safer.types) || safer.types.length === 0) safer.types = ['depends_on', 'relates'];
    safer.limit = Math.min(Number(safer.limit) || 25, 25);
    return safer;
  }

  if (targetOperation === 'match_nodes') {
    safer.limit = Math.min(Number(safer.limit) || 25, 25);
    return safer;
  }

  if (safer.limit !== undefined) {
    safer.limit = Math.min(Number(safer.limit) || 25, 25);
    return safer;
  }

  return null;
}
