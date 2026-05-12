const DEFAULT_LIMIT = 100;

export function queryCompiledOntology(artifact, query = {}) {
  const operation = query.operation;
  const engine = createOntologyEngine(artifact);

  if (operation === 'neighbors') {
    return engine.neighbors(query.slug, query);
  }
  if (operation === 'path') {
    return engine.path(query.from, query.to, query);
  }
  if (operation === 'impact') {
    return engine.impact(query.slug, query);
  }
  if (operation === 'subgraph') {
    return engine.subgraph(query.slug ?? query.seed, query);
  }

  throw new Error('operation must be one of: neighbors, path, impact, subgraph.');
}

export function createOntologyEngine(artifact) {
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
    const includeExternal = options.includeExternal === true;
    const includeUnresolved = options.includeUnresolved === true;
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
    const rows = filteredEdges(center, options).slice(0, limit);
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
      total: rows.length,
      limited: rows.length >= limit,
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
      return { operation: 'path', from, to, found: true, hopCount: 0, hops: [from], edges: [] };
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
            edges: nextEdges,
          };
        }
        visited.add(next);
        queue.push({ slug: next, hops: nextHops, edges: nextEdges });
      }
    }

    return { operation: 'path', from, to, found: false, maxHops, hops: [], edges: [] };
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

    while (queue.length > 0 && discovered.size < limit + 1) {
      const current = queue.shift();
      if (current.distance >= depth) continue;
      for (const { next, edge } of traversalEdges(current.slug, direction, typeSet)) {
        collectedEdges.push(formatPathEdge(edge, current.slug, next));
        if (discovered.has(next)) continue;
        const item = { slug: next, distance: current.distance + 1 };
        discovered.set(next, item);
        queue.push(item);
        if (discovered.size >= limit + 1) break;
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
      limited: nodeRows.length >= limit,
      nodes: nodeRows.slice(0, limit).map((row) => ({
        ...row,
        node: nodeBySlug.get(row.slug),
      })),
      edges: uniqueEdges(collectedEdges).slice(0, limit),
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

    while (queue.length > 0 && discovered.size < limit) {
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
        if (discovered.size >= limit) {
          limited = i < candidates.length - 1 || queue.length > 0;
          break;
        }
      }
    }

    const nodeRows = [...discovered.values()].sort(
      (a, b) => a.distance - b.distance || a.slug.localeCompare(b.slug),
    );
    const allowedSlugs = new Set(nodeRows.map((row) => row.slug));
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
      limited,
      nodes: nodeRows.map((row) => ({
        ...row,
        node: nodeBySlug.get(row.slug),
      })),
      edges: internalEdges,
    };
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

  return { resolve, neighbors, path, impact, subgraph };
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

function normalizeTypes(types) {
  if (!Array.isArray(types) || types.length === 0) return null;
  return new Set(types.filter((type) => typeof type === 'string').map(normalizeRelationType));
}

function normalizeRelationType(type) {
  return type === 'depends_on' ? 'dependencies' : type;
}

function normalizeDirection(direction, fallback) {
  if (direction === 'incoming' || direction === 'outgoing' || direction === 'both') return direction;
  return fallback;
}

function normalizePathDirection(direction) {
  if (direction === 'incoming' || direction === 'outgoing') return direction;
  return 'undirected';
}

function normalizeDepth(value, fallback) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(20, Math.trunc(value)));
}

function normalizeLimit(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(500, Math.trunc(value)));
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
