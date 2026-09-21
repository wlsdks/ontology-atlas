import { formatAllowedValueError } from '../suggestions.mjs';
import {
  DEFAULT_QUERY_LIMIT,
} from './query-values.mjs';
import {
  edgeAllowed,
  normalizeDepth,
  normalizeDirection,
  normalizeLimit,
  normalizeOptionalBoolean,
  normalizePathDirection,
  normalizeSearchBudget,
  normalizeTypes,
  typeAllowed,
} from './query-primitives.mjs';

export function createQueryPlanner({
  artifact,
  nodes,
  edges,
  nodeBySlug,
  resolve,
  filteredEdges,
  traversalEstimate,
  targetOperations,
  normalizeDependencyImpactTypes,
  normalizeEdgeTargetKind,
  normalizeIterations,
  normalizeMatchEdgesTypes,
  normalizeNodeKind,
  normalizeNodeSort,
  normalizeNonNegativeInteger,
  normalizeOptionalString,
  normalizeTraversalDirection,
  publicRelationTypes,
}) {
  function queryPlan(options = {}) {
    const targetOperation = normalizePlanTargetOperation(options.targetOperation, targetOperations);
    const limit = normalizeLimit(options.limit, targetOperation === 'all_paths' ? 25 : DEFAULT_QUERY_LIMIT);
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
    } else if (
      targetOperation === 'path' ||
      targetOperation === 'all_paths' ||
      targetOperation === 'explain_relation'
    ) {
      const from = resolve(options.from, 'from');
      const to = resolve(options.to, 'to');
      const direction = normalizePathDirection(options.direction);
      const maxHops = normalizeDepth(options.maxHops, 5);
      const traversal = traversalEstimate(from, direction, typeSet, maxHops);
      normalized.from = from;
      normalized.to = to;
      normalized.direction = direction;
      normalized.maxHops = maxHops;
      if (targetOperation === 'all_paths') {
        normalized.searchBudget = normalizeSearchBudget(options.searchBudget);
      }
      indexesUsed.push(...adjacencyIndexesForDirection(direction), 'aliasToSlug');
      if (typeSet) indexesUsed.push('edge.type filter');
      if (targetOperation === 'all_paths' && traversal.potentialPathUpperBound > limit) {
        warnings.push('all_paths may be truncated by limit; reduce maxHops or add relation types.');
      }
      if (targetOperation === 'all_paths' && traversal.potentialPathUpperBound > normalized.searchBudget) {
        warnings.push('all_paths may stop at searchBudget before exhaustive enumeration; reduce maxHops, add relation types, or raise searchBudget.');
      }
      estimate = {
        strategy: targetOperation === 'all_paths' ? 'bounded_path_enumeration' : 'bounded_bfs',
        edgeScans: traversal.edgeScans,
        reachableWithinDepth: traversal.reachableWithinDepth,
        frontierByDepth: traversal.frontierByDepth,
        potentialPathUpperBound: traversal.potentialPathUpperBound,
        resultUpperBound: targetOperation === 'all_paths'
          ? Math.min(traversal.potentialPathUpperBound, limit, normalized.searchBudget ?? limit)
          : 1,
        costClass: queryCostClass(traversal.edgeScans + traversal.potentialPathUpperBound),
      };
    } else if (
      targetOperation === 'reachability' ||
      targetOperation === 'impact' ||
      targetOperation === 'blast_radius' ||
      targetOperation === 'subgraph' ||
      targetOperation === 'builder_context'
    ) {
      const slug = resolve(options.slug ?? options.seed, 'slug');
      const defaultDirection =
        targetOperation === 'impact' || targetOperation === 'blast_radius'
          ? 'incoming'
          : targetOperation === 'builder_context'
            ? 'both'
            : 'outgoing';
      const direction = targetOperation === 'builder_context'
        ? normalizeDirection(options.direction, defaultDirection)
        : normalizeTraversalDirection(options.direction, defaultDirection);
      const defaultDepth =
        targetOperation === 'reachability' ? 3 : targetOperation === 'builder_context' ? 1 : 2;
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
      const slugContains = normalizeOptionalString(options.slugContains, 'slugContains')?.toLowerCase() ?? null;
      const minDegree = normalizeNonNegativeInteger(options.minDegree, 'minDegree');
      const maxDegree = normalizeNonNegativeInteger(options.maxDegree, 'maxDegree');
      const minInDegree = normalizeNonNegativeInteger(options.minInDegree, 'minInDegree');
      const minOutDegree = normalizeNonNegativeInteger(options.minOutDegree, 'minOutDegree');
      const hasIncoming = normalizeOptionalBoolean(options.hasIncoming, 'hasIncoming', null);
      const hasOutgoing = normalizeOptionalBoolean(options.hasOutgoing, 'hasOutgoing', null);
      const sort = normalizeNodeSort(options.sort);
      const matchingNodes = nodes.filter((node) => {
        const inDegree = node.inDegree || 0;
        const outDegree = node.outDegree || 0;
        const degree = inDegree + outDegree;
        if (kind && node.kind !== kind) return false;
        if (domain && node.domain !== domain) return false;
        if (slugContains && !node.slug.toLowerCase().includes(slugContains)) return false;
        if (minDegree !== null && degree < minDegree) return false;
        if (maxDegree !== null && degree > maxDegree) return false;
        if (minInDegree !== null && inDegree < minInDegree) return false;
        if (minOutDegree !== null && outDegree < minOutDegree) return false;
        if (hasIncoming !== null && (inDegree > 0) !== hasIncoming) return false;
        if (hasOutgoing !== null && (outDegree > 0) !== hasOutgoing) return false;
        return true;
      });
      Object.assign(normalized, {
        kind,
        domain,
        slugContains,
        minDegree,
        maxDegree,
        minInDegree,
        minOutDegree,
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
    } else if (targetOperation === 'match_edges') {
      const edgeTypeSet = normalizeMatchEdgesTypes(options);
      const fromInput = normalizeOptionalString(options.from, 'from');
      const toInput = normalizeOptionalString(options.to, 'to');
      const from = fromInput ? resolve(fromInput, 'from') : null;
      const to = toInput ? resolve(toInput, 'to') : null;
      const fromKind = normalizeNodeKind(options.fromKind, 'fromKind');
      const toKind = normalizeEdgeTargetKind(options.toKind, 'toKind');
      const includeExternal = normalizeOptionalBoolean(options.includeExternal, 'includeExternal', false);
      const includeUnresolved = normalizeOptionalBoolean(options.includeUnresolved, 'includeUnresolved', false);
      const matchingEdges = edges.filter((edge) => {
        if (!edgeAllowed(edge, edgeTypeSet, includeExternal, includeUnresolved)) return false;
        if (from && edge.from !== from) return false;
        if (to && edge.to !== to) return false;
        const fromNode = nodeBySlug.get(edge.from);
        const toNode = edge.resolved ? nodeBySlug.get(edge.to) : null;
        if (fromKind && fromNode?.kind !== fromKind) return false;
        if (toKind) {
          if (edge.resolved) return toNode?.kind === toKind;
          if (edge.external) return toKind === 'external';
          return toKind === 'unresolved';
        }
        return true;
      });
      Object.assign(normalized, {
        from,
        to,
        fromKind,
        toKind,
        types: edgeTypeSet ? [...edgeTypeSet].sort() : null,
        relationTypes: publicRelationTypes(edgeTypeSet),
        includeExternal,
        includeUnresolved,
      });
      indexesUsed.push('edges');
      if (edgeTypeSet) indexesUsed.push('edge.type filter');
      if (from || to) indexesUsed.push('aliasToSlug');
      estimate = {
        strategy: 'edge_scan',
        edgeScans: edges.length,
        totalMatches: matchingEdges.length,
        resultUpperBound: Math.min(matchingEdges.length, limit),
        costClass: queryCostClass(edges.length),
      };
    } else if (targetOperation === 'centrality') {
      const iterations = normalizeIterations(options.iterations);
      const resolvedEdges = edges.filter((edge) => edge.resolved && typeAllowed(edge.via, typeSet));
      const sourcesWithOutgoingEdges = new Set(resolvedEdges.map((edge) => edge.from));
      const rankingWorkUnits = (nodes.length + resolvedEdges.length) * iterations;
      normalized.iterations = iterations;
      indexesUsed.push('nodes', 'edges');
      if (typeSet) indexesUsed.push('edge.type filter');
      estimate = {
        strategy: 'page_rank_centrality',
        nodeScans: nodes.length,
        edgeScans: resolvedEdges.length,
        iterations,
        danglingNodes: Math.max(0, nodes.length - sourcesWithOutgoingEdges.size),
        rankingWorkUnits,
        resultUpperBound: Math.min(nodes.length, limit),
        costClass: queryCostClass(Math.ceil(rankingWorkUnits / 20)),
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
    'seed',
    'from',
    'to',
    'project',
    'direction',
    'depth',
    'maxHops',
    'searchBudget',
    'iterations',
    'limit',
    'kind',
    'domain',
    'slugContains',
    'minDegree',
    'maxDegree',
    'minInDegree',
    'minOutDegree',
    'hasIncoming',
    'hasOutgoing',
    'sort',
    'fromKind',
    'toKind',
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

  if (targetOperation === 'all_paths' || targetOperation === 'path' || targetOperation === 'explain_relation') {
    if (typeof safer.maxHops === 'number') safer.maxHops = Math.max(1, Math.min(safer.maxHops - 1, 3));
    if (!Array.isArray(safer.types) || safer.types.length === 0) safer.types = ['depends_on', 'relates'];
    if (targetOperation === 'all_paths') {
      safer.limit = Math.min(Number(safer.limit) || 10, 10);
      safer.searchBudget = Math.min(Number(safer.searchBudget) || 1000, 1000);
    }
    return safer;
  }

  if (
    targetOperation === 'reachability' ||
    targetOperation === 'impact' ||
    targetOperation === 'blast_radius' ||
    targetOperation === 'subgraph' ||
    targetOperation === 'builder_context'
  ) {
    if (typeof safer.depth === 'number') safer.depth = Math.max(1, Math.min(safer.depth - 1, 2));
    if (!Array.isArray(safer.types) || safer.types.length === 0) safer.types = ['depends_on', 'relates'];
    safer.limit = Math.min(Number(safer.limit) || 25, 25);
    return safer;
  }

  if (targetOperation === 'match_nodes' || targetOperation === 'match_edges') {
    safer.limit = Math.min(Number(safer.limit) || 25, 25);
    return safer;
  }

  if (targetOperation === 'centrality') {
    safer.limit = Math.min(Number(safer.limit) || 25, 25);
    safer.iterations = Math.min(Number(safer.iterations) || 20, 20);
    if (!Array.isArray(safer.types) || safer.types.length === 0) safer.types = ['depends_on', 'relates'];
    return safer;
  }

  if (safer.limit !== undefined) {
    safer.limit = Math.min(Number(safer.limit) || 25, 25);
    return safer;
  }

  return null;
}
