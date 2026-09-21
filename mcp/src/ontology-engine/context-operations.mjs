import {
  countEdgeMap,
  countEdges,
  edgeSortKey,
  formatPathEdge,
  sortedCountObject,
  summarizeNode,
  typeAllowed,
} from './query-primitives.mjs';

export function createContextOperations({
  artifact,
  edges,
  nodeBySlug,
  aliasToSlug,
  outgoing,
  incoming,
  traversalEdges,
  formatCompiledEdge,
  compareEdges,
  publicRelationCountObject,
  downwardContainmentTypes,
  upwardContainmentTypes,
}) {
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

  function nearbySchemaPatterns({ fromKind, relation, toKind, matchedPattern }) {
    return schemaPatterns()
      .filter((pattern) => pattern !== matchedPattern)
      .map((pattern) => ({
        ...pattern,
        similarity:
          (pattern.fromKind === fromKind ? 1 : 0) +
          (pattern.relation === relation ? 1 : 0) +
          (pattern.toKind === toKind ? 1 : 0),
      }))
      .filter((pattern) => pattern.similarity > 0)
      .sort((a, b) => {
        if (b.similarity !== a.similarity) return b.similarity - a.similarity;
        if (b.count !== a.count) return b.count - a.count;
        return (
          a.fromKind.localeCompare(b.fromKind) ||
          a.relation.localeCompare(b.relation) ||
          a.toKind.localeCompare(b.toKind)
        );
      })
      .slice(0, 5);
  }

  function writeRelationType(relation) {
    return relation === 'dependencies' ? 'depends_on' : relation;
  }

  function resolvedEdgesBetween(from, to, typeSet) {
    return edges
      .filter((edge) => {
        if (!edge.resolved || !typeAllowed(edge.via, typeSet)) return false;
        return (edge.from === from && edge.to === to) || (edge.from === to && edge.to === from);
      })
      .sort(compareEdges)
      .map((edge) => ({
        ...formatCompiledEdge(edge),
        direction: edge.from === from && edge.to === to ? 'outgoing' : 'incoming',
        fromNode: summarizeNode(nodeBySlug.get(edge.from)),
        toNode: summarizeNode(nodeBySlug.get(edge.to)),
      }));
  }

  function commonNeighborRows(from, to, typeSet, limit) {
    const fromNeighbors = explainNeighborMap(from, typeSet);
    const toNeighbors = explainNeighborMap(to, typeSet);
    const rows = [];
    for (const slug of [...fromNeighbors.keys()].sort()) {
      if (!toNeighbors.has(slug)) continue;
      rows.push({
        slug,
        node: summarizeNode(nodeBySlug.get(slug)),
        fromEdges: fromNeighbors.get(slug).slice(0, limit),
        toEdges: toNeighbors.get(slug).slice(0, limit),
      });
    }
    return rows.sort((a, b) => {
      const aDegree = (a.node?.inDegree || 0) + (a.node?.outDegree || 0);
      const bDegree = (b.node?.inDegree || 0) + (b.node?.outDegree || 0);
      return bDegree - aDegree || a.slug.localeCompare(b.slug);
    });
  }

  function explainNeighborMap(slug, typeSet) {
    const byNeighbor = new Map();
    for (const { next, edge } of traversalEdges(slug, 'both', typeSet)) {
      if (!byNeighbor.has(next)) byNeighbor.set(next, []);
      byNeighbor.get(next).push({
        ...formatPathEdge(edge, slug, next),
        direction: edge.from === slug ? 'outgoing' : 'incoming',
        via: edge.via,
      });
    }
    for (const rows of byNeighbor.values()) {
      rows.sort((a, b) => edgeSortKey(a).localeCompare(edgeSortKey(b)));
    }
    return byNeighbor;
  }

  function relationVerdict(from, to, directEdges, shortest, commonNeighbors) {
    if (from === to) return 'same_node';
    if (directEdges.length > 0) return 'direct';
    if (shortest.found) return 'path';
    if (commonNeighbors.length > 0) return 'common_neighbor';
    return 'unrelated_within_hops';
  }

  function patternLayer(step, relation, paths) {
    const slugs = [...new Set(paths.map((row) => row.slug))].sort();
    return {
      step,
      relation,
      totalPaths: paths.length,
      totalNodes: slugs.length,
      nodes: slugs.map((slug) => summarizeNode(nodeBySlug.get(slug))),
    };
  }

  function traversalEstimate(start, direction, typeSet, depth) {
    const visited = new Set([start]);
    let frontier = [start];
    let edgeScans = 0;
    let potentialPathUpperBound = 1;
    const frontierByDepth = [];

    for (let distance = 1; distance <= depth; distance += 1) {
      const next = new Set();
      let candidateEdges = 0;
      for (const slug of frontier) {
        const candidates = traversalEdges(slug, direction, typeSet);
        candidateEdges += candidates.length;
        for (const { next: nextSlug } of candidates) {
          if (!visited.has(nextSlug)) next.add(nextSlug);
        }
      }
      edgeScans += candidateEdges;
      potentialPathUpperBound *= Math.max(1, candidateEdges);
      for (const slug of next) visited.add(slug);
      frontierByDepth.push({
        distance,
        frontierNodes: frontier.length,
        candidateEdges,
        newNodes: next.size,
      });
      frontier = [...next].sort();
      if (frontier.length === 0) break;
    }

    return {
      edgeScans,
      reachableWithinDepth: visited.size - 1,
      potentialPathUpperBound,
      frontierByDepth,
    };
  }

  function containmentTraversalEdges(slug, mode) {
    const candidates = [];
    if (mode === 'descendants') {
      for (const edge of outgoing.get(slug) || []) {
        if (!edge.resolved || !downwardContainmentTypes.has(edge.via)) continue;
        candidates.push({ next: edge.to, edge });
      }
      for (const edge of incoming.get(slug) || []) {
        if (!edge.resolved || !upwardContainmentTypes.has(edge.via)) continue;
        candidates.push({ next: edge.from, edge });
      }
    } else {
      for (const edge of incoming.get(slug) || []) {
        if (!edge.resolved || !downwardContainmentTypes.has(edge.via)) continue;
        candidates.push({ next: edge.from, edge });
      }
      for (const edge of outgoing.get(slug) || []) {
        if (!edge.resolved || !upwardContainmentTypes.has(edge.via)) continue;
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

  function hasResolvedContainmentParent(slug) {
    return (incoming.get(slug) || []).some(
      (edge) => edge.resolved && (edge.via === 'elements' || edge.via === 'contains'),
    );
  }

  function aliasesFor(slug) {
    return (Array.isArray(artifact?.aliases) ? artifact.aliases : [])
      .filter((entry) => entry.slug === slug)
      .map((entry) => entry.alias)
      .sort();
  }

  function profileEdgeGroup(rows, direction, limit) {
    const relationCounts = countEdgeMap(rows, 'via');
    return {
      total: rows.length,
      byRelation: sortedCountObject(relationCounts),
      byRelationType: publicRelationCountObject(relationCounts),
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
        id: 'add_missing_relations',
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
        id: 'resolve_dangling_references',
        kind: 'resolve_dangling_references',
        severity: 'warn',
        count: growthResult.summary.danglingReferences,
        message: 'Resolve dangling graph references or create the missing ontology nodes.',
        sample: growthResult.danglingReferences.rows.slice(0, Math.min(3, limit)),
      });
    }
    if (growthResult.summary.externalElementRefs > 0) {
      actions.push({
        id: 'materialize_external_elements',
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

  return { schemaPatterns, nearbySchemaPatterns, writeRelationType, resolvedEdgesBetween, commonNeighborRows, relationVerdict, patternLayer, traversalEstimate, containmentTraversalEdges, containmentChildren, containmentParentsFor, resolveOptional, hasResolvedEdge, hasResolvedContainmentParent, aliasesFor, profileEdgeGroup, scopeEdgeGroup, partitionScopeEdges, inferKindFromRelation, workspaceNextActions };
}
