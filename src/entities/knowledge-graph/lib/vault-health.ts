/**
 * Browser mirror of the MCP `health()` verdict, computed from raw frontmatter rather than the
 * auto-healed derived graph so the app and CLI agree (`tests/contract/vault-health.contract.test.ts`).
 */

import { ATLAS_CLI, ATLAS_CLI_HINT_EN } from '@/shared/config/cli-invocation';

/** CLI checks this mirror does not run (frontmatter validation, meaning assessment), named so the list never reads as complete. */
export const UNAVAILABLE_CHECKS = [
  {
    id: 'vault_validation',
    reason: 'the MCP tool layer runs it, not the compiled-graph engine this mirrors',
    where: `${ATLAS_CLI} validate`,
    hint: ATLAS_CLI_HINT_EN,
  },
  {
    id: 'meaning_assessment',
    reason: 'asks whether a project\'s competency answers are finalized, which is a semantic judgement rather than a graph count',
    where: `${ATLAS_CLI} health`,
    hint: ATLAS_CLI_HINT_EN,
  },
];

/** The subset of `VaultDoc` this needs. */
export interface VaultHealthDoc {
  slug: string;
  frontmatter: Record<string, unknown>;
  diagnostics?: ReadonlyArray<{ code: string }>;
}

type VaultHealthStatus = 'healthy' | 'needs_attention';
type VaultHealthCheckStatus = 'pass' | 'warn' | 'fail' | 'info';

interface VaultHealthCheck {
  id:
    | 'vault_present'
    | 'compile_issues'
    | 'unresolved_edges'
    | 'dependency_cycles'
    | 'relation_recommendations'
    | 'components';
  status: VaultHealthCheckStatus;
  count: number;
}

/** A check this surface knows about and does not run, with where it can be run. */
interface UnavailableVaultHealthCheck {
  id: string;
  reason: string;
  /** A runnable command; there is no npm package. */
  where: string;
  /** How to fill in the placeholder in `where`. */
  hint: string;
}

interface MissingContainmentTarget {
  /** e.g. `capabilities/invoice` */
  slug: string;
  /** Domain slug that should link back. */
  domain: string;
}

export interface VaultHealthResult {
  status: VaultHealthStatus;
  checks: VaultHealthCheck[];
  /** Checks this verdict did not run. */
  unavailableChecks: readonly UnavailableVaultHealthCheck[];
  summary: {
    nodes: number;
    edges: number;
    unresolvedEdges: number;
    issues: number;
    actionableComponents: number;
    ignoredComponents: number;
    dependencyCycles: number;
    relationRecommendations: number;
  };
  /** Repair targets for linking to the offending node, sorted by slug. */
  missingContainment: MissingContainmentTarget[];
  /** Members of every actionable island except the largest, largest first. */
  islands: string[][];
}

// Array keys that become edges, in lockstep with `NEIGHBOR_KEYS` in `mcp/src/vault.mjs`.
const NEIGHBOR_KEYS = [
  'domains',
  'capabilities',
  'elements',
  'dependencies',
  'relates',
  'contains',
  'describes',
  'broader',
] as const;
// Frontmatter key → canonical edge `via`; only `depends_on` differs.
const NEIGHBOR_KEY_ALIASES: Record<string, string> = { depends_on: 'dependencies' };
// Singular string keys that also become an edge (`node --domain--> ref`).
const INLINE_NEIGHBOR_KEYS = ['domain'] as const;

const HEALTH_IGNORED_COMPONENT_KINDS = new Set(['vault-readme']);

interface CompiledEdge {
  from: string;
  to: string;
  via: string;
  ref: string;
  resolved: boolean;
  external: boolean;
}

interface CompiledNode {
  slug: string;
  kind: string | undefined;
  domain: unknown;
  path: unknown;
}

// Mirrors `isPathLikeGraphRef` in mcp/src/ontology-compiler.mjs.
function isPathLikeGraphRef(ref: string): boolean {
  return (
    ref.startsWith('src/') ||
    ref.startsWith('mcp/') ||
    ref.startsWith('cli/') ||
    ref.startsWith('app/') ||
    ref.startsWith('tests/') ||
    ref.startsWith('scripts/') ||
    ref.includes('.')
  );
}

// Mirrors `collectNeighborRefs` in mcp/src/vault.mjs.
function collectNeighborRefs(fm: Record<string, unknown>): { key: string; ref: string }[] {
  const refs: { key: string; ref: string }[] = [];
  const seen = new Set<string>();
  const pushRef = (key: string, value: unknown) => {
    if (typeof value !== 'string') return;
    const trimmed = value.trim();
    if (!trimmed) return;
    const canonicalKey = NEIGHBOR_KEY_ALIASES[key] || key;
    const seenKey = `${canonicalKey}\0${trimmed}`;
    if (seen.has(seenKey)) return;
    seen.add(seenKey);
    refs.push({ key: canonicalKey, ref: trimmed });
  };
  for (const key of NEIGHBOR_KEYS) {
    const value = fm[key];
    if (!Array.isArray(value)) continue;
    for (const ref of value) pushRef(key, ref);
  }
  for (const key of Object.keys(NEIGHBOR_KEY_ALIASES)) {
    const value = fm[key];
    if (!Array.isArray(value)) continue;
    for (const ref of value) pushRef(key, ref);
  }
  for (const key of INLINE_NEIGHBOR_KEYS) {
    pushRef(key, fm[key]);
  }
  return refs;
}

// Mirrors MCP `normalizeRelationType`.
function normalizeRelationType(type: string): string {
  return type === 'depends_on' ? 'dependencies' : type;
}

interface CompiledGraph {
  nodes: CompiledNode[];
  edges: CompiledEdge[];
  issueCount: number;
  outgoing: Map<string, CompiledEdge[]>;
  aliasToSlug: Map<string, string>;
}

function malformedFrontmatterCount(doc: VaultHealthDoc): number {
  return (doc.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.code === 'malformed-frontmatter-line',
  ).length;
}

// The parts of `compileOntology` the health verdict needs.
/** A document without `kind:` is plain markdown, not a node, as in the MCP compiler. */
function isOntologyNode(doc: VaultHealthDoc): boolean {
  const kind = doc.frontmatter?.kind;
  return typeof kind === 'string' && kind.trim().length > 0;
}

function compile(input: readonly VaultHealthDoc[]): CompiledGraph {
  const docs = input.filter(isOntologyNode);
  const aliasEntries = new Map<string, Set<string>>();
  const addAlias = (alias: unknown, slug: string) => {
    if (typeof alias !== 'string' || !alias.trim()) return;
    const key = alias.trim();
    if (!aliasEntries.has(key)) aliasEntries.set(key, new Set());
    aliasEntries.get(key)!.add(slug);
  };

  for (const doc of docs) {
    addAlias(doc.slug, doc.slug);
    const tail = doc.slug.split('/').pop();
    if (tail && tail !== doc.slug) addAlias(tail, doc.slug);
    const fmSlug = doc.frontmatter?.slug;
    if (typeof fmSlug === 'string' && fmSlug.trim()) addAlias(fmSlug.trim(), doc.slug);
  }

  const aliasToSlug = new Map<string, string>();
  let ambiguousCount = 0;
  for (const [alias, slugs] of aliasEntries) {
    if (slugs.size === 1) aliasToSlug.set(alias, [...slugs][0]);
    else ambiguousCount += 1;
  }

  const edges: CompiledEdge[] = [];
  const edgeKeys = new Set<string>();
  let danglingCount = 0;
  for (const doc of docs) {
    for (const { key, ref } of collectNeighborRefs(doc.frontmatter ?? {})) {
      const resolved = aliasToSlug.get(ref) || null;
      const external = !resolved && key === 'elements' && isPathLikeGraphRef(ref);
      const to = resolved || ref;
      const edgeKey = `${doc.slug}\0${to}\0${key}\0${ref}`;
      if (edgeKeys.has(edgeKey)) continue;
      edgeKeys.add(edgeKey);
      edges.push({ from: doc.slug, to, via: key, ref, resolved: Boolean(resolved), external });
      if (!resolved && !external) danglingCount += 1;
    }
  }

  const nodes: CompiledNode[] = docs.map((doc) => ({
    slug: doc.slug,
    kind: typeof doc.frontmatter?.kind === 'string' ? (doc.frontmatter.kind as string) : undefined,
    domain: doc.frontmatter?.domain,
    path: doc.frontmatter?.path,
  }));

  const outgoing = new Map<string, CompiledEdge[]>();
  for (const edge of edges) {
    if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
    outgoing.get(edge.from)!.push(edge);
  }

  const malformedCount = docs.reduce(
    (count, doc) => count + malformedFrontmatterCount(doc),
    0,
  );
  return {
    nodes,
    edges,
    issueCount: ambiguousCount + danglingCount + malformedCount,
    outgoing,
    aliasToSlug,
  };
}

// Undirected components over resolved edges, dropping groups of ignored kinds only.
function actionableComponentCounts(graph: CompiledGraph): {
  actionable: number;
  ignored: number;
  actionableGroups: string[][];
} {
  const kindBySlug = new Map(graph.nodes.map((n) => [n.slug, n.kind]));
  const adjacency = new Map<string, Set<string>>();
  const ensure = (slug: string) => {
    let set = adjacency.get(slug);
    if (!set) {
      set = new Set();
      adjacency.set(slug, set);
    }
    return set;
  };
  for (const node of graph.nodes) ensure(node.slug);
  for (const edge of graph.edges) {
    if (!edge.resolved) continue;
    ensure(edge.from).add(edge.to);
    ensure(edge.to).add(edge.from);
  }

  const visited = new Set<string>();
  let actionable = 0;
  let ignored = 0;
  const actionableGroups: string[][] = [];
  for (const node of graph.nodes) {
    if (visited.has(node.slug)) continue;
    const queue = [node.slug];
    visited.add(node.slug);
    const groupSlugs: string[] = [];
    // Head pointer for O(1) dequeue — `Array.shift()` is O(n).
    let head = 0;
    while (head < queue.length) {
      const current = queue[head++];
      groupSlugs.push(current);
      for (const next of adjacency.get(current) ?? []) {
        if (visited.has(next)) continue;
        visited.add(next);
        queue.push(next);
      }
    }
    const onlyIgnored = groupSlugs.every((slug) => {
      const kind = kindBySlug.get(slug);
      return kind !== undefined && HEALTH_IGNORED_COMPONENT_KINDS.has(kind);
    });
    if (onlyIgnored) {
      ignored += 1;
    } else {
      actionable += 1;
      actionableGroups.push(groupSlugs.slice().sort((a, b) => a.localeCompare(b)));
    }
  }
  actionableGroups.sort((a, b) => b.length - a.length || (a[0] ?? '').localeCompare(b[0] ?? ''));
  return { actionable, ignored, actionableGroups };
}

// Mirrors MCP `missing_domain_containment`: a `domain:` the domain does not link back.
function missingDomainContainment(graph: CompiledGraph): MissingContainmentTarget[] {
  const slugSet = new Set(graph.nodes.map((n) => n.slug));
  // Exact slug first, then a single-target alias (MCP `resolveOptional`).
  const resolveOptional = (input: unknown): string | null => {
    if (typeof input !== 'string' || !input.trim()) return null;
    const candidate = input.trim();
    if (slugSet.has(candidate)) return candidate;
    return graph.aliasToSlug.get(candidate) ?? null;
  };
  const hasResolvedEdge = (from: string, to: string, via: string) =>
    (graph.outgoing.get(from) ?? []).some(
      (edge) => edge.resolved && edge.to === to && edge.via === via,
    );

  const targets: MissingContainmentTarget[] = [];
  for (const node of [...graph.nodes].sort((a, b) => a.slug.localeCompare(b.slug))) {
    if (node.kind !== 'capability' && node.kind !== 'element') continue;
    const domainSlug = resolveOptional(node.domain);
    if (!domainSlug) continue;
    const relation = node.kind === 'capability' ? 'capabilities' : 'elements';
    if (
      hasResolvedEdge(domainSlug, node.slug, relation) ||
      hasResolvedEdge(domainSlug, node.slug, 'contains')
    ) {
      continue;
    }
    targets.push({ slug: node.slug, domain: domainSlug });
  }
  return targets;
}

// Dependency cycles up to MAX_DEPTH, matching the engine's `cycles({types:['dependencies']})`.
function dependencyCycleCount(graph: CompiledGraph): number {
  const MAX_DEPTH = 8;
  const outByType = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (!edge.resolved) continue;
    if (normalizeRelationType(edge.via) !== 'dependencies') continue;
    if (!outByType.has(edge.from)) outByType.set(edge.from, []);
    outByType.get(edge.from)!.push(edge.to);
  }
  const cycleKeys = new Set<string>();
  const sortedSlugs = graph.nodes.map((n) => n.slug).sort((a, b) => a.localeCompare(b));

    // Reverse adjacency, built to measure "how many steps from here back to start".
  const inByType = new Map<string, string[]>();
  for (const [from, targets] of outByType) {
    for (const to of targets) {
      if (!inByType.has(to)) inByType.set(to, []);
      inByType.get(to)!.push(from);
    }
  }

  /**
   * Nodes that can reach `start` within MAX_DEPTH, with distances; other branches cannot close a
   * cycle and are pruned, which keeps a dense 2000-node graph on the main thread in milliseconds.
   */
  const reverseDistances = (start: string): Map<string, number> => {
    const dist = new Map<string, number>();
    let frontier = [start];
    for (let step = 1; step <= MAX_DEPTH && frontier.length > 0; step += 1) {
      const next: string[] = [];
      for (const node of frontier) {
        for (const prev of inByType.get(node) ?? []) {
          if (dist.has(prev) || prev === start) continue;
          dist.set(prev, step);
          next.push(prev);
        }
      }
      frontier = next;
    }
    return dist;
  };

  const normalizeCycle = (path: string[]): string => {
    // A closed walk start..start: drop the repeat and rotate to the minimum.
    const ring = path.slice(0, -1);
    let minIdx = 0;
    for (let i = 1; i < ring.length; i += 1) {
      if (ring[i].localeCompare(ring[minIdx]) < 0) minIdx = i;
    }
    const rotated = [...ring.slice(minIdx), ...ring.slice(0, minIdx)];
    return rotated.join('\0');
  };

  const dfs = (
    start: string,
    current: string,
    path: string[],
    visited: Set<string>,
    backDist: Map<string, number>,
  ) => {
    if (path.length > MAX_DEPTH) return;
    for (const next of outByType.get(current) ?? []) {
      if (next === start && path.length > 1) {
        cycleKeys.add(normalizeCycle([...path, next]));
        continue;
      }
      if (visited.has(next) || path.length >= MAX_DEPTH) continue;
      // Cycle length = path.length + backDist ≤ MAX_DEPTH, or this branch cannot close.
      const back = backDist.get(next);
      if (back === undefined || path.length + back > MAX_DEPTH) continue;
      visited.add(next);
      dfs(start, next, [...path, next], visited, backDist);
      visited.delete(next);
    }
  };

  for (const slug of sortedSlugs) {
    const backDist = reverseDistances(slug);
    if (backDist.size === 0) continue; // Nothing reaches start.
    dfs(slug, slug, [slug], new Set([slug]), backDist);
  }
  return cycleKeys.size;
}

/** Capabilities with neither a `path:` nor a resolved `elements:` ref (MCP `capability_without_evidence`). */
export function capabilitiesWithoutImplementationEvidence(
  docs: readonly VaultHealthDoc[],
): string[] {
  const graph = compile(docs);
  const withResolvedElement = new Set(
    graph.edges
      .filter((edge) => edge.via === 'elements' && edge.resolved)
      .map((edge) => edge.from),
  );

  return graph.nodes
    .filter((node) => node.kind === 'capability')
    .filter((node) => {
      const hasPath = typeof node.path === 'string' && node.path.trim().length > 0;
      return !hasPath && !withResolvedElement.has(node.slug);
    })
    .map((node) => node.slug)
    .sort();
}

/** The six status-flipping checks of MCP `health()`, from raw frontmatter. */
export function computeVaultHealth(docs: readonly VaultHealthDoc[]): VaultHealthResult {
  const graph = compile(docs);
  const unresolvedEdges = graph.edges.filter((e) => !e.resolved && !e.external).length;
  const { actionable, ignored, actionableGroups } = actionableComponentCounts(graph);
  const dependencyCycles = dependencyCycleCount(graph);
  const missingContainment = missingDomainContainment(graph);
  const relationRecommendations = missingContainment.length;
  // Every actionable group except the largest.
  const islands = actionableGroups.slice(1);

  const checks: VaultHealthCheck[] = [
    // An empty vault fails, or a wrong folder reads as healthy.
    { id: 'vault_present', status: graph.nodes.length === 0 ? 'fail' : 'pass', count: graph.nodes.length },
    { id: 'compile_issues', status: graph.issueCount === 0 ? 'pass' : 'warn', count: graph.issueCount },
    { id: 'unresolved_edges', status: unresolvedEdges === 0 ? 'pass' : 'warn', count: unresolvedEdges },
    { id: 'dependency_cycles', status: dependencyCycles === 0 ? 'pass' : 'fail', count: dependencyCycles },
    {
      id: 'relation_recommendations',
      status: relationRecommendations === 0 ? 'pass' : 'warn',
      count: relationRecommendations,
    },
    { id: 'components', status: actionable <= 1 ? 'pass' : 'info', count: actionable },
  ];

  const status: VaultHealthStatus = checks.some(
    (check) => check.status === 'fail' || check.status === 'warn',
  )
    ? 'needs_attention'
    : 'healthy';

  return {
    status,
    checks,
    unavailableChecks: UNAVAILABLE_CHECKS,
    summary: {
      nodes: graph.nodes.length,
      edges: graph.edges.length,
      unresolvedEdges,
      issues: graph.issueCount,
      actionableComponents: actionable,
      ignoredComponents: ignored,
      dependencyCycles,
      relationRecommendations,
    },
    missingContainment,
    islands,
  };
}

/**
 * References no node answers to, grouped by name: concepts agents reached for that the vault
 * lacks. Resolved exactly like `compile()`; MCP twin: `resolve_dangling_reference`.
 */
export interface UnmatchedGraphAsk {
  /** The name as written in frontmatter. */
  ref: string;
  /** The frontmatter keys it was written under, sorted. */
  relations: string[];
  /** How many `(node, key)` references asked for it. */
  count: number;
  /** The nodes that asked, sorted. */
  sources: string[];
}

export function unmatchedGraphAsks(docs: readonly VaultHealthDoc[]): UnmatchedGraphAsk[] {
  const graph = compile(docs);
  const grouped = new Map<string, { relations: Set<string>; sources: Set<string>; count: number }>();
  for (const edge of graph.edges) {
    // `external` is an `elements:` source path: evidence, not a missing concept.
    if (edge.resolved || edge.external) continue;
    const entry = grouped.get(edge.ref) ?? {
      relations: new Set<string>(),
      sources: new Set<string>(),
      count: 0,
    };
    entry.relations.add(edge.via);
    entry.sources.add(edge.from);
    entry.count += 1;
    grouped.set(edge.ref, entry);
  }
  return [...grouped]
    .map(([ref, entry]) => ({
      ref,
      relations: [...entry.relations].sort(),
      count: entry.count,
      sources: [...entry.sources].sort(),
    }))
    .sort((a, b) => b.count - a.count || a.ref.localeCompare(b.ref));
}
