import { formatAllowedValueError } from '../suggestions.mjs';
import {
  normalizeRelationType,
  normalizeTypes,
  publicRelationType,
  requireRelationType,
} from './query-primitives.mjs';
import { EDGE_TARGET_KIND_VALUES, NODE_KIND_VALUES } from './query-values.mjs';

export function normalizeDependencyImpactTypes(types) {
  const normalized = normalizeTypes(types) ?? new Set(['dependencies']);
  const unsupported = [...normalized].filter((type) => type !== 'dependencies');
  if (unsupported.length > 0) {
    throw new Error(
      `dependency impact only accepts depends_on relations; use reachability or subgraph for structural relation types: ${unsupported.map(publicRelationType).join(', ')}`,
    );
  }
  return normalized;
}

export function normalizeMatchEdgesTypes(options = {}) {
  if (Array.isArray(options.types) && options.types.length > 0) {
    return normalizeTypes(options.types, 'types');
  }
  const field = options.type === undefined ? 'relation' : 'type';
  const value = options.type ?? options.relation;
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new Error(`${field} must be a string.`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${field} must be a non-empty string.`);
  }
  if (trimmed !== value) {
    throw new Error(`${field} must not have leading or trailing whitespace.`);
  }
  if (trimmed.includes('\0')) {
    throw new Error(`${field} must not contain a null byte.`);
  }
  requireRelationType(trimmed, field);
  return new Set([normalizeRelationType(trimmed)]);
}

export function normalizePattern(pattern) {
  if (!Array.isArray(pattern) || pattern.length === 0) {
    throw new Error('pattern (non-empty string array) is required for pattern_walk.');
  }
  const normalized = [];
  for (const relation of pattern) {
    if (typeof relation !== 'string') {
      throw new Error('pattern must be an array of strings.');
    }
    const trimmed = relation.trim();
    if (!trimmed) {
      throw new Error('pattern items must be non-empty strings.');
    }
    if (trimmed !== relation) {
      throw new Error('pattern items must not have leading or trailing whitespace.');
    }
    if (trimmed.includes('\0')) {
      throw new Error('pattern items must not contain a null byte.');
    }
    requireRelationType(trimmed, 'pattern items');
    normalized.push(normalizeRelationType(trimmed));
  }
  return normalized.slice(0, 20);
}

export function normalizeOptionalString(value, name) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new Error(`${name} must be a string.`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${name} must be a non-empty string.`);
  }
  if (trimmed !== value) {
    throw new Error(`${name} must not have leading or trailing whitespace.`);
  }
  if (trimmed.includes('\0')) {
    throw new Error(`${name} must not contain a null byte.`);
  }
  return trimmed;
}

export function normalizeNonNegativeInteger(value, name) {
  if (value === undefined || value === null) return null;
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return value;
}

export function normalizeRecommendRelationKind(value) {
  const kind = normalizeOptionalString(value, 'kind');
  if (kind === null) return null;
  if (kind !== 'capability' && kind !== 'element') {
    throw new Error(formatAllowedValueError('kind', kind, ['capability', 'element']));
  }
  return kind;
}

export function normalizeNodeKind(value, name) {
  const kind = normalizeOptionalString(value, name);
  if (kind === null) return null;
  if (!NODE_KIND_VALUES.includes(kind)) {
    throw new Error(formatAllowedValueError(name, kind, NODE_KIND_VALUES));
  }
  return kind;
}

export function normalizeEdgeTargetKind(value, name) {
  const kind = normalizeOptionalString(value, name);
  if (kind === null) return null;
  if (!EDGE_TARGET_KIND_VALUES.includes(kind)) {
    throw new Error(formatAllowedValueError(name, kind, EDGE_TARGET_KIND_VALUES));
  }
  return kind;
}

export function normalizeNodeSort(value) {
  if (value === undefined || value === null) return 'degree';
  if (
    value === 'slug' ||
    value === 'inDegree' ||
    value === 'outDegree' ||
    value === 'degree'
  ) {
    return value;
  }
  throw new Error(formatAllowedValueError('sort', value, ['degree', 'inDegree', 'outDegree', 'slug']));
}

export function normalizeStringSet(value, name, allowedValues = null) {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value)) {
    throw new Error(`${name} must be an array of strings.`);
  }
  const items = [];
  for (const item of value) {
    if (typeof item !== 'string') {
      throw new Error(`${name} must be an array of strings.`);
    }
    const trimmed = item.trim();
    if (!trimmed) {
      throw new Error(`${name} items must be non-empty strings.`);
    }
    if (trimmed !== item) {
      throw new Error(`${name} items must not have leading or trailing whitespace.`);
    }
    if (trimmed.includes('\0')) {
      throw new Error(`${name} items must not contain a null byte.`);
    }
    if (allowedValues && !allowedValues.has(trimmed)) {
      throw new Error(formatAllowedValueError(`${name} items`, trimmed, [...allowedValues]));
    }
    items.push(trimmed);
  }
  return items.length > 0 ? new Set(items) : null;
}

export function normalizeIterations(value) {
  if (value === undefined || value === null) return 20;
  if (!Number.isInteger(value) || value < 1) {
    throw new Error('iterations must be a positive integer.');
  }
  if (value > 100) {
    throw new Error('iterations must be <= 100.');
  }
  return value;
}

export function normalizeTraversalDirection(direction, fallback) {
  if (direction === undefined) return fallback;
  if (
    direction === 'incoming' ||
    direction === 'outgoing' ||
    direction === 'both' ||
    direction === 'undirected'
  ) {
    return direction;
  }
  throw new Error(formatAllowedValueError('direction', direction, ['incoming', 'outgoing', 'both', 'undirected']));
}
