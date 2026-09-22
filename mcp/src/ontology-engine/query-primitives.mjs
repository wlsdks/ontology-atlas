import { formatAllowedValueError } from '../suggestions.mjs';
import {
  DEFAULT_ALL_PATHS_SEARCH_BUDGET,
  DEFAULT_QUERY_LIMIT,
  MAX_ALL_PATHS_SEARCH_BUDGET,
  RELATION_TYPE_VALUES,
} from './query-values.mjs';
const RELATION_TYPES = new Set(RELATION_TYPE_VALUES);

export function countEdges(items, key) {
  return sortedCountObject(countEdgeMap(items, key));
}

export function countEdgeMap(items, key) {
  const counts = new Map();
  for (const item of items) {
    const value = item[key];
    if (typeof value !== 'string' || !value.trim()) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return counts;
}

export function sortedCountObject(counts) {
  return Object.fromEntries(
    [...counts.entries()].sort(([leftKey, leftCount], [rightKey, rightCount]) => {
      if (rightCount !== leftCount) return rightCount - leftCount;
      return leftKey.localeCompare(rightKey);
    }),
  );
}

export function summarizeNode(node) {
  if (!node) return null;
  return {
    uid: node.uid,
    slug: node.slug,
    kind: node.kind,
    title: node.title,
    domain: node.domain,
    inDegree: node.inDegree || 0,
    outDegree: node.outDegree || 0,
  };
}

export function edgeAllowed(edge, typeSet, includeExternal, includeUnresolved) {
  if (!typeAllowed(edge.via, typeSet)) return false;
  if (edge.resolved) return true;
  if (edge.external) return includeExternal;
  return includeUnresolved;
}

export function typeAllowed(via, typeSet) {
  return !typeSet || typeSet.has(normalizeRelationType(via));
}

export function normalizeTypes(types, name = 'types') {
  if (types === undefined || types === null) return null;
  if (!Array.isArray(types)) {
    throw new Error(`${name} must be an array of strings.`);
  }
  if (types.length === 0) return null;
  const normalized = [];
  for (const type of types) {
    if (typeof type !== 'string') {
      throw new Error(`${name} must be an array of strings.`);
    }
    const trimmed = type.trim();
    if (!trimmed) {
      throw new Error(`${name} items must be non-empty strings.`);
    }
    if (trimmed !== type) {
      throw new Error(`${name} items must not have leading or trailing whitespace.`);
    }
    if (trimmed.includes('\0')) {
      throw new Error(`${name} items must not contain a null byte.`);
    }
    requireRelationType(trimmed, `${name} items`);
    normalized.push(normalizeRelationType(trimmed));
  }
  return new Set(normalized);
}

export function normalizeOptionalBoolean(value, name, defaultValue) {
  if (value === undefined) return defaultValue;
  if (typeof value !== 'boolean') {
    throw new Error(`${name} must be a boolean.`);
  }
  return value;
}

export function requireRelationType(type, name) {
  if (!RELATION_TYPES.has(type)) {
    throw new Error(formatAllowedValueError(name, type, RELATION_TYPE_VALUES));
  }
}

export function normalizeDirection(direction, fallback) {
  if (direction === undefined) return fallback;
  if (direction === 'incoming' || direction === 'outgoing' || direction === 'both') return direction;
  if (direction === 'undirected') return 'both';
  throw new Error(formatAllowedValueError('direction', direction, ['incoming', 'outgoing', 'both', 'undirected']));
}

export function normalizePathDirection(direction) {
  if (direction === undefined) return 'undirected';
  if (direction === 'incoming' || direction === 'outgoing') return direction;
  if (direction === 'both' || direction === 'undirected') return 'undirected';
  throw new Error(formatAllowedValueError('direction', direction, ['incoming', 'outgoing', 'both', 'undirected']));
}

export function normalizeDepth(value, fallback) {
  if (value === undefined || value === null) return fallback;
  if (!Number.isInteger(value) || value < 0) {
    throw new Error('depth/maxHops must be a non-negative integer.');
  }
  if (value > 20) {
    throw new Error('depth/maxHops must be <= 20.');
  }
  return value;
}

export function normalizeLimit(value, fallback = DEFAULT_QUERY_LIMIT, name = 'limit', maximum = 500) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  if (value > maximum) {
    throw new Error(`${name} must be <= ${maximum}.`);
  }
  return value;
}

export function normalizeSearchBudget(value) {
  return normalizeLimit(
    value,
    DEFAULT_ALL_PATHS_SEARCH_BUDGET,
    'searchBudget',
    MAX_ALL_PATHS_SEARCH_BUDGET,
  );
}

export function formatDirectedEdge({ direction, edge }) {
  return {
    direction,
    id: edge.id,
    from: edge.from,
    to: edge.to,
    via: edge.via,
    ref: edge.ref,
    resolved: edge.resolved,
    external: edge.external,
  };
}

export function formatPathEdge(edge, traversedFrom, traversedTo) {
  return {
    id: edge.id,
    from: edge.from,
    to: edge.to,
    via: edge.via,
    ...(edge.rationale ? { rationale: edge.rationale } : {}),
    traversedFrom,
    traversedTo,
  };
}

export function normalizeRelationType(type) {
  return type === 'depends_on' ? 'dependencies' : type;
}

export function publicRelationType(type) {
  return type === 'dependencies' ? 'depends_on' : type;
}

export function edgeSortKey(edge) {
  return `${edge.from}:${edge.via}:${edge.to}:${edge.ref}`;
}
