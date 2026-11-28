import {
  edgeAllowed,
  edgeSortKey,
  formatDirectedEdge,
  formatPathEdge,
  normalizeDepth,
  normalizeDirection,
  normalizeLimit,
  normalizeOptionalBoolean,
  normalizePathDirection,
  normalizeTypes,
  summarizeNode,
  typeAllowed,
} from '../query-operation/query-primitives.mjs';
import { compareText } from '../../compare-text.mjs';

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
      compareText(`${a.direction}:${edgeSortKey(a.edge)}`, `${b.direction}:${edgeSortKey(b.edge)}`),
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
    const queue = [{ slug: from, depth: 0, parent: null, edge: null }];
    const visited = new Set([from]);
  
    // BFS retains O(V) predecessor state and projects only the selected path.
    let head = 0;
    while (head < queue.length) {
      const currentIndex = head++;
      const current = queue[currentIndex];
      if (current.depth >= maxHops) continue;
      for (const { next, edge } of traversalEdges(current.slug, direction, typeSet)) {
        if (visited.has(next)) continue;
        if (next === to) {
          const hops = [next];
          const edges = [formatPathEdge(edge, current.slug, next)];
          let step = current;
          while (step.parent !== null) {
            const previous = queue[step.parent];
            hops.push(step.slug);
            edges.push(formatPathEdge(step.edge, previous.slug, step.slug));
            step = previous;
          }
          hops.push(from);
          hops.reverse();
          edges.reverse();
          return {
            operation: 'path',
            from,
            to,
            found: true,
            hopCount: hops.length - 1,
            hops,
            nodes: pathNodes(hops),
            edges,
          };
        }
        visited.add(next);
        queue.push({ slug: next, depth: current.depth + 1, parent: currentIndex, edge });
      }
    }
  
    return { operation: 'path', from, to, found: false, maxHops, hops: [], nodes: [], edges: [] };
  }
  
  
  function pathNodes(hops) {
    return hops.map((slug) => summarizeNode(nodeBySlug.get(slug))).filter(Boolean);
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
    const keyed = candidates.map((candidate) => ({
      candidate,
      key: `${candidate.next}:${edgeSortKey(candidate.edge)}`,
    }));
    keyed.sort((left, right) => compareText(left.key, right.key));
    return keyed.map(({ candidate }) => candidate);
  }
  
  
  return { filteredEdges, neighbors, path, pathNodes, traversalEdges };
}
