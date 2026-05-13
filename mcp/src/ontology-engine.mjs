const DEFAULT_LIMIT = 100;
const DOWNWARD_CONTAINMENT_TYPES = new Set(['domains', 'capabilities', 'elements', 'contains']);
const UPWARD_CONTAINMENT_TYPES = new Set(['domain']);

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
  if (operation === 'workspace_brief') {
    return engine.workspaceBrief(query);
  }
  if (operation === 'health') {
    return engine.health(query);
  }

  throw new Error(
    'operation must be one of: neighbors, path, impact, blast_radius, subgraph, overview, schema, facets, match_nodes, match_edges, node_profile, domain_profile, domain_matrix, project_scope, project_map, relation_check, components, lineage, containment_tree, cycles, topological_order, recommend_relations, growth_plan, workspace_brief, health.',
  );
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
        limited: enrichedNodes.length >= limit,
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

  function overview(options = {}) {
    const limit = normalizeLimit(options.limit ?? 10);
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
    const limit = normalizeLimit(options.limit ?? 50);
    const patterns = schemaPatterns();

    return {
      operation: 'schema',
      totalPatterns: patterns.length,
      limited: patterns.length > limit,
      patterns: patterns.slice(0, limit),
    };
  }

  function facets(options = {}) {
    const limit = normalizeLimit(options.limit ?? 10);
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
    const kind = normalizeOptionalString(options.kind);
    const domain = normalizeOptionalString(options.domain);
    const slugContains = normalizeOptionalString(options.slugContains)?.toLowerCase() || null;
    const minDegree = normalizeNonNegativeInteger(options.minDegree);
    const maxDegree = normalizeNonNegativeInteger(options.maxDegree);
    const minInDegree = normalizeNonNegativeInteger(options.minInDegree);
    const minOutDegree = normalizeNonNegativeInteger(options.minOutDegree);
    const hasIncoming = typeof options.hasIncoming === 'boolean' ? options.hasIncoming : null;
    const hasOutgoing = typeof options.hasOutgoing === 'boolean' ? options.hasOutgoing : null;
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
      nodes: rows.slice(0, limit),
    };
  }

  function matchEdges(options = {}) {
    const limit = normalizeLimit(options.limit);
    const typeSet = normalizeTypes(
      Array.isArray(options.types) && options.types.length > 0
        ? options.types
        : [options.type ?? options.relation].filter(Boolean),
    );
    const from = typeof options.from === 'string' && options.from.trim()
      ? resolve(options.from, 'from')
      : null;
    const to = typeof options.to === 'string' && options.to.trim()
      ? resolve(options.to, 'to')
      : null;
    const fromKind = normalizeOptionalString(options.fromKind);
    const toKind = normalizeOptionalString(options.toKind);
    const includeExternal = options.includeExternal === true;
    const includeUnresolved = options.includeUnresolved === true;
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

    return {
      operation: 'match_edges',
      filters: {
        from,
        to,
        fromKind,
        toKind,
        types: typeSet ? [...typeSet].sort() : null,
        includeExternal,
        includeUnresolved,
      },
      totalMatches: matches.length,
      limited: matches.length > limit,
      edges: matches.slice(0, limit),
    };
  }

  function relationCheck(options = {}) {
    const from = resolve(options.from, 'from');
    const to = resolve(options.to, 'to');
    const relationInput = options.type ?? options.relation;
    if (typeof relationInput !== 'string' || !relationInput.trim()) {
      throw new Error('type (string) is required for relation_check.');
    }
    const relation = normalizeRelationType(relationInput.trim());
    const fromKind = nodeBySlug.get(from)?.kind || 'unknown';
    const toKind = nodeBySlug.get(to)?.kind || 'unknown';
    const existing = edges.filter(
      (edge) => edge.from === from && edge.to === to && edge.via === relation && edge.resolved,
    );
    const matchedPattern = schemaPatterns().find(
      (pattern) =>
        pattern.fromKind === fromKind &&
        pattern.relation === relation &&
        pattern.toKind === toKind,
    );
    const verdict = existing.length > 0
      ? 'already_exists'
      : matchedPattern
        ? 'matches_existing_schema'
        : 'new_schema_pattern';

    return {
      operation: 'relation_check',
      from,
      to,
      relation,
      fromKind,
      toKind,
      exists: existing.length > 0,
      verdict,
      matchingEdges: existing.map(formatCompiledEdge),
      schemaPattern: matchedPattern || null,
    };
  }

  function nodeProfile(slugOrAlias, options = {}) {
    const center = resolve(slugOrAlias, 'slug');
    const limit = normalizeLimit(options.limit ?? 20);
    const depth = normalizeDepth(options.depth, 3);
    const includeExternal = options.includeExternal !== false;
    const includeUnresolved = options.includeUnresolved !== false;
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
    const limit = normalizeLimit(options.limit ?? 100);
    const itemLimit = normalizeLimit(options.itemLimit ?? 20);
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
    const limit = normalizeLimit(options.limit ?? 100);
    const project = normalizeOptionalString(options.project ?? options.slug);
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
        fromNode: summarizeNode(nodeBySlug.get(row.from)),
        toNode: summarizeNode(nodeBySlug.get(row.to)),
        examples: row.examples,
      }))
      .sort((a, b) => b.count - a.count || a.from.localeCompare(b.from) || a.to.localeCompare(b.to));

    return {
      operation: 'domain_matrix',
      project: project ? resolveProjectRoot(project) : null,
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
    const limit = normalizeLimit(options.limit ?? 200);
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
    const limit = normalizeLimit(options.limit ?? 50);
    const itemLimit = normalizeLimit(options.itemLimit ?? 20);
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

  function components(options = {}) {
    const limit = normalizeLimit(options.limit ?? 20);
    const nodeLimit = normalizeLimit(options.nodeLimit ?? 25);
    const typeSet = normalizeTypes(options.types);
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
    const root = normalizeOptionalString(slugOrAlias);
    const depth = normalizeDepth(options.depth, 20);
    const limit = normalizeLimit(options.limit ?? 200);
    const includeOrphans = options.includeOrphans === true;
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
    const rows = edges
      .filter((edge) => edge.external && edge.via === 'elements')
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

    return limitedCandidateGroup(rows, limit);
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
    const limit = normalizeLimit(options.limit ?? 20);
    const maxDepth = normalizeDepth(options.maxHops ?? options.depth, 8);
    const typeSet = normalizeTypes(options.types ?? ['dependencies']);
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
    const limit = normalizeLimit(options.limit ?? 100);
    const typeSet = normalizeTypes(options.types ?? ['dependencies']);
    const includeIsolated = options.includeIsolated === true;
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
    const limit = normalizeLimit(options.limit ?? 50);
    const kindFilter = typeof options.kind === 'string' && options.kind.trim()
      ? options.kind.trim()
      : null;
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
    const limit = normalizeLimit(options.limit ?? 25);
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

  function workspaceBrief(options = {}) {
    const limit = normalizeLimit(options.limit ?? 10);
    const overviewResult = overview({ limit });
    const healthResult = health({
      limit,
      componentLimit: limit,
      cycleLimit: limit,
      recommendationLimit: limit,
      orderLimit: limit,
      nodeLimit: limit,
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

  function health(options = {}) {
    const limit = normalizeLimit(options.limit ?? 10);
    const overviewResult = overview({ limit });
    const componentResult = components({
      limit: normalizeLimit(options.componentLimit ?? 5),
      nodeLimit: normalizeLimit(options.nodeLimit ?? 10),
      types: options.componentTypes ?? options.types,
    });
    const cycleResult = cycles({
      limit: normalizeLimit(options.cycleLimit ?? 5),
      maxHops: options.maxHops ?? options.depth,
      types: options.dependencyTypes ?? ['dependencies'],
    });
    const recommendationResult = recommendRelations({
      limit: normalizeLimit(options.recommendationLimit ?? 20),
    });
    const orderResult = topologicalOrder({
      limit: normalizeLimit(options.orderLimit ?? 20),
      types: options.dependencyTypes ?? ['dependencies'],
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
        status: componentResult.totalComponents <= 1 ? 'pass' : 'info',
        count: componentResult.totalComponents,
        message:
          componentResult.totalComponents <= 1
            ? 'The resolved ontology graph is connected.'
            : 'The resolved ontology graph has disconnected islands; this can be intentional for README or reference nodes.',
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
        largestComponentSize: componentResult.largestSize,
        singletonComponents: componentResult.singletonCount,
        dependencyCycles: cycleResult.totalCycles,
        relationRecommendations: recommendationResult.totalRecommendations,
        dependencyOrderAcyclic: orderResult.acyclic,
      },
      checks,
      components: {
        totalComponents: componentResult.totalComponents,
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
    return {
      total: rows.length,
      byRelation: countEdges(rows, 'via'),
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
        kind: 'resolve_dangling_references',
        severity: 'warn',
        count: growthResult.summary.danglingReferences,
        message: 'Resolve dangling graph references or create the missing ontology nodes.',
        sample: growthResult.danglingReferences.rows.slice(0, Math.min(3, limit)),
      });
    }
    if (growthResult.summary.externalElementRefs > 0) {
      actions.push({
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
    workspaceBrief,
    health,
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
  const counts = new Map();
  for (const item of items) {
    const value = item[key];
    if (typeof value !== 'string' || !value.trim()) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return sortedCountObject(counts);
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

function normalizeTypes(types) {
  if (!Array.isArray(types) || types.length === 0) return null;
  return new Set(types.filter((type) => typeof type === 'string').map(normalizeRelationType));
}

function normalizeOptionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeNonNegativeInteger(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.trunc(value));
}

function normalizeNodeSort(value) {
  if (
    value === 'slug' ||
    value === 'inDegree' ||
    value === 'outDegree' ||
    value === 'degree'
  ) {
    return value;
  }
  return 'degree';
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

function formatCompiledEdge(edge) {
  return {
    id: edge.id,
    from: edge.from,
    to: edge.to,
    via: edge.via,
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
