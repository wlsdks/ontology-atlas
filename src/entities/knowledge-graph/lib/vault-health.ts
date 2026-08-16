/**
 * Vault health — a faithful browser-side mirror of the MCP engine's
 * `query_ontology({operation:'health'})` verdict (`mcp/src/ontology-engine.mjs`
 * `health()` + `mcp/src/ontology-compiler.mjs`).
 *
 * WHY this exists (C1 — 인사이트↔CLI 건강도 불일치, codex-audit 2026-07-25):
 * `/ontology/insights` used to derive its "수리 큐 / 건강도" from
 * `deriveOntologyFromVault`, which AUTO-HEALS containment — a `domain: X`
 * frontmatter key becomes a synthetic `domain:X --contains--> node` edge. The
 * MCP compiler does NOT do this: `domain:` is only a node property + a
 * `node --domain--> X` edge (`collectNeighborRefs` inline key), so a
 * capability/element whose domain never links back stays a disconnected island
 * AND a missing-containment recommendation. Result: the app said
 * "100% 수리할 것 없음" while `node $ATLAS/cli/src/index.mjs health` said `needs_attention`
 * (섬 2 · 누락 containment 3) on the SAME vault — a trust hole.
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

/** Minimal vault-doc shape — a subset of `VaultDoc` (slug + frontmatter). */
export interface VaultHealthDoc {
  slug: string;
  frontmatter: Record<string, unknown>;
  diagnostics?: ReadonlyArray<{ code: string }>;
}

export type VaultHealthStatus = 'healthy' | 'needs_attention';
export type VaultHealthCheckStatus = 'pass' | 'warn' | 'fail' | 'info';

export interface VaultHealthCheck {
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

/** A capability/element whose `domain:` never links back (missing containment). */
export interface MissingContainmentTarget {
  /** full node slug (e.g. `capabilities/invoice`) */
  slug: string;
  /** resolved domain slug that should back-link */
  domain: string;
}

export interface VaultHealthResult {
  status: VaultHealthStatus;
  checks: VaultHealthCheck[];
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
 * `kind:` 가 없는 문서는 **온톨로지 노드가 아니다** — 디자인 문서 · 백로그 ·
 * 릴리스 노트처럼 볼트 폴더 안에 같이 사는 평범한 마크다운이다.
 *
 * ## 왜 이 한 줄이 필요한가 (2026-08-17 실측)
 *
 * MCP 컴파일러는 이런 문서를 노드로 세지 않는데(확인: `kind:` 없는 문서 하나를
 * 넣어도 `nodes` 는 1), 이 사본은 **전부 셌다.** 그래서 우리 자신의 문서함
 * (163개 중 83개가 평범한 마크다운)에 대해 화면이 「고칠 곳 83군데」라고 말했고,
 * CLI 는 같은 볼트를 「정상」이라고 답했다.
 *
 * 이 파일 맨 위가 그 상황을 막으려고 존재한다 — *"the insights surface must
 * agree with the CLI"*. 그런데 정작 노드가 무엇인지에서 갈라져 있었다.
 * 사용자에게는 이게 가장 나쁜 종류의 오답이다: **고칠 수 없는 것 83개를 고치라고
 * 말하는 지도**는 그 뒤로 아무 말도 믿기지 않는다.
 *
 * 게이트: `tests/fixtures/vault-health-cases.mjs` 의
 * `plain markdown without kind: is not a node`.
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
    // head pointer 로 dequeue O(1) — Array.shift() 는 O(n) (repo 컨벤션)
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

  // 역방향 인접 — "여기서 start 로 몇 걸음에 돌아갈 수 있나"를 재려고 만든다.
  const inByType = new Map<string, string[]>();
  for (const [from, targets] of outByType) {
    for (const to of targets) {
      if (!inByType.has(to)) inByType.set(to, []);
      inByType.get(to)!.push(from);
    }
  }

  /**
   * start 로 MAX_DEPTH 이내에 되돌아올 수 있는 노드와 그 최단 거리(간선 수).
   * 이 안에 없는 노드로 뻗는 가지는 **절대 사이클을 못 닫으므로** 탐색에서
   * 잘라낸다 — 결과 집합은 그대로이고(정확성 보존) 죽은 경로 탐색만 사라진다.
   *
   * WHY: 브라우저(인사이트 화면)가 이 계산을 메인 스레드에서 돌린다. 가지치기
   * 전 실측 — 2000노드 × 평균 4의존(강연결이지만 길이 ≤8 사이클은 0)에서
   * 6.3초 블로킹. 가지치기 후 두 자릿수 ms. MCP 엔진과의 카운트 동일성은
   * `tests/contract/vault-health.contract.test.ts` 가 계속 강제한다.
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
      // next 를 밟은 뒤 start 까지 남은 예산 안에 못 돌아오면 이 가지는 사이클을
      // 만들 수 없다 → 자른다. (사이클 노드 수 = path.length + backDist ≤ MAX_DEPTH)
      const back = backDist.get(next);
      if (back === undefined || path.length + back > MAX_DEPTH) continue;
      visited.add(next);
      dfs(start, next, [...path, next], visited, backDist);
      visited.delete(next);
    }
  };

  for (const slug of sortedSlugs) {
    const backDist = reverseDistances(slug);
    if (backDist.size === 0) continue; // 아무도 start 로 못 돌아옴 → 사이클 불가
    dfs(slug, slug, [slug], new Set([slug]), backDist);
  }
  return cycleKeys.size;
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
    // 셀 것이 있는가를 먼저 묻는다. 노드가 0개면 아래 다섯이 전부 셀 것이
    // 없어 통과하고 「정상」이 나온다 — 폴더를 잘못 짚은 사람이 그 사실을
    // 알아챌 자리가 없어진다 (2026-08-16 실측, MCP 엔진과 같은 결함이었다).
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
