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
    /** The search hit its step budget, so `dependencyCycles` is a floor. */
    dependencyCyclesPartial: boolean;
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

function compileHealthGraph(input: readonly VaultHealthDoc[]): CompiledGraph {
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

// Undirected components over resolved edges by BFS, O(V + E); groups of only ignored kinds drop.
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

/** DFS calls the cycle count may spend, as many as the Insights cycle list; past it the count is a floor. */
const CYCLE_STEP_BUDGET = 500_000;

// Dependency cycles up to MAX_DEPTH, matching the engine's `cycles({types:['dependencies']})`, where a
// node that depends on itself is a cycle of one. Each is counted once, from its smallest slug (the
// minimum-vertex rule), so no key set grows with the count. Worst case O(V·b^MAX_DEPTH) for out-degree
// b, stopped at CYCLE_STEP_BUDGET calls; a reverse BFS per start over the slugs above it, O(V·(V+E)),
// prunes branches that cannot close.
function dependencyCycleCount(graph: CompiledGraph): { count: number; partial: boolean } {
  const MAX_DEPTH = 8;
  const successors = new Map<string, Set<string>>();
  const predecessors = new Map<string, Set<string>>();
  const selfDependent = new Set<string>();
  const link = (links: Map<string, Set<string>>, from: string, to: string) => {
    const targets = links.get(from);
    if (targets) targets.add(to);
    else links.set(from, new Set([to]));
  };
  for (const edge of graph.edges) {
    if (!edge.resolved || normalizeRelationType(edge.via) !== 'dependencies') continue;
    if (edge.from === edge.to) {
      selfDependent.add(edge.from);
      continue;
    }
    link(successors, edge.from, edge.to);
    link(predecessors, edge.to, edge.from);
  }

  const reverseDistances = (start: string): Map<string, number> => {
    const dist = new Map<string, number>();
    let frontier = [start];
    for (let step = 1; step <= MAX_DEPTH && frontier.length > 0; step += 1) {
      const next: string[] = [];
      for (const node of frontier) {
        for (const prev of predecessors.get(node) ?? []) {
          if (prev <= start || dist.has(prev)) continue;
          dist.set(prev, step);
          next.push(prev);
        }
      }
      frontier = next;
    }
    return dist;
  };

  let count = selfDependent.size;
  let steps = 0;
  let partial = false;
  const onPath = new Set<string>();
  const dfs = (start: string, current: string, length: number, backDist: Map<string, number>) => {
    if (steps++ > CYCLE_STEP_BUDGET) {
      partial = true;
      return;
    }
    for (const next of successors.get(current) ?? []) {
      if (next === start) {
        count += 1;
        continue;
      }
      if (next < start || onPath.has(next) || length >= MAX_DEPTH) continue;
      // Cycle length = length + backDist ≤ MAX_DEPTH, or this branch cannot close.
      const back = backDist.get(next);
      if (back === undefined || length + back > MAX_DEPTH) continue;
      onPath.add(next);
      dfs(start, next, length + 1, backDist);
      onPath.delete(next);
      if (partial) return;
    }
  };

  for (const start of [...successors.keys()].sort()) {
    const backDist = reverseDistances(start);
    if (backDist.size === 0) continue;
    onPath.add(start);
    dfs(start, start, 1, backDist);
    onPath.delete(start);
    if (partial) break;
  }
  return { count, partial };
}

/** Capabilities with neither a `path:` nor a resolved `elements:` ref (MCP `capability_without_evidence`). */
export function capabilitiesWithoutImplementationEvidence(
  docs: readonly VaultHealthDoc[],
): string[] {
  const graph = compileHealthGraph(docs);
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
  const graph = compileHealthGraph(docs);
  const unresolvedEdges = graph.edges.filter((e) => !e.resolved && !e.external).length;
  const { actionable, ignored, actionableGroups } = actionableComponentCounts(graph);
  const { count: dependencyCycles, partial: dependencyCyclesPartial } = dependencyCycleCount(graph);
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
      dependencyCyclesPartial,
      relationRecommendations,
    },
    missingContainment,
    islands,
  };
}

/**
 * References no node answers to, grouped by name: concepts agents reached for that the vault
 * lacks. Resolved exactly like `compileHealthGraph()` and MCP `compile()`; MCP twin: `resolve_dangling_reference`.
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
  const graph = compileHealthGraph(docs);
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
