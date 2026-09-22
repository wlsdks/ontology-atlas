import {
  countEdges,
  edgeSortKey,
  formatPathEdge,
  normalizeDepth,
  normalizeDirection,
  normalizeLimit,
  normalizePathDirection,
  normalizeTypes,
  summarizeNode,
  typeAllowed,
} from './query-primitives.mjs';

export function createTraversalAnalysis({
  artifact,
  nodes,
  edges,
  nodeBySlug,
  sourceDocBySlug,
  resolve,
  path,
  pathNodes,
  traversalEdges,
  buildDependencyImpactQualification,
  builderFocusParam,
  commonNeighborRows,
  compareCentralityRows,
  countBy,
  nearestDomainFor,
  normalizeBuilderFocusInput,
  normalizeCanvasPosition,
  normalizeDependencyImpactTypes,
  normalizeIterations,
  normalizePattern,
  normalizeTraversalDirection,
  pageRankScores,
  patternLayer,
  qualifyDeclaredDependencyEdges,
  relationVerdict,
  resolvedEdgesBetween,
  roundScore,
  uniqueEdges,
}) {
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

    // Head pointer keeps dequeue O(1) — Array.shift() is O(n) (repo convention)
    let head = 0;
    while (head < queue.length && discovered.size < limit + 2) {
      const current = queue[head++];
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
    const typeSet = normalizeDependencyImpactTypes(options.types);
    const discovered = new Map([[center, { slug: center, distance: 0 }]]);
    const collectedEdges = [];
    const queue = [{ slug: center, distance: 0 }];

    // Head pointer keeps dequeue O(1) — Array.shift() is O(n) (repo convention)
    let head = 0;
    while (head < queue.length && discovered.size < limit + 2) {
      const current = queue[head++];
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
    const edgeRows = qualifyDeclaredDependencyEdges(uniqueEdges(collectedEdges));

    return {
      operation: 'impact',
      center,
      direction,
      depth,
      total: nodeRows.length,
      limited: nodeRows.length > limit,
      qualification: buildDependencyImpactQualification(edgeRows),
      nodes: nodeRows.slice(0, limit).map((row) => ({
        ...row,
        node: nodeBySlug.get(row.slug),
      })),
      edges: edgeRows.slice(0, limit),
    };
  }

  function blastRadius(slugOrAlias, options = {}) {
    const center = resolve(slugOrAlias, 'slug');
    const direction = normalizeDirection(options.direction, 'incoming');
    const depth = normalizeDepth(options.depth, 2);
    const limit = normalizeLimit(options.limit);
    const typeSet = normalizeDependencyImpactTypes(options.types);
    const allSlugs = new Set(nodes.map((node) => node.slug));
    const discovered = new Map([[center, { slug: center, distance: 0 }]]);
    const collectedEdges = [];
    const queue = [{ slug: center, distance: 0 }];

    // Head pointer keeps dequeue O(1) — Array.shift() is O(n) (repo convention)
    let head = 0;
    while (head < queue.length && discovered.size < limit + 2) {
      const current = queue[head++];
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
          rationale: edge.rationale ?? null,
          qualification: edge.rationale ? 'declared_with_rationale' : 'review_required',
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
    const qualification = buildDependencyImpactQualification(edgeRows);

    return {
      operation: 'blast_radius',
      center,
      node: summarizeNode(nodeBySlug.get(center)),
      direction,
      depth,
      risk: 'unknown',
      qualification,
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

    // Head pointer keeps dequeue O(1) — Array.shift() is O(n) (repo convention)
    let head = 0;
    while (head < queue.length && discovered.size < limit + 1) {
      const current = queue[head++];
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

  function builderContext(slugOrAlias, options = {}) {
    const focus = resolve(normalizeBuilderFocusInput(slugOrAlias), 'slug');
    const focusNode = nodeBySlug.get(focus);
    const focusParam = builderFocusParam(focusNode);
    const direction = normalizeDirection(options.direction, 'both');
    const depth = normalizeDepth(options.depth, 1);
    const slice = subgraph(focus, { ...options, direction, depth });
    const rows = slice.nodes.map((row) => {
      const sourceDoc = sourceDocBySlug.get(row.slug);
      return {
        ...row,
        node: summarizeNode(row.node),
        canvasPosition: normalizeCanvasPosition(sourceDoc?.frontmatter?.canvasPosition),
        expected_mtime: row.node?.mtime ?? sourceDoc?.mtime ?? null,
      };
    });

    return {
      operation: 'builder_context',
      source: 'persisted_vault',
      focus,
      builder: {
        // `/ontology/studio` is a retired legacy redirect, so this handed every agent an address
        // the vault's own `ontology-edit-redirect` element declares "not a navigation destination".
        // This is the address that redirect already resolves to (standing decision 92, 2026-08-21),
        // so the hop disappears and the destination does not change.
        //
        // App-relative and locale-less on purpose: routes are locale-prefixed (`/en`, `/ko`) and a
        // Pages deployment adds a base path, neither of which the server knows. A caller composes
        // the absolute URL from the workbench origin plus its own locale.
        href: `/topology/?p=${encodeURIComponent(focusParam)}&workbench=edit`,
        focusParam,
        unsavedDraftsIncluded: false,
      },
      direction,
      depth,
      totalNodes: slice.totalNodes,
      totalEdges: slice.totalEdges,
      limited: slice.limited,
      nodes: rows,
      edges: slice.edges,
      agentHandoff: {
        writeTools: ['add_concepts', 'relation_check', 'add_relations', 'patch_concept'],
        constraints: [
          'Only persisted vault documents are visible; unsaved Workshop drafts must be saved before MCP can inspect them.',
          'Run relation_check before add_relations when introducing a new edge pattern.',
          'Use patch_concept with the row expected_mtime when changing canvasPosition or other existing frontmatter.',
          'Re-run builder_context after writes to verify the persisted graph and Workshop handoff.',
        ],
      },
    };
  }

  return { centrality, explainRelation, reachability, patternWalk, impact, blastRadius, subgraph, builderContext };
}
