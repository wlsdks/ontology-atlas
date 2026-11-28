import { formatCompiledEdge, typeAllowed } from '../query-operation/query-primitives.mjs';

/**
 * Gives each scoped node its nearest domain, counting it on that domain's row of `domainStats`.
 * O(nodes · containment parents) through `nearestDomainFor`.
 */
export function assignNodesToDomains({ scopedNodes, scope, nearestDomainFor, domainStats }) {
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
  return { domainForNode, assignedNodes };
}

/**
 * Classifies every edge that starts inside the scope as inside one domain, across two domains,
 * external or unresolved, adding to the rows of `domainStats` and grouping the cross-domain edges
 * by domain pair with up to three example edges each. O(edges).
 */
export function tallyDomainEdges({ edges, scope, typeSet, domainForNode, domainStats }) {
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
  return { connectionMap, selfDomainEdges, crossDomainEdges, externalEdges, unresolvedEdges };
}
