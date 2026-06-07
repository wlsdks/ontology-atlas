import { refMatchesOntologyAtlasIgnore } from './ontology-atlas-ignore.mjs';
import { formatAllowedValueError } from './suggestions.mjs';

const DEFAULT_LIMIT = 100;
const DEFAULT_ALL_PATHS_SEARCH_BUDGET = 5000;
const MAX_ALL_PATHS_SEARCH_BUDGET = 50000;
const DOWNWARD_CONTAINMENT_TYPES = new Set(['domains', 'capabilities', 'elements', 'contains']);
const UPWARD_CONTAINMENT_TYPES = new Set(['domain']);
const HEALTH_IGNORED_COMPONENT_KINDS = new Set(['vault-readme']);
const AGENT_WORKFLOW_GUIDE = Object.freeze({
  path: 'docs/AGENT-GRAPH-WORKFLOW.md',
  title: 'Agent Graph Workflow',
  description:
    'CLI-only use, MCP-connected use, graph DB differences, graph query packs, and verification checks.',
});
const AGENT_MODE_COMPARISON = Object.freeze([
  Object.freeze({
    id: 'cli_only',
    label: 'CLI-only',
    when: 'No MCP client is connected or the user wants terminal-only inspection.',
    gives: 'validate, workspace-brief, graph scans, graph DB pack, and fallback timing over the same local vault.',
  }),
  Object.freeze({
    id: 'mcp_connected',
    label: 'MCP-connected',
    when: 'Claude Code, Codex, Cursor, or another MCP client is registered and restarted.',
    gives: 'direct read/write tools, structured repair fields, result contracts, and write guardrails.',
  }),
  Object.freeze({
    id: 'graph_db_pack',
    label: 'Graph DB pack',
    when: 'The user wants database-style graph exploration without running a database server.',
    gives: 'bounded query plans, node/edge scans, domain matrix, path evidence, and proof follow-ups.',
  }),
  Object.freeze({
    id: 'setup_gate',
    label: 'Setup gate',
    when: 'Setup is unclear or the agent was opened from a separate codebase root.',
    gives: 'config repair commands, JSON readiness, performance timing, and restart guidance before edits.',
  }),
]);
const GRAPH_SCAN_PROOF_CHECKLIST = Object.freeze([
  Object.freeze({
    id: 'report_scan_scope',
    label: 'Report scan scope',
    evidence: ['totalMatches', 'limited', 'row count'],
  }),
  Object.freeze({
    id: 'prove_node_rows',
    label: 'Prove node rows',
    evidence: ['node_profile', 'blast_radius'],
  }),
  Object.freeze({
    id: 'prove_edge_rows',
    label: 'Prove edge rows',
    evidence: ['explain_relation', 'path', 'relation_check'],
  }),
  Object.freeze({
    id: 'prove_path_completeness',
    label: 'Prove path completeness',
    evidence: ['evidence.pathsComplete', 'totalPathsExact'],
  }),
]);
export const NODE_KIND_VALUES = Object.freeze([
  'project',
  'domain',
  'capability',
  'element',
  'document',
  'vault-readme',
]);
export const EDGE_TARGET_KIND_VALUES = Object.freeze([
  ...NODE_KIND_VALUES,
  'external',
  'unresolved',
]);
export const RELATION_TYPE_VALUES = Object.freeze([
  'domains',
  'domain',
  'capabilities',
  'elements',
  'dependencies',
  'depends_on',
  'relates',
  'contains',
  'describes',
]);
export const WRITE_RELATION_TYPE_VALUES = Object.freeze([
  'depends_on',
  'relates',
  'contains',
  'describes',
  'domains',
  'capabilities',
  'elements',
  'domain',
]);
const RELATION_TYPES = new Set(RELATION_TYPE_VALUES);
export const MAINTENANCE_PHASE_VALUES = Object.freeze(['validate', 'repair', 'link', 'materialize', 'review']);
export const MAINTENANCE_SEVERITY_VALUES = Object.freeze(['fail', 'warn', 'info']);
export const MAINTENANCE_KIND_VALUES = Object.freeze([
  'inspect_compile_issue',
  'break_dependency_cycle',
  'canonicalize_graph_arrays',
  'resolve_dangling_reference',
  'add_missing_relation',
  'materialize_external_element',
  'unassigned_node',
  'empty_domain',
]);
const MAINTENANCE_PHASES = new Set(MAINTENANCE_PHASE_VALUES);
const MAINTENANCE_SEVERITIES = new Set(MAINTENANCE_SEVERITY_VALUES);
const MAINTENANCE_KINDS = new Set(MAINTENANCE_KIND_VALUES);
export const QUERY_ONTOLOGY_OPERATIONS = Object.freeze([
  'neighbors',
  'path',
  'all_paths',
  'query_plan',
  'centrality',
  'communities',
  'similar_nodes',
  'explain_relation',
  'reachability',
  'pattern_walk',
  'impact',
  'blast_radius',
  'subgraph',
  'overview',
  'schema',
  'facets',
  'match_nodes',
  'match_edges',
  'node_profile',
  'domain_profile',
  'domain_matrix',
  'project_scope',
  'project_map',
  'relation_check',
  'components',
  'lineage',
  'containment_tree',
  'cycles',
  'topological_order',
  'recommend_relations',
  'growth_plan',
  'maintenance_plan',
  'agent_brief',
  'workspace_brief',
  'health',
]);
export const QUERY_PLAN_TARGET_OPERATIONS = Object.freeze(
  QUERY_ONTOLOGY_OPERATIONS.filter((operation) => operation !== 'query_plan'),
);

export function queryCompiledOntology(artifact, query = {}, options = {}) {
  const operation = query.operation;
  const engine = createOntologyEngine(artifact, options);

  if (operation === 'neighbors') {
    return engine.neighbors(query.slug, query);
  }
  if (operation === 'path') {
    return engine.path(query.from, query.to, query);
  }
  if (operation === 'all_paths') {
    return engine.allPaths(query.from, query.to, query);
  }
  if (operation === 'query_plan') {
    return engine.queryPlan(query);
  }
  if (operation === 'centrality') {
    return engine.centrality(query);
  }
  if (operation === 'communities') {
    return engine.communities(query);
  }
  if (operation === 'similar_nodes') {
    return engine.similarNodes(query);
  }
  if (operation === 'explain_relation') {
    return engine.explainRelation(query.from, query.to, query);
  }
  if (operation === 'reachability') {
    return engine.reachability(query.slug, query);
  }
  if (operation === 'pattern_walk') {
    return engine.patternWalk(query.slug, query);
  }
  if (operation === 'impact') {
    return engine.impact(query.slug, query);
  }
  if (operation === 'blast_radius') {
    return engine.blastRadius(query.slug, query);
  }
  if (operation === 'subgraph') {
    return engine.subgraph(query.slug ?? query.seed, query);
  }
  if (operation === 'overview') {
    return engine.overview(query);
  }
  if (operation === 'schema') {
    return engine.schema(query);
  }
  if (operation === 'facets') {
    return engine.facets(query);
  }
  if (operation === 'match_nodes') {
    return engine.matchNodes(query);
  }
  if (operation === 'match_edges') {
    return engine.matchEdges(query);
  }
  if (operation === 'node_profile') {
    return engine.nodeProfile(query.slug, query);
  }
  if (operation === 'domain_profile') {
    return engine.domainProfile(query.slug ?? query.domain, query);
  }
  if (operation === 'domain_matrix') {
    return engine.domainMatrix(query);
  }
  if (operation === 'project_scope') {
    return engine.projectScope(query.slug ?? query.project, query);
  }
  if (operation === 'project_map') {
    return engine.projectMap(query.slug ?? query.project, query);
  }
  if (operation === 'relation_check') {
    return engine.relationCheck(query);
  }
  if (operation === 'components') {
    return engine.components(query);
  }
  if (operation === 'lineage') {
    return engine.lineage(query.slug, query);
  }
  if (operation === 'containment_tree') {
    return engine.containmentTree(query.slug, query);
  }
  if (operation === 'cycles') {
    return engine.cycles(query);
  }
  if (operation === 'topological_order') {
    return engine.topologicalOrder(query);
  }
  if (operation === 'recommend_relations') {
    return engine.recommendRelations(query);
  }
  if (operation === 'growth_plan') {
    return engine.growthPlan(query);
  }
  if (operation === 'maintenance_plan') {
    return engine.maintenancePlan(query);
  }
  if (operation === 'agent_brief') {
    return engine.agentBrief(query);
  }
  if (operation === 'workspace_brief') {
    return engine.workspaceBrief(query);
  }
  if (operation === 'health') {
    return engine.health(query);
  }

  throw new Error(formatAllowedValueError('operation', operation, QUERY_ONTOLOGY_OPERATIONS));
}

export function createOntologyEngine(artifact, options = {}) {
  const ontologyAtlasIgnorePatterns = Array.isArray(options.ontologyAtlasIgnorePatterns)
    ? options.ontologyAtlasIgnorePatterns
    : [];
  const nodes = Array.isArray(artifact?.nodes) ? artifact.nodes : [];
  const edges = Array.isArray(artifact?.edges) ? artifact.edges : [];
  const nodeBySlug = new Map(nodes.map((node) => [node.slug, node]));
  const aliasToSlug = new Map(
    (Array.isArray(artifact?.aliases) ? artifact.aliases : []).map(({ alias, slug }) => [
      alias,
      slug,
    ]),
  );
  const ambiguousAliasByName = new Map(
    (Array.isArray(artifact?.ambiguousAliases) ? artifact.ambiguousAliases : []).map((entry) => [
      entry.alias,
      entry.slugs,
    ]),
  );

  const outgoing = new Map();
  const incoming = new Map();
  for (const edge of edges) {
    if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
    outgoing.get(edge.from).push(edge);
    if (edge.resolved) {
      if (!incoming.has(edge.to)) incoming.set(edge.to, []);
      incoming.get(edge.to).push(edge);
    }
  }
  for (const list of [...outgoing.values(), ...incoming.values()]) {
    list.sort(compareEdges);
  }

  function resolve(input, fieldName = 'slug') {
    if (typeof input !== 'string' || !input.trim()) {
      throw new Error(`${fieldName} (string) is required.`);
    }
    const candidate = input.trim();
    if (nodeBySlug.has(candidate)) return candidate;
    const aliased = aliasToSlug.get(candidate);
    if (aliased) return aliased;
    const ambiguous = ambiguousAliasByName.get(candidate);
    if (ambiguous) {
      throw new Error(
        `${fieldName} "${candidate}" is ambiguous. Use a canonical slug: ${ambiguous.join(', ')}`,
      );
    }
    throw new Error(`${fieldName} "${candidate}" does not resolve to a compiled ontology node.`);
  }

  function filteredEdges(center, options = {}) {
    const direction = normalizeDirection(options.direction, 'both');
    const typeSet = normalizeTypes(options.types);
    const includeExternal = normalizeOptionalBoolean(options.includeExternal, 'includeExternal', false);
    const includeUnresolved = normalizeOptionalBoolean(options.includeUnresolved, 'includeUnresolved', false);
    const rows = [];

    if (direction === 'outgoing' || direction === 'both') {
      for (const edge of outgoing.get(center) || []) {
        if (!edgeAllowed(edge, typeSet, includeExternal, includeUnresolved)) continue;
        rows.push({ direction: 'outgoing', edge });
      }
    }
    if (direction === 'incoming' || direction === 'both') {
      for (const edge of incoming.get(center) || []) {
        if (!edgeAllowed(edge, typeSet, includeExternal, includeUnresolved)) continue;
        rows.push({ direction: 'incoming', edge });
      }
    }

    rows.sort((a, b) =>
      `${a.direction}:${edgeSortKey(a.edge)}`.localeCompare(
        `${b.direction}:${edgeSortKey(b.edge)}`,
      ),
    );
    return rows;
  }

  function neighbors(slugOrAlias, options = {}) {
    const center = resolve(slugOrAlias, 'slug');
    const limit = normalizeLimit(options.limit);
    const allRows = filteredEdges(center, options);
    const rows = allRows.slice(0, limit);
    const neighborSlugs = new Set();

    for (const row of rows) {
      if (row.edge.resolved) {
        neighborSlugs.add(row.direction === 'incoming' ? row.edge.from : row.edge.to);
      }
    }

    return {
      operation: 'neighbors',
      center,
      node: nodeBySlug.get(center),
      total: allRows.length,
      limited: allRows.length > rows.length,
      edges: rows.map(formatDirectedEdge),
      nodes: [...neighborSlugs].sort().map((slug) => nodeBySlug.get(slug)),
    };
  }

  function path(fromInput, toInput, options = {}) {
    const from = resolve(fromInput, 'from');
    const to = resolve(toInput, 'to');
    const maxHops = normalizeDepth(options.maxHops, 5);
    const direction = normalizePathDirection(options.direction);
    if (from === to) {
      return {
        operation: 'path',
        from,
        to,
        found: true,
        hopCount: 0,
        hops: [from],
        nodes: pathNodes([from]),
        edges: [],
      };
    }

    const typeSet = normalizeTypes(options.types);
    const queue = [{ slug: from, hops: [from], edges: [] }];
    const visited = new Set([from]);

    while (queue.length > 0) {
      const current = queue.shift();
      if (current.hops.length - 1 >= maxHops) continue;
      for (const { next, edge } of traversalEdges(current.slug, direction, typeSet)) {
        if (visited.has(next)) continue;
        const nextHops = [...current.hops, next];
        const nextEdges = [...current.edges, formatPathEdge(edge, current.slug, next)];
        if (next === to) {
          return {
            operation: 'path',
            from,
            to,
            found: true,
            hopCount: nextHops.length - 1,
            hops: nextHops,
            nodes: pathNodes(nextHops),
            edges: nextEdges,
          };
        }
        visited.add(next);
        queue.push({ slug: next, hops: nextHops, edges: nextEdges });
      }
    }

    return { operation: 'path', from, to, found: false, maxHops, hops: [], nodes: [], edges: [] };
  }

  function allPaths(fromInput, toInput, options = {}) {
    const from = resolve(fromInput, 'from');
    const to = resolve(toInput, 'to');
    const maxHops = normalizeDepth(options.maxHops, 5);
    const direction = normalizePathDirection(options.direction);
    const limit = normalizeLimit(options.limit, 25);
    const searchBudget = normalizeSearchBudget(options.searchBudget);
    const typeSet = normalizeTypes(options.types);
    const matches = [];
    let expandedStates = 0;
    let truncatedByBudget = false;

    const stack = [{ slug: from, hops: [from], edges: [] }];
    while (stack.length > 0) {
      if (expandedStates >= searchBudget) {
        truncatedByBudget = true;
        break;
      }
      const current = stack.pop();
      expandedStates += 1;
      const hopCount = current.hops.length - 1;
      if (current.slug === to) {
        matches.push(current);
        continue;
      }
      if (hopCount >= maxHops) continue;

      const candidates = traversalEdges(current.slug, direction, typeSet).reverse();
      for (const { next, edge } of candidates) {
        if (current.hops.includes(next)) continue;
        stack.push({
          slug: next,
          hops: [...current.hops, next],
          edges: [...current.edges, formatPathEdge(edge, current.slug, next)],
        });
      }
    }

    const uniqueMatches = uniquePathMatches(matches);
    const rows = uniqueMatches
      .map((row) => ({
        hopCount: row.hops.length - 1,
        hops: row.hops,
        nodes: pathNodes(row.hops),
        edges: row.edges,
        byRelation: countEdges(row.edges, 'via'),
      }))
      .sort((a, b) => a.hopCount - b.hopCount || a.hops.join('\0').localeCompare(b.hops.join('\0')));
    const lengthCounts = new Map();
    for (const row of rows) {
      const key = String(row.hopCount);
      lengthCounts.set(key, (lengthCounts.get(key) || 0) + 1);
    }
    const visibleRows = rows.slice(0, limit);
    const pathsComplete = !truncatedByBudget && rows.length <= limit;
    const evidenceReason = truncatedByBudget ? 'search_budget' : rows.length > limit ? 'limit' : 'complete';
    const baseQuery = {
      from,
      to,
      direction,
      maxHops,
      limit,
      searchBudget,
    };
    if (typeSet) baseQuery.types = [...typeSet].sort();
    const evidence = {
      status: pathsComplete ? 'complete' : 'partial',
      reason: evidenceReason,
      totalPathsExact: !truncatedByBudget,
      pathsComplete,
      nextStep: pathsComplete ? 'use' : 'narrow',
      recommendation: pathsComplete
        ? 'Safe to treat paths and totalPaths as complete for the requested bounds.'
        : truncatedByBudget
          ? 'Treat returned paths as partial evidence; reduce maxHops, add relation types, or raise searchBudget before relying on missing-path absence.'
          : 'totalPaths is exact, but paths is truncated by limit; raise limit or narrow maxHops/types before comparing every path.',
      suggestedQuery: pathsComplete
        ? { operation: 'all_paths', ...baseQuery }
        : { operation: 'query_plan', targetOperation: 'all_paths', ...baseQuery },
    };
    if (!pathsComplete) {
      evidence.saferQuery = {
        operation: 'all_paths',
        ...baseQuery,
        maxHops: maxHops > 1 ? maxHops - 1 : maxHops,
        limit: Math.min(limit, 10),
        searchBudget: Math.min(searchBudget, 1000),
      };
    }

    return {
      operation: 'all_paths',
      from,
      to,
      found: rows.length > 0,
      direction,
      maxHops,
      limit,
      searchBudget,
      expandedStates,
      exhaustive: !truncatedByBudget,
      truncatedByBudget,
      totalPaths: rows.length,
      totalPathsExact: !truncatedByBudget,
      limited: rows.length > limit || truncatedByBudget,
      shortestHopCount: visibleRows[0]?.hopCount ?? null,
      byLength: sortedCountObject(lengthCounts),
      evidence,
      paths: visibleRows,
    };
  }

  function pathNodes(hops) {
    return hops.map((slug) => summarizeNode(nodeBySlug.get(slug))).filter(Boolean);
  }

  function queryPlan(options = {}) {
    const targetOperation = normalizePlanTargetOperation(options.targetOperation);
    const limit = normalizeLimit(options.limit, targetOperation === 'all_paths' ? 25 : DEFAULT_LIMIT);
    const typeSet = normalizeTypes(options.types);
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
      targetOperation === 'subgraph'
    ) {
      const slug = resolve(options.slug ?? options.seed, 'slug');
      const direction = normalizeTraversalDirection(
        options.direction,
        targetOperation === 'impact' || targetOperation === 'blast_radius' ? 'incoming' : 'outgoing',
      );
      const depth = normalizeDepth(options.depth, targetOperation === 'reachability' ? 3 : 2);
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

  function centrality(options = {}) {
    const limit = normalizeLimit(options.limit, 10);
    const iterations = normalizeIterations(options.iterations);
    const typeSet = normalizeTypes(options.types);
    const resolvedEdges = edges.filter((edge) => edge.resolved && typeAllowed(edge.via, typeSet));
    const outgoingNeighbors = new Map(nodes.map((node) => [node.slug, new Set()]));
    const incomingNeighbors = new Map(nodes.map((node) => [node.slug, new Set()]));
    const outgoingEdgesBySlug = new Map(nodes.map((node) => [node.slug, []]));

    for (const edge of resolvedEdges) {
      outgoingNeighbors.get(edge.from)?.add(edge.to);
      incomingNeighbors.get(edge.to)?.add(edge.from);
      outgoingEdgesBySlug.get(edge.from)?.push(edge);
    }

    const pageRank = pageRankScores(nodes, outgoingEdgesBySlug, iterations);
    const rows = nodes
      .map((node) => {
        const inDegree = incomingNeighbors.get(node.slug)?.size || 0;
        const outDegree = outgoingNeighbors.get(node.slug)?.size || 0;
        return {
          ...summarizeNode(node),
          inDegree,
          outDegree,
          degree: inDegree + outDegree,
          pageRank: roundScore(pageRank.get(node.slug) || 0),
          bridgeScore: inDegree * outDegree,
        };
      })
      .sort(compareCentralityRows);

    return {
      operation: 'centrality',
      graph: {
        nodes: nodes.length,
        edges: edges.length,
        resolvedEdges: resolvedEdges.length,
        graphHash: artifact?.graphHash,
      },
      parameters: {
        types: typeSet ? [...typeSet].sort() : null,
        iterations,
        limit,
      },
      rankings: {
        pageRank: rows.slice(0, limit),
        bridges: [...rows]
          .sort((a, b) => b.bridgeScore - a.bridgeScore || compareCentralityRows(a, b))
          .slice(0, limit),
        authorities: [...rows]
          .sort((a, b) => b.inDegree - a.inDegree || compareCentralityRows(a, b))
          .slice(0, limit),
        hubs: [...rows]
          .sort((a, b) => b.outDegree - a.outDegree || compareCentralityRows(a, b))
          .slice(0, limit),
      },
    };
  }

  function explainRelation(fromInput, toInput, options = {}) {
    const from = resolve(fromInput, 'from');
    const to = resolve(toInput, 'to');
    const limit = normalizeLimit(options.limit, 20);
    const maxHops = normalizeDepth(options.maxHops, 5);
    const direction = normalizePathDirection(options.direction);
    const typeSet = normalizeTypes(options.types);
    const allSlugs = new Set(nodes.map((node) => node.slug));
    const directEdges = resolvedEdgesBetween(from, to, typeSet);
    const shortest = path(from, to, { ...options, direction, maxHops });
    const commonNeighbors = commonNeighborRows(from, to, typeSet, limit);
    const fromDomain = nearestDomainFor(from, allSlugs);
    const toDomain = nearestDomainFor(to, allSlugs);

    return {
      operation: 'explain_relation',
      from,
      to,
      fromNode: summarizeNode(nodeBySlug.get(from)),
      toNode: summarizeNode(nodeBySlug.get(to)),
      verdict: relationVerdict(from, to, directEdges, shortest, commonNeighbors),
      domains: {
        from: fromDomain,
        to: toDomain,
        sameDomain: Boolean(fromDomain && toDomain && fromDomain === toDomain),
      },
      direct: {
        total: directEdges.length,
        edges: directEdges,
      },
      shortestPath: {
        found: shortest.found,
        direction,
        maxHops,
        hopCount: shortest.hopCount ?? null,
        hops: shortest.hops,
        nodes: shortest.nodes ?? pathNodes(shortest.hops ?? []),
        edges: shortest.edges,
      },
      commonNeighbors: {
        total: commonNeighbors.length,
        limited: commonNeighbors.length > limit,
        rows: commonNeighbors.slice(0, limit),
      },
    };
  }

  function reachability(slugOrAlias, options = {}) {
    const start = resolve(slugOrAlias, 'slug');
    const direction = normalizeTraversalDirection(options.direction, 'outgoing');
    const depth = normalizeDepth(options.depth, 3);
    const limit = normalizeLimit(options.limit);
    const typeSet = normalizeTypes(options.types);
    const discovered = new Map([[start, { slug: start, distance: 0, path: [start], edges: [] }]]);
    const collectedEdges = [];
    const queue = [discovered.get(start)];

    while (queue.length > 0 && discovered.size < limit + 2) {
      const current = queue.shift();
      if (current.distance >= depth) continue;
      const candidates = traversalEdges(current.slug, direction, typeSet);
      for (const { next, edge } of candidates) {
        const formattedEdge = formatPathEdge(edge, current.slug, next);
        collectedEdges.push(formattedEdge);
        if (discovered.has(next)) continue;
        const item = {
          slug: next,
          distance: current.distance + 1,
          path: [...current.path, next],
          edges: [...current.edges, formattedEdge],
        };
        discovered.set(next, item);
        queue.push(item);
        if (discovered.size >= limit + 2) break;
      }
    }

    const rows = [...discovered.values()]
      .filter((row) => row.slug !== start)
      .sort((a, b) => a.distance - b.distance || a.slug.localeCompare(b.slug));
    const limitedRows = rows.slice(0, limit);
    const visibleSlugs = new Set([start, ...limitedRows.map((row) => row.slug)]);
    const layerMap = new Map();
    for (const row of limitedRows) {
      if (!layerMap.has(row.distance)) layerMap.set(row.distance, []);
      layerMap.get(row.distance).push(row);
    }
    const edgeRows = uniqueEdges(collectedEdges)
      .filter((edge) => visibleSlugs.has(edge.from) && visibleSlugs.has(edge.to))
      .sort((a, b) => edgeSortKey(a).localeCompare(edgeSortKey(b)));
    const terminalRows = limitedRows.filter(
      (row) => traversalEdges(row.slug, direction, typeSet).length === 0,
    );
    const nodeRows = limitedRows.map((row) => ({
      ...row,
      node: summarizeNode(nodeBySlug.get(row.slug)),
    }));

    return {
      operation: 'reachability',
      start,
      node: summarizeNode(nodeBySlug.get(start)),
      direction,
      depth,
      summary: {
        reachableNodes: rows.length,
        traversedEdges: edgeRows.length,
        layers: layerMap.size,
        terminalNodes: terminalRows.length,
      },
      byKind: countBy(
        limitedRows.map((row) => nodeBySlug.get(row.slug)).filter(Boolean),
        'kind',
      ),
      byRelation: countEdges(edgeRows, 'via'),
      layers: [...layerMap.entries()]
        .sort(([left], [right]) => left - right)
        .map(([distance, layerRows]) => ({
          distance,
          total: layerRows.length,
          nodes: layerRows.map((row) => summarizeNode(nodeBySlug.get(row.slug))),
        })),
      paths: {
        total: rows.length,
        limited: rows.length > limit,
        rows: nodeRows,
      },
      terminalNodes: terminalRows.map((row) => summarizeNode(nodeBySlug.get(row.slug))),
      edges: {
        total: edgeRows.length,
        limited: edgeRows.length > limit,
        rows: edgeRows.slice(0, limit),
      },
    };
  }

  function patternWalk(slugOrAlias, options = {}) {
    const start = resolve(slugOrAlias, 'slug');
    const pattern = normalizePattern(options.pattern);
    const direction = normalizeTraversalDirection(options.direction, 'outgoing');
    const limit = normalizeLimit(options.limit);
    let paths = [{ slug: start, path: [start], edges: [] }];
    let totalPaths = paths.length;
    let limited = false;
    const layers = [];

    pattern.forEach((relation, index) => {
      const nextPaths = [];
      let stepLimited = false;
      const relationSet = new Set([relation]);
      for (const row of paths) {
        const candidates = traversalEdges(row.slug, direction, relationSet);
        for (const { next, edge } of candidates) {
          if (row.path.includes(next)) continue;
          const formattedEdge = formatPathEdge(edge, row.slug, next);
          nextPaths.push({
            slug: next,
            path: [...row.path, next],
            edges: [...row.edges, formattedEdge],
          });
          if (nextPaths.length > limit) {
            stepLimited = true;
            break;
          }
        }
        if (stepLimited) break;
      }
      if (stepLimited) limited = true;
      nextPaths.sort((a, b) => a.path.join('\0').localeCompare(b.path.join('\0')));
      totalPaths = nextPaths.length;
      const visiblePaths = nextPaths.slice(0, limit);
      layers.push(patternLayer(index + 1, relation, visiblePaths));
      paths = visiblePaths;
    });

    const endSlugs = [...new Set(paths.map((row) => row.slug))].sort();
    const edgeRows = uniqueEdges(paths.flatMap((row) => row.edges)).sort((a, b) =>
      edgeSortKey(a).localeCompare(edgeSortKey(b)),
    );
    const pathTotal = limited && totalPaths <= paths.length ? paths.length + 1 : totalPaths;

    return {
      operation: 'pattern_walk',
      start,
      node: summarizeNode(nodeBySlug.get(start)),
      direction,
      pattern,
      summary: {
        steps: pattern.length,
        matchedPaths: paths.length,
        endNodes: endSlugs.length,
        traversedEdges: edgeRows.length,
      },
      layers,
      endNodes: endSlugs.map((slug) => summarizeNode(nodeBySlug.get(slug))),
      paths: {
        total: pathTotal,
        limited,
        rows: paths.map((row) => ({
          end: row.slug,
          node: summarizeNode(nodeBySlug.get(row.slug)),
          path: row.path,
          edges: row.edges,
        })),
      },
      edges: {
        total: edgeRows.length,
        rows: edgeRows,
      },
    };
  }

  function impact(slugOrAlias, options = {}) {
    const center = resolve(slugOrAlias, 'slug');
    const direction = normalizeDirection(options.direction, 'incoming');
    const depth = normalizeDepth(options.depth, 2);
    const limit = normalizeLimit(options.limit);
    const typeSet = normalizeTypes(options.types);
    const discovered = new Map([[center, { slug: center, distance: 0 }]]);
    const collectedEdges = [];
    const queue = [{ slug: center, distance: 0 }];

    while (queue.length > 0 && discovered.size < limit + 2) {
      const current = queue.shift();
      if (current.distance >= depth) continue;
      for (const { next, edge } of traversalEdges(current.slug, direction, typeSet)) {
        collectedEdges.push(formatPathEdge(edge, current.slug, next));
        if (discovered.has(next)) continue;
        const item = { slug: next, distance: current.distance + 1 };
        discovered.set(next, item);
        queue.push(item);
        if (discovered.size >= limit + 2) break;
      }
    }

    const nodeRows = [...discovered.values()]
      .filter((row) => row.slug !== center)
      .sort((a, b) => a.distance - b.distance || a.slug.localeCompare(b.slug));

    return {
      operation: 'impact',
      center,
      direction,
      depth,
      total: nodeRows.length,
      limited: nodeRows.length > limit,
      nodes: nodeRows.slice(0, limit).map((row) => ({
        ...row,
        node: nodeBySlug.get(row.slug),
      })),
      edges: uniqueEdges(collectedEdges).slice(0, limit),
    };
  }

  function blastRadius(slugOrAlias, options = {}) {
    const center = resolve(slugOrAlias, 'slug');
    const direction = normalizeDirection(options.direction, 'incoming');
    const depth = normalizeDepth(options.depth, 2);
    const limit = normalizeLimit(options.limit);
    const typeSet = normalizeTypes(options.types);
    const allSlugs = new Set(nodes.map((node) => node.slug));
    const discovered = new Map([[center, { slug: center, distance: 0 }]]);
    const collectedEdges = [];
    const queue = [{ slug: center, distance: 0 }];

    while (queue.length > 0 && discovered.size < limit + 2) {
      const current = queue.shift();
      if (current.distance >= depth) continue;
      for (const { next, edge } of traversalEdges(current.slug, direction, typeSet)) {
        collectedEdges.push(formatPathEdge(edge, current.slug, next));
        if (discovered.has(next)) continue;
        const item = { slug: next, distance: current.distance + 1 };
        discovered.set(next, item);
        queue.push(item);
        if (discovered.size >= limit + 2) break;
      }
    }

    const nodeRows = [...discovered.values()]
      .filter((row) => row.slug !== center)
      .sort((a, b) => a.distance - b.distance || a.slug.localeCompare(b.slug));
    const enrichedNodes = nodeRows.map((row) => {
      const node = nodeBySlug.get(row.slug);
      const domain = nearestDomainFor(row.slug, allSlugs);
      return {
        ...row,
        domain,
        node: summarizeNode(node),
      };
    });
    const edgeRows = uniqueEdges(collectedEdges)
      .map((edge) => {
        const fromDomain = nearestDomainFor(edge.from, allSlugs);
        const toDomain = nearestDomainFor(edge.to, allSlugs);
        return {
          ...edge,
          fromDomain,
          toDomain,
          crossDomain: Boolean(fromDomain && toDomain && fromDomain !== toDomain),
        };
      })
      .sort((a, b) => edgeSortKey(a).localeCompare(edgeSortKey(b)));
    const byKind = countBy(
      enrichedNodes.map((row) => nodeBySlug.get(row.slug)).filter(Boolean),
      'kind',
    );
    const byDomain = countBy(enrichedNodes, 'domain');
    const crossDomainEdges = edgeRows.filter((edge) => edge.crossDomain).length;
    const summary = {
      affectedNodes: nodeRows.length,
      affectedEdges: edgeRows.length,
      affectedKinds: Object.keys(byKind).length,
      affectedDomains: Object.keys(byDomain).length,
      crossDomainEdges,
    };

    return {
      operation: 'blast_radius',
      center,
      node: summarizeNode(nodeBySlug.get(center)),
      direction,
      depth,
      risk: blastRadiusRisk(summary),
      summary,
      byKind,
      byDomain,
      nodes: {
        total: enrichedNodes.length,
        limited: enrichedNodes.length > limit,
        rows: enrichedNodes.slice(0, limit),
      },
      edges: {
        total: edgeRows.length,
        limited: edgeRows.length > limit,
        rows: edgeRows.slice(0, limit),
      },
    };
  }

  function subgraph(slugOrAlias, options = {}) {
    const seed = resolve(slugOrAlias, 'slug');
    const direction = normalizeDirection(options.direction, 'both');
    const depth = normalizeDepth(options.depth, 2);
    const limit = normalizeLimit(options.limit);
    const typeSet = normalizeTypes(options.types);
    const discovered = new Map([[seed, { slug: seed, distance: 0 }]]);
    const collectedEdges = [];
    const queue = [{ slug: seed, distance: 0 }];
    let limited = false;

    while (queue.length > 0 && discovered.size < limit + 1) {
      const current = queue.shift();
      if (current.distance >= depth) continue;
      const candidates = traversalEdges(current.slug, direction, typeSet);
      for (let i = 0; i < candidates.length; i += 1) {
        const { next, edge } = candidates[i];
        collectedEdges.push(formatPathEdge(edge, current.slug, next));
        if (discovered.has(next)) continue;
        const item = { slug: next, distance: current.distance + 1 };
        discovered.set(next, item);
        queue.push(item);
        if (discovered.size >= limit + 1) {
          limited = true;
          break;
        }
      }
    }

    const nodeRows = [...discovered.values()].sort(
      (a, b) => a.distance - b.distance || a.slug.localeCompare(b.slug),
    );
    const visibleRows = nodeRows.slice(0, limit);
    const allowedSlugs = new Set(visibleRows.map((row) => row.slug));
    const internalEdges = uniqueEdges(collectedEdges)
      .filter((edge) => allowedSlugs.has(edge.from) && allowedSlugs.has(edge.to))
      .sort((a, b) => edgeSortKey(a).localeCompare(edgeSortKey(b)));

    return {
      operation: 'subgraph',
      seed,
      direction,
      depth,
      totalNodes: nodeRows.length,
      totalEdges: internalEdges.length,
      limited: limited || nodeRows.length > limit,
      nodes: visibleRows.map((row) => ({
        ...row,
        node: nodeBySlug.get(row.slug),
      })),
      edges: internalEdges,
    };
  }

  function overview(options = {}) {
    const limit = normalizeLimit(options.limit, 10);
    const byKind = countBy(nodes, 'kind');
    const byDomain = countBy(nodes, 'domain');
    const byRelation = countEdges(edges, 'via');
    const graph = {
      nodes: nodes.length,
      edges: edges.length,
      resolvedEdges: edges.filter((edge) => edge.resolved).length,
      externalEdges: edges.filter((edge) => edge.external).length,
      unresolvedEdges: edges.filter((edge) => !edge.resolved && !edge.external).length,
      aliases: Array.isArray(artifact?.aliases) ? artifact.aliases.length : 0,
      ambiguousAliases: Array.isArray(artifact?.ambiguousAliases)
        ? artifact.ambiguousAliases.length
        : 0,
      issues: Array.isArray(artifact?.issues) ? artifact.issues.length : 0,
      graphHash: artifact?.graphHash,
      maxMtime: artifact?.maxMtime,
    };

    return {
      operation: 'overview',
      graph,
      byKind,
      byDomain,
      byRelation,
      hubs: topHubs(nodes, limit),
    };
  }

  function schema(options = {}) {
    const limit = normalizeLimit(options.limit, 50);
    const patterns = schemaPatterns();

    return {
      operation: 'schema',
      totalPatterns: patterns.length,
      limited: patterns.length > limit,
      patterns: patterns.slice(0, limit),
    };
  }

  function facets(options = {}) {
    const limit = normalizeLimit(options.limit, 10);
    const resolvedEdges = edges.filter((edge) => edge.resolved);
    const externalEdges = edges.filter((edge) => edge.external);
    const unresolvedEdges = edges.filter((edge) => !edge.resolved && !edge.external);
    const degreeBuckets = new Map([
      ['0', 0],
      ['1', 0],
      ['2-4', 0],
      ['5-9', 0],
      ['10+', 0],
    ]);

    for (const node of nodes) {
      const degree = (node.inDegree || 0) + (node.outDegree || 0);
      degreeBuckets.set(degreeBucket(degree), degreeBuckets.get(degreeBucket(degree)) + 1);
    }

    return {
      operation: 'facets',
      graph: {
        nodes: nodes.length,
        edges: edges.length,
        resolvedEdges: resolvedEdges.length,
        externalEdges: externalEdges.length,
        unresolvedEdges: unresolvedEdges.length,
      },
      nodes: {
        byKind: countBy(nodes, 'kind'),
        byDomain: countBy(nodes, 'domain'),
        byDegreeBucket: Object.fromEntries(degreeBuckets),
        topByDegree: topHubs(nodes, limit),
      },
      edges: {
        byRelation: countEdges(edges, 'via'),
        byResolution: {
          resolved: resolvedEdges.length,
          external: externalEdges.length,
          unresolved: unresolvedEdges.length,
        },
        topPatterns: schemaPatterns().slice(0, limit),
      },
    };
  }

  function matchNodes(options = {}) {
    const limit = normalizeLimit(options.limit);
    const kind = normalizeNodeKind(options.kind, 'kind');
    const domain = normalizeOptionalString(options.domain, 'domain');
    const slugContains =
      normalizeOptionalString(options.slugContains, 'slugContains')?.toLowerCase() || null;
    const minDegree = normalizeNonNegativeInteger(options.minDegree, 'minDegree');
    const maxDegree = normalizeNonNegativeInteger(options.maxDegree, 'maxDegree');
    const minInDegree = normalizeNonNegativeInteger(options.minInDegree, 'minInDegree');
    const minOutDegree = normalizeNonNegativeInteger(options.minOutDegree, 'minOutDegree');
    const hasIncoming = normalizeOptionalBoolean(options.hasIncoming, 'hasIncoming', null);
    const hasOutgoing = normalizeOptionalBoolean(options.hasOutgoing, 'hasOutgoing', null);
    const sort = normalizeNodeSort(options.sort);
    const rows = [];

    for (const node of nodes) {
      const inDegree = node.inDegree || 0;
      const outDegree = node.outDegree || 0;
      const degree = inDegree + outDegree;
      if (kind && node.kind !== kind) continue;
      if (domain && node.domain !== domain) continue;
      if (slugContains && !node.slug.toLowerCase().includes(slugContains)) continue;
      if (minDegree !== null && degree < minDegree) continue;
      if (maxDegree !== null && degree > maxDegree) continue;
      if (minInDegree !== null && inDegree < minInDegree) continue;
      if (minOutDegree !== null && outDegree < minOutDegree) continue;
      if (hasIncoming !== null && (inDegree > 0) !== hasIncoming) continue;
      if (hasOutgoing !== null && (outDegree > 0) !== hasOutgoing) continue;
      rows.push({
        ...summarizeNode(node),
        degree,
      });
    }

    rows.sort((left, right) => compareNodeRows(left, right, sort));

    const page = rows.slice(0, limit);
    const followUp = buildMatchNodesFollowUp(page[0]);

    return {
      operation: 'match_nodes',
      filters: {
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
      },
      totalMatches: rows.length,
      limited: rows.length > limit,
      nodes: page,
      ...(followUp ? { followUp } : {}),
    };
  }

  function matchEdges(options = {}) {
    const limit = normalizeLimit(options.limit);
    const typeSet = normalizeMatchEdgesTypes(options);
    const fromInput = normalizeOptionalString(options.from, 'from');
    const toInput = normalizeOptionalString(options.to, 'to');
    const from = fromInput ? resolve(fromInput, 'from') : null;
    const to = toInput ? resolve(toInput, 'to') : null;
    const fromKind = normalizeNodeKind(options.fromKind, 'fromKind');
    const toKind = normalizeEdgeTargetKind(options.toKind, 'toKind');
    const includeExternal = normalizeOptionalBoolean(options.includeExternal, 'includeExternal', false);
    const includeUnresolved = normalizeOptionalBoolean(options.includeUnresolved, 'includeUnresolved', false);
    const matches = [];

    for (const edge of [...edges].sort(compareEdges)) {
      if (!edgeAllowed(edge, typeSet, includeExternal, includeUnresolved)) continue;
      if (from && edge.from !== from) continue;
      if (to && edge.to !== to) continue;

      const fromNode = nodeBySlug.get(edge.from);
      const toNode = edge.resolved ? nodeBySlug.get(edge.to) : null;
      if (fromKind && fromNode?.kind !== fromKind) continue;
      if (toKind) {
        if (edge.resolved) {
          if (toNode?.kind !== toKind) continue;
        } else if (edge.external) {
          if (toKind !== 'external') continue;
        } else if (toKind !== 'unresolved') {
          continue;
        }
      }

      matches.push({
        ...formatCompiledEdge(edge),
        fromNode: summarizeNode(fromNode),
        toNode: summarizeNode(toNode),
        toKind: edge.resolved ? toNode?.kind || 'unknown' : edge.external ? 'external' : 'unresolved',
      });
    }

    const page = matches.slice(0, limit);
    const followUp = buildMatchEdgesFollowUp(page[0]);

    return {
      operation: 'match_edges',
      filters: {
        from,
        to,
        fromKind,
        toKind,
        types: typeSet ? [...typeSet].sort() : null,
        relationTypes: publicRelationTypes(typeSet),
        includeExternal,
        includeUnresolved,
      },
      totalMatches: matches.length,
      limited: matches.length > limit,
      edges: page,
      ...(followUp ? { followUp } : {}),
    };
  }

  function relationCheck(options = {}) {
    const relationInput = options.type ?? options.relation;
    if (typeof relationInput !== 'string' || !relationInput.trim()) {
      throw new Error('type (string) is required for relation_check.');
    }
    const trimmedRelation = relationInput.trim();
    requireRelationType(trimmedRelation, options.type === undefined ? 'relation' : 'type');
    const relation = normalizeRelationType(trimmedRelation);
    const from = resolve(options.from, 'from');
    const to = resolve(options.to, 'to');
    const fromKind = nodeBySlug.get(from)?.kind || 'unknown';
    const toKind = nodeBySlug.get(to)?.kind || 'unknown';
    const existing = edges.filter(
      (edge) => edge.from === from && edge.to === to && edge.via === relation && edge.resolved,
    );
    const inverse = edges.filter(
      (edge) => edge.from === to && edge.to === from && edge.via === relation && edge.resolved,
    );
    const matchedPattern = schemaPatterns().find(
      (pattern) =>
        pattern.fromKind === fromKind &&
        pattern.relation === relation &&
        pattern.toKind === toKind,
    );
    const nearbyPatterns = nearbySchemaPatterns({ fromKind, relation, toKind, matchedPattern });
    const verdict = existing.length > 0
      ? 'already_exists'
      : matchedPattern
        ? 'matches_existing_schema'
        : 'new_schema_pattern';
    const recommendation = relationCheckRecommendation({
      existing,
      inverse,
      matchedPattern,
      fromKind,
      relation,
      toKind,
    });

    return {
      operation: 'relation_check',
      from,
      to,
      relation,
      fromKind,
      toKind,
      exists: existing.length > 0,
      verdict,
      recommendation,
      matchingEdges: existing.map(formatCompiledEdge),
      inverseEdges: inverse.map(formatCompiledEdge),
      schemaPattern: matchedPattern || null,
      nearbyPatterns,
      proposedAction: existing.length > 0
        ? null
        : {
            tool: 'add_relation',
            args: {
              from,
              to,
              type: writeRelationType(relation),
            },
          },
    };
  }

  function relationCheckRecommendation({ existing, inverse, matchedPattern, fromKind, relation, toKind }) {
    if (existing.length > 0) {
      return {
        decision: 'skip_existing',
        severity: 'info',
        reason: 'Exact edge already exists; do not add another relation.',
      };
    }
    if (inverse.length > 0) {
      return {
        decision: 'review_inverse',
        severity: 'warn',
        reason: 'Reverse edge with the same relation already exists; inspect direction before adding.',
      };
    }
    if (matchedPattern) {
      return {
        decision: 'safe_to_add',
        severity: 'info',
        reason: `No exact or inverse edge found; ${fromKind} --${relation}--> ${toKind} is an existing schema pattern.`,
      };
    }
    return {
      decision: 'review_new_schema',
      severity: 'warn',
      reason: `No exact or inverse edge found; ${fromKind} --${relation}--> ${toKind} would introduce a new schema pattern.`,
    };
  }

  function nodeProfile(slugOrAlias, options = {}) {
    const center = resolve(slugOrAlias, 'slug');
    const limit = normalizeLimit(options.limit, 20);
    const depth = normalizeDepth(options.depth, 3);
    const includeExternal = normalizeOptionalBoolean(options.includeExternal, 'includeExternal', true);
    const includeUnresolved = normalizeOptionalBoolean(options.includeUnresolved, 'includeUnresolved', true);
    const typeSet = normalizeTypes(options.types);
    const node = nodeBySlug.get(center);
    const outgoingRows = (outgoing.get(center) || [])
      .filter((edge) => edgeAllowed(edge, typeSet, includeExternal, includeUnresolved))
      .sort(compareEdges);
    const incomingRows = (incoming.get(center) || [])
      .filter((edge) => edgeAllowed(edge, typeSet, includeExternal, includeUnresolved))
      .sort(compareEdges);
    const ancestors = collectLineage(center, 'ancestors', depth, limit);
    const descendants = collectLineage(center, 'descendants', depth, limit);
    const containmentParents = containmentParentsFor(center).map(({ next, edge }) => ({
      slug: next,
      via: edge.via,
      node: summarizeNode(nodeBySlug.get(next)),
    }));
    const containmentChildRows = containmentChildren(center).map(({ next, edge }) => ({
      slug: next,
      via: edge.via,
      node: summarizeNode(nodeBySlug.get(next)),
    }));

    return {
      operation: 'node_profile',
      center,
      node: summarizeNode(node),
      aliases: aliasesFor(center),
      degree: {
        in: node?.inDegree || 0,
        out: node?.outDegree || 0,
        total: (node?.inDegree || 0) + (node?.outDegree || 0),
      },
      edges: {
        incoming: profileEdgeGroup(incomingRows, 'incoming', limit),
        outgoing: profileEdgeGroup(outgoingRows, 'outgoing', limit),
      },
      containment: {
        parents: containmentParents.slice(0, limit),
        parentLimited: containmentParents.length > limit,
        children: containmentChildRows.slice(0, limit),
        childLimited: containmentChildRows.length > limit,
      },
      lineage: {
        depth,
        ancestors: {
          total: ancestors.rows.length,
          limited: ancestors.limited,
          nodes: ancestors.rows,
        },
        descendants: {
          total: descendants.rows.length,
          limited: descendants.limited,
          nodes: descendants.rows,
        },
      },
    };
  }

  function domainProfile(slugOrAlias, options = {}) {
    const limit = normalizeLimit(options.limit, 100);
    const itemLimit = normalizeLimit(options.itemLimit, 20, 'itemLimit');
    const domain = resolveDomainRoot(slugOrAlias);
    const included = collectContainmentScope(domain);
    const scopedNodes = sortedNodesInScope(included);
    const capabilities = scopedNodes.filter((node) => node.kind === 'capability');
    const elements = scopedNodes.filter((node) => node.kind === 'element');
    const edgesByScope = partitionScopeEdges(included);
    const parentProjects = containmentParentsFor(domain)
      .filter(({ next }) => nodeBySlug.get(next)?.kind === 'project')
      .map(({ next, edge }) => ({
        slug: next,
        via: edge.via,
        node: summarizeNode(nodeBySlug.get(next)),
      }));

    return {
      operation: 'domain_profile',
      domain,
      node: summarizeNode(nodeBySlug.get(domain)),
      parents: {
        projects: parentProjects,
      },
      summary: {
        nodes: scopedNodes.length,
        capabilities: capabilities.length,
        elements: elements.length,
        internalEdges: edgesByScope.internal.length,
        boundaryEdges: edgesByScope.boundary.length,
        externalEdges: edgesByScope.external.length,
        unresolvedEdges: edgesByScope.unresolved.length,
      },
      capabilities: limitedNodeList(capabilities, itemLimit),
      elements: limitedNodeList(elements, itemLimit),
      hotspots: topHubs(scopedNodes, itemLimit),
      edges: {
        boundary: scopeEdgeGroup(edgesByScope.boundary, included, limit),
        external: scopeEdgeGroup(edgesByScope.external, included, limit),
        unresolved: scopeEdgeGroup(edgesByScope.unresolved, included, limit),
      },
    };
  }

  function domainMatrix(options = {}) {
    const limit = normalizeLimit(options.limit, 100);
    const project = normalizeOptionalString(options.project ?? options.slug, 'project');
    const typeSet = normalizeTypes(options.types);
    const scope = project
      ? collectContainmentScope(resolveProjectRoot(project))
      : new Set(nodes.map((node) => node.slug));
    const scopedNodes = sortedNodesInScope(scope);
    const domainSlugs = scopedNodes
      .filter((node) => node.kind === 'domain')
      .map((node) => node.slug);
    const domainStats = new Map(domainSlugs.map((slug) => [
      slug,
      {
        slug,
        node: summarizeNode(nodeBySlug.get(slug)),
        nodes: 0,
        outgoing: 0,
        incoming: 0,
        selfEdges: 0,
        externalEdges: 0,
        unresolvedEdges: 0,
      },
    ]));
    const domainForNode = new Map();
    let assignedNodes = 0;

    for (const node of scopedNodes) {
      const domain = nearestDomainFor(node.slug, scope);
      if (!domain) continue;
      domainForNode.set(node.slug, domain);
      assignedNodes += 1;
      const stats = domainStats.get(domain);
      if (stats) stats.nodes += 1;
    }

    const connectionMap = new Map();
    let selfDomainEdges = 0;
    let crossDomainEdges = 0;
    let externalEdges = 0;
    let unresolvedEdges = 0;

    for (const edge of edges) {
      if (!scope.has(edge.from)) continue;
      if (!typeAllowed(edge.via, typeSet)) continue;
      const fromDomain = domainForNode.get(edge.from);
      if (!fromDomain) continue;
      const fromStats = domainStats.get(fromDomain);
      if (edge.external) {
        externalEdges += 1;
        if (fromStats) fromStats.externalEdges += 1;
        continue;
      }
      if (!edge.resolved || !scope.has(edge.to)) {
        unresolvedEdges += 1;
        if (fromStats) fromStats.unresolvedEdges += 1;
        continue;
      }
      const toDomain = domainForNode.get(edge.to);
      if (!toDomain) continue;
      if (fromDomain === toDomain) {
        selfDomainEdges += 1;
        if (fromStats) fromStats.selfEdges += 1;
        continue;
      }
      crossDomainEdges += 1;
      if (fromStats) fromStats.outgoing += 1;
      const toStats = domainStats.get(toDomain);
      if (toStats) toStats.incoming += 1;
      const key = `${fromDomain}\0${toDomain}`;
      if (!connectionMap.has(key)) {
        connectionMap.set(key, {
          from: fromDomain,
          to: toDomain,
          count: 0,
          byRelation: new Map(),
          examples: [],
        });
      }
      const row = connectionMap.get(key);
      row.count += 1;
      row.byRelation.set(edge.via, (row.byRelation.get(edge.via) || 0) + 1);
      if (row.examples.length < 3) row.examples.push(formatCompiledEdge(edge));
    }

    const connections = [...connectionMap.values()]
      .map((row) => ({
        from: row.from,
        to: row.to,
        count: row.count,
        byRelation: sortedCountObject(row.byRelation),
        byRelationType: publicRelationCountObject(row.byRelation),
        fromNode: summarizeNode(nodeBySlug.get(row.from)),
        toNode: summarizeNode(nodeBySlug.get(row.to)),
        examples: row.examples,
      }))
      .sort((a, b) => b.count - a.count || a.from.localeCompare(b.from) || a.to.localeCompare(b.to));

    return {
      operation: 'domain_matrix',
      project: project ? resolveProjectRoot(project) : null,
      filters: {
        types: typeSet ? [...typeSet].sort() : null,
        relationTypes: publicRelationTypes(typeSet),
      },
      summary: {
        domains: domainSlugs.length,
        nodes: scopedNodes.length,
        assignedNodes,
        unassignedNodes: scopedNodes.length - assignedNodes,
        crossDomainEdges,
        selfDomainEdges,
        externalEdges,
        unresolvedEdges,
      },
      domains: [...domainStats.values()].sort((a, b) => a.slug.localeCompare(b.slug)),
      connections: {
        total: connections.length,
        limited: connections.length > limit,
        rows: connections.slice(0, limit),
      },
    };
  }

  function projectScope(slugOrAlias, options = {}) {
    const limit = normalizeLimit(options.limit, 200);
    const project = resolveProjectRoot(slugOrAlias);
    const included = collectContainmentScope(project);
    const nodeRows = [...included]
      .map((slug) => nodeBySlug.get(slug))
      .filter(Boolean)
      .sort((a, b) => a.slug.localeCompare(b.slug));
    const edgesByScope = partitionScopeEdges(included);

    return {
      operation: 'project_scope',
      project,
      node: summarizeNode(nodeBySlug.get(project)),
      summary: {
        nodes: nodeRows.length,
        internalEdges: edgesByScope.internal.length,
        boundaryEdges: edgesByScope.boundary.length,
        externalEdges: edgesByScope.external.length,
        unresolvedEdges: edgesByScope.unresolved.length,
      },
      byKind: countBy(nodeRows, 'kind'),
      byDomain: countBy(nodeRows, 'domain'),
      nodes: {
        total: nodeRows.length,
        limited: nodeRows.length > limit,
        rows: nodeRows.slice(0, limit).map(summarizeNode),
      },
      edges: {
        internal: scopeEdgeGroup(edgesByScope.internal, included, limit),
        boundary: scopeEdgeGroup(edgesByScope.boundary, included, limit),
        external: scopeEdgeGroup(edgesByScope.external, included, limit),
        unresolved: scopeEdgeGroup(edgesByScope.unresolved, included, limit),
      },
    };
  }

  function projectMap(slugOrAlias, options = {}) {
    const limit = normalizeLimit(options.limit, 50);
    const itemLimit = normalizeLimit(options.itemLimit, 20, 'itemLimit');
    const project = resolveProjectRoot(slugOrAlias);
    const included = collectContainmentScope(project);
    const scopedNodes = sortedNodesInScope(included);
    const domainSlugs = scopedNodes
      .filter((node) => node.kind === 'domain')
      .map((node) => node.slug);
    const covered = new Set([project]);
    const domainRows = domainSlugs.map((domainSlug) => {
      const domainScope = intersectSlugSets(collectContainmentScope(domainSlug), included);
      for (const slug of domainScope) covered.add(slug);
      return domainMapRow(domainSlug, domainScope, itemLimit);
    });
    const unassignedNodes = scopedNodes
      .filter((node) => !covered.has(node.slug))
      .sort((a, b) => a.slug.localeCompare(b.slug));
    const edgesByScope = partitionScopeEdges(included);

    return {
      operation: 'project_map',
      project,
      node: summarizeNode(nodeBySlug.get(project)),
      summary: {
        nodes: scopedNodes.length,
        domains: domainRows.length,
        capabilities: scopedNodes.filter((node) => node.kind === 'capability').length,
        elements: scopedNodes.filter((node) => node.kind === 'element').length,
        unassignedNodes: unassignedNodes.length,
        internalEdges: edgesByScope.internal.length,
        boundaryEdges: edgesByScope.boundary.length,
        externalEdges: edgesByScope.external.length,
        unresolvedEdges: edgesByScope.unresolved.length,
      },
      limited: domainRows.length > limit,
      domains: domainRows.slice(0, limit),
      unassigned: {
        total: unassignedNodes.length,
        limited: unassignedNodes.length > itemLimit,
        nodes: unassignedNodes.slice(0, itemLimit).map(summarizeNode),
      },
      hotspots: topHubs(scopedNodes, itemLimit),
    };
  }

  function connectedComponentGroups(typeSet) {
    const visited = new Set();
    const groups = [];

    for (const node of nodes) {
      if (visited.has(node.slug)) continue;
      const queue = [node.slug];
      const slugs = [];
      visited.add(node.slug);

      while (queue.length > 0) {
        const current = queue.shift();
        slugs.push(current);

        for (const { next } of traversalEdges(current, 'undirected', typeSet)) {
          if (visited.has(next)) continue;
          visited.add(next);
          queue.push(next);
        }
      }

      slugs.sort();
      groups.push({ slugs, size: slugs.length });
    }

    groups.sort(
      (a, b) => b.size - a.size || (a.slugs[0] || '').localeCompare(b.slugs[0] || ''),
    );
    return groups;
  }

  function components(options = {}) {
    const limit = normalizeLimit(options.limit, 20);
    const nodeLimit = normalizeLimit(options.nodeLimit, 25, 'nodeLimit');
    const typeSet = normalizeTypes(options.types);
    const groups = connectedComponentGroups(typeSet);

    return {
      operation: 'components',
      totalComponents: groups.length,
      largestSize: groups[0]?.size || 0,
      singletonCount: groups.filter((group) => group.size === 1).length,
      limited: groups.length > limit,
      components: groups.slice(0, limit).map((group, index) => ({
        id: index + 1,
        size: group.size,
        kinds: countBy(group.slugs.map((slug) => nodeBySlug.get(slug)).filter(Boolean), 'kind'),
        nodeLimited: group.slugs.length > nodeLimit,
        nodes: group.slugs.slice(0, nodeLimit).map((slug) => summarizeNode(nodeBySlug.get(slug))),
      })),
    };
  }

  function componentGroupOnlyHasKinds(group, ignoredKinds) {
    if (!group || !Array.isArray(group.slugs) || group.slugs.length === 0) return false;
    return group.slugs.every((slug) => {
      const node = nodeBySlug.get(slug);
      return node && ignoredKinds.has(node.kind);
    });
  }

  function communities(options = {}) {
    const limit = normalizeLimit(options.limit, 20);
    const nodeLimit = normalizeLimit(options.nodeLimit, 25, 'nodeLimit');
    const iterations = normalizeIterations(options.iterations);
    const typeSet = normalizeTypes(options.types);
    const adjacency = undirectedAdjacencyFrom(nodes, edges, typeSet);
    const labels = propagateCommunityLabels(adjacency, iterations);
    const groupsByLabel = new Map();

    for (const node of nodes) {
      const label = labels.get(node.slug) || node.slug;
      if (!groupsByLabel.has(label)) groupsByLabel.set(label, []);
      groupsByLabel.get(label).push(node.slug);
    }

    const groups = [...groupsByLabel.entries()].map(([label, slugs]) => {
      const sortedSlugs = [...slugs].sort();
      const internalEdges = [];
      const boundaryEdges = [];
      const slugSet = new Set(sortedSlugs);
      for (const edge of edges) {
        if (!edge.resolved || !typeAllowed(edge.via, typeSet)) continue;
        const fromIn = slugSet.has(edge.from);
        const toIn = slugSet.has(edge.to);
        if (fromIn && toIn) internalEdges.push(edge);
        else if (fromIn || toIn) boundaryEdges.push(edge);
      }
      const groupNodes = sortedSlugs.map((slug) => nodeBySlug.get(slug)).filter(Boolean);
      return {
        label,
        slugs: sortedSlugs,
        size: sortedSlugs.length,
        internalEdges: internalEdges.length,
        boundaryEdges: boundaryEdges.length,
        kinds: countBy(groupNodes, 'kind'),
        domains: countBy(groupNodes, 'domain'),
        representative: summarizeNode(
          [...groupNodes].sort(
            (a, b) =>
              (b.inDegree || 0) + (b.outDegree || 0) - ((a.inDegree || 0) + (a.outDegree || 0)) ||
              a.slug.localeCompare(b.slug),
          )[0],
        ),
      };
    });

    groups.sort(
      (a, b) =>
        b.size - a.size ||
        b.internalEdges - a.internalEdges ||
        (a.representative?.slug || a.label).localeCompare(b.representative?.slug || b.label),
    );

    const communityBySlug = new Map();
    groups.forEach((group, index) => {
      for (const slug of group.slugs) communityBySlug.set(slug, index + 1);
    });
    const crossCommunityEdges = edges.filter(
      (edge) =>
        edge.resolved &&
        typeAllowed(edge.via, typeSet) &&
        communityBySlug.get(edge.from) !== communityBySlug.get(edge.to),
    );

    return {
      operation: 'communities',
      parameters: {
        types: typeSet ? [...typeSet].sort() : null,
        iterations,
        limit,
        nodeLimit,
      },
      summary: {
        communities: groups.length,
        largestSize: groups[0]?.size || 0,
        singletonCount: groups.filter((group) => group.size === 1).length,
        crossCommunityEdges: crossCommunityEdges.length,
      },
      limited: groups.length > limit,
      communities: groups.slice(0, limit).map((group, index) => ({
        id: index + 1,
        label: group.label,
        size: group.size,
        internalEdges: group.internalEdges,
        boundaryEdges: group.boundaryEdges,
        kinds: group.kinds,
        domains: group.domains,
        representative: group.representative,
        nodeLimited: group.slugs.length > nodeLimit,
        nodes: group.slugs.slice(0, nodeLimit).map((slug) => summarizeNode(nodeBySlug.get(slug))),
      })),
      crossCommunityEdges: {
        total: crossCommunityEdges.length,
        limited: crossCommunityEdges.length > limit,
        rows: crossCommunityEdges.slice(0, limit).map((edge) => ({
          ...formatPathEdge(edge, edge.from, edge.to),
          fromCommunity: communityBySlug.get(edge.from),
          toCommunity: communityBySlug.get(edge.to),
        })),
      },
    };
  }

  function similarNodes(options = {}) {
    const limit = normalizeLimit(options.limit, 10);
    const typeSet = normalizeTypes(options.types);
    const sourceSlug = normalizeOptionalString(options.slug, 'slug');
    const resolvedSource = sourceSlug ? resolve(sourceSlug, 'slug') : null;
    const sourceNode = resolvedSource ? nodeBySlug.get(resolvedSource) : null;
    const candidate = sourceNode || {
      slug:
        normalizeOptionalString(options.candidateSlug, 'candidateSlug') ||
        normalizeOptionalString(options.title, 'title') ||
        '',
      kind: normalizeOptionalString(options.kind, 'kind'),
      title:
        normalizeOptionalString(options.title, 'title') ||
        normalizeOptionalString(options.candidateSlug, 'candidateSlug') ||
        '',
      domain: normalizeOptionalString(options.domain, 'domain'),
    };
    const sourceNeighbors = resolvedSource
      ? new Set(traversalEdges(resolvedSource, 'undirected', typeSet).map((row) => row.next))
      : new Set();
    const rows = [];

    for (const node of nodes) {
      if (resolvedSource && node.slug === resolvedSource) continue;
      const targetNeighbors = new Set(
        traversalEdges(node.slug, 'undirected', typeSet).map((row) => row.next),
      );
      const score = similarityScore(candidate, node, sourceNeighbors, targetNeighbors);
      if (score.total <= 0) continue;
      rows.push({
        node: summarizeNode(node),
        score: roundScore(score.total),
        signals: {
          slug: roundScore(score.slug),
          title: roundScore(score.title),
          kind: roundScore(score.kind),
          domain: roundScore(score.domain),
          neighbors: roundScore(score.neighbors),
        },
        sharedNeighbors: [...sourceNeighbors]
          .filter((slug) => targetNeighbors.has(slug))
          .sort()
          .map((slug) => summarizeNode(nodeBySlug.get(slug))),
      });
    }

    rows.sort((a, b) => b.score - a.score || a.node.slug.localeCompare(b.node.slug));

    return {
      operation: 'similar_nodes',
      source: resolvedSource
        ? {
            mode: 'existing',
            slug: resolvedSource,
            node: summarizeNode(sourceNode),
          }
        : {
            mode: 'candidate',
            slug: candidate.slug || null,
            kind: candidate.kind || null,
            title: candidate.title || null,
            domain: candidate.domain || null,
          },
      parameters: {
        types: typeSet ? [...typeSet].sort() : null,
        limit,
      },
      totalMatches: rows.length,
      limited: rows.length > limit,
      matches: rows.slice(0, limit),
    };
  }

  function lineage(slugOrAlias, options = {}) {
    const center = resolve(slugOrAlias, 'slug');
    const depth = normalizeDepth(options.depth, 20);
    const limit = normalizeLimit(options.limit);
    const ancestors = collectLineage(center, 'ancestors', depth, limit);
    const descendants = collectLineage(center, 'descendants', depth, limit);

    return {
      operation: 'lineage',
      center,
      node: nodeBySlug.get(center),
      depth,
      ancestors: {
        total: ancestors.rows.length,
        limited: ancestors.limited,
        nodes: ancestors.rows,
      },
      descendants: {
        total: descendants.rows.length,
        limited: descendants.limited,
        nodes: descendants.rows,
      },
      edges: uniqueEdges([...ancestors.edges, ...descendants.edges]).sort((a, b) =>
        edgeSortKey(a).localeCompare(edgeSortKey(b)),
      ),
    };
  }

  function containmentTree(slugOrAlias, options = {}) {
    const root = normalizeOptionalString(slugOrAlias, 'slug');
    const depth = normalizeDepth(options.depth, 20);
    const limit = normalizeLimit(options.limit, 200);
    const includeOrphans = normalizeOptionalBoolean(options.includeOrphans, 'includeOrphans', false);
    const rootSlugs = root
      ? [resolve(root, 'slug')]
      : defaultContainmentRoots(includeOrphans);
    const cycles = [];
    let emittedNodes = 0;
    let limited = false;

    const roots = [];
    for (const rootSlug of rootSlugs) {
      const tree = buildContainmentNode(rootSlug, null, 0, []);
      if (tree) roots.push(tree);
      if (limited) break;
    }

    return {
      operation: 'containment_tree',
      root: root ? rootSlugs[0] : null,
      depth,
      totalRoots: rootSlugs.length,
      emittedNodes,
      limited,
      roots,
      cycles,
    };

    function buildContainmentNode(slug, via, distance, path) {
      if (emittedNodes >= limit) {
        limited = true;
        return null;
      }
      emittedNodes += 1;
      const row = {
        slug,
        via,
        distance,
        node: summarizeNode(nodeBySlug.get(slug)),
        children: [],
      };
      if (distance >= depth) return row;

      for (const { next, edge } of containmentChildren(slug)) {
        if (path.includes(next)) {
          cycles.push({
            from: slug,
            to: next,
            via: edge.via,
            path: [...path, slug, next],
          });
          continue;
        }
        const child = buildContainmentNode(next, edge.via, distance + 1, [...path, slug]);
        if (child) row.children.push(child);
        if (limited) break;
      }
      return row;
    }
  }

  function defaultContainmentRoots(includeOrphans) {
    const projectRoots = nodes
      .filter((node) => node.kind === 'project')
      .map((node) => node.slug)
      .sort();
    if (projectRoots.length === 0) return ancestorlessRootSlugs(new Set());
    if (!includeOrphans) return projectRoots;

    const included = new Set();
    for (const rootSlug of projectRoots) {
      included.add(rootSlug);
      const queue = [rootSlug];
      while (queue.length > 0) {
        const current = queue.shift();
        for (const { next } of containmentChildren(current)) {
          if (included.has(next)) continue;
          included.add(next);
          queue.push(next);
        }
      }
    }

    return [...projectRoots, ...ancestorlessRootSlugs(included)];
  }

  function resolveProjectRoot(slugOrAlias) {
    if (typeof slugOrAlias === 'string' && slugOrAlias.trim()) {
      const slug = resolve(slugOrAlias, 'project');
      const node = nodeBySlug.get(slug);
      if (node?.kind !== 'project') {
        throw new Error(`project "${slug}" must resolve to a kind: project node.`);
      }
      return slug;
    }
    const projectRoots = projectRootSlugs();
    if (projectRoots.length === 1) return projectRoots[0];
    if (projectRoots.length === 0) {
      throw new Error('project_scope requires a project slug because the compiled graph has no kind: project root.');
    }
    throw new Error(
      `project_scope requires a project slug because multiple project roots exist: ${projectRoots.join(', ')}`,
    );
  }

  function projectRootSlugs() {
    return nodes
      .filter((node) => node.kind === 'project')
      .map((node) => node.slug)
      .sort();
  }

  function resolveDomainRoot(slugOrAlias) {
    const slug = resolve(slugOrAlias, 'domain');
    const node = nodeBySlug.get(slug);
    if (node?.kind !== 'domain') {
      throw new Error(`domain "${slug}" must resolve to a kind: domain node.`);
    }
    return slug;
  }

  function collectContainmentScope(rootSlug) {
    const included = new Set([rootSlug]);
    const queue = [rootSlug];
    while (queue.length > 0) {
      const current = queue.shift();
      for (const { next } of containmentChildren(current)) {
        if (included.has(next)) continue;
        included.add(next);
        queue.push(next);
      }
    }
    return included;
  }

  function nearestDomainFor(slug, scopeSlugs) {
    const node = nodeBySlug.get(slug);
    if (!node || !scopeSlugs.has(slug)) return null;
    if (node.kind === 'domain') return slug;
    const inlineDomain = resolveOptional(node.domain);
    if (inlineDomain && scopeSlugs.has(inlineDomain) && nodeBySlug.get(inlineDomain)?.kind === 'domain') {
      return inlineDomain;
    }
    const visited = new Set([slug]);
    const queue = [slug];
    while (queue.length > 0) {
      const current = queue.shift();
      for (const { next } of containmentParentsFor(current)) {
        if (visited.has(next) || !scopeSlugs.has(next)) continue;
        const parent = nodeBySlug.get(next);
        if (parent?.kind === 'domain') return next;
        visited.add(next);
        queue.push(next);
      }
    }
    return null;
  }

  function intersectSlugSets(left, right) {
    return new Set([...left].filter((slug) => right.has(slug)));
  }

  function sortedNodesInScope(scopeSlugs) {
    return [...scopeSlugs]
      .map((slug) => nodeBySlug.get(slug))
      .filter(Boolean)
      .sort((a, b) => a.slug.localeCompare(b.slug));
  }

  function domainMapRow(domainSlug, domainScope, itemLimit) {
    const scopedNodes = sortedNodesInScope(domainScope);
    const edgesByScope = partitionScopeEdges(domainScope);
    const capabilities = scopedNodes.filter((node) => node.kind === 'capability');
    const elements = scopedNodes.filter((node) => node.kind === 'element');

    return {
      slug: domainSlug,
      node: summarizeNode(nodeBySlug.get(domainSlug)),
      summary: {
        nodes: scopedNodes.length,
        capabilities: capabilities.length,
        elements: elements.length,
        internalEdges: edgesByScope.internal.length,
        boundaryEdges: edgesByScope.boundary.length,
        externalEdges: edgesByScope.external.length,
        unresolvedEdges: edgesByScope.unresolved.length,
      },
      capabilities: limitedNodeList(capabilities, itemLimit),
      elements: limitedNodeList(elements, itemLimit),
      hotspots: topHubs(scopedNodes, Math.min(itemLimit, 5)),
    };
  }

  function externalElementCandidates(limit) {
    // `.ontology-atlasignore` 패턴에 매치되는 ref 는 *의도된 외부 코드* 로 간주, materialize
    // 추천에서 skip. ignored 카운트는 응답에 같이 노출 (투명성 — 사용자가 "왜
    // 외부 ref 가 적게 보이지?" 묻지 않도록).
    const allExternal = edges.filter(
      (edge) => edge.external && edge.via === 'elements',
    );
    let ignored = 0;
    const kept = [];
    for (const edge of allExternal) {
      if (refMatchesOntologyAtlasIgnore(edge.ref, ontologyAtlasIgnorePatterns)) {
        ignored += 1;
        continue;
      }
      kept.push(edge);
    }
    const rows = kept
      .sort(compareEdges)
      .map((edge) => {
        const slug = suggestedSlugForReference(edge.ref, 'element');
        return {
          kind: 'materialize_external_element',
          score: 0.8,
          from: edge.from,
          ref: edge.ref,
          suggestedSlug: slug,
          reason: `${edge.from} references external element "${edge.ref}". Materialize it if this file should become a first-class ontology node.`,
          proposedAction: {
            tool: 'add_concept',
            args: {
              slug,
              kind: 'element',
              title: titleFromReference(edge.ref),
            },
          },
          node: summarizeNode(nodeBySlug.get(edge.from)),
        };
      });

    const result = limitedCandidateGroup(rows, limit);
    if (ignored > 0) result.ignored = ignored;
    return result;
  }

  function danglingReferenceCandidates(limit) {
    const rows = edges
      .filter((edge) => !edge.resolved && !edge.external)
      .sort(compareEdges)
      .map((edge) => {
        const kind = inferKindFromRelation(edge.via);
        return {
          kind: 'resolve_dangling_reference',
          score: kind ? 0.7 : 0.4,
          from: edge.from,
          ref: edge.ref,
          relation: edge.via,
          inferredKind: kind,
          suggestedSlug: kind ? suggestedSlugForReference(edge.ref, kind) : null,
          reason: `Graph reference "${edge.ref}" from "${edge.from}" via "${edge.via}" does not resolve to a vault node.`,
          proposedAction: kind
            ? {
                tool: 'add_concept',
                args: {
                  slug: suggestedSlugForReference(edge.ref, kind),
                  kind,
                  title: titleFromReference(edge.ref),
                },
              }
            : null,
          node: summarizeNode(nodeBySlug.get(edge.from)),
        };
      });

    return limitedCandidateGroup(rows, limit);
  }

  function unassignedNodeCandidates(limit) {
    const rows = nodes
      .filter((node) => (node.kind === 'capability' || node.kind === 'element') && !resolveOptional(node.domain))
      .filter((node) => containmentParentsFor(node.slug).length === 0)
      .sort((a, b) => a.slug.localeCompare(b.slug))
      .map((node) => ({
        kind: 'unassigned_node',
        score: 0.5,
        slug: node.slug,
        reason: `${node.slug} has no resolved domain and no containment parent. Assign it to a domain or keep it intentionally global.`,
        node: summarizeNode(node),
      }));

    return limitedCandidateGroup(rows, limit);
  }

  function emptyDomainCandidates(limit) {
    const rows = nodes
      .filter((node) => node.kind === 'domain')
      .filter((node) => !containmentChildren(node.slug).some(({ next }) => {
        const child = nodeBySlug.get(next);
        return child?.kind === 'capability' || child?.kind === 'element';
      }))
      .sort((a, b) => a.slug.localeCompare(b.slug))
      .map((node) => ({
        kind: 'empty_domain',
        score: 0.4,
        slug: node.slug,
        reason: `${node.slug} has no contained capability or element nodes yet.`,
        node: summarizeNode(node),
      }));

    return limitedCandidateGroup(rows, limit);
  }

  function limitedCandidateGroup(rows, limit) {
    return {
      total: rows.length,
      limited: rows.length > limit,
      rows: rows.slice(0, limit),
    };
  }

  function limitedNodeList(rows, limit) {
    return {
      total: rows.length,
      limited: rows.length > limit,
      nodes: rows.slice(0, limit).map(summarizeNode),
    };
  }

  function ancestorlessRootSlugs(excluded) {
    return nodes
      .filter((node) => !excluded.has(node.slug) && containmentTraversalEdges(node.slug, 'ancestors').length === 0)
      .map((node) => node.slug)
      .sort();
  }

  function collectLineage(center, mode, depth, limit) {
    const discovered = new Map([[center, { slug: center, distance: 0 }]]);
    const rows = [];
    const collectedEdges = [];
    const queue = [{ slug: center, distance: 0 }];
    let limited = false;

    while (queue.length > 0) {
      const current = queue.shift();
      if (current.distance >= depth) continue;

      for (const { next, edge } of containmentTraversalEdges(current.slug, mode)) {
        collectedEdges.push(formatPathEdge(edge, current.slug, next));
        if (discovered.has(next)) continue;
        const row = {
          slug: next,
          distance: current.distance + 1,
          via: edge.via,
          node: summarizeNode(nodeBySlug.get(next)),
        };
        discovered.set(next, row);
        rows.push(row);
        queue.push(row);
        if (rows.length >= limit) {
          limited = true;
          return { rows: sortLineageRows(rows), edges: collectedEdges, limited };
        }
      }
    }

    return { rows: sortLineageRows(rows), edges: collectedEdges, limited };
  }

  function cycles(options = {}) {
    const limit = normalizeLimit(options.limit, 20);
    const maxDepth = normalizeDepth(options.maxHops ?? options.depth, 8);
    const typeSet = normalizeTypes(options.types ?? ['dependencies'], options.typeName || 'types');
    const cycleMap = new Map();
    const sortedNodes = [...nodes].sort((a, b) => a.slug.localeCompare(b.slug));

    for (const node of sortedNodes) {
      if (cycleMap.size > limit) break;
      findCyclesFrom(node.slug, node.slug, [node.slug], [], new Set([node.slug]));
    }

    const rows = [...cycleMap.values()].sort(
      (a, b) => a.length - b.length || a.nodes.join('\0').localeCompare(b.nodes.join('\0')),
    );

    return {
      operation: 'cycles',
      relationTypes: [...typeSet].sort(),
      maxDepth,
      totalCycles: rows.length,
      limited: rows.length > limit,
      cycles: rows.slice(0, limit),
    };

    function findCyclesFrom(start, current, path, edgePath, visited) {
      if (path.length > maxDepth || cycleMap.size > limit) return;

      for (const edge of outgoing.get(current) || []) {
        if (!edge.resolved || !typeAllowed(edge.via, typeSet)) continue;
        if (edge.to === start && path.length > 1) {
          const cycle = normalizeCycle(path, [...edgePath, edge]);
          if (!cycleMap.has(cycle.key) && cycleMap.size <= limit) {
            cycleMap.set(cycle.key, {
              id: cycle.key,
              length: cycle.nodes.length - 1,
              nodes: cycle.nodes,
              nodeSummaries: pathNodes(cycle.nodes),
              edges: cycle.edges.map(formatCompiledEdge),
            });
          }
          continue;
        }
        if (visited.has(edge.to) || path.length >= maxDepth) continue;
        visited.add(edge.to);
        findCyclesFrom(start, edge.to, [...path, edge.to], [...edgePath, edge], visited);
        visited.delete(edge.to);
      }
    }
  }

  function topologicalOrder(options = {}) {
    const limit = normalizeLimit(options.limit, 100);
    const typeSet = normalizeTypes(options.types ?? ['dependencies'], options.typeName || 'types');
    const includeIsolated = normalizeOptionalBoolean(options.includeIsolated, 'includeIsolated', false);
    const selectedEdges = edges.filter((edge) => edge.resolved && typeAllowed(edge.via, typeSet));
    const slugs = new Set();
    const adjacency = new Map();
    const indegree = new Map();
    const edgePairs = new Set();

    if (includeIsolated) {
      for (const node of nodes) slugs.add(node.slug);
    }

    for (const edge of selectedEdges) {
      slugs.add(edge.from);
      slugs.add(edge.to);
      const prerequisite = edge.to;
      const dependent = edge.from;
      const pairKey = `${prerequisite}\0${dependent}`;
      if (edgePairs.has(pairKey)) continue;
      edgePairs.add(pairKey);
      if (!adjacency.has(prerequisite)) adjacency.set(prerequisite, new Set());
      adjacency.get(prerequisite).add(dependent);
      indegree.set(dependent, (indegree.get(dependent) || 0) + 1);
      if (!indegree.has(prerequisite)) indegree.set(prerequisite, 0);
    }

    for (const slug of slugs) {
      if (!adjacency.has(slug)) adjacency.set(slug, new Set());
      if (!indegree.has(slug)) indegree.set(slug, 0);
    }

    const ordered = [];
    const layers = [];
    let ready = [...slugs].filter((slug) => indegree.get(slug) === 0).sort();
    let rank = 0;

    while (ready.length > 0) {
      const layer = ready;
      layers.push({ rank, nodes: layer.map((slug) => summarizeNode(nodeBySlug.get(slug))) });
      for (const slug of layer) ordered.push({ rank, slug, node: summarizeNode(nodeBySlug.get(slug)) });

      const nextReady = [];
      for (const slug of layer) {
        for (const next of [...(adjacency.get(slug) || [])].sort()) {
          indegree.set(next, indegree.get(next) - 1);
          if (indegree.get(next) === 0) nextReady.push(next);
        }
      }
      ready = [...new Set(nextReady)].sort();
      rank += 1;
    }

    const blocked = [...slugs]
      .filter((slug) => (indegree.get(slug) || 0) > 0)
      .sort()
      .map((slug) => ({
        slug,
        remainingInDegree: indegree.get(slug),
        node: summarizeNode(nodeBySlug.get(slug)),
      }));

    return {
      operation: 'topological_order',
      relationTypes: [...typeSet].sort(),
      prerequisiteFirst: true,
      includeIsolated,
      acyclic: blocked.length === 0,
      totalNodes: slugs.size,
      orderedCount: ordered.length,
      selectedEdges: selectedEdges.length,
      limited: ordered.length > limit,
      order: ordered.slice(0, limit),
      layers: limitLayers(layers, limit),
      blocked,
    };
  }

  function recommendRelations(options = {}) {
    const limit = normalizeLimit(options.limit, 50);
    const kindFilter = normalizeRecommendRelationKind(options.kind);
    const recommendations = [];

    for (const node of [...nodes].sort((a, b) => a.slug.localeCompare(b.slug))) {
      if (node.kind !== 'capability' && node.kind !== 'element') continue;
      if (kindFilter && node.kind !== kindFilter) continue;
      const domainSlug = resolveOptional(node.domain);
      if (!domainSlug) continue;
      const relation = node.kind === 'capability' ? 'capabilities' : 'elements';
      if (hasResolvedEdge(domainSlug, node.slug, relation) || hasResolvedEdge(domainSlug, node.slug, 'contains')) {
        continue;
      }

      recommendations.push({
        kind: 'missing_domain_containment',
        score: 1,
        from: domainSlug,
        to: node.slug,
        relation,
        reason: `${node.slug} has domain "${node.domain}", but ${domainSlug} does not link back via ${relation}.`,
        proposedAction: {
          tool: 'add_relation',
          args: {
            from: domainSlug,
            to: node.slug,
            type: relation,
          },
        },
        nodes: {
          from: summarizeNode(nodeBySlug.get(domainSlug)),
          to: summarizeNode(node),
        },
      });
    }

    return {
      operation: 'recommend_relations',
      mode: 'domain_containment',
      totalRecommendations: recommendations.length,
      limited: recommendations.length > limit,
      recommendations: recommendations.slice(0, limit),
    };
  }

  function growthPlan(options = {}) {
    const limit = normalizeLimit(options.limit, 25);
    const relationRecommendations = recommendRelations({ limit });
    const externalElementRefs = externalElementCandidates(limit);
    const danglingReferences = danglingReferenceCandidates(limit);
    const unassignedNodes = unassignedNodeCandidates(limit);
    const emptyDomains = emptyDomainCandidates(limit);

    return {
      operation: 'growth_plan',
      summary: {
        relationRecommendations: relationRecommendations.totalRecommendations,
        externalElementRefs: externalElementRefs.total,
        externalElementRefsIgnored: externalElementRefs.ignored ?? 0,
        danglingReferences: danglingReferences.total,
        unassignedNodes: unassignedNodes.total,
        emptyDomains: emptyDomains.total,
        totalActions:
          relationRecommendations.totalRecommendations +
          externalElementRefs.total +
          danglingReferences.total,
      },
      relationRecommendations,
      externalElementRefs,
      danglingReferences,
      unassignedNodes,
      emptyDomains,
    };
  }

  function maintenancePlan(options = {}) {
    const limit = normalizeLimit(options.limit, 25);
    const phaseFilter = normalizeStringSet(options.phases, 'phases', MAINTENANCE_PHASES);
    const severityFilter = normalizeStringSet(options.severities, 'severities', MAINTENANCE_SEVERITIES);
    const kindFilter = normalizeStringSet(options.kinds, 'kinds', MAINTENANCE_KINDS);
    const cycleResult = cycles({ limit, types: options.dependencyTypes ?? ['dependencies'] });
    const relationRecommendations = recommendRelations({ limit });
    const externalElementRefs = externalElementCandidates(limit);
    const danglingReferences = danglingReferenceCandidates(limit);
    const unassignedNodes = unassignedNodeCandidates(limit);
    const emptyDomains = emptyDomainCandidates(limit);
    const canonicalizationActions = Array.isArray(artifact?.canonicalizationActions)
      ? artifact.canonicalizationActions
      : [];
    const actions = [];

    for (const issue of Array.isArray(artifact?.issues) ? artifact.issues : []) {
      actions.push({
        phase: 'validate',
        kind: 'inspect_compile_issue',
        severity: 'warn',
        score: 1,
        reason: issue.message || issue.code || 'Compiled ontology issue requires inspection.',
        issue,
      });
    }
    for (const cycle of cycleResult.cycles) {
      actions.push({
        phase: 'repair',
        kind: 'break_dependency_cycle',
        severity: 'fail',
        score: 1,
        reason: `Dependency cycle detected across ${cycle.length} nodes.`,
        cycle,
      });
    }
    for (const row of canonicalizationActions) {
      actions.push({
        phase: 'repair',
        kind: 'canonicalize_graph_arrays',
        severity: 'warn',
        score: 0.95,
        reason: `${row.slug} has non-canonical graph arrays: ${row.keys.join(', ')}.`,
        proposedAction: {
          tool: 'patch_concept',
          args: {
            slug: row.slug,
            frontmatter: row.frontmatter,
            expected_mtime: row.expected_mtime,
          },
        },
        node: summarizeNode(nodeBySlug.get(row.slug)),
      });
    }
    for (const row of danglingReferences.rows) {
      actions.push({
        phase: 'repair',
        kind: row.kind,
        severity: 'warn',
        score: row.score,
        reason: row.reason,
        proposedAction: row.proposedAction,
        node: row.node,
      });
    }
    for (const row of relationRecommendations.recommendations) {
      actions.push({
        phase: 'link',
        kind: 'add_missing_relation',
        severity: 'warn',
        score: row.score,
        reason: row.reason,
        proposedAction: row.proposedAction,
        nodes: row.nodes,
      });
    }
    for (const row of externalElementRefs.rows) {
      actions.push({
        phase: 'materialize',
        kind: row.kind,
        severity: 'info',
        score: row.score,
        reason: row.reason,
        proposedAction: row.proposedAction,
        node: row.node,
      });
    }
    for (const row of unassignedNodes.rows) {
      actions.push({
        phase: 'review',
        kind: row.kind,
        severity: 'info',
        score: row.score,
        reason: row.reason,
        node: row.node,
      });
    }
    for (const row of emptyDomains.rows) {
      actions.push({
        phase: 'review',
        kind: row.kind,
        severity: 'info',
        score: row.score,
        reason: row.reason,
        node: row.node,
      });
    }

    actions.sort(compareMaintenanceActions);
    const annotatedActions = actions.map(annotateMaintenanceAction);
    const executableOnly = normalizeOptionalBoolean(options.executableOnly, 'executableOnly', false);
    const filteredActions = annotatedActions.filter((action) => {
      if (executableOnly && !action.executable) return false;
      if (phaseFilter && !phaseFilter.has(action.phase)) return false;
      if (severityFilter && !severityFilter.has(action.severity)) return false;
      if (kindFilter && !kindFilter.has(action.kind)) return false;
      return true;
    });
    const afterActionId = typeof options.afterActionId === 'string' && options.afterActionId.trim()
      ? options.afterActionId.trim()
      : null;
    const afterIndex = afterActionId
      ? filteredActions.findIndex((action) => action.id === afterActionId)
      : -1;
    const cursorFound = afterActionId ? afterIndex >= 0 : true;
    const cursorActions = afterActionId
      ? (cursorFound ? filteredActions.slice(afterIndex + 1) : [])
      : filteredActions;
    const pageActions = cursorActions.slice(0, limit);

    return {
      operation: 'maintenance_plan',
      sideEffect: false,
      graphHash: artifact?.graphHash,
      summary: {
        totalActions: actions.length,
        filteredActions: filteredActions.length,
        remainingActions: cursorActions.length,
        executableActions: annotatedActions.filter((action) => action.executable).length,
        reviewActions: annotatedActions.filter((action) => !action.executable).length,
        compileIssues: Array.isArray(artifact?.issues) ? artifact.issues.length : 0,
        dependencyCycles: cycleResult.totalCycles,
        canonicalizationActions: canonicalizationActions.length,
        danglingReferences: danglingReferences.total,
        relationRecommendations: relationRecommendations.totalRecommendations,
        externalElementRefs: externalElementRefs.total,
        externalElementRefsIgnored: externalElementRefs.ignored ?? 0,
        unassignedNodes: unassignedNodes.total,
        emptyDomains: emptyDomains.total,
      },
      filters: {
        executableOnly,
        phases: phaseFilter ? [...phaseFilter].sort() : [],
        severities: severityFilter ? [...severityFilter].sort() : [],
        kinds: kindFilter ? [...kindFilter].sort() : [],
      },
      cursor: {
        afterActionId,
        found: cursorFound,
        reason: cursorFound ? null : 'afterActionId not found in filtered maintenance actions',
        startIndex: afterActionId ? (cursorFound ? afterIndex + 1 : null) : 0,
        nextAfterActionId: pageActions.length > 0 ? pageActions[pageActions.length - 1].id : null,
        hasMore: cursorActions.length > limit,
      },
      byPhase: countBy(cursorActions, 'phase'),
      bySeverity: countBy(cursorActions, 'severity'),
      byKind: countBy(cursorActions, 'kind'),
      limited: cursorActions.length > limit,
      nextExecutableAction: pageActions.find((action) => action.executable) ?? null,
      nextReviewAction: pageActions.find((action) => !action.executable) ?? null,
      actions: pageActions,
    };
  }

  function workspaceBrief(options = {}) {
    const limit = normalizeLimit(options.limit, 10);
    const overviewResult = overview({ limit });
    const healthResult = health({
      limit,
      componentLimit: options.componentLimit ?? limit,
      cycleLimit: options.cycleLimit ?? limit,
      recommendationLimit: options.recommendationLimit ?? limit,
      orderLimit: options.orderLimit ?? limit,
      nodeLimit: options.nodeLimit ?? limit,
      dependencyTypes: options.dependencyTypes,
      componentTypes: options.componentTypes ?? options.types,
    });
    const growthResult = growthPlan({ limit });
    const projectRoots = projectRootSlugs();
    const projectMaps = projectRoots.slice(0, limit).map((project) => {
      const map = projectMap(project, { limit, itemLimit: Math.min(limit, 20) });
      return {
        project,
        node: map.node,
        summary: map.summary,
        domains: map.domains.map((domain) => ({
          slug: domain.slug,
          node: domain.node,
          summary: domain.summary,
        })),
        unassigned: map.unassigned,
      };
    });
    const nextActions = workspaceNextActions(healthResult, growthResult, limit);

    return {
      operation: 'workspace_brief',
      status: healthResult.status,
      summary: {
        graphHash: overviewResult.graph.graphHash,
        maxMtime: overviewResult.graph.maxMtime,
        nodes: overviewResult.graph.nodes,
        edges: overviewResult.graph.edges,
        projects: projectRoots.length,
        domains: overviewResult.byKind.domain || 0,
        capabilities: overviewResult.byKind.capability || 0,
        elements: overviewResult.byKind.element || 0,
        externalEdges: overviewResult.graph.externalEdges,
        unresolvedEdges: overviewResult.graph.unresolvedEdges,
        issues: overviewResult.graph.issues,
        growthActions: growthResult.summary.totalActions,
      },
      health: {
        status: healthResult.status,
        checks: healthResult.checks,
      },
      growth: growthResult.summary,
      projects: {
        total: projectRoots.length,
        limited: projectRoots.length > limit,
        maps: projectMaps,
      },
      hotspots: overviewResult.hubs,
      nextActions,
    };
  }

  function agentBrief(options = {}) {
    const limit = normalizeLimit(options.limit, 5);
    const workspace = workspaceBrief({
      limit,
      componentLimit: options.componentLimit ?? limit,
      cycleLimit: options.cycleLimit ?? limit,
      recommendationLimit: options.recommendationLimit ?? limit,
      orderLimit: options.orderLimit ?? limit,
      nodeLimit: options.nodeLimit ?? limit,
      dependencyTypes: options.dependencyTypes,
      componentTypes: options.componentTypes ?? options.types,
    });
    const overviewResult = overview({ limit });
    const topEntrypoint = overviewResult.hubs[0] ?? nodes.find((node) => ['domain', 'capability', 'element'].includes(node.kind));
    const secondEntrypoint = overviewResult.hubs.find((node) => node.slug !== topEntrypoint?.slug);
    const projectSlug = projectRootSlugs()[0] ?? '<project-slug>';
    const meaningfulNodes = nodes.filter((node) => ['domain', 'capability', 'element'].includes(node.kind)).length;
    const relationCount = edges.length;
    const shaped = meaningfulNodes >= 3;
    const linked = relationCount >= Math.max(1, meaningfulNodes - 1);
    const clean = workspace.status === 'healthy';
    const score =
      (shaped ? 30 : 0) +
      (linked ? 25 : 0) +
      (clean ? 25 : 0) +
      (overviewResult.hubs.length > 0 ? 20 : 0);
    const readinessStatus = !shaped ? 'needs_shape' : !linked || !clean ? 'needs_attention' : 'ready';
    const impactSlug = topEntrypoint?.slug ?? '<slug>';
    const graphDbPathTargetSlug =
      edges.find(
        (edge) =>
          edge.from === impactSlug
          && ['dependencies', 'depends_on', 'relates'].includes(edge.via)
          && edge.to !== impactSlug,
      )?.to ??
      edges.find(
        (edge) =>
          edge.to === impactSlug
          && ['dependencies', 'depends_on', 'relates'].includes(edge.via)
          && edge.from !== impactSlug,
      )?.from;
    const pathTargetSlug = graphDbPathTargetSlug ?? secondEntrypoint?.slug ?? '<other-slug>';
    const relationPreflightCall = agentToolCall('query_ontology', {
      operation: 'relation_check',
      from: impactSlug,
      to: pathTargetSlug,
      type: 'depends_on',
    });
    const pathPreflightCall = agentToolCall('query_ontology', {
      operation: 'path',
      from: impactSlug,
      to: pathTargetSlug,
      maxHops: 5,
    });
    const backlinkPreflightCall = agentToolCall('find_backlinks', { slug: impactSlug });
    const nodeProfilePreflightCall = agentToolCall('query_ontology', {
      operation: 'node_profile',
      slug: impactSlug,
      depth: 1,
      limit: Math.max(5, limit),
    });
    const healthGateCall = agentToolCall('query_ontology', { operation: 'health', limit });
    const validateVaultGateCall = agentToolCall('validate_vault', {});
    const traversalBudget = {
      maxHops: 1,
      limit: 10,
      searchBudget: 1000,
      types: ['depends_on', 'relates', 'domain', 'capabilities', 'contains'],
    };
    const traversalPlanCall = agentToolCall('query_ontology', {
      operation: 'query_plan',
      targetOperation: 'all_paths',
      from: impactSlug,
      to: pathTargetSlug,
      ...traversalBudget,
    });
    const traversalAllPathsCall = agentToolCall('query_ontology', {
      operation: 'all_paths',
      from: impactSlug,
      to: pathTargetSlug,
      ...traversalBudget,
    });
    const graphDbQueryPack = [
      {
        id: 'graph_facets',
        intent: 'MATCH graph RETURN kind/domain/degree/relation facets LIMIT 10',
        goal: 'Read kind, domain, degree, relation, and schema-pattern buckets before choosing a narrower graph query.',
        calls: [
          agentToolCall('query_ontology', {
            operation: 'facets',
            limit: 10,
          }),
          agentToolCall('query_ontology', {
            operation: 'schema',
            limit: 20,
          }),
        ],
      },
      {
        id: 'node_scan',
        intent: 'MATCH (n:capability) WHERE degree(n) >= 2 RETURN n ORDER BY degree(n) DESC LIMIT 10',
        goal: 'Find high-degree capability nodes as onboarding or refactor starting points.',
        calls: [
          agentToolCall('query_ontology', {
            operation: 'query_plan',
            targetOperation: 'match_nodes',
            kind: 'capability',
            minDegree: 2,
            sort: 'degree',
            limit: 10,
          }),
          agentToolCall('query_ontology', {
            operation: 'match_nodes',
            kind: 'capability',
            minDegree: 2,
            sort: 'degree',
            limit: 10,
          }),
        ],
      },
      {
        id: 'edge_scan',
        intent: 'MATCH ()-[r:depends_on]->() RETURN r LIMIT 20',
        goal: 'Scan dependency edges before treating coupling rows as proof.',
        calls: [
          agentToolCall('query_ontology', {
            operation: 'query_plan',
            targetOperation: 'match_edges',
            types: ['depends_on'],
            limit: 20,
          }),
          agentToolCall('query_ontology', { operation: 'match_edges', types: ['depends_on'], limit: 20 }),
        ],
      },
      {
        id: 'domain_coupling',
        intent: 'MATCH (domain)-[depends_on|relates]->(domain) RETURN coupling_matrix LIMIT 6',
        goal: 'Compare domain coupling and centrality before making boundary claims.',
        calls: [
          agentToolCall('query_ontology', { operation: 'domain_matrix', types: ['depends_on', 'relates'], limit: 6 }),
          agentToolCall('query_ontology', {
            operation: 'query_plan',
            targetOperation: 'centrality',
            types: ['depends_on', 'relates'],
            limit: 10,
          }),
          agentToolCall('query_ontology', { operation: 'centrality', types: ['depends_on', 'relates'], limit: 10 }),
        ],
      },
      {
        id: 'path_evidence',
        intent: 'MATCH p=(from)-[:depends_on|relates*..3]-(to) RETURN p LIMIT 10',
        goal: 'Collect bounded path evidence and relation explanation before writing or refactoring.',
        calls: [
          agentToolCall('query_ontology', {
            operation: 'query_plan',
            targetOperation: 'all_paths',
            from: impactSlug,
            to: pathTargetSlug,
            maxHops: 3,
            types: ['depends_on', 'relates'],
            searchBudget: 1000,
            limit: 10,
          }),
          agentToolCall('query_ontology', {
            operation: 'all_paths',
            from: impactSlug,
            to: pathTargetSlug,
            maxHops: 3,
            types: ['depends_on', 'relates'],
            searchBudget: 1000,
            limit: 10,
          }),
          agentToolCall('query_ontology', {
            operation: 'explain_relation',
            from: impactSlug,
            to: pathTargetSlug,
            direction: 'undirected',
            maxHops: 5,
            types: ['depends_on', 'relates'],
            limit: 10,
          }),
        ],
      },
      {
        id: 'business_questions',
        intent: 'MATCH business questions TO outcomes, domain boundaries, capability claims, and implementation evidence',
        goal: 'Answer the business ontology lens questions with executable graph evidence instead of treating paths or APIs as the ontology root.',
        calls: [
          agentToolCall('query_ontology', {
            operation: 'facets',
          }),
          agentToolCall('query_ontology', {
            operation: 'query_plan',
            targetOperation: 'match_nodes',
            kind: 'domain',
            sort: 'degree',
            limit: 10,
          }),
          agentToolCall('query_ontology', {
            operation: 'match_nodes',
            kind: 'domain',
            sort: 'degree',
            limit: 10,
          }),
          agentToolCall('query_ontology', { operation: 'domain_matrix', types: ['depends_on', 'relates'], limit: 6 }),
          agentToolCall('query_ontology', {
            operation: 'query_plan',
            targetOperation: 'match_edges',
            fromKind: 'capability',
            toKind: 'element',
            types: ['elements', 'depends_on', 'relates'],
            limit: 20,
          }),
          agentToolCall('query_ontology', {
            operation: 'match_edges',
            fromKind: 'capability',
            toKind: 'element',
            types: ['elements', 'depends_on', 'relates'],
            limit: 20,
          }),
        ],
      },
    ];
    const containmentCrossCheckCalls = [
      agentToolCall('query_ontology', {
        operation: 'pattern_walk',
        slug: projectSlug,
        pattern: ['domains', 'capabilities'],
        direction: 'outgoing',
        limit: 20,
      }),
      agentToolCall('query_ontology', { operation: 'project_map', project: projectSlug, limit: 10, itemLimit: 20 }),
    ];
    const traversalStrategy = [
      {
        id: 'plan_before_enumeration',
        priority: 'first',
        goal: 'Estimate traversal cost before enumerating paths.',
        useWhen: 'The question needs more than one shortest route or may touch high-degree hubs.',
        evidence: ['query_plan.execution.nextStep', 'query_plan.execution.suggestedQuery', 'query_plan.execution.saferQuery when present'],
        stopWhen: ['execution.nextStep is narrow or review and the saferQuery still lacks maxHops/types/searchBudget bounds.'],
        calls: [traversalPlanCall],
      },
      {
        id: 'bounded_path_evidence',
        priority: 'evidence',
        goal: 'Enumerate bounded alternatives without turning traversal into an unbounded graph scan.',
        useWhen: 'A write, refactor, or architecture answer depends on whether multiple paths explain the relation.',
        evidence: ['all_paths.evidence.status', 'all_paths.evidence.reason', 'all_paths.evidence.pathsComplete', 'all_paths.totalPathsExact'],
        stopWhen: ['evidence.status is partial, evidence.pathsComplete is false, or totalPathsExact is false; follow evidence.suggestedQuery or evidence.saferQuery before writing.'],
        calls: [traversalAllPathsCall],
      },
      {
        id: 'containment_cross_check',
        priority: 'confirm',
        goal: 'Cross-check path evidence against project/domain containment instead of trusting edge proximity alone.',
        useWhen: 'The answer changes ownership, domain boundaries, or add_relation direction.',
        evidence: ['pattern_walk rows for project -> domains -> capabilities', 'project_map domain placement and boundary edges'],
        stopWhen: ['pattern_walk and project_map disagree on project/domain placement.'],
        calls: containmentCrossCheckCalls,
      },
    ];
    const relationDecisionGuide = [
      {
        decision: 'skip_existing',
        severity: 'info',
        meaning: 'Exact edge already exists; do not call add_relation for the same edge.',
      },
      {
        decision: 'review_inverse',
        severity: 'warn',
        meaning: 'Reverse edge exists; inspect direction and explain before writing.',
      },
      {
        decision: 'safe_to_add',
        severity: 'info',
        meaning: 'Schema pattern is familiar; add only when path evidence still supports the edge.',
      },
      {
        decision: 'review_new_schema',
        severity: 'warn',
        meaning: 'This creates a new schema pattern; explain why the relation type belongs before writing.',
      },
    ];
    const resultContracts = [
      {
        operation: 'all_paths',
        mustReport: [
          'limit',
          'searchBudget',
          'expandedStates',
          'exhaustive',
          'truncatedByBudget',
          'totalPathsExact',
          'evidence.status',
          'evidence.reason',
          'evidence.pathsComplete',
        ],
        partialWhen: ['exhaustive=false', 'truncatedByBudget=true', 'totalPathsExact=false', 'evidence.status=partial', 'evidence.pathsComplete=false'],
        policy: 'Treat paths as partial evidence unless evidence.pathsComplete is true; treat totalPaths as partial evidence unless totalPathsExact is true; follow evidence.suggestedQuery or narrow maxHops/types before using paths as write evidence.',
      },
      {
        operation: 'match_nodes',
        mustReport: [
          'totalMatches',
          'limited',
          'nodes.length',
          'followUp.focusSlug',
          'followUp.calls',
          'followUp.cliFallbackCommands',
        ],
        partialWhen: ['limited=true', 'nodes.length=0', 'followUp missing because no rows were returned'],
        policy: 'Treat match_nodes rows as scan candidates, not evidence; run the followUp node_profile, incoming/outgoing match_edges, and blast_radius calls before using a node row for onboarding or refactor decisions.',
      },
      {
        operation: 'match_edges',
        mustReport: [
          'totalMatches',
          'limited',
          'edges.length',
          'followUp.focusEdge',
          'followUp.calls',
          'followUp.cliFallbackCommands',
        ],
        partialWhen: ['limited=true', 'edges.length=0', 'followUp missing because the first row is external/unresolved or no rows were returned'],
        policy: 'Treat match_edges rows as scan candidates, not proof; run the followUp explain_relation, path, and relation_check calls before using an edge row as write, refactor, or coupling evidence.',
      },
    ];
    const entrypoints = overviewResult.hubs.slice(0, limit).map((node) => ({
      slug: node.slug,
      title: node.title,
      kind: node.kind,
      degree: node.degree,
      inDegree: node.inDegree,
      outDegree: node.outDegree,
    }));
    const businessOntologyLens = buildAgentBusinessOntologyLens(entrypoints);

    const brief = {
      operation: 'agent_brief',
      sideEffect: false,
      status: workspace.status,
      readiness: {
        status: readinessStatus,
        score,
        meaningfulNodes,
        relationCount,
        projects: workspace.summary.projects,
        domains: workspace.summary.domains,
        capabilities: workspace.summary.capabilities,
        elements: workspace.summary.elements,
        unresolvedEdges: workspace.summary.unresolvedEdges,
        externalEdges: workspace.summary.externalEdges,
        growthActions: workspace.summary.growthActions,
        healthChecks: workspace.health.checks.length,
      },
      graph: workspace.summary,
      health: workspace.health,
      nextActions: workspace.nextActions,
      businessOntologyLens,
      entrypoints,
      firstCalls: [
        agentToolCall('query_ontology', { operation: 'workspace_brief', limit }),
        agentToolCall('query_ontology', { operation: 'health', limit }),
        agentToolCall('query_ontology', {
          operation: 'query_plan',
          targetOperation: 'blast_radius',
          slug: impactSlug,
          depth: 2,
        }),
        agentToolCall('query_ontology', {
          operation: 'node_profile',
          slug: impactSlug,
          depth: 2,
          limit: Math.max(5, limit),
        }),
        relationPreflightCall,
      ],
      graphDbQueryPack,
      traversalStrategy,
      playbooks: [
        {
          id: 'refactor_impact',
          goal: 'Before changing a node or module, estimate dependency blast radius and cite affected slugs.',
          evidence: [
            'Target node profile, incoming blast radius groups, and the highest-risk affected slugs.',
            'Whether an existing path already explains the proposed relation.',
            'The relation_check recommendation.decision before any add_relation.',
          ],
          stopWhen: [
            'health reports failing checks or actionable nextActions.',
            'relation_check returns skip_existing, review_inverse, or review_new_schema.',
            'blast radius crosses domains that are outside the requested change.',
          ],
          calls: [
            agentToolCall('query_ontology', { operation: 'workspace_brief', limit }),
            agentToolCall('query_ontology', {
              operation: 'query_plan',
              targetOperation: 'blast_radius',
              slug: impactSlug,
              depth: 2,
            }),
            agentToolCall('query_ontology', { operation: 'node_profile', slug: impactSlug, depth: 2, limit: 12 }),
            agentToolCall('query_ontology', { operation: 'blast_radius', slug: impactSlug, depth: 2, direction: 'incoming' }),
            pathPreflightCall,
            relationPreflightCall,
          ],
        },
        {
          id: 'onboarding_map',
          goal: 'Build a compact project/domain map before editing an unfamiliar vault.',
          evidence: [
            'Workspace status, project/domain map, and the main high-degree entrypoints.',
            'Domain coupling rows that explain where codebase knowledge clusters.',
            'Graph DB-style node scan results that surface high-degree capability starting points.',
            'One concrete hub profile to anchor the first mental model.',
          ],
          stopWhen: [
            'workspace_brief reports unresolved graph health issues.',
            'query_plan(match_nodes) asks for a narrower kind/domain/limit before scanning.',
            'node_profile cannot resolve the selected high-degree entrypoint.',
          ],
          calls: [
            agentToolCall('query_ontology', { operation: 'workspace_brief', limit }),
            agentToolCall('query_ontology', { operation: 'domain_matrix', limit: 10 }),
            agentToolCall('query_ontology', {
              operation: 'query_plan',
              targetOperation: 'match_nodes',
              kind: 'capability',
              minDegree: 2,
              sort: 'degree',
              limit: 10,
            }),
            agentToolCall('query_ontology', {
              operation: 'match_nodes',
              kind: 'capability',
              minDegree: 2,
              sort: 'degree',
              limit: 10,
            }),
            agentToolCall('query_ontology', { operation: 'node_profile', slug: impactSlug, depth: 2, limit: 12 }),
          ],
        },
        {
          id: 'coupling_audit',
          goal: 'Find high-coupling nodes and relation patterns before a modularity review.',
          evidence: [
            'Domain-to-domain coupling hot spots.',
            'Central nodes and dependency edges that create boundary pressure.',
            'Any cycles, disconnected components, or health failures that weaken the audit.',
          ],
          stopWhen: [
            'health fails or reports dependency cycles.',
            'centrality and match_edges point to conflicting boundary conclusions.',
          ],
          calls: [
            agentToolCall('query_ontology', { operation: 'health', limit }),
            agentToolCall('query_ontology', { operation: 'domain_matrix', limit: 10 }),
            agentToolCall('query_ontology', {
              operation: 'query_plan',
              targetOperation: 'centrality',
              types: ['depends_on', 'relates'],
              limit: 10,
            }),
            agentToolCall('query_ontology', { operation: 'centrality', types: ['depends_on', 'relates'], limit: 10 }),
            agentToolCall('query_ontology', {
              operation: 'query_plan',
              targetOperation: 'match_edges',
              types: ['depends_on'],
              limit: 20,
            }),
            agentToolCall('query_ontology', { operation: 'match_edges', types: ['depends_on'], limit: 20 }),
          ],
        },
        {
          id: 'graph_traversal',
          goal: 'Use graph-database-style traversal evidence when one shortest path is not enough.',
          evidence: [
            'Schema patterns that make the traversal legal and meaningful.',
            'Bounded all_paths alternatives with the edges that distinguish them.',
            'Pattern-walk containment evidence and the project_map domain placement.',
          ],
          stopWhen: [
            'query_plan marks all_paths as high cost for the requested bounds.',
            'all_paths returns too many plausible paths to justify a single edge without narrowing types or hops.',
            'pattern_walk and project_map disagree on project/domain containment.',
          ],
          calls: [
            agentToolCall('query_ontology', { operation: 'schema', limit: 20 }),
            traversalPlanCall,
            traversalAllPathsCall,
            ...containmentCrossCheckCalls,
          ],
        },
      ],
      writeGuardrails: [
        {
          id: 'preflight_relation',
          goal: 'Before add_relation, prove the target edge is not duplicated, inverted, or already explained by an existing path.',
          calls: [
            relationPreflightCall,
            pathPreflightCall,
          ],
        },
        {
          id: 'preflight_rename',
          goal: 'Before rename_concept or merge_concepts, inspect backlinks and local node context for the slug being rewritten.',
          calls: [
            backlinkPreflightCall,
            nodeProfilePreflightCall,
          ],
        },
        {
          id: 'post_change_sync',
          goal: 'After code changes or vault writes, gate the shared graph before handing work back to another agent.',
          calls: [
            healthGateCall,
            agentToolCall('query_ontology', { operation: 'cycles', maxHops: 8 }),
            agentToolCall('query_ontology', { operation: 'growth_plan', limit: 20 }),
            agentToolCall('query_ontology', { operation: 'maintenance_plan', limit: 20 }),
            validateVaultGateCall,
          ],
        },
      ],
      writePolicy: [
        'Run read tools first and cite returned slugs/edges before editing.',
        'Run relation_check before add_relation to confirm matchingEdges, inverseEdges, schema pattern, and proposedAction args.',
        'For all_paths, report limit/searchBudget/expandedStates/exhaustive/truncatedByBudget/totalPathsExact plus evidence.status/evidence.reason/evidence.pathsComplete and treat incomplete paths as partial evidence.',
        'For match_nodes and match_edges, report totalMatches/limited plus followUp details, then run the followUp calls before treating scan rows as evidence.',
        'Follow relationDecisionGuide: skip_existing blocks duplicate writes; review_inverse and review_new_schema require explicit justification before writing.',
        'Run find_backlinks before rename_concept or merge_concepts so backlink rewrites are intentional.',
        'Run health, cycles, growth_plan, maintenance_plan, and validate_vault after code changes or vault writes before handing the graph to another agent.',
        'Use add_concept/add_relation/patch_concept/merge_concepts only after the intended ontology change is clear.',
        'After code changes introduce or rename a domain, capability, element, or relation, sync the vault before finishing.',
      ],
      resultContracts,
      relationDecisionGuide,
      docs: {
        workflowGuide: AGENT_WORKFLOW_GUIDE,
        modeComparison: AGENT_MODE_COMPARISON,
        graphScanProofChecklist: GRAPH_SCAN_PROOF_CHECKLIST,
      },
    };
    brief.cliFallbackCommands = uniqueCliCommands([
      ...brief.firstCalls,
      ...brief.graphDbQueryPack.flatMap((item) => item.calls),
      ...brief.playbooks.flatMap((playbook) => playbook.calls),
      ...brief.traversalStrategy.flatMap((strategy) => strategy.calls),
      ...brief.writeGuardrails.flatMap((guardrail) => guardrail.calls),
    ]);
    brief.handoffPrompt = buildAgentBriefHandoffPrompt(brief);
    return brief;
  }

  function health(options = {}) {
    const limit = normalizeLimit(options.limit, 10);
    const overviewResult = overview({ limit });
    const componentTypeSet = normalizeTypes(options.componentTypes ?? options.types, options.componentTypes !== undefined ? 'componentTypes' : 'types');
    const componentResult = components({
      limit: normalizeLimit(options.componentLimit, 5, 'componentLimit'),
      nodeLimit: normalizeLimit(options.nodeLimit, 10, 'nodeLimit'),
      types: options.componentTypes ?? options.types,
    });
    const allComponentGroups = connectedComponentGroups(componentTypeSet);
    const actionableComponentGroups = allComponentGroups.filter(
      (group) => !componentGroupOnlyHasKinds(group, HEALTH_IGNORED_COMPONENT_KINDS),
    );
    const actionableComponentCount = actionableComponentGroups.length;
    const ignoredComponentCount = allComponentGroups.length - actionableComponentCount;
    const cycleResult = cycles({
      limit: normalizeLimit(options.cycleLimit, 5, 'cycleLimit'),
      maxHops: options.maxHops ?? options.depth,
      types: options.dependencyTypes ?? ['dependencies'],
      typeName: options.dependencyTypes !== undefined ? 'dependencyTypes' : 'types',
    });
    const recommendationResult = recommendRelations({
      limit: normalizeLimit(options.recommendationLimit, 20, 'recommendationLimit'),
    });
    const orderResult = topologicalOrder({
      limit: normalizeLimit(options.orderLimit, 20, 'orderLimit'),
      types: options.dependencyTypes ?? ['dependencies'],
      typeName: options.dependencyTypes !== undefined ? 'dependencyTypes' : 'types',
    });
    const issueCount = Array.isArray(artifact?.issues) ? artifact.issues.length : 0;
    const graph = overviewResult.graph;
    const checks = [
      healthCheck({
        id: 'compile_issues',
        status: issueCount === 0 ? 'pass' : 'warn',
        count: issueCount,
        message:
          issueCount === 0
            ? 'Compiled ontology artifact has no compiler issues.'
            : 'Compiled ontology artifact has compiler issues; inspect compile_ontology.issues.',
      }),
      healthCheck({
        id: 'unresolved_edges',
        status: graph.unresolvedEdges === 0 ? 'pass' : 'warn',
        count: graph.unresolvedEdges,
        message:
          graph.unresolvedEdges === 0
            ? 'Every internal edge resolves to a known ontology node.'
            : 'Some internal edges do not resolve to a known ontology node.',
      }),
      healthCheck({
        id: 'dependency_cycles',
        status: cycleResult.totalCycles === 0 ? 'pass' : 'fail',
        count: cycleResult.totalCycles,
        message:
          cycleResult.totalCycles === 0
            ? 'No directed dependency cycles were detected.'
            : 'Directed dependency cycles block a clean prerequisite-first graph order.',
      }),
      healthCheck({
        id: 'relation_recommendations',
        status: recommendationResult.totalRecommendations === 0 ? 'pass' : 'warn',
        count: recommendationResult.totalRecommendations,
        message:
          recommendationResult.totalRecommendations === 0
            ? 'No safe domain-containment relation suggestions are pending.'
            : 'Safe domain-containment relation suggestions are available.',
      }),
      healthCheck({
        id: 'components',
        status: actionableComponentCount <= 1 ? 'pass' : 'info',
        count: actionableComponentCount,
        message:
          actionableComponentCount <= 1
            ? ignoredComponentCount > 0
              ? `${componentHealthConnectedSubject(options, true)} is connected; ${ignoredComponentCount} root/reference component(s) were ignored.`
              : `${componentHealthSubject(options)} is connected.`
            : `${componentHealthSubject(options)} has disconnected actionable islands.`,
      }),
    ];
    const status = checks.some((check) => check.status === 'fail' || check.status === 'warn')
      ? 'needs_attention'
      : 'healthy';

    return {
      operation: 'health',
      status,
      graphHash: graph.graphHash,
      maxMtime: graph.maxMtime,
      summary: {
        nodes: graph.nodes,
        edges: graph.edges,
        resolvedEdges: graph.resolvedEdges,
        externalEdges: graph.externalEdges,
        unresolvedEdges: graph.unresolvedEdges,
        issues: graph.issues,
        ambiguousAliases: graph.ambiguousAliases,
        components: componentResult.totalComponents,
        actionableComponents: actionableComponentCount,
        ignoredComponents: ignoredComponentCount,
        largestComponentSize: componentResult.largestSize,
        singletonComponents: componentResult.singletonCount,
        dependencyCycles: cycleResult.totalCycles,
        relationRecommendations: recommendationResult.totalRecommendations,
        dependencyOrderAcyclic: orderResult.acyclic,
      },
      checks,
      components: {
        totalComponents: componentResult.totalComponents,
        actionableComponents: actionableComponentCount,
        ignoredComponents: ignoredComponentCount,
        largestSize: componentResult.largestSize,
        singletonCount: componentResult.singletonCount,
        limited: componentResult.limited,
        components: componentResult.components,
      },
      dependencyCycles: {
        totalCycles: cycleResult.totalCycles,
        limited: cycleResult.limited,
        cycles: cycleResult.cycles,
      },
      relationRecommendations: {
        totalRecommendations: recommendationResult.totalRecommendations,
        limited: recommendationResult.limited,
        recommendations: recommendationResult.recommendations,
      },
      dependencyOrder: {
        acyclic: orderResult.acyclic,
        totalNodes: orderResult.totalNodes,
        orderedCount: orderResult.orderedCount,
        blocked: orderResult.blocked,
      },
    };
  }

  function componentHealthSubject(options = {}) {
    return options.componentTypes !== undefined || options.types !== undefined
      ? 'The scoped ontology graph'
      : 'The resolved ontology graph';
  }

  function componentHealthConnectedSubject(options = {}, ignored = false) {
    if (options.componentTypes !== undefined || options.types !== undefined) return 'The scoped ontology graph';
    return ignored ? 'The actionable ontology graph' : 'The resolved ontology graph';
  }

  function schemaPatterns() {
    const patternMap = new Map();
    for (const edge of edges) {
      const fromKind = nodeBySlug.get(edge.from)?.kind || 'unknown';
      const toKind = edge.resolved
        ? nodeBySlug.get(edge.to)?.kind || 'unknown'
        : edge.external
          ? 'external'
          : 'unresolved';
      const key = `${fromKind}\0${edge.via}\0${toKind}`;
      if (!patternMap.has(key)) {
        patternMap.set(key, {
          fromKind,
          relation: edge.via,
          toKind,
          count: 0,
          resolved: 0,
          external: 0,
          unresolved: 0,
          examples: [],
        });
      }
      const pattern = patternMap.get(key);
      pattern.count += 1;
      if (edge.resolved) pattern.resolved += 1;
      else if (edge.external) pattern.external += 1;
      else pattern.unresolved += 1;
      if (pattern.examples.length < 3) {
        pattern.examples.push({
          from: edge.from,
          to: edge.to,
          ref: edge.ref,
        });
      }
    }
    return [...patternMap.values()].sort(
      (a, b) =>
        b.count - a.count ||
        a.fromKind.localeCompare(b.fromKind) ||
        a.relation.localeCompare(b.relation) ||
        a.toKind.localeCompare(b.toKind),
    );
  }

  function nearbySchemaPatterns({ fromKind, relation, toKind, matchedPattern }) {
    return schemaPatterns()
      .filter((pattern) => pattern !== matchedPattern)
      .map((pattern) => ({
        ...pattern,
        similarity:
          (pattern.fromKind === fromKind ? 1 : 0) +
          (pattern.relation === relation ? 1 : 0) +
          (pattern.toKind === toKind ? 1 : 0),
      }))
      .filter((pattern) => pattern.similarity > 0)
      .sort((a, b) => {
        if (b.similarity !== a.similarity) return b.similarity - a.similarity;
        if (b.count !== a.count) return b.count - a.count;
        return (
          a.fromKind.localeCompare(b.fromKind) ||
          a.relation.localeCompare(b.relation) ||
          a.toKind.localeCompare(b.toKind)
        );
      })
      .slice(0, 5);
  }

  function writeRelationType(relation) {
    return relation === 'dependencies' ? 'depends_on' : relation;
  }

  function resolvedEdgesBetween(from, to, typeSet) {
    return edges
      .filter((edge) => {
        if (!edge.resolved || !typeAllowed(edge.via, typeSet)) return false;
        return (edge.from === from && edge.to === to) || (edge.from === to && edge.to === from);
      })
      .sort(compareEdges)
      .map((edge) => ({
        ...formatCompiledEdge(edge),
        direction: edge.from === from && edge.to === to ? 'outgoing' : 'incoming',
        fromNode: summarizeNode(nodeBySlug.get(edge.from)),
        toNode: summarizeNode(nodeBySlug.get(edge.to)),
      }));
  }

  function commonNeighborRows(from, to, typeSet, limit) {
    const fromNeighbors = explainNeighborMap(from, typeSet);
    const toNeighbors = explainNeighborMap(to, typeSet);
    const rows = [];
    for (const slug of [...fromNeighbors.keys()].sort()) {
      if (!toNeighbors.has(slug)) continue;
      rows.push({
        slug,
        node: summarizeNode(nodeBySlug.get(slug)),
        fromEdges: fromNeighbors.get(slug).slice(0, limit),
        toEdges: toNeighbors.get(slug).slice(0, limit),
      });
    }
    return rows.sort((a, b) => {
      const aDegree = (a.node?.inDegree || 0) + (a.node?.outDegree || 0);
      const bDegree = (b.node?.inDegree || 0) + (b.node?.outDegree || 0);
      return bDegree - aDegree || a.slug.localeCompare(b.slug);
    });
  }

  function explainNeighborMap(slug, typeSet) {
    const byNeighbor = new Map();
    for (const { next, edge } of traversalEdges(slug, 'both', typeSet)) {
      if (!byNeighbor.has(next)) byNeighbor.set(next, []);
      byNeighbor.get(next).push({
        ...formatPathEdge(edge, slug, next),
        direction: edge.from === slug ? 'outgoing' : 'incoming',
        via: edge.via,
      });
    }
    for (const rows of byNeighbor.values()) {
      rows.sort((a, b) => edgeSortKey(a).localeCompare(edgeSortKey(b)));
    }
    return byNeighbor;
  }

  function relationVerdict(from, to, directEdges, shortest, commonNeighbors) {
    if (from === to) return 'same_node';
    if (directEdges.length > 0) return 'direct';
    if (shortest.found) return 'path';
    if (commonNeighbors.length > 0) return 'common_neighbor';
    return 'unrelated_within_hops';
  }

  function patternLayer(step, relation, paths) {
    const slugs = [...new Set(paths.map((row) => row.slug))].sort();
    return {
      step,
      relation,
      totalPaths: paths.length,
      totalNodes: slugs.length,
      nodes: slugs.map((slug) => summarizeNode(nodeBySlug.get(slug))),
    };
  }

  function uniquePathMatches(matches) {
    const seen = new Set();
    const rows = [];
    for (const row of matches) {
      const relationKey = row.edges.map((edge) => edge.via).join('>');
      const key = `${row.hops.join('>')}|${relationKey}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }
    return rows;
  }

  function traversalEdges(slug, direction, typeSet) {
    const candidates = [];
    if (direction === 'outgoing' || direction === 'both' || direction === 'undirected') {
      for (const edge of outgoing.get(slug) || []) {
        if (!edge.resolved || !typeAllowed(edge.via, typeSet)) continue;
        candidates.push({ next: edge.to, edge });
      }
    }
    if (direction === 'incoming' || direction === 'both' || direction === 'undirected') {
      for (const edge of incoming.get(slug) || []) {
        if (!edge.resolved || !typeAllowed(edge.via, typeSet)) continue;
        candidates.push({ next: edge.from, edge });
      }
    }
    candidates.sort((a, b) =>
      `${a.next}:${edgeSortKey(a.edge)}`.localeCompare(`${b.next}:${edgeSortKey(b.edge)}`),
    );
    return candidates;
  }

  function traversalEstimate(start, direction, typeSet, depth) {
    const visited = new Set([start]);
    let frontier = [start];
    let edgeScans = 0;
    let potentialPathUpperBound = 1;
    const frontierByDepth = [];

    for (let distance = 1; distance <= depth; distance += 1) {
      const next = new Set();
      let candidateEdges = 0;
      for (const slug of frontier) {
        const candidates = traversalEdges(slug, direction, typeSet);
        candidateEdges += candidates.length;
        for (const { next: nextSlug } of candidates) {
          if (!visited.has(nextSlug)) next.add(nextSlug);
        }
      }
      edgeScans += candidateEdges;
      potentialPathUpperBound *= Math.max(1, candidateEdges);
      for (const slug of next) visited.add(slug);
      frontierByDepth.push({
        distance,
        frontierNodes: frontier.length,
        candidateEdges,
        newNodes: next.size,
      });
      frontier = [...next].sort();
      if (frontier.length === 0) break;
    }

    return {
      edgeScans,
      reachableWithinDepth: visited.size - 1,
      potentialPathUpperBound,
      frontierByDepth,
    };
  }

  function containmentTraversalEdges(slug, mode) {
    const candidates = [];
    if (mode === 'descendants') {
      for (const edge of outgoing.get(slug) || []) {
        if (!edge.resolved || !DOWNWARD_CONTAINMENT_TYPES.has(edge.via)) continue;
        candidates.push({ next: edge.to, edge });
      }
      for (const edge of incoming.get(slug) || []) {
        if (!edge.resolved || !UPWARD_CONTAINMENT_TYPES.has(edge.via)) continue;
        candidates.push({ next: edge.from, edge });
      }
    } else {
      for (const edge of incoming.get(slug) || []) {
        if (!edge.resolved || !DOWNWARD_CONTAINMENT_TYPES.has(edge.via)) continue;
        candidates.push({ next: edge.from, edge });
      }
      for (const edge of outgoing.get(slug) || []) {
        if (!edge.resolved || !UPWARD_CONTAINMENT_TYPES.has(edge.via)) continue;
        candidates.push({ next: edge.to, edge });
      }
    }
    candidates.sort((a, b) =>
      `${a.next}:${edgeSortKey(a.edge)}`.localeCompare(`${b.next}:${edgeSortKey(b.edge)}`),
    );
    return candidates;
  }

  function containmentChildren(slug) {
    const bySlug = new Map();
    for (const candidate of containmentTraversalEdges(slug, 'descendants')) {
      const previous = bySlug.get(candidate.next);
      if (!previous || (previous.edge.via === 'domain' && candidate.edge.via !== 'domain')) {
        bySlug.set(candidate.next, candidate);
      }
    }
    return [...bySlug.values()].sort((a, b) => a.next.localeCompare(b.next));
  }

  function containmentParentsFor(slug) {
    const bySlug = new Map();
    for (const candidate of containmentTraversalEdges(slug, 'ancestors')) {
      const previous = bySlug.get(candidate.next);
      if (!previous || (previous.edge.via === 'domain' && candidate.edge.via !== 'domain')) {
        bySlug.set(candidate.next, candidate);
      }
    }
    return [...bySlug.values()].sort((a, b) => a.next.localeCompare(b.next));
  }

  function resolveOptional(input) {
    if (typeof input !== 'string' || !input.trim()) return null;
    const candidate = input.trim();
    if (nodeBySlug.has(candidate)) return candidate;
    return aliasToSlug.get(candidate) || null;
  }

  function hasResolvedEdge(from, to, via) {
    return (outgoing.get(from) || []).some(
      (edge) => edge.resolved && edge.to === to && edge.via === via,
    );
  }

  function aliasesFor(slug) {
    return (Array.isArray(artifact?.aliases) ? artifact.aliases : [])
      .filter((entry) => entry.slug === slug)
      .map((entry) => entry.alias)
      .sort();
  }

  function profileEdgeGroup(rows, direction, limit) {
    const relationCounts = countEdgeMap(rows, 'via');
    return {
      total: rows.length,
      byRelation: sortedCountObject(relationCounts),
      byRelationType: publicRelationCountObject(relationCounts),
      limited: rows.length > limit,
      edges: rows.slice(0, limit).map((edge) => ({
        ...formatCompiledEdge(edge),
        otherNode: edge.resolved
          ? summarizeNode(nodeBySlug.get(direction === 'incoming' ? edge.from : edge.to))
          : null,
        otherKind: edge.resolved
          ? nodeBySlug.get(direction === 'incoming' ? edge.from : edge.to)?.kind || 'unknown'
          : edge.external
            ? 'external'
            : 'unresolved',
      })),
    };
  }

  function scopeEdgeGroup(rows, scopeSlugs, limit) {
    return {
      total: rows.length,
      byRelation: countEdges(rows, 'via'),
      limited: rows.length > limit,
      edges: rows.slice(0, limit).map((edge) => ({
        ...formatCompiledEdge(edge),
        fromNode: summarizeNode(nodeBySlug.get(edge.from)),
        toNode: edge.resolved ? summarizeNode(nodeBySlug.get(edge.to)) : null,
        toScope: classifyEdgeScope(edge, scopeSlugs),
      })),
    };
  }

  function classifyEdgeScope(edge, scopeSlugs) {
    if (edge.resolved && scopeSlugs.has(edge.to)) return 'internal';
    if (edge.external) return 'external';
    if (edge.resolved) return 'boundary';
    return 'unresolved';
  }

  function partitionScopeEdges(scopeSlugs) {
    const internal = [];
    const boundary = [];
    const external = [];
    const unresolved = [];

    for (const edge of edges) {
      if (!scopeSlugs.has(edge.from)) continue;
      if (edge.resolved && scopeSlugs.has(edge.to)) internal.push(edge);
      else if (edge.resolved) boundary.push(edge);
      else if (edge.external) external.push(edge);
      else unresolved.push(edge);
    }

    return {
      internal: internal.sort(compareEdges),
      boundary: boundary.sort(compareEdges),
      external: external.sort(compareEdges),
      unresolved: unresolved.sort(compareEdges),
    };
  }

  function inferKindFromRelation(relation) {
    if (relation === 'domains' || relation === 'domain') return 'domain';
    if (relation === 'capabilities' || relation === 'dependencies') return 'capability';
    if (relation === 'elements') return 'element';
    return null;
  }

  function workspaceNextActions(healthResult, growthResult, limit) {
    const actions = [];
    for (const check of healthResult.checks) {
      if (check.status === 'pass') continue;
      actions.push({
        kind: 'health_check',
        severity: check.status,
        id: check.id,
        count: check.count,
        message: check.message,
      });
    }
    if (growthResult.summary.relationRecommendations > 0) {
      actions.push({
        id: 'add_missing_relations',
        kind: 'add_missing_relations',
        severity: 'warn',
        count: growthResult.summary.relationRecommendations,
        message: 'Add missing domain containment relations before relying on project/domain rollups.',
        sample: growthResult.relationRecommendations.recommendations
          .slice(0, Math.min(3, limit))
          .map((row) => row.proposedAction),
      });
    }
    if (growthResult.summary.danglingReferences > 0) {
      actions.push({
        id: 'resolve_dangling_references',
        kind: 'resolve_dangling_references',
        severity: 'warn',
        count: growthResult.summary.danglingReferences,
        message: 'Resolve dangling graph references or create the missing ontology nodes.',
        sample: growthResult.danglingReferences.rows.slice(0, Math.min(3, limit)),
      });
    }
    if (growthResult.summary.externalElementRefs > 0) {
      actions.push({
        id: 'materialize_external_elements',
        kind: 'materialize_external_elements',
        severity: 'info',
        count: growthResult.summary.externalElementRefs,
        message: 'Materialize frequently referenced external files as element nodes when they should be first-class.',
        sample: growthResult.externalElementRefs.rows
          .slice(0, Math.min(3, limit))
          .map((row) => row.proposedAction),
      });
    }
    return actions.slice(0, limit);
  }

  return {
    resolve,
    neighbors,
    path,
    allPaths,
    queryPlan,
    centrality,
    communities,
    similarNodes,
    explainRelation,
    reachability,
    patternWalk,
    impact,
    blastRadius,
    subgraph,
    overview,
    schema,
    facets,
    matchNodes,
    matchEdges,
    nodeProfile,
    domainProfile,
    domainMatrix,
    projectScope,
    projectMap,
    relationCheck,
    components,
    lineage,
    containmentTree,
    cycles,
    topologicalOrder,
    recommendRelations,
    growthPlan,
    maintenancePlan,
    agentBrief,
    workspaceBrief,
    health,
  };
}

function agentToolCall(tool, args) {
  return { tool, arguments: args };
}

function buildMatchNodesFollowUp(node) {
  if (!node?.slug) return null;
  const slug = node.slug;
  const calls = [
    {
      id: 'profile_focus',
      label: 'Profile the first matched node before editing.',
      ...agentToolCall('query_ontology', {
        operation: 'node_profile',
        slug,
        limit: 12,
      }),
    },
    {
      id: 'outgoing_edges',
      label: 'Inspect outgoing edges from the first match.',
      ...agentToolCall('query_ontology', {
        operation: 'match_edges',
        from: slug,
        includeExternal: true,
        includeUnresolved: true,
        limit: 20,
      }),
    },
    {
      id: 'incoming_edges',
      label: 'Inspect incoming edges into the first match.',
      ...agentToolCall('query_ontology', {
        operation: 'match_edges',
        to: slug,
        limit: 20,
      }),
    },
    {
      id: 'incoming_impact',
      label: 'Check incoming blast radius before changing this node.',
      ...agentToolCall('query_ontology', {
        operation: 'blast_radius',
        slug,
        depth: 2,
        direction: 'incoming',
      }),
    },
  ];

  return {
    focusSlug: slug,
    reason:
      'match_nodes is a scan; use these focused follow-up calls before treating a row as graph evidence.',
    calls,
    cliFallbackCommands: uniqueCliCommands(calls),
  };
}

function buildMatchEdgesFollowUp(edge) {
  if (!edge?.from || !edge?.to || edge.resolved === false || edge.external === true) return null;
  const relation = edge.via === 'dependencies' ? 'depends_on' : edge.via;
  const calls = [
    {
      id: 'explain_relation',
      label: 'Explain why the first matched edge exists.',
      ...agentToolCall('query_ontology', {
        operation: 'explain_relation',
        from: edge.from,
        to: edge.to,
        direction: 'undirected',
        types: [relation],
        maxHops: 5,
        limit: 10,
      }),
    },
    {
      id: 'path_evidence',
      label: 'Find a shortest path between the edge endpoints.',
      ...agentToolCall('query_ontology', {
        operation: 'path',
        from: edge.from,
        to: edge.to,
        maxHops: 5,
      }),
    },
    {
      id: 'relation_preflight',
      label: 'Preflight this relation before writing a duplicate or inverse edge.',
      ...agentToolCall('query_ontology', {
        operation: 'relation_check',
        from: edge.from,
        to: edge.to,
        type: relation,
      }),
    },
  ];

  return {
    focusEdge: {
      from: edge.from,
      to: edge.to,
      via: edge.via,
      relationType: publicRelationType(edge.via),
    },
    reason:
      'match_edges is a scan; explain and preflight the first edge before treating it as write or refactor evidence.',
    calls,
    cliFallbackCommands: uniqueCliCommands(calls),
  };
}

function formatAgentToolCall(call) {
  return `${call.tool} ${JSON.stringify(call.arguments)}`;
}

function formatAgentToolCallCliCommand(call) {
  const args = call?.arguments || {};
  if (call?.tool === 'find_backlinks') {
    const slug = stringArg(args.slug, '<slug>');
    return `ontology-atlas backlinks ${shellQuote(slug)} [vault]`;
  }
  if (call?.tool === 'validate_vault') {
    return 'ontology-atlas validate [vault]';
  }
  if (call?.tool !== 'query_ontology') return null;

  switch (args.operation) {
    case 'workspace_brief':
      return withCliFlags('ontology-atlas workspace-brief [vault]', [
        positiveFlag('--limit', args.limit),
      ]);
    case 'health':
      return withCliFlags('ontology-atlas health [vault]', [
        positiveFlag('--limit', args.limit),
      ]);
    case 'agent_brief':
      return withCliFlags('ontology-atlas agent-brief [vault]', [
        positiveFlag('--limit', args.limit),
      ]);
    case 'facets':
      return withCliFlags('ontology-atlas facets [vault]', [
        positiveFlag('--limit', args.limit),
      ]);
    case 'schema':
      return withCliFlags('ontology-atlas schema [vault]', [
        positiveFlag('--limit', args.limit),
      ]);
    case 'query_plan':
      if (args.targetOperation === 'blast_radius') {
        const slug = stringArg(args.slug, '<slug>');
        return withCliFlags(`ontology-atlas blast-radius ${shellQuote(slug)} [vault]`, [
          '--plan',
          nonNegativeFlag('--depth', args.depth),
          stringFlag('--direction', args.direction),
        ]);
      }
      if (args.targetOperation === 'centrality') {
        return withCliFlags('ontology-atlas hubs [vault]', [
          '--plan',
          positiveFlag('--limit', args.limit),
          csvFlag('--types', args.types),
        ]);
      }
      if (args.targetOperation === 'match_nodes') {
        return formatMatchNodesCliCommand(args, { plan: true });
      }
      if (args.targetOperation === 'match_edges') {
        return formatMatchEdgesCliCommand(args, { plan: true });
      }
      if (args.targetOperation === 'all_paths') {
        const from = stringArg(args.from, '<from-slug>');
        const to = stringArg(args.to, '<to-slug>');
        return withCliFlags(`ontology-atlas all-paths ${shellQuote(from)} ${shellQuote(to)} [vault]`, [
          '--plan',
          '--force',
          nonNegativeFlag('--max-hops', args.maxHops),
          csvFlag('--types', args.types),
          positiveFlag('--search-budget', args.searchBudget),
          positiveFlag('--limit', args.limit),
        ]);
      }
      return null;
    case 'node_profile': {
      const slug = stringArg(args.slug, '<slug>');
      return withCliFlags(`ontology-atlas node ${shellQuote(slug)} [vault]`, [
        positiveFlag('--limit', args.limit),
      ]);
    }
    case 'path': {
      const from = stringArg(args.from, '<from-slug>');
      const to = stringArg(args.to, '<to-slug>');
      return withCliFlags(`ontology-atlas path ${shellQuote(from)} ${shellQuote(to)} [vault]`, [
        nonNegativeFlag('--max-hops', args.maxHops),
      ]);
    }
    case 'explain_relation': {
      const from = stringArg(args.from, '<from-slug>');
      const to = stringArg(args.to, '<to-slug>');
      return withCliFlags(`ontology-atlas explain ${shellQuote(from)} ${shellQuote(to)} [vault]`, [
        stringFlag('--direction', args.direction),
        nonNegativeFlag('--max-hops', args.maxHops),
        csvFlag('--types', args.types),
        positiveFlag('--limit', args.limit),
      ]);
    }
    case 'relation_check': {
      const from = stringArg(args.from, '<from-slug>');
      const to = stringArg(args.to, '<to-slug>');
      const type = stringArg(args.type, 'depends_on');
      return `ontology-atlas relation-check ${shellQuote(from)} ${shellQuote(to)} ${shellQuote(type)} [vault]`;
    }
    case 'blast_radius': {
      const slug = stringArg(args.slug, '<slug>');
      return withCliFlags(`ontology-atlas blast-radius ${shellQuote(slug)} [vault]`, [
        nonNegativeFlag('--depth', args.depth),
        stringFlag('--direction', args.direction),
      ]);
    }
    case 'all_paths': {
      const from = stringArg(args.from, '<from-slug>');
      const to = stringArg(args.to, '<to-slug>');
      return withCliFlags(`ontology-atlas all-paths ${shellQuote(from)} ${shellQuote(to)} [vault]`, [
        '--plan',
        '--force',
        nonNegativeFlag('--max-hops', args.maxHops),
        csvFlag('--types', args.types),
        positiveFlag('--search-budget', args.searchBudget),
        positiveFlag('--limit', args.limit),
      ]);
    }
    case 'centrality':
      return withCliFlags('ontology-atlas hubs [vault]', [
        positiveFlag('--limit', args.limit),
        csvFlag('--types', args.types),
      ]);
    case 'match_nodes':
      return formatMatchNodesCliCommand(args);
    case 'match_edges':
      return formatMatchEdgesCliCommand(args);
    case 'domain_matrix':
      return withCliFlags('ontology-atlas domain-matrix [vault]', [
        stringFlag('--project', args.project),
        positiveFlag('--limit', args.limit),
        csvFlag('--types', args.types),
      ]);
    case 'pattern_walk': {
      const slug = stringArg(args.slug, '<slug>');
      if (isPlaceholderArg(slug)) return null;
      return withCliFlags(`ontology-atlas pattern-walk ${shellQuote(slug)} [vault]`, [
        csvFlag('--pattern', args.pattern),
        stringFlag('--direction', args.direction),
        positiveFlag('--limit', args.limit),
      ]);
    }
    case 'project_map': {
      const project = stringArg(args.project ?? args.slug, '<project-slug>');
      if (isPlaceholderArg(project)) return null;
      return withCliFlags(`ontology-atlas project-map ${shellQuote(project)} [vault]`, [
        positiveFlag('--limit', args.limit),
        positiveFlag('--item-limit', args.itemLimit),
      ]);
    }
    default:
      return null;
  }
}

function isPlaceholderArg(value) {
  return typeof value === 'string' && /^<[^>]+>$/.test(value);
}

function formatMatchNodesCliCommand(args, options = {}) {
  return withCliFlags('ontology-atlas match-nodes [vault]', [
    options.plan ? '--plan' : null,
    stringFlag('--kind', args.kind),
    stringFlag('--domain', args.domain),
    stringFlag('--slug-contains', args.slugContains),
    nonNegativeFlag('--min-degree', args.minDegree),
    nonNegativeFlag('--max-degree', args.maxDegree),
    nonNegativeFlag('--min-in-degree', args.minInDegree),
    nonNegativeFlag('--min-out-degree', args.minOutDegree),
    booleanFlag('--has-incoming', args.hasIncoming),
    booleanFlag('--has-outgoing', args.hasOutgoing),
    stringFlag('--sort', args.sort),
    positiveFlag('--limit', args.limit),
  ]);
}

function formatMatchEdgesCliCommand(args, options = {}) {
  return withCliFlags('ontology-atlas match-edges [vault]', [
    options.plan ? '--plan' : null,
    stringFlag('--from', args.from),
    stringFlag('--to', args.to),
    stringFlag('--from-kind', args.fromKind),
    stringFlag('--to-kind', args.toKind),
    stringFlag('--type', args.type),
    csvFlag('--types', args.types),
    booleanFlag('--include-external', args.includeExternal),
    booleanFlag('--include-unresolved', args.includeUnresolved),
    positiveFlag('--limit', args.limit),
  ]);
}

function withCliFlags(command, flags) {
  return [command, ...flags.filter(Boolean)].join(' ');
}

function stringArg(value, fallback) {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function stringFlag(name, value) {
  return typeof value === 'string' && value.trim() ? `${name} ${shellQuote(value)}` : null;
}

function positiveFlag(name, value) {
  return Number.isInteger(value) && value > 0 ? `${name} ${value}` : null;
}

function nonNegativeFlag(name, value) {
  return Number.isInteger(value) && value >= 0 ? `${name} ${value}` : null;
}

function booleanFlag(name, value) {
  return value === true ? name : null;
}

function csvFlag(name, value) {
  if (!Array.isArray(value) || value.length === 0) return null;
  const values = value.filter((item) => typeof item === 'string' && item.trim().length > 0);
  return values.length > 0 ? `${name} ${values.map(shellQuote).join(',')}` : null;
}

function shellQuote(value) {
  if (/^[A-Za-z0-9_/:=.,@%+-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function uniqueCliCommands(calls) {
  const seen = new Set();
  const commands = [];
  for (const call of calls) {
    const command = formatAgentToolCallCliCommand(call);
    if (!command || seen.has(command)) continue;
    seen.add(command);
    commands.push(command);
  }
  return commands;
}

function buildAgentBriefHandoffPrompt(brief) {
  const firstCalls = brief.firstCalls
    .map((call, index) => `${index + 1}. ${formatAgentToolCall(call)}`)
    .join('\n');
  const playbooks = brief.playbooks
    .map((playbook) => {
      const calls = playbook.calls.map((call) => formatAgentToolCall(call)).join(' -> ');
      const evidence = playbook.evidence.map((item) => `   evidence: ${item}`).join('\n');
      const stopWhen = playbook.stopWhen.map((item) => `   stop if: ${item}`).join('\n');
      return `- ${playbook.id}: ${playbook.goal}\n  calls: ${calls}\n${evidence}\n${stopWhen}`;
    })
    .join('\n');
  const graphDbQueryPack = Array.isArray(brief.graphDbQueryPack)
    ? brief.graphDbQueryPack
        .map((item) => {
          const calls = item.calls.map((call) => formatAgentToolCall(call)).join(' -> ');
          return `- ${item.id}: ${item.intent}\n  goal: ${item.goal}\n  calls: ${calls}`;
        })
        .join('\n')
    : '';
  const guardrails = brief.writeGuardrails
    .map((guardrail) => {
      const calls = guardrail.calls.map((call) => formatAgentToolCall(call)).join(' -> ');
      return `- ${guardrail.id}: ${guardrail.goal}\n  calls: ${calls}`;
    })
    .join('\n');
  const traversalStrategy = Array.isArray(brief.traversalStrategy)
    ? brief.traversalStrategy
        .map((strategy) => {
          const calls = strategy.calls.map((call) => formatAgentToolCall(call)).join(' -> ');
          const evidence = strategy.evidence.map((item) => `   evidence: ${item}`).join('\n');
          const stopWhen = strategy.stopWhen.map((item) => `   stop if: ${item}`).join('\n');
          return `- ${strategy.id}: ${strategy.goal}\n  use when: ${strategy.useWhen}\n  calls: ${calls}\n${evidence}\n${stopWhen}`;
        })
        .join('\n')
    : '';
  const entrypoints = brief.entrypoints.length > 0
    ? brief.entrypoints.map((entrypoint) => `- ${entrypoint.slug} (${entrypoint.kind}, degree ${entrypoint.degree})`).join('\n')
    : '- <no concrete entrypoint; start with workspace_brief and health>';
  const businessOntologyLens = brief.businessOntologyLens ?? buildAgentBusinessOntologyLens(brief.entrypoints);
  const businessDomains = businessOntologyLens.businessDomains;
  const capabilityOutcomes = businessOntologyLens.capabilityOutcomes;
  const implementationEvidence = businessOntologyLens.implementationEvidence;
  const decisionQuestions = Array.isArray(businessOntologyLens.decisionQuestions)
    ? businessOntologyLens.decisionQuestions
    : [];
  const cliCommands = Array.isArray(brief.cliFallbackCommands)
    ? brief.cliFallbackCommands
    : uniqueCliCommands([
        ...brief.firstCalls,
        ...(Array.isArray(brief.graphDbQueryPack)
          ? brief.graphDbQueryPack.flatMap((item) => item.calls)
          : []),
        ...brief.playbooks.flatMap((playbook) => playbook.calls),
        ...(Array.isArray(brief.traversalStrategy)
          ? brief.traversalStrategy.flatMap((strategy) => strategy.calls)
          : []),
        ...brief.writeGuardrails.flatMap((guardrail) => guardrail.calls),
      ]);
  const cliFallback = cliCommands.length > 0
    ? [
        '',
        'CLI fallback commands when the MCP connector is unavailable:',
        ...cliCommands.map((command, index) => `${index + 1}. ${command}`),
      ]
    : [];

  return [
    'Use the ontology-atlas MCP server as the shared codebase graph memory before editing.',
    `Current readiness: ${brief.readiness.status} ${brief.readiness.score}/100; graph ${brief.graph.nodes ?? 0} nodes, ${brief.graph.edges ?? 0} edges; status ${brief.status}.`,
    'Feature guide: docs/AGENT-GRAPH-WORKFLOW.md explains CLI-only use, MCP-connected use, graph DB differences, graph query packs, and verification checks.',
    '',
    'Business-to-code ontology lens:',
    '- Read the business outcome first, then business/product domains, capabilities, and implementation evidence.',
    `- business domains: ${businessDomains.length > 0 ? businessDomains.join(', ') : 'none in top entrypoints; run workspace_brief and domain_matrix before making business boundary claims'}`,
    `- capability outcomes: ${capabilityOutcomes.length > 0 ? capabilityOutcomes.join(', ') : 'none in top entrypoints; inspect project/domain containment before promoting source folders to capabilities'}`,
    `- implementation evidence: ${implementationEvidence.length > 0 ? `${implementationEvidence.join(', ')} proves or supports capability behavior` : 'attach source paths, APIs, routes, commands, or MCP tools only after domain/capability meaning is clear'}; do not treat paths, APIs, routes, or commands as the ontology root.`,
    ...(decisionQuestions.length > 0
      ? ['- business decision questions:', ...decisionQuestions.map((question) => `  - ${question}`)]
      : []),
    '',
    'Run these first-contact MCP calls in order:',
    firstCalls,
    '',
    'Suggested graph entrypoints:',
    entrypoints,
    ...cliFallback,
    '',
    'Graph DB query pack for local markdown graph scans:',
    graphDbQueryPack,
    '',
    'Kind classification contract before writing frontmatter:',
    '- Do not classify from the label alone. Treat kind as an evidence-backed role in the shared conceptualization.',
    '- classify from evidence in this order: project scope -> domain boundary -> capability behavior -> implementation element; use unknown only as a temporary review state.',
    '- project: top-level product or system scope root. Use sparingly; most repositories should have one project node.',
    '- domain: shared vocabulary boundary or product/business area that owns capabilities.',
    '- capability: user-visible behavior, workflow, or coherent system ability.',
    '- element: concrete implementation part such as UI component, API, CLI command, script, module, schema, or file-level unit.',
    '- unknown: temporary review signal; use similar_nodes and relation_check evidence before leaving it permanent.',
    '- High-confidence gate: write a new or changed kind only when another agent could repeat the same choice from the cited evidence; otherwise keep the node unknown/reviewed and ask for more evidence.',
    "- Decision questions: project asks 'is this the whole product/system scope?', domain asks 'does this own a vocabulary boundary?', capability asks 'what behavior or workflow does this enable?', element asks 'which concrete code artifact implements or supports it?'.",
    '- Common near-miss rule: if the evidence is only a file path, start as element; promote to capability only when behavior/workflow evidence exists, and promote to domain only when multiple capabilities share the boundary.',
    '- Containment spine: project contains domains, domains contain capabilities, and capabilities realize through elements; use depends_on/relates only after that ownership path is clear.',
    '- For capability and element nodes, set or verify domain before writing so browse/map/edit colors carry a meaningful ownership boundary.',
    '- Color contract: kind hue communicates ontology layer, while domain tint communicates ownership; a wrong color is evidence that kind/domain should be rechecked.',
    '- Before writing, report source path, symbol, route, command, or MCP tool evidence; then state why not the nearest adjacent kind.',
    '',
    'Investigation playbooks:',
    playbooks,
    '',
    'Traversal strategy:',
    traversalStrategy,
    '',
    'Write guardrails:',
    guardrails,
    '',
    'Relation decision policy:',
    ...brief.relationDecisionGuide.map((row) => `- ${row.decision}: ${row.meaning}`),
    '',
    'Result contracts:',
    ...brief.resultContracts.map((contract) => `- ${contract.operation}: report ${contract.mustReport.join(', ')}; ${contract.policy}`),
    '',
    'Write policy:',
    ...brief.writePolicy.map((line) => `- ${line}`),
  ].join('\n');
}

function buildAgentBusinessOntologyLens(entrypoints = []) {
  return {
    policy: 'business-first',
    readOrder: ['outcome', 'domain', 'capability', 'element'],
    businessDomains: entrypoints
      .filter((entrypoint) => entrypoint.kind === 'domain')
      .map((entrypoint) => entrypoint.slug)
      .slice(0, 5),
    capabilityOutcomes: entrypoints
      .filter((entrypoint) => entrypoint.kind === 'capability')
      .map((entrypoint) => entrypoint.slug)
      .slice(0, 5),
    implementationEvidence: entrypoints
      .filter((entrypoint) => entrypoint.kind === 'element')
      .map((entrypoint) => entrypoint.slug)
      .slice(0, 5),
    decisionQuestions: [
      'What business outcome should this ontology explain or improve?',
      'Which business/product domain boundary does this code change?',
      'What capability claim can a planner, marketer, or leader discuss?',
      'Which implementation evidence proves or disproves that capability?',
    ],
    guidance: [
      'Read the business outcome first, then business/product domains, capabilities, and implementation evidence.',
      'Use implementation evidence to prove or support capability behavior.',
      'Do not treat paths, APIs, routes, or commands as the ontology root.',
    ],
  };
}

function healthCheck({ id, status, count, message }) {
  return { id, status, count, message };
}

function blastRadiusRisk(summary) {
  if (
    summary.affectedNodes >= 10 ||
    summary.affectedDomains >= 3 ||
    summary.crossDomainEdges >= 5
  ) {
    return 'high';
  }
  if (
    summary.affectedNodes >= 3 ||
    summary.affectedDomains >= 2 ||
    summary.crossDomainEdges > 0
  ) {
    return 'medium';
  }
  return 'low';
}

function countBy(items, key) {
  const counts = new Map();
  for (const item of items) {
    const value = item[key];
    if (typeof value !== 'string' || !value.trim()) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return sortedCountObject(counts);
}

function countEdges(items, key) {
  return sortedCountObject(countEdgeMap(items, key));
}

function countEdgeMap(items, key) {
  const counts = new Map();
  for (const item of items) {
    const value = item[key];
    if (typeof value !== 'string' || !value.trim()) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return counts;
}

function sortedCountObject(counts) {
  return Object.fromEntries(
    [...counts.entries()].sort(([leftKey, leftCount], [rightKey, rightCount]) => {
      if (rightCount !== leftCount) return rightCount - leftCount;
      return leftKey.localeCompare(rightKey);
    }),
  );
}

function degreeBucket(degree) {
  if (degree <= 0) return '0';
  if (degree === 1) return '1';
  if (degree <= 4) return '2-4';
  if (degree <= 9) return '5-9';
  return '10+';
}

function topHubs(nodes, limit) {
  return [...nodes]
    .map((node) => ({
      slug: node.slug,
      kind: node.kind,
      title: node.title,
      domain: node.domain,
      inDegree: node.inDegree || 0,
      outDegree: node.outDegree || 0,
      degree: (node.inDegree || 0) + (node.outDegree || 0),
    }))
    .sort((a, b) => b.degree - a.degree || b.inDegree - a.inDegree || a.slug.localeCompare(b.slug))
    .slice(0, limit);
}

function suggestedSlugForReference(ref, kind) {
  const prefix = kind === 'domain' ? 'domains' : kind === 'capability' ? 'capabilities' : 'elements';
  const raw = String(ref || '').trim();
  const withoutExtension = raw.replace(/\.[^.\/\\]+$/, '');
  const normalized = withoutExtension
    .split(/[\/\\]+/)
    .map(slugSegment)
    .filter(Boolean)
    .join('/');
  if (!normalized) return `${prefix}/unnamed`;
  if (normalized.startsWith(`${prefix}/`)) return normalized;
  return `${prefix}/${normalized}`;
}

function slugSegment(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function titleFromReference(ref) {
  const raw = String(ref || '').trim();
  const base = raw.split(/[\/\\]+/).pop()?.replace(/\.[^.]+$/, '') || raw || 'Untitled';
  const words = base
    .replace(/[_-]+/g, ' ')
    .trim();
  return words ? words[0].toUpperCase() + words.slice(1) : 'Untitled';
}

function summarizeNode(node) {
  if (!node) return null;
  return {
    slug: node.slug,
    kind: node.kind,
    title: node.title,
    domain: node.domain,
    inDegree: node.inDegree || 0,
    outDegree: node.outDegree || 0,
  };
}

function sortLineageRows(rows) {
  return [...rows].sort((a, b) => a.distance - b.distance || a.slug.localeCompare(b.slug));
}

function normalizeCycle(nodes, edges) {
  let startIndex = 0;
  for (let i = 1; i < nodes.length; i += 1) {
    if (nodes[i].localeCompare(nodes[startIndex]) < 0) startIndex = i;
  }
  const rotatedNodes = [...nodes.slice(startIndex), ...nodes.slice(0, startIndex)];
  const rotatedEdges = [...edges.slice(startIndex), ...edges.slice(0, startIndex)];
  const closedNodes = [...rotatedNodes, rotatedNodes[0]];
  return {
    key: rotatedNodes.join('->'),
    nodes: closedNodes,
    edges: rotatedEdges,
  };
}

function limitLayers(layers, limit) {
  const out = [];
  let remaining = limit;
  for (const layer of layers) {
    if (remaining <= 0) break;
    const nodes = layer.nodes.slice(0, remaining);
    out.push({
      rank: layer.rank,
      nodes,
      limited: layer.nodes.length > nodes.length,
    });
    remaining -= nodes.length;
  }
  return out;
}

function edgeAllowed(edge, typeSet, includeExternal, includeUnresolved) {
  if (!typeAllowed(edge.via, typeSet)) return false;
  if (edge.resolved) return true;
  if (edge.external) return includeExternal;
  return includeUnresolved;
}

function typeAllowed(via, typeSet) {
  return !typeSet || typeSet.has(normalizeRelationType(via));
}

function normalizeTypes(types, name = 'types') {
  if (types === undefined || types === null) return null;
  if (!Array.isArray(types)) {
    throw new Error(`${name} must be an array of strings.`);
  }
  if (types.length === 0) return null;
  const normalized = [];
  for (const type of types) {
    if (typeof type !== 'string') {
      throw new Error(`${name} must be an array of strings.`);
    }
    const trimmed = type.trim();
    if (!trimmed) {
      throw new Error(`${name} items must be non-empty strings.`);
    }
    if (trimmed !== type) {
      throw new Error(`${name} items must not have leading or trailing whitespace.`);
    }
    if (trimmed.includes('\0')) {
      throw new Error(`${name} items must not contain a null byte.`);
    }
    requireRelationType(trimmed, `${name} items`);
    normalized.push(normalizeRelationType(trimmed));
  }
  return new Set(normalized);
}

function normalizeMatchEdgesTypes(options = {}) {
  if (Array.isArray(options.types) && options.types.length > 0) {
    return normalizeTypes(options.types, 'types');
  }
  const field = options.type === undefined ? 'relation' : 'type';
  const value = options.type ?? options.relation;
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new Error(`${field} must be a string.`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${field} must be a non-empty string.`);
  }
  if (trimmed !== value) {
    throw new Error(`${field} must not have leading or trailing whitespace.`);
  }
  if (trimmed.includes('\0')) {
    throw new Error(`${field} must not contain a null byte.`);
  }
  requireRelationType(trimmed, field);
  return new Set([normalizeRelationType(trimmed)]);
}

function normalizePattern(pattern) {
  if (!Array.isArray(pattern) || pattern.length === 0) {
    throw new Error('pattern (non-empty string array) is required for pattern_walk.');
  }
  const normalized = [];
  for (const relation of pattern) {
    if (typeof relation !== 'string') {
      throw new Error('pattern must be an array of strings.');
    }
    const trimmed = relation.trim();
    if (!trimmed) {
      throw new Error('pattern items must be non-empty strings.');
    }
    if (trimmed !== relation) {
      throw new Error('pattern items must not have leading or trailing whitespace.');
    }
    if (trimmed.includes('\0')) {
      throw new Error('pattern items must not contain a null byte.');
    }
    requireRelationType(trimmed, 'pattern items');
    normalized.push(normalizeRelationType(trimmed));
  }
  return normalized.slice(0, 20);
}

function normalizeOptionalString(value, name) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new Error(`${name} must be a string.`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${name} must be a non-empty string.`);
  }
  if (trimmed !== value) {
    throw new Error(`${name} must not have leading or trailing whitespace.`);
  }
  if (trimmed.includes('\0')) {
    throw new Error(`${name} must not contain a null byte.`);
  }
  return trimmed;
}

function normalizeNonNegativeInteger(value, name) {
  if (value === undefined || value === null) return null;
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return value;
}

function normalizeOptionalBoolean(value, name, defaultValue) {
  if (value === undefined) return defaultValue;
  if (typeof value !== 'boolean') {
    throw new Error(`${name} must be a boolean.`);
  }
  return value;
}

function normalizeRecommendRelationKind(value) {
  const kind = normalizeOptionalString(value, 'kind');
  if (kind === null) return null;
  if (kind !== 'capability' && kind !== 'element') {
    throw new Error(formatAllowedValueError('kind', kind, ['capability', 'element']));
  }
  return kind;
}

function normalizeNodeKind(value, name) {
  const kind = normalizeOptionalString(value, name);
  if (kind === null) return null;
  if (!NODE_KIND_VALUES.includes(kind)) {
    throw new Error(formatAllowedValueError(name, kind, NODE_KIND_VALUES));
  }
  return kind;
}

function normalizeEdgeTargetKind(value, name) {
  const kind = normalizeOptionalString(value, name);
  if (kind === null) return null;
  if (!EDGE_TARGET_KIND_VALUES.includes(kind)) {
    throw new Error(formatAllowedValueError(name, kind, EDGE_TARGET_KIND_VALUES));
  }
  return kind;
}

function normalizeNodeSort(value) {
  if (value === undefined || value === null) return 'degree';
  if (
    value === 'slug' ||
    value === 'inDegree' ||
    value === 'outDegree' ||
    value === 'degree'
  ) {
    return value;
  }
  throw new Error(formatAllowedValueError('sort', value, ['degree', 'inDegree', 'outDegree', 'slug']));
}

function compareNodeRows(left, right, sort) {
  if (sort === 'slug') return left.slug.localeCompare(right.slug);
  const leftValue = left[sort] || 0;
  const rightValue = right[sort] || 0;
  if (rightValue !== leftValue) return rightValue - leftValue;
  if (sort !== 'degree') {
    const leftDegree = left.degree || 0;
    const rightDegree = right.degree || 0;
    if (rightDegree !== leftDegree) return rightDegree - leftDegree;
  }
  return left.slug.localeCompare(right.slug);
}

function pageRankScores(nodes, outgoingEdgesBySlug, iterations) {
  const totalNodes = nodes.length;
  if (totalNodes === 0) return new Map();
  const damping = 0.85;
  let scores = new Map(nodes.map((node) => [node.slug, 1 / totalNodes]));
  const slugs = nodes.map((node) => node.slug);
  const uniqueTargetsBySlug = new Map(
    slugs.map((slug) => [
      slug,
      [...new Set((outgoingEdgesBySlug.get(slug) || []).map((edge) => edge.to))],
    ]),
  );

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const nextScores = new Map(slugs.map((slug) => [slug, (1 - damping) / totalNodes]));
    let danglingMass = 0;
    for (const slug of slugs) {
      const score = scores.get(slug) || 0;
      const uniqueTargets = uniqueTargetsBySlug.get(slug) || [];
      if (uniqueTargets.length === 0) {
        danglingMass += score;
        continue;
      }
      const share = score / uniqueTargets.length;
      for (const target of uniqueTargets) {
        nextScores.set(target, nextScores.get(target) + damping * share);
      }
    }
    if (danglingMass > 0) {
      const danglingShare = (damping * danglingMass) / totalNodes;
      for (const target of slugs) {
        nextScores.set(target, nextScores.get(target) + danglingShare);
      }
    }
    scores = nextScores;
  }

  return scores;
}

function undirectedAdjacencyFrom(nodes, edges, typeSet) {
  const adjacency = new Map(nodes.map((node) => [node.slug, new Set()]));
  for (const edge of edges) {
    if (!edge.resolved || !typeAllowed(edge.via, typeSet)) continue;
    adjacency.get(edge.from)?.add(edge.to);
    adjacency.get(edge.to)?.add(edge.from);
  }
  return adjacency;
}

function propagateCommunityLabels(adjacency, iterations) {
  const labels = new Map([...adjacency.keys()].map((slug) => [slug, slug]));
  const slugs = [...adjacency.keys()].sort();
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let changed = false;
    for (const slug of slugs) {
      const counts = new Map();
      for (const neighbor of [...(adjacency.get(slug) || [])].sort()) {
        const label = labels.get(neighbor) || neighbor;
        counts.set(label, (counts.get(label) || 0) + 1);
      }
      if (counts.size === 0) continue;
      const nextLabel = [...counts.entries()].sort(
        ([leftLabel, leftCount], [rightLabel, rightCount]) =>
          rightCount - leftCount || leftLabel.localeCompare(rightLabel),
      )[0][0];
      if (labels.get(slug) !== nextLabel) {
        labels.set(slug, nextLabel);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return labels;
}

function similarityScore(source, target, sourceNeighbors, targetNeighbors) {
  const slug = tokenJaccard(source.slug, target.slug) * 0.35;
  const title = tokenJaccard(source.title, target.title) * 0.35;
  const kind = source.kind && target.kind && source.kind === target.kind ? 0.1 : 0;
  const domain = source.domain && target.domain && source.domain === target.domain ? 0.1 : 0;
  const neighbors = setJaccard(sourceNeighbors, targetNeighbors) * 0.1;
  return {
    slug,
    title,
    kind,
    domain,
    neighbors,
    total: slug + title + kind + domain + neighbors,
  };
}

function tokenJaccard(left, right) {
  return setJaccard(new Set(textTokens(left)), new Set(textTokens(right)));
}

function textTokens(value) {
  return String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2);
}

function setJaccard(left, right) {
  if (!left || !right || left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const value of left) {
    if (right.has(value)) intersection += 1;
  }
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
}

function compareCentralityRows(left, right) {
  if (right.pageRank !== left.pageRank) return right.pageRank - left.pageRank;
  if (right.degree !== left.degree) return right.degree - left.degree;
  return left.slug.localeCompare(right.slug);
}

function roundScore(value) {
  return Number(value.toFixed(6));
}

function normalizePlanTargetOperation(value) {
  const allowed = new Set(QUERY_PLAN_TARGET_OPERATIONS);
  if (typeof value === 'string' && allowed.has(value)) return value;
  if (value === undefined || value === null || value === '') {
    throw new Error('targetOperation is required for query_plan and must name a supported query.');
  }
  throw new Error(formatAllowedValueError('targetOperation', value, QUERY_PLAN_TARGET_OPERATIONS));
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
    targetOperation === 'subgraph'
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

function compareMaintenanceActions(left, right) {
  const severityRank = { fail: 0, warn: 1, info: 2 };
  const phaseRank = { validate: 0, repair: 1, link: 2, materialize: 3, review: 4 };
  const severityDelta = (severityRank[left.severity] ?? 9) - (severityRank[right.severity] ?? 9);
  if (severityDelta !== 0) return severityDelta;
  const phaseDelta = (phaseRank[left.phase] ?? 9) - (phaseRank[right.phase] ?? 9);
  if (phaseDelta !== 0) return phaseDelta;
  if ((right.score || 0) !== (left.score || 0)) return (right.score || 0) - (left.score || 0);
  return `${left.kind}:${left.reason}`.localeCompare(`${right.kind}:${right.reason}`);
}

function annotateMaintenanceAction(action) {
  return {
    id: maintenanceActionId(action),
    executable: Boolean(action.proposedAction?.tool),
    ...action,
  };
}

function maintenanceActionId(action) {
  const payload = {
    phase: action.phase,
    kind: action.kind,
    severity: action.severity,
    proposedAction: action.proposedAction ?? null,
    node: action.node?.slug ?? null,
    nodes: normalizeMaintenanceActionNodes(action.nodes),
    issue: action.issue
      ? {
          code: action.issue.code,
          slug: action.issue.slug,
          ref: action.issue.ref,
        }
      : null,
    cycle: Array.isArray(action.cycle) ? action.cycle : null,
    reason: action.reason,
  };
  return `maint_${hashString(JSON.stringify(payload))}`;
}

function normalizeMaintenanceActionNodes(nodesValue) {
  if (!nodesValue) return null;
  if (Array.isArray(nodesValue)) return nodesValue.map((node) => node?.slug ?? node).sort();
  if (typeof nodesValue === 'object') {
    return Object.fromEntries(
      Object.entries(nodesValue)
        .map(([key, node]) => [key, node?.slug ?? node])
        .sort(([left], [right]) => left.localeCompare(right)),
    );
  }
  return nodesValue;
}

function normalizeStringSet(value, name, allowedValues = null) {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value)) {
    throw new Error(`${name} must be an array of strings.`);
  }
  const items = [];
  for (const item of value) {
    if (typeof item !== 'string') {
      throw new Error(`${name} must be an array of strings.`);
    }
    const trimmed = item.trim();
    if (!trimmed) {
      throw new Error(`${name} items must be non-empty strings.`);
    }
    if (trimmed !== item) {
      throw new Error(`${name} items must not have leading or trailing whitespace.`);
    }
    if (trimmed.includes('\0')) {
      throw new Error(`${name} items must not contain a null byte.`);
    }
    if (allowedValues && !allowedValues.has(trimmed)) {
      throw new Error(formatAllowedValueError(`${name} items`, trimmed, [...allowedValues]));
    }
    items.push(trimmed);
  }
  return items.length > 0 ? new Set(items) : null;
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function normalizeIterations(value) {
  if (value === undefined || value === null) return 20;
  if (!Number.isInteger(value) || value < 1) {
    throw new Error('iterations must be a positive integer.');
  }
  if (value > 100) {
    throw new Error('iterations must be <= 100.');
  }
  return value;
}

function normalizeRelationType(type) {
  return type === 'depends_on' ? 'dependencies' : type;
}

function publicRelationType(type) {
  return type === 'dependencies' ? 'depends_on' : type;
}

function publicRelationTypes(typeSet) {
  return typeSet ? [...typeSet].map(publicRelationType).sort() : null;
}

function publicRelationCountObject(bucket) {
  const mapped = new Map();
  for (const [relation, count] of bucket.entries()) {
    const publicName = publicRelationType(relation);
    mapped.set(publicName, (mapped.get(publicName) || 0) + count);
  }
  return sortedCountObject(mapped);
}

function requireRelationType(type, name) {
  if (!RELATION_TYPES.has(type)) {
    throw new Error(formatAllowedValueError(name, type, RELATION_TYPE_VALUES));
  }
}

function normalizeDirection(direction, fallback) {
  if (direction === undefined) return fallback;
  if (direction === 'incoming' || direction === 'outgoing' || direction === 'both') return direction;
  if (direction === 'undirected') return 'both';
  throw new Error(formatAllowedValueError('direction', direction, ['incoming', 'outgoing', 'both', 'undirected']));
}

function normalizePathDirection(direction) {
  if (direction === undefined) return 'undirected';
  if (direction === 'incoming' || direction === 'outgoing') return direction;
  if (direction === 'both' || direction === 'undirected') return 'undirected';
  throw new Error(formatAllowedValueError('direction', direction, ['incoming', 'outgoing', 'both', 'undirected']));
}

function normalizeTraversalDirection(direction, fallback) {
  if (direction === undefined) return fallback;
  if (
    direction === 'incoming' ||
    direction === 'outgoing' ||
    direction === 'both' ||
    direction === 'undirected'
  ) {
    return direction;
  }
  throw new Error(formatAllowedValueError('direction', direction, ['incoming', 'outgoing', 'both', 'undirected']));
}

function normalizeDepth(value, fallback) {
  if (value === undefined || value === null) return fallback;
  if (!Number.isInteger(value) || value < 0) {
    throw new Error('depth/maxHops must be a non-negative integer.');
  }
  if (value > 20) {
    throw new Error('depth/maxHops must be <= 20.');
  }
  return value;
}

function normalizeLimit(value, fallback = DEFAULT_LIMIT, name = 'limit', maximum = 500) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  if (value > maximum) {
    throw new Error(`${name} must be <= ${maximum}.`);
  }
  return value;
}

function normalizeSearchBudget(value) {
  return normalizeLimit(
    value,
    DEFAULT_ALL_PATHS_SEARCH_BUDGET,
    'searchBudget',
    MAX_ALL_PATHS_SEARCH_BUDGET,
  );
}

function formatDirectedEdge({ direction, edge }) {
  return {
    direction,
    id: edge.id,
    from: edge.from,
    to: edge.to,
    via: edge.via,
    ref: edge.ref,
    resolved: edge.resolved,
    external: edge.external,
  };
}

function formatPathEdge(edge, traversedFrom, traversedTo) {
  return {
    id: edge.id,
    from: edge.from,
    to: edge.to,
    via: edge.via,
    traversedFrom,
    traversedTo,
  };
}

function formatCompiledEdge(edge) {
  return {
    id: edge.id,
    from: edge.from,
    to: edge.to,
    via: edge.via,
    relationType: publicRelationType(edge.via),
    ref: edge.ref,
    resolved: edge.resolved,
    external: edge.external,
  };
}

function uniqueEdges(edges) {
  const seen = new Set();
  const out = [];
  for (const edge of edges) {
    const key = `${edge.id}:${edge.traversedFrom}:${edge.traversedTo}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(edge);
  }
  return out;
}

function compareEdges(a, b) {
  return edgeSortKey(a).localeCompare(edgeSortKey(b));
}

function edgeSortKey(edge) {
  return `${edge.from}:${edge.via}:${edge.to}:${edge.ref}`;
}
