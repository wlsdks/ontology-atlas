import {
  edgeAllowed,
  normalizeDepth,
  normalizeLimit,
  normalizeOptionalBoolean,
  normalizeTypes,
  summarizeNode,
} from '../query-operation/query-primitives.mjs';

/** The character bound every answer keeps (the field-trial response bound). */
const PROJECT_MAP_TEXT_CHARS = 36_000;

/** What surrounds one node, one domain or one project: its edges, lineage, members and hotspots. */
export function createProfileQueries({
  nodeBySlug,
  outgoing,
  incoming,
  resolveWithGrowthHint,
  aliasesFor,
  collectContainmentScope,
  collectLineage,
  compareEdges,
  containmentChildren,
  containmentParentsFor,
  countBy,
  domainMapRow,
  intersectSlugSets,
  limitedNodeList,
  partitionScopeEdges,
  profileEdgeGroup,
  resolveDomainRoot,
  resolveProjectRoot,
  scopeEdgeGroup,
  sortedNodesInScope,
  topHubs,
}) {
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

  /**
   * The project map whose pretty JSON fits `PROJECT_MAP_TEXT_CHARS`: per-domain lists are cut
   * from the asked `itemLimit` until it fits, so a large map never answers past the bound.
   * At most log2(itemLimit) builds.
   */
  function projectMap(slugOrAlias, options = {}) {
    const requestedItemLimit = normalizeLimit(options.itemLimit, 20, 'itemLimit');
    let itemLimit = requestedItemLimit;
    let map = buildProjectMap(slugOrAlias, options, itemLimit);
    while (itemLimit > 1 && JSON.stringify(map, null, 2).length > PROJECT_MAP_TEXT_CHARS) {
      itemLimit = Math.max(1, Math.floor(itemLimit / 2));
      map = buildProjectMap(slugOrAlias, options, itemLimit);
    }
    if (itemLimit === requestedItemLimit) return map;
    return {
      ...map,
      narrowedToFit: {
        requestedItemLimit,
        itemLimit,
        next: `Lists were cut to ${itemLimit} per domain to keep this answer under ${PROJECT_MAP_TEXT_CHARS} characters; query_ontology({operation:"domain_profile", slug}) lists one domain in full.`,
      },
    };
  }

  function buildProjectMap(slugOrAlias, options, itemLimit) {
    const limit = normalizeLimit(options.limit, 50);
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

  return { nodeProfile, domainProfile, projectScope, projectMap };
}
