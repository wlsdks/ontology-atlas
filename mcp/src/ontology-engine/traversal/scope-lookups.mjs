import { summarizeNode } from '../query-operation/query-primitives.mjs';
import { compareText } from '../../compare-text.mjs';

/** Which nodes sit under a project or domain, and which domain a node belongs to. */
export function createScopeLookups({
  nodes,
  nodeBySlug,
  resolve,
  resolveOptional,
  containmentChildren,
  containmentParentsFor,
  partitionScopeEdges,
  topHubs,
}) {
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

  function collectContainmentScope(rootSlug) {
    const included = new Set([rootSlug]);
    const queue = [rootSlug];
    // Head pointer keeps dequeue O(1) — Array.shift() is O(n) (repo convention)
    let head = 0;
    while (head < queue.length) {
      const current = queue[head++];
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
    // Head pointer keeps dequeue O(1) — Array.shift() is O(n) (repo convention)
    let head = 0;
    while (head < queue.length) {
      const current = queue[head++];
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
      .sort((a, b) => compareText(a.slug, b.slug));
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

  function limitedNodeList(rows, limit) {
    return {
      total: rows.length,
      limited: rows.length > limit,
      nodes: rows.slice(0, limit).map(summarizeNode),
    };
  }

  return {
    resolveProjectRoot, projectRootSlugs, collectContainmentScope,
    nearestDomainFor, intersectSlugSets, sortedNodesInScope, domainMapRow, limitedNodeList,
  };
}
