import { buildMatchEdgesFollowUp, buildMatchNodesFollowUp } from '../briefs/agent-responses.mjs';
import {
  edgeAllowed,
  normalizeLimit,
  normalizeOptionalBoolean,
  normalizeRelationType,
  normalizeTypes,
  requireRelationType,
  summarizeNode,
} from '../query-operation/query-primitives.mjs';
import {
  edgeTargetKindLabel,
  edgeTargetKindMatches,
  judgeRelationCheck,
  nodeDegree,
  nodeMatchesFilters,
} from './match-rules.mjs';
import { compareText } from '../../compare-text.mjs';

/** Which nodes and edges meet a condition or resemble a given node, and whether a proposed relation is new, present or off-pattern. */
export function createMatchQueries({
  edges,
  nodes,
  nodeBySlug,
  resolve,
  traversalEdges,
  compareEdges,
  compareNodeRows,
  formatCompiledEdge,
  nearbySchemaPatterns,
  normalizeEdgeTargetKind,
  normalizeMatchEdgesTypes,
  normalizeNodeKind,
  normalizeNodeSort,
  normalizeNonNegativeInteger,
  normalizeOptionalString,
  publicRelationTypes,
  roundScore,
  schemaPatterns,
  similarityScore,
  writeRelationType,
}) {
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

    const filters = {
      kind, domain, slugContains, minDegree, maxDegree, minInDegree, minOutDegree, hasIncoming, hasOutgoing,
    };

    for (const node of nodes) {
      if (!nodeMatchesFilters(node, filters)) continue;
      rows.push({
        ...summarizeNode(node),
        degree: nodeDegree(node),
      });
    }

    rows.sort((left, right) => compareNodeRows(left, right, sort));

    const page = rows.slice(0, limit);
    const followUp = buildMatchNodesFollowUp(page[0]);

    return {
      operation: 'match_nodes',
      filters: {
        ...filters,
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
      if (toKind && !edgeTargetKindMatches(edge, toNode, toKind)) continue;

      matches.push({
        ...formatCompiledEdge(edge),
        fromNode: summarizeNode(fromNode),
        toNode: summarizeNode(toNode),
        toKind: edgeTargetKindLabel(edge, toNode),
      });
    }

    const page = matches.slice(0, limit);
    const followUp = buildMatchEdgesFollowUp(page[0]);

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
    const { verdict, recommendation, proposedAction, approvalGate } = judgeRelationCheck({
      existing, inverse, matchedPattern, from, to, fromKind, relation, toKind, writeRelationType,
    });

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
      proposedAction,
      approvalGate,
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
      const targetNeighbors = sourceNeighbors.size > 0 ? new Set(
        traversalEdges(node.slug, 'undirected', typeSet).map((row) => row.next),
      ) : sourceNeighbors;
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
        sharedNeighbors: [...(sourceNeighbors.size <= targetNeighbors.size ? sourceNeighbors : targetNeighbors)]
          .filter((slug) => sourceNeighbors.has(slug) && targetNeighbors.has(slug))
          .sort()
          .map((slug) => summarizeNode(nodeBySlug.get(slug))),
      });
    }

    rows.sort((a, b) => b.score - a.score || compareText(a.node.slug, b.node.slug));

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

  return { matchNodes, matchEdges, relationCheck, similarNodes };
}
