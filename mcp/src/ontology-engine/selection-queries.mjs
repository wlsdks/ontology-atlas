import { buildMatchEdgesFollowUp, buildMatchNodesFollowUp } from './agent-responses.mjs';
import {
  countEdges,
  edgeAllowed,
  formatPathEdge,
  normalizeDepth,
  normalizeLimit,
  normalizeOptionalBoolean,
  normalizeRelationType,
  normalizeTypes,
  requireRelationType,
  sortedCountObject,
  summarizeNode,
  typeAllowed,
} from './query-primitives.mjs';

export function createSelectionQueries({
  artifact,
  cliPrefix,
  nodes,
  edges,
  nodeBySlug,
  referencedOnlyByRef,
  outgoing,
  incoming,
  resolve,
  resolveWithGrowthHint,
  traversalEdges,
  aliasesFor,
  collectContainmentScope,
  collectLineage,
  compareNodeRows,
  compareEdges,
  containmentChildren,
  containmentParentsFor,
  countBy,
  degreeBucket,
  domainMapRow,
  formatCompiledEdge,
  intersectSlugSets,
  limitedNodeList,
  nearbySchemaPatterns,
  nearestDomainFor,
  normalizeEdgeTargetKind,
  normalizeIterations,
  normalizeMatchEdgesTypes,
  normalizeNodeKind,
  normalizeNodeSort,
  normalizeNonNegativeInteger,
  normalizeOptionalString,
  partitionScopeEdges,
  profileEdgeGroup,
  propagateCommunityLabels,
  publicRelationCountObject,
  publicRelationTypes,
  resolveDomainRoot,
  resolveProjectRoot,
  roundScore,
  schemaPatterns,
  scopeEdgeGroup,
  similarityScore,
  sortedNodesInScope,
  topHubs,
  undirectedAdjacencyFrom,
  writeRelationType,
}) {
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
      // Count of concepts named without a document. The web map and insights
      // count these as concepts too (screen total = nodes + referencedOnly), so
      // reporting it here is what explains the gap between the two entrances.
      // They are not nodes: byKind, centrality, and health below still count only
      // concepts that have a document.
      referencedOnly: referencedOnlyByRef.size,
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
    const followUp = buildMatchNodesFollowUp(page[0], cliPrefix);

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
    const followUp = buildMatchEdgesFollowUp(page[0], cliPrefix);

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
    const semanticDependencyPending = existing.length === 0 && relation === 'dependencies';

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
      proposedAction: existing.length > 0 || semanticDependencyPending
        ? null
        : {
            tool: 'add_relation',
            args: {
              from,
              to,
              type: writeRelationType(relation),
            },
          },
      approvalGate: semanticDependencyPending
        ? {
            status: 'semantic_approval_required',
            writeAllowed: false,
            required: [
              'observable_ability',
              'semantic_rationale',
              'explicit_human_approval',
              'why',
            ],
            next:
              'Explain which observable ability fails without the target, ask for approval of the exact direction and rationale, then call add_relation with a nonblank why.',
          }
        : null,
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
    const center = resolveWithGrowthHint(slugOrAlias, 'slug');
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

  // health() needs both the displayed groups and the complete actionable
  // count. Share that traversal only within this engine and relation filter.
  const componentGroupsByTypes = new Map();

  function connectedComponentGroups(typeSet) {
    const key = JSON.stringify(typeSet ? [...typeSet].sort() : null);
    if (componentGroupsByTypes.has(key)) return componentGroupsByTypes.get(key);
    const visited = new Set();
    const groups = [];

    for (const node of nodes) {
      if (visited.has(node.slug)) continue;
      const queue = [node.slug];
      const slugs = [];
      visited.add(node.slug);

      // Head pointer keeps dequeue O(1) — Array.shift() is O(n) (repo convention)
      let head = 0;
      while (head < queue.length) {
        const current = queue[head++];
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
    componentGroupsByTypes.set(key, groups);
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

  return {
    overview, schema, facets, matchNodes, matchEdges, relationCheck, nodeProfile,
    domainProfile, domainMatrix, projectScope, projectMap, components, communities, similarNodes,
    connectedComponentGroups, componentGroupOnlyHasKinds,
  };
}
