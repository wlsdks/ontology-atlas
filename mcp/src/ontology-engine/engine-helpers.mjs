import { formatAllowedValueError } from '../suggestions.mjs';
import { EDGE_TARGET_KIND_VALUES, NODE_KIND_VALUES } from './query-values.mjs';
import {
  edgeSortKey,
  normalizeRelationType,
  normalizeTypes,
  publicRelationType,
  requireRelationType,
  sortedCountObject,
  typeAllowed,
} from './query-primitives.mjs';

export function healthCheck({ id, status, count, message }) {
  return { id, status, count, message };
}

export function qualifyDeclaredDependencyEdges(edges) {
  return edges.map((edge) => ({
    ...edge,
    rationale: edge.rationale ?? null,
    qualification: edge.rationale ? 'declared_with_rationale' : 'review_required',
  }));
}

export function buildDependencyImpactQualification(edges) {
  const declaredWithRationaleEdges = edges.filter(
    (edge) => edge.qualification === 'declared_with_rationale',
  ).length;
  const reviewRequiredEdges = edges.length - declaredWithRationaleEdges;
  return {
    status: edges.length === 0
      ? 'unknown'
      : reviewRequiredEdges > 0
        ? 'review_required'
        : 'declared_with_rationale',
    basis: 'declared_dependencies',
    completeness: 'unknown',
    sourceBacked: false,
    declaredEdges: edges.length,
    declaredWithRationaleEdges,
    reviewRequiredEdges,
    sourceBackedEdges: 0,
  };
}

export function countBy(items, key) {
  const counts = new Map();
  for (const item of items) {
    const value = item[key];
    if (typeof value !== 'string' || !value.trim()) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return sortedCountObject(counts);
}


export function degreeBucket(degree) {
  if (degree <= 0) return '0';
  if (degree === 1) return '1';
  if (degree <= 4) return '2-4';
  if (degree <= 9) return '5-9';
  return '10+';
}

export function topHubs(nodes, limit) {
  return [...nodes]
    .map((node) => ({
      uid: node.uid,
      slug: node.slug,
      kind: node.kind,
      title: node.title,
      domain: node.domain,
      inDegree: node.inDegree || 0,
      outDegree: node.outDegree || 0,
      degree: (node.inDegree || 0) + (node.outDegree || 0),
    }))
    .sort((a, b) => b.degree - a.degree || b.inDegree - a.inDegree || a.slug.localeCompare(b.slug))
    .slice(0, limit);
}

/**
 * Checks whether a dangling ref was meant as a typo or a missing prefix for an
 * existing vault node — the minimum implementation for the real bug in the
 * persona-2026-07 QA log (`domain: checkout` while `domains/checkout` already
 * existed). Exact tail (last segment) match first, then tail prefix. Two or more
 * candidates (ambiguous) return null: never propose a confidently wrong fix.
 * Reuses the tiering idea from `suggestSimilarSlugs` in `mcp/src/vault.mjs`,
 * adapted to in-memory nodes.
 */
export function findNearMatchSlug(ref, nodes) {
  const raw = String(ref || '').trim();
  if (!raw) return null;
  const lowerRaw = raw.toLowerCase();
  const exactTail = [];
  const prefixTail = [];
  for (const node of nodes) {
    const slug = node.slug;
    if (slug === raw) continue; // already resolves: wouldn't be dangling
    const tail = (slug.split('/').pop() || slug).toLowerCase();
    if (tail === lowerRaw) {
      exactTail.push(slug);
      continue;
    }
    if (tail.startsWith(lowerRaw) || lowerRaw.startsWith(tail)) {
      prefixTail.push(slug);
    }
  }
  if (exactTail.length === 1) return exactTail[0];
  if (exactTail.length === 0 && prefixTail.length === 1) return prefixTail[0];
  return null;
}

export function suggestedSlugForReference(ref, kind) {
  const prefix = kind === 'domain' ? 'domains' : kind === 'capability' ? 'capabilities' : 'elements';
  const raw = String(ref || '').trim();
  const withoutExtension = raw.replace(/\.[^.\/\\]+$/, '');
  const normalized = withoutExtension
    .split(/[\/\\]+/)
    .map(slugSegment)
    .filter(Boolean)
    .join('/');
  if (!normalized) return `${prefix}/unnamed`;
  if (normalized.startsWith(`${prefix}/`)) return normalized;
  return `${prefix}/${normalized}`;
}

function slugSegment(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function titleFromReference(ref) {
  const raw = String(ref || '').trim();
  const base = raw.split(/[\/\\]+/).pop()?.replace(/\.[^.]+$/, '') || raw || 'Untitled';
  const words = base
    .replace(/[_-]+/g, ' ')
    .trim();
  return words ? words[0].toUpperCase() + words.slice(1) : 'Untitled';
}


export function sortLineageRows(rows) {
  return [...rows].sort((a, b) => a.distance - b.distance || a.slug.localeCompare(b.slug));
}

export function normalizeCycle(nodes, edges) {
  let startIndex = 0;
  for (let i = 1; i < nodes.length; i += 1) {
    if (nodes[i].localeCompare(nodes[startIndex]) < 0) startIndex = i;
  }
  const rotatedNodes = [...nodes.slice(startIndex), ...nodes.slice(0, startIndex)];
  const rotatedEdges = [...edges.slice(startIndex), ...edges.slice(0, startIndex)];
  const closedNodes = [...rotatedNodes, rotatedNodes[0]];
  return {
    key: rotatedNodes.join('->'),
    nodes: closedNodes,
    edges: rotatedEdges,
  };
}

export function limitLayers(layers, limit) {
  const out = [];
  let remaining = limit;
  for (const layer of layers) {
    if (remaining <= 0) break;
    const nodes = layer.nodes.slice(0, remaining);
    out.push({
      rank: layer.rank,
      nodes,
      limited: layer.nodes.length > nodes.length,
    });
    remaining -= nodes.length;
  }
  return out;
}


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

export function compareNodeRows(left, right, sort) {
  if (sort === 'slug') return left.slug.localeCompare(right.slug);
  const leftValue = left[sort] || 0;
  const rightValue = right[sort] || 0;
  if (rightValue !== leftValue) return rightValue - leftValue;
  if (sort !== 'degree') {
    const leftDegree = left.degree || 0;
    const rightDegree = right.degree || 0;
    if (rightDegree !== leftDegree) return rightDegree - leftDegree;
  }
  return left.slug.localeCompare(right.slug);
}

export function pageRankScores(nodes, outgoingEdgesBySlug, iterations) {
  const totalNodes = nodes.length;
  if (totalNodes === 0) return new Map();
  const damping = 0.85;
  let scores = new Map(nodes.map((node) => [node.slug, 1 / totalNodes]));
  const slugs = nodes.map((node) => node.slug);
  const uniqueTargetsBySlug = new Map(
    slugs.map((slug) => [
      slug,
      [...new Set((outgoingEdgesBySlug.get(slug) || []).map((edge) => edge.to))],
    ]),
  );

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const nextScores = new Map(slugs.map((slug) => [slug, (1 - damping) / totalNodes]));
    let danglingMass = 0;
    for (const slug of slugs) {
      const score = scores.get(slug) || 0;
      const uniqueTargets = uniqueTargetsBySlug.get(slug) || [];
      if (uniqueTargets.length === 0) {
        danglingMass += score;
        continue;
      }
      const share = score / uniqueTargets.length;
      for (const target of uniqueTargets) {
        nextScores.set(target, nextScores.get(target) + damping * share);
      }
    }
    if (danglingMass > 0) {
      const danglingShare = (damping * danglingMass) / totalNodes;
      for (const target of slugs) {
        nextScores.set(target, nextScores.get(target) + danglingShare);
      }
    }
    scores = nextScores;
  }

  return scores;
}

export function undirectedAdjacencyFrom(nodes, edges, typeSet) {
  const adjacency = new Map(nodes.map((node) => [node.slug, new Set()]));
  for (const edge of edges) {
    if (!edge.resolved || !typeAllowed(edge.via, typeSet)) continue;
    adjacency.get(edge.from)?.add(edge.to);
    adjacency.get(edge.to)?.add(edge.from);
  }
  return adjacency;
}

export function propagateCommunityLabels(adjacency, iterations) {
  const labels = new Map([...adjacency.keys()].map((slug) => [slug, slug]));
  const slugs = [...adjacency.keys()].sort();
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let changed = false;
    for (const slug of slugs) {
      const counts = new Map();
      for (const neighbor of [...(adjacency.get(slug) || [])].sort()) {
        const label = labels.get(neighbor) || neighbor;
        counts.set(label, (counts.get(label) || 0) + 1);
      }
      if (counts.size === 0) continue;
      const nextLabel = [...counts.entries()].sort(
        ([leftLabel, leftCount], [rightLabel, rightCount]) =>
          rightCount - leftCount || leftLabel.localeCompare(rightLabel),
      )[0][0];
      if (labels.get(slug) !== nextLabel) {
        labels.set(slug, nextLabel);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return labels;
}

export function similarityScore(source, target, sourceNeighbors, targetNeighbors) {
  const slug = tokenJaccard(source.slug, target.slug) * 0.35;
  const title = tokenJaccard(source.title, target.title) * 0.35;
  const kind = source.kind && target.kind && source.kind === target.kind ? 0.1 : 0;
  const domain = source.domain && target.domain && source.domain === target.domain ? 0.1 : 0;
  const neighbors = setJaccard(sourceNeighbors, targetNeighbors) * 0.1;
  return {
    slug,
    title,
    kind,
    domain,
    neighbors,
    total: slug + title + kind + domain + neighbors,
  };
}

function tokenJaccard(left, right) {
  return setJaccard(new Set(textTokens(left)), new Set(textTokens(right)));
}

function textTokens(value) {
  return String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2);
}

function setJaccard(left, right) {
  if (!left || !right || left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const value of left) {
    if (right.has(value)) intersection += 1;
  }
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
}

export function compareCentralityRows(left, right) {
  if (right.pageRank !== left.pageRank) return right.pageRank - left.pageRank;
  if (right.degree !== left.degree) return right.degree - left.degree;
  return left.slug.localeCompare(right.slug);
}

export function roundScore(value) {
  return Number(value.toFixed(6));
}


export function compareMaintenanceActions(left, right) {
  const severityRank = { fail: 0, warn: 1, info: 2 };
  const phaseRank = { validate: 0, repair: 1, link: 2, materialize: 3, review: 4 };
  const severityDelta = (severityRank[left.severity] ?? 9) - (severityRank[right.severity] ?? 9);
  if (severityDelta !== 0) return severityDelta;
  const phaseDelta = (phaseRank[left.phase] ?? 9) - (phaseRank[right.phase] ?? 9);
  if (phaseDelta !== 0) return phaseDelta;
  if ((right.score || 0) !== (left.score || 0)) return (right.score || 0) - (left.score || 0);
  return `${left.kind}:${left.reason}`.localeCompare(`${right.kind}:${right.reason}`);
}

export function annotateMaintenanceAction(action) {
  return {
    id: maintenanceActionId(action),
    executable: Boolean(action.proposedAction?.tool),
    ...action,
  };
}

function maintenanceActionId(action) {
  const payload = {
    phase: action.phase,
    kind: action.kind,
    severity: action.severity,
    proposedAction: action.proposedAction ?? null,
    node: action.node?.slug ?? null,
    nodes: normalizeMaintenanceActionNodes(action.nodes),
    issue: action.issue
      ? {
          code: action.issue.code,
          slug: action.issue.slug,
          ref: action.issue.ref,
        }
      : null,
    cycle: Array.isArray(action.cycle) ? action.cycle : null,
    reason: action.reason,
  };
  return `maint_${hashString(JSON.stringify(payload))}`;
}

function normalizeMaintenanceActionNodes(nodesValue) {
  if (!nodesValue) return null;
  if (Array.isArray(nodesValue)) return nodesValue.map((node) => node?.slug ?? node).sort();
  if (typeof nodesValue === 'object') {
    return Object.fromEntries(
      Object.entries(nodesValue)
        .map(([key, node]) => [key, node?.slug ?? node])
        .sort(([left], [right]) => left.localeCompare(right)),
    );
  }
  return nodesValue;
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

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
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


export function publicRelationTypes(typeSet) {
  return typeSet ? [...typeSet].map(publicRelationType).sort() : null;
}

export function publicRelationCountObject(bucket) {
  const mapped = new Map();
  for (const [relation, count] of bucket.entries()) {
    const publicName = publicRelationType(relation);
    mapped.set(publicName, (mapped.get(publicName) || 0) + count);
  }
  return sortedCountObject(mapped);
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


export function normalizeCanvasPosition(value) {
  if (
    value &&
    typeof value === 'object' &&
    Number.isFinite(value.x) &&
    Number.isFinite(value.y)
  ) {
    return { x: value.x, y: value.y };
  }
  return null;
}

export function builderFocusParam(node) {
  const slug = node?.slug || '';
  if (!['project', 'domain', 'capability', 'element'].includes(node?.kind)) return slug;
  const tail = slug.includes('/') ? slug.slice(slug.indexOf('/') + 1) : slug;
  return `${node.kind}:${tail}`;
}

export function normalizeBuilderFocusInput(value) {
  if (typeof value !== 'string') return value;
  const normalized = value.trim().replace(/^\/+/, '').replace(/^ontology\//, '');
  if (!normalized || normalized.includes('/')) return normalized;
  const [kind, ...tailParts] = normalized.split(':');
  const tail = tailParts.join(':').trim();
  if (!tail) return normalized;
  if (kind === 'project') return tail;
  const folder = {
    domain: 'domains',
    capability: 'capabilities',
    element: 'elements',
  }[kind];
  return folder ? `${folder}/${tail}` : normalized;
}


export function formatCompiledEdge(edge) {
  return {
    id: edge.id,
    from: edge.from,
    to: edge.to,
    via: edge.via,
    relationType: publicRelationType(edge.via),
    ref: edge.ref,
    resolved: edge.resolved,
    external: edge.external,
  };
}

export function uniqueEdges(edges) {
  const seen = new Set();
  const out = [];
  for (const edge of edges) {
    const key = `${edge.id}:${edge.traversedFrom}:${edge.traversedTo}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(edge);
  }
  return out;
}

export function compareEdges(a, b) {
  return edgeSortKey(a).localeCompare(edgeSortKey(b));
}
