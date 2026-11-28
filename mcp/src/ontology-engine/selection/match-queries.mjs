import { buildMatchNodesFollowUp } from '../briefs/agent-responses.mjs';
import {
  normalizeLimit,
  normalizeOptionalBoolean,
  normalizeRelationType,
  normalizeTypes,
  requireRelationType,
  summarizeNode,
} from '../query-operation/query-primitives.mjs';
import {
  judgeRelationCheck,
  nodeDegree,
  nodeMatchesFilters,
  pageMatchedRows,
} from './match-rules.mjs';
import { normalizeNonNegativeInteger } from '../query-operation/query-arguments.mjs';
import { compareText } from '../../compare-text.mjs';

/** Which nodes and edges meet a condition or resemble a given node, and whether a proposed relation is new, present or off-pattern. */
export function createMatchQueries({
  edges,
  nodes,
  nodeBySlug,
  resolve,
  traversalEdges,
  compareNodeRows,
  formatCompiledEdge,
  nearbySchemaPatterns,
  normalizeNodeKind,
  normalizeNodeSort,
  normalizeOptionalString,
  roundScore,
  schemaPatterns,
  similarityScore,
  writeRelationType,
}) {
  function matchNodes(options = {}) {
    const limit = normalizeLimit(options.limit);
    const kind = normalizeNodeKind(options.kind, 'kind');
    const domain = normalizeOptionalString(options.domain, 'domain');
    const hasIncoming = normalizeOptionalBoolean(options.hasIncoming, 'hasIncoming', null);
    const hasOutgoing = normalizeOptionalBoolean(options.hasOutgoing, 'hasOutgoing', null);
    const sort = normalizeNodeSort(options.sort);
    const offset = normalizeNonNegativeInteger(options.offset, 'offset') ?? 0;
    const excludeKinds = new Set(options.excludeKinds ?? []);
    const rows = [];

    const filters = { kind, domain, hasIncoming, hasOutgoing };

    for (const node of nodes) {
      if (excludeKinds.has(node.kind)) continue;
      if (!nodeMatchesFilters(node, filters)) continue;
      rows.push({
        ...summarizeNode(node),
        degree: nodeDegree(node),
      });
    }

    rows.sort((left, right) => compareNodeRows(left, right, sort));

    const { page, pagination } = pageMatchedRows(rows, { limit, offset });
    const followUp = buildMatchNodesFollowUp(page[0]);

    return {
      operation: 'match_nodes',
      filters: {
        ...filters,
        ...(excludeKinds.size > 0 ? { excludeKinds: [...excludeKinds] } : {}),
        sort,
      },
      totalMatches: rows.length,
      limited: pagination.hasMore,
      pagination,
      nodes: page,
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

  return { matchNodes, relationCheck, similarNodes };
}
