/**
 * Vault health — a faithful browser-side mirror of the MCP engine's
 * `query_ontology({operation:'health'})` verdict (`mcp/src/ontology-engine.mjs`
 * `health()` + `mcp/src/ontology-compiler.mjs`).
 *
 * WHY this exists (insights and the CLI disagreed on health; audit 2026-07-25):
 * `/ontology/insights` used to derive its repair queue and health score from
 * `deriveOntologyFromVault`, which AUTO-HEALS containment — a `domain: X`
 * frontmatter key becomes a synthetic `domain:X --contains--> node` edge. The
 * MCP compiler does NOT do this: `domain:` is only a node property plus a
 * `node --domain--> X` edge (`collectNeighborRefs` inline key), so a
 * capability/element whose domain never links back stays a disconnected island
 * AND a missing-containment recommendation. Result: the app said "nothing to
 * repair, 100%" while `node $ATLAS/cli/src/index.mjs health` said
 * `needs_attention` (2 islands, 3 missing containments) on the SAME vault — a
 * trust hole.
 *
 * This lib computes the SAME actionable checks from the raw vault frontmatter
 * (NOT the auto-healed derived graph), so both surfaces agree. A contract test
 * (`tests/contract/vault-health.contract.test.ts`) feeds one fixture vault
 * through BOTH this lib and the MCP engine and asserts identical
 * status + per-check counts, following the parser/validator contract pattern.
 *
 * Scope: the health VERDICT (status + actionable check counts). It deliberately
 * mirrors the six health checks the MCP engine flips status on
 * (vault_present · compile_issues · unresolved_edges · dependency_cycles ·
 * relation_recommendations · components), not the full engine API.
 */

import { ATLAS_CLI, ATLAS_CLI_HINT_EN } from '@/shared/config/cli-invocation';

/**
 * Checks the CLI reports that this browser mirror **does not run**.
 *
 * This file mirrors the compiled-graph engine, which answers six checks. The
 * health command answers eight: the MCP tool layer adds
 * frontmatter validation and a project meaning assessment on top of the engine's
 * verdict. Re-deriving the second one here would be a second implementation of
 * meaning assessment — a semantic judgement rather than a graph count — which is
 * exactly the drift this file's header was written against.
 *
 * So the two are named rather than silently missing. A surface that does not run
 * every check must not imply its list is the whole list: on this repository's own
 * vault the CLI answers `needs_attention` on the strength of one of them while
 * every check this mirror runs passes, so a screen reporting only these six would
 * be telling a person the opposite of what the command says.
 */
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

/** Minimal vault-doc shape — a subset of `VaultDoc` (slug + frontmatter). */
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
  /** A runnable command, not a bare binary name — there is no npm package. */
  where: string;
  /** How to fill in the placeholder `where` carries. A command nobody can run is not a remedy. */
  hint: string;
}

/** A capability/element whose `domain:` never links back (missing containment). */
interface MissingContainmentTarget {
  /** full node slug (e.g. `capabilities/invoice`) */
  slug: string;
  /** resolved domain slug that should back-link */
  domain: string;
}

export interface VaultHealthResult {
  status: VaultHealthStatus;
  checks: VaultHealthCheck[];
  /**
   * What this verdict did not look at. Empty would mean the list is complete;
   * it is not, and saying so is the difference between a scoped answer and a
   * wrong one.
   */
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
  /**
   * Concrete repair targets so the UI can link to the offending node — the
   * counts alone answer "how healthy", these answer "fix what". Sorted by slug.
   */
  missingContainment: MissingContainmentTarget[];
  /**
   * Member slugs of each actionable island BEYOND the largest (main) component,
   * i.e. the disconnected groups a user would want to reconnect. Largest group
   * omitted (that's the healthy trunk). Sorted, largest islands first.
   */
  islands: string[][];
}

// ── mirror of mcp/src/vault.mjs graph keys ──────────────────────────────────
// Array frontmatter keys that become graph edges. Kept in lockstep with
// `NEIGHBOR_KEYS` in mcp/src/vault.mjs; the contract test guards drift.
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
// frontmatter key → canonical edge `via`. Only `depends_on` differs.
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

// mcp/src/ontology-compiler.mjs isPathLikeGraphRef
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

// mcp/src/vault.mjs collectNeighborRefs (arrays + depends_on alias + inline domain)
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

// mcp normalizeRelationType — only depends_on collapses onto dependencies.
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

// Mirror of mcp/src/ontology-compiler.mjs compileOntology — only the parts the
// health verdict needs (alias map, edges, resolution, issue count).
/**
 * A document without `kind:` is **not an ontology node** — it is ordinary markdown
 * living in the same folder: a design document, a backlog, a release note.
 *
 * Measured 2026-08-17: the MCP compiler does not count these as nodes (verified —
 * adding one `kind:`-less document leaves `nodes` at 1), while this mirror
 * **counted them all**. Against our own document folder (83 of 163 files are plain
 * markdown) the screen said "83 things to fix" and the CLI called the same vault
 * healthy.
 *
 * The top of this file exists to prevent exactly that — *"the insights surface must
 * agree with the CLI"* — yet the two disagreed on what a node even is. For a user
 * this is the worst kind of wrong answer: **a map that names 83 unfixable problems**
 * is not believed about anything afterwards.
 *
 * Gate: `plain markdown without kind: is not a node` in
 * `tests/fixtures/vault-health-cases.mjs`.
 */
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

// Undirected connected components over resolved edges (mcp connectedComponentGroups
// with typeSet=null → all edge types), then drop groups that are only ignored kinds.
function actionableComponentCounts(graph: CompiledGraph): {
  actionable: number;
  ignored: number;
  /** actionable groups' member slugs, sorted largest-first. */
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

// mcp recommendRelations (missing_domain_containment): capability/element whose
// `domain:` resolves to a domain that does not link back via capabilities /
// elements / contains.
function missingDomainContainment(graph: CompiledGraph): MissingContainmentTarget[] {
  const slugSet = new Set(graph.nodes.map((n) => n.slug));
  // mcp resolveOptional: exact slug first, then single-target alias.
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

// mcp cycles over dependency edges (DFS, maxDepth 8). Mirrors the engine's
// `cycles({types:['dependencies']})` totalCycles.
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
   * Nodes that can reach `start` again within MAX_DEPTH, and their shortest
   * distance in edges. A branch into anything outside this set **can never close a
   * cycle**, so it is pruned — the result set is unchanged and only dead paths
   * disappear.
   *
   * WHY: the browser runs this on the main thread. Measured before pruning, on
   * 2000 nodes averaging 4 dependencies (strongly connected but with zero cycles of
   * length ≤ 8): 6.3 s blocked. After pruning: tens of milliseconds. Count parity
   * with the MCP engine is still enforced by
   * `tests/contract/vault-health.contract.test.ts`.
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
    // path is a closed walk start..start; drop trailing repeat, rotate to min.
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
      // If stepping to `next` leaves no budget to get back to start, this branch
      // cannot form a cycle. (Cycle length = path.length + backDist ≤ MAX_DEPTH.)
      const back = backDist.get(next);
      if (back === undefined || path.length + back > MAX_DEPTH) continue;
      visited.add(next);
      dfs(start, next, [...path, next], visited, backDist);
      visited.delete(next);
    }
  };

  for (const slug of sortedSlugs) {
    const backDist = reverseDistances(slug);
    if (backDist.size === 0) continue; // nothing reaches start — no cycle possible
    dfs(slug, slug, [slug], new Set([slug]), backDist);
  }
  return cycleKeys.size;
}

/**
 * Capability slugs whose vault record cannot lead an agent to implementation.
 * This is the browser-side twin of `maintenance_plan`'s
 * `capability_without_evidence` predicate: either one canonical `path:` or one
 * resolved `elements:` relation is sufficient. A dangling element ref or a raw
 * source path placed inside `elements:` is not.
 */
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

/**
 * Compute the vault health verdict from raw frontmatter, matching the MCP
 * engine's `health()` for the six status-flipping checks.
 */
export function computeVaultHealth(docs: readonly VaultHealthDoc[]): VaultHealthResult {
  const graph = compile(docs);
  const unresolvedEdges = graph.edges.filter((e) => !e.resolved && !e.external).length;
  const { actionable, ignored, actionableGroups } = actionableComponentCounts(graph);
  const dependencyCycles = dependencyCycleCount(graph);
  const missingContainment = missingDomainContainment(graph);
  const relationRecommendations = missingContainment.length;
  // Islands to reconnect = every actionable group except the largest (trunk).
  const islands = actionableGroups.slice(1);

  const checks: VaultHealthCheck[] = [
    // Ask whether there is anything to count first. With zero nodes the five checks
    // below all pass for want of anything to fail, and the verdict reads "healthy" —
    // leaving someone who pointed at the wrong folder no way to notice (measured
    // 2026-08-16; the MCP engine had the same defect).
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
 * **What an agent asked this vault for and did not get.**
 *
 * ## Why (2026-09-05)
 *
 * A relation *type* an agent invents never lands here — the write tools reject an
 * unknown `type` with a closest-value hint before touching a file, and that refusal is
 * returned to the caller and persisted nowhere. So the vault cannot say which relation
 * types agents keep reaching for.
 *
 * What it *can* say is the other half of the same question, and that half is on disk:
 * **a name written into frontmatter that no node in this vault answers to.** An agent
 * wrote `dependencies: [capabilities/holds-position]` because it believed that concept
 * existed. The reference is durable, dated by Git, and reviewable as a diff — and a
 * name three different nodes reached for is a concept this ontology is missing, not a
 * typo to swat.
 *
 * `computeVaultHealth` already counts these as `summary.unresolvedEdges` and stops at
 * the number. This returns the names behind it, grouped, so a person can read them.
 * It is the browser-side twin of the MCP maintenance plan's `resolve_dangling_reference`
 * action and resolves references exactly the way `compile()` does — the same aliases,
 * the same source-path exemption for `elements:` — so the two never disagree about what
 * is missing.
 */
export interface UnmatchedGraphAsk {
  /** The name written in frontmatter, verbatim. This vault has no node for it. */
  ref: string;
  /** The frontmatter keys it was written under, sorted. What the writer meant by it. */
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
    // `external` is an `elements:` source path — evidence pointing at code, not a
    // concept this vault failed to hold.
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
