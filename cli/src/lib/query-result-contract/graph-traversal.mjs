import { validBlastRadiusEdgeRow } from './blast-radius.mjs';
import { validPathNode, validUndirectedPathEdge } from './path-queries.mjs';
import { assertQueryOperation } from './query-operation.mjs';
import {
  hasNonEmptyString,
  isPlainObject,
  nullableString,
  validCompiledEdgeRow,
  validCount,
  validCountBucket,
  validNodeSummary,
  validPage,
} from './value-checks.mjs';

const EXPLAIN_RELATION_VERDICTS = new Set([
  'same_node',
  'direct',
  'path',
  'common_neighbor',
  'unrelated_within_hops',
]);
const PATH_DIRECTIONS = new Set(['incoming', 'outgoing', 'both', 'undirected']);

export function assertExplainRelationShape(result) {
  assertQueryOperation(result, 'explain_relation');
  for (const field of ['from', 'to']) {
    if (!hasNonEmptyString(result[field])) {
      throw new Error(`explain_relation ${field} must be a non-empty string`);
    }
  }
  if (!validNodeSummary(result.fromNode)) {
    throw new Error('explain_relation fromNode must be a valid node summary');
  }
  if (!validNodeSummary(result.toNode)) {
    throw new Error('explain_relation toNode must be a valid node summary');
  }
  if (!EXPLAIN_RELATION_VERDICTS.has(result.verdict)) {
    throw new Error(`explain_relation verdict must be one of: ${[...EXPLAIN_RELATION_VERDICTS].join(', ')}`);
  }
  if (!isPlainObject(result.domains) || !nullableString(result.domains.from) || !nullableString(result.domains.to) || typeof result.domains.sameDomain !== 'boolean') {
    throw new Error('explain_relation domains must include from/to nullable strings and sameDomain boolean');
  }
  if (!isPlainObject(result.direct) || !validCount(result.direct.total) || !Array.isArray(result.direct.edges)) {
    throw new Error('explain_relation direct must include total and edges');
  }
  if (result.direct.edges.length > result.direct.total) {
    throw new Error('explain_relation direct.edges length must not exceed total');
  }
  for (let index = 0; index < result.direct.edges.length; index += 1) {
    if (!validExplainDirectEdge(result.direct.edges[index], result.from, result.to)) {
      throw new Error(`explain_relation direct.edges[${index}] has an invalid direct-edge shape`);
    }
  }
  if (!validExplainShortestPath(result.shortestPath)) {
    throw new Error('explain_relation shortestPath has an invalid path shape');
  }
  if (!isPlainObject(result.commonNeighbors) || !validCount(result.commonNeighbors.total) || typeof result.commonNeighbors.limited !== 'boolean' || !Array.isArray(result.commonNeighbors.rows)) {
    throw new Error('explain_relation commonNeighbors must include total, limited, and rows');
  }
  if (result.commonNeighbors.rows.length > result.commonNeighbors.total) {
    throw new Error('explain_relation commonNeighbors.rows length must not exceed total');
  }
  for (let index = 0; index < result.commonNeighbors.rows.length; index += 1) {
    if (!validExplainCommonNeighbor(result.commonNeighbors.rows[index])) {
      throw new Error(`explain_relation commonNeighbors.rows[${index}] has an invalid common-neighbor shape`);
    }
  }
  return result;
}

export function assertReachabilityShape(result) {
  assertQueryOperation(result, 'reachability');
  if (!hasNonEmptyString(result.start)) {
    throw new Error('reachability start must be a non-empty string');
  }
  if (!validNodeSummary(result.node)) {
    throw new Error('reachability node must be a valid node summary');
  }
  if (!['incoming', 'outgoing', 'both'].includes(result.direction)) {
    throw new Error('reachability direction must be one of: incoming, outgoing, both');
  }
  if (!validCount(result.depth)) {
    throw new Error('reachability depth must be a non-negative integer');
  }
  if (!isPlainObject(result.summary)) {
    throw new Error('reachability summary must be an object');
  }
  for (const field of ['reachableNodes', 'traversedEdges', 'layers', 'terminalNodes']) {
    if (!validCount(result.summary[field])) {
      throw new Error(`reachability summary.${field} must be a non-negative integer`);
    }
  }
  for (const field of ['byKind', 'byRelation']) {
    if (!validCountBucket(result[field])) {
      throw new Error(`reachability ${field} must be an object of non-negative integer counts`);
    }
  }
  if (!Array.isArray(result.layers)) {
    throw new Error('reachability layers must be an array');
  }
  for (let index = 0; index < result.layers.length; index += 1) {
    if (!validReachabilityLayer(result.layers[index])) {
      throw new Error(`reachability layers[${index}] has an invalid layer shape`);
    }
  }
  if (!validPage(result.paths, validReachabilityPathRow)) {
    throw new Error('reachability paths must be a page with valid path rows');
  }
  if (!Array.isArray(result.terminalNodes) || !result.terminalNodes.every((node) => validNodeSummary(node))) {
    throw new Error('reachability terminalNodes must be an array of node summaries');
  }
  if (!validPage(result.edges, validBlastRadiusEdgeRow)) {
    throw new Error('reachability edges must be a page with valid edge rows');
  }
  return result;
}

function validExplainDirectEdge(row, from, to) {
  return Boolean(
    validCompiledEdgeRow(row)
    && ((row.from === from && row.to === to && row.direction === 'outgoing')
      || (row.from === to && row.to === from && row.direction === 'incoming'))
    && validNodeSummary(row.fromNode)
    && validNodeSummary(row.toNode)
  );
}

function validExplainShortestPath(path) {
  if (!isPlainObject(path)) return false;
  if (typeof path.found !== 'boolean') return false;
  if (!PATH_DIRECTIONS.has(path.direction)) return false;
  if (!validCount(path.maxHops)) return false;
  if (path.hopCount !== null && !validCount(path.hopCount)) return false;
  if (!Array.isArray(path.hops)) return false;
  if (!Array.isArray(path.nodes)) return false;
  if (!Array.isArray(path.edges)) return false;
  if (!path.found) {
    return path.hopCount === null && path.hops.length === 0 && path.nodes.length === 0 && path.edges.length === 0;
  }
  if (path.hops.length === 0 || path.hops.some((hop) => !hasNonEmptyString(hop))) return false;
  if (path.hopCount !== path.hops.length - 1) return false;
  if (path.nodes.length !== path.hops.length) return false;
  for (let index = 0; index < path.nodes.length; index += 1) {
    if (!validPathNode(path.nodes[index], path.hops[index])) return false;
  }
  if (path.edges.length !== path.hops.length - 1) return false;
  for (let index = 0; index < path.edges.length; index += 1) {
    if (!validUndirectedPathEdge(path.edges[index], path.hops[index], path.hops[index + 1])) {
      return false;
    }
  }
  return true;
}

function validExplainCommonNeighbor(row) {
  return Boolean(
    isPlainObject(row)
    && hasNonEmptyString(row.slug)
    && validNodeSummary(row.node)
    && row.node.slug === row.slug
    && Array.isArray(row.fromEdges)
    && row.fromEdges.every(validExplainNeighborEdge)
    && Array.isArray(row.toEdges)
    && row.toEdges.every(validExplainNeighborEdge)
  );
}

function validExplainNeighborEdge(row) {
  return Boolean(
    validCompiledEdgeRow(row)
    && (row.direction === 'incoming' || row.direction === 'outgoing')
  );
}

function validReachabilityLayer(layer) {
  return Boolean(
    isPlainObject(layer)
    && validCount(layer.distance)
    && validCount(layer.total)
    && Array.isArray(layer.nodes)
    && layer.nodes.every((node) => validNodeSummary(node))
  );
}

function validReachabilityPathRow(row) {
  if (!isPlainObject(row)) return false;
  if (!hasNonEmptyString(row.slug)) return false;
  if (!validCount(row.distance)) return false;
  if (!Array.isArray(row.path) || row.path.length !== row.distance + 1) return false;
  if (!row.path.every((slug) => hasNonEmptyString(slug))) return false;
  if (row.path[0] === row.slug) return false;
  if (row.path[row.path.length - 1] !== row.slug) return false;
  if (!Array.isArray(row.edges) || row.edges.length !== row.distance) return false;
  for (let index = 0; index < row.edges.length; index += 1) {
    if (!validUndirectedPathEdge(row.edges[index], row.path[index], row.path[index + 1])) {
      return false;
    }
  }
  return validNodeSummary(row.node);
}
