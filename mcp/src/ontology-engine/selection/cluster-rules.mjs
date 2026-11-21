import { countEdges, summarizeNode, typeAllowed } from '../query-operation/query-primitives.mjs';

/**
 * The connected groups of `nodes`, largest first, each with its slugs sorted. `neighborsOf(slug)`
 * yields rows with a `next` slug. Breadth-first from every unvisited node: O(nodes + edges).
 */
export function connectedComponents(nodes, neighborsOf) {
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

      for (const { next } of neighborsOf(current)) {
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

/**
 * Groups nodes by their propagated community label and measures each group: size, edges inside and
 * across its boundary, kinds, domains and its best-connected node. Groups are largest first.
 * O(communities · edges), since each group scans every edge once.
 */
export function groupCommunities({ nodes, edges, labels, typeSet, nodeBySlug }) {
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
      kinds: countEdges(groupNodes, 'kind'),
      domains: countEdges(groupNodes, 'domain'),
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
  return { groups, communityBySlug, crossCommunityEdges };
}
