import {
  countEdges,
  edgeAllowed,
  edgeSortKey,
  formatDirectedEdge,
  formatPathEdge,
  normalizeDepth,
  normalizeDirection,
  normalizeLimit,
  normalizeOptionalBoolean,
  normalizePathDirection,
  normalizeSearchBudget,
  normalizeTypes,
  sortedCountObject,
  summarizeNode,
  typeAllowed,
} from './query-primitives.mjs';

export function createTraversalQueries({
  resolve,
  nodeBySlug,
  outgoing,
  incoming,
}) {
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
  
    // Head pointer keeps dequeue O(1) — Array.shift() is O(n) (repo convention)
    let head = 0;
    while (head < queue.length) {
      const current = queue[head++];
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
  
  
  return { allPaths, filteredEdges, neighbors, path, pathNodes, traversalEdges };
}
