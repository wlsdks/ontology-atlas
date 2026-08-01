import { createHash } from 'node:crypto';

import { GRAPH_ARRAY_KEYS, collectNeighborRefs, normalizeRelationRefs } from './vault.mjs';

const COMPILER_VERSION = 1;

/**
 * `summary: true` 면 nodes / edges / aliases 배열을 생략하고 카운트/aggregate
 * 만 반환 — AI agent 가 graphHash 변화 감지 + 사이즈 판단용 cheap call. 큰
 * vault (100+ 노드) 에서 토큰 한도 초과 회피.
 *
 * `nodesLimit / nodesOffset` (또는 `edgesLimit / edgesOffset`) 가 있으면 그
 * 배열을 slice 해서 `nodesPagination: { offset, limit, total, hasMore,
 * nextOffset }` 메타와 함께 반환. summary 가 우선 (둘 다 주면 summary 만).
 */
export function compileOntology(docs, options = {}) {
  const includeIndexes = optionalBoolean(options.includeIndexes, 'includeIndexes') ?? false;
  const summary = optionalBoolean(options.summary, 'summary') ?? false;
  const nodesLimit = optionalPositiveInt(options.nodesLimit, 'nodesLimit', { max: 500 });
  const nodesOffset = optionalNonNegativeInt(options.nodesOffset, 'nodesOffset') ?? 0;
  const edgesLimit = optionalPositiveInt(options.edgesLimit, 'edgesLimit', { max: 500 });
  const edgesOffset = optionalNonNegativeInt(options.edgesOffset, 'edgesOffset') ?? 0;
  const nodeMap = new Map();
  const aliasEntries = new Map();

  /**
   * **`kind:` 없는 `.md` 는 노드가 아니다** (2026-07-29 실측).
   *
   * `AGENTS.md` 가 계약을 이렇게 적는다: *"each `.md` with a frontmatter
   * `kind:` is an ontology node"*. `list`·`validate`·웹 런타임
   * (`deriveDocNode` 는 kind 가 비면 `null` 을 낸다)은 그 계약을 지켰는데,
   * 컴파일러만 모든 `.md` 를 노드로 받았다. 그래서 볼트에 평범한 메모 한 장만
   * 있어도:
   *
   *   list 97 · compile 98 · overview 98      ← 같은 볼트, 다른 숫자
   *   compile --summary: nodeCount 4, byKind { domain: 1 }   ← 한 산출물 안에서 모순
   *
   * 게다가 kind 없는 노드가 `overview`/`hubs` 의 결과 계약(비어 있지 않은
   * `kind` 요구)에 걸려 **명령 전체가 exit 2** 로 죽었다 — 파일 이름도 안
   * 알려주는 내부 문자열과 함께, 방금 `validate` 가 통과시킨 볼트에서.
   *
   * 문서·검증기·웹이 이미 한쪽에 서 있으므로 컴파일러를 그쪽으로 옮긴다.
   * 세는 범위가 달라지는 것이 아니라, **원래 계약이던 범위로 돌아간다.**
   */
  const graphDocs = docs.filter((doc) => {
    const kind = doc?.frontmatter?.kind;
    return typeof kind === 'string' && kind.trim() !== '';
  });
  const skippedNonNodeCount = docs.length - graphDocs.length;

  for (const doc of graphDocs) {
    nodeMap.set(doc.slug, doc);
    addAlias(aliasEntries, doc.slug, doc.slug);
    const tail = doc.slug.split('/').pop();
    if (tail && tail !== doc.slug) addAlias(aliasEntries, tail, doc.slug);
    const frontmatterSlug = doc.frontmatter?.slug;
    if (typeof frontmatterSlug === 'string' && frontmatterSlug.trim()) {
      addAlias(aliasEntries, frontmatterSlug.trim(), doc.slug);
    }
  }

  const aliases = [];
  const ambiguousAliases = [];
  const aliasToSlug = new Map();
  for (const [alias, slugs] of [...aliasEntries].sort(([a], [b]) => a.localeCompare(b))) {
    const sortedSlugs = [...slugs].sort();
    if (sortedSlugs.length === 1) {
      aliasToSlug.set(alias, sortedSlugs[0]);
      aliases.push({ alias, slug: sortedSlugs[0] });
    } else {
      ambiguousAliases.push({ alias, slugs: sortedSlugs });
    }
  }

  const issues = ambiguousAliases.map(({ alias, slugs }) => ({
    code: 'ambiguous-alias',
    severity: 'warning',
    alias,
    slugs,
    message: `Alias "${alias}" resolves to multiple nodes: ${slugs.join(', ')}`,
  }));

  const edges = [];
  const edgeKeys = new Set();
  const canonicalizationActions = [];
  for (const doc of graphDocs) {
    const frontmatterPatch = {};
    const keys = [];
    for (const key of GRAPH_ARRAY_KEYS) {
      const value = doc.frontmatter?.[key];
      if (!Array.isArray(value)) continue;
      const canonical = normalizeRelationRefs(value);
      const alreadyCanonical =
        value.length === canonical.length &&
        value.every((item, index) => item === canonical[index]);
      if (alreadyCanonical) {
        continue;
      }
      frontmatterPatch[key] = canonical;
      keys.push(key);
    }
    if (keys.length > 0) {
      canonicalizationActions.push({
        slug: doc.slug,
        keys,
        frontmatter: frontmatterPatch,
        expected_mtime: doc.mtime,
      });
    }
    for (const { key, ref } of collectNeighborRefs(doc)) {
      const resolved = aliasToSlug.get(ref) || null;
      const external = !resolved && key === 'elements' && isPathLikeGraphRef(ref);
      const to = resolved || ref;
      const edgeKey = `${doc.slug}\0${to}\0${key}\0${ref}`;
      if (edgeKeys.has(edgeKey)) continue;
      edgeKeys.add(edgeKey);
      const edge = {
        id: `${doc.slug}->${to}:${key}:${ref}`,
        from: doc.slug,
        to,
        via: key,
        ref,
        resolved: Boolean(resolved),
        external,
      };
      edges.push(edge);
      if (!resolved && !external) {
        issues.push({
          code: 'dangling-graph-reference',
          severity: 'warning',
          slug: doc.slug,
          via: key,
          ref,
          message: `Graph reference "${ref}" from "${doc.slug}" via "${key}" does not resolve to a vault node.`,
        });
      }
    }
  }
  edges.sort((a, b) =>
    `${a.from}:${a.via}:${a.to}:${a.ref}`.localeCompare(`${b.from}:${b.via}:${b.to}:${b.ref}`),
  );

  const nodes = [...graphDocs]
    .map((doc) => ({
      slug: doc.slug,
      kind: doc.frontmatter?.kind,
      title: doc.frontmatter?.title || doc.frontmatter?.name || doc.slug,
      domain: doc.frontmatter?.domain,
      ...(typeof doc.frontmatter?.path === 'string' && doc.frontmatter.path.trim()
        ? { path: doc.frontmatter.path }
        : {}),
      mtime: doc.mtime,
      outDegree: 0,
      inDegree: 0,
    }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
  const nodeBySlug = new Map(nodes.map((node) => [node.slug, node]));
  const out = {};
  const incoming = {};
  const edgeById = {};
  for (const edge of edges) {
    edgeById[edge.id] = edge;
    if (!out[edge.from]) out[edge.from] = [];
    out[edge.from].push(edge.id);
    const fromNode = nodeBySlug.get(edge.from);
    if (fromNode) fromNode.outDegree += 1;
    if (!edge.resolved) continue;
    if (!incoming[edge.to]) incoming[edge.to] = [];
    incoming[edge.to].push(edge.id);
    const toNode = nodeBySlug.get(edge.to);
    if (toNode) toNode.inDegree += 1;
  }
  for (const edgeIds of Object.values(out)) edgeIds.sort();
  for (const edgeIds of Object.values(incoming)) edgeIds.sort();
  const byKind = groupNodes(nodes, 'kind');
  const byDomain = groupNodes(nodes, 'domain');
  const aliasToSlugIndex = Object.fromEntries(aliases.map(({ alias, slug }) => [alias, slug]));
  const graphHash = hashGraph({
    version: COMPILER_VERSION,
    nodes: nodes.map(({ slug, kind, title, domain, outDegree, inDegree }) => ({
      slug,
      kind,
      title,
      domain,
      outDegree,
      inDegree,
    })),
    edges,
    aliases,
    ambiguousAliases,
    issues,
  });

  const nodeCount = nodes.length;
  const edgeCount = edges.length;
  const resolvedEdgeCount = edges.filter((edge) => edge.resolved).length;
  const externalEdgeCount = edges.filter((edge) => edge.external).length;
  const unresolvedEdgeCount = edges.filter(
    (edge) => !edge.resolved && !edge.external,
  ).length;
  const maxMtime = Math.max(0, ...nodes.map((node) => Number(node.mtime) || 0));
  // 문서가 없어 노드가 되지 못한, 그러나 볼트가 이름을 적어 둔 개념의 수.
  // 웹 지도/인사이트는 이것들도 개념으로 그리므로(도그푸드 96 문서 + 193
  // 참조 = 289) 이 수를 같이 내지 않으면 화면과 CLI 가 서로 다른 총계를
  // 말하는데 어느 쪽도 그 차이를 설명하지 않는다. 노드로 승격하지는 않는다 —
  // census·중심성·health 는 여전히 "문서가 있는 개념" 만 센다.
  const referencedOnlyCount = new Set(
    edges.filter((edge) => !edge.resolved).map((edge) => edge.ref),
  ).size;

  // summary mode — 배열 전부 omit, 카운트와 aggregate 만. 큰 vault 에서
  // AI agent 가 토큰 한도 초과 없이 graphHash / 변화 감지 / 사이즈 판단 가능.
  // byKind / byDomain 은 *slug list* 가 아닌 *count* 로 응축.
  // 응답에 marker 안 둠 — 호출자가 자기가 요청한 거 안다.
  if (summary) {
    return {
      version: COMPILER_VERSION,
      graphHash,
      maxMtime,
      nodeCount,
    skippedNonNodeCount,
      // 노드가 아닌 `.md`(kind 없음) 몇 장을 지나쳤는지 — 조용히 건너뛰지
      // 않는다. 볼트에 평범한 메모가 섞이는 건 정상이라 issue 는 아니다.
      skippedNonNodeCount,
      edgeCount,
      resolvedEdgeCount,
      externalEdgeCount,
      unresolvedEdgeCount,
      referencedOnlyCount,
      aliasCount: aliases.length,
      ambiguousAliasCount: ambiguousAliases.length,
      issueCount: issues.length,
      canonicalizationActionCount: canonicalizationActions.length,
      byKind: countByGroup(nodes, 'kind'),
      byDomain: countByGroup(nodes, 'domain'),
    };
  }

  // Pagination — slice + meta. 미지정 시 전체 반환 (backward compat).
  const slicedNodes = sliceWithMeta(nodes, nodesOffset, nodesLimit);
  const slicedEdges = sliceWithMeta(edges, edgesOffset, edgesLimit);

  return {
    version: COMPILER_VERSION,
    graphHash,
    maxMtime,
    nodeCount,
    edgeCount,
    resolvedEdgeCount,
    externalEdgeCount,
    unresolvedEdgeCount,
    referencedOnlyCount,
    aliasCount: aliases.length,
    ambiguousAliasCount: ambiguousAliases.length,
    issueCount: issues.length,
    canonicalizationActionCount: canonicalizationActions.length,
    byKind: countByGroup(nodes, 'kind'),
    byDomain: countByGroup(nodes, 'domain'),
    nodes: slicedNodes.items,
    edges: slicedEdges.items,
    ...(slicedNodes.paginated ? { nodesPagination: slicedNodes.meta } : {}),
    ...(slicedEdges.paginated ? { edgesPagination: slicedEdges.meta } : {}),
    aliases,
    ambiguousAliases,
    issues,
    canonicalizationActions,
    indexes: includeIndexes
      ? { out, in: incoming, byKind, byDomain, edgeById, aliasToSlug: aliasToSlugIndex }
      : undefined,
  };
}

function optionalNonNegativeInt(value, name) {
  if (value === undefined) return null;
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return value;
}

function optionalPositiveInt(value, name, options = {}) {
  if (value === undefined) return null;
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  if (options.max !== undefined && value > options.max) {
    throw new Error(`${name} must be <= ${options.max}`);
  }
  return value;
}

function optionalBoolean(value, name) {
  if (value === undefined) return null;
  if (typeof value !== 'boolean') {
    throw new Error(`${name} must be a boolean`);
  }
  return value;
}

function countByGroup(nodes, key) {
  const counts = {};
  for (const node of nodes) {
    const value = node[key];
    if (typeof value !== 'string' || !value.trim()) continue;
    counts[value] = (counts[value] || 0) + 1;
  }
  // 알파벳 sort — deterministic
  return Object.fromEntries(
    Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)),
  );
}

function sliceWithMeta(items, offset, limit) {
  const total = items.length;
  if (limit === null && offset === 0) {
    return { items, paginated: false };
  }
  const start = Math.min(offset, total);
  const end = limit === null ? total : Math.min(start + limit, total);
  const slice = items.slice(start, end);
  const hasMore = end < total;
  return {
    items: slice,
    paginated: true,
    meta: {
      offset: start,
      limit: limit ?? total - start,
      total,
      returned: slice.length,
      hasMore,
      nextOffset: hasMore ? end : null,
    },
  };
}

function groupNodes(nodes, key) {
  const grouped = {};
  for (const node of nodes) {
    const value = node[key];
    if (typeof value !== 'string' || !value.trim()) continue;
    if (!grouped[value]) grouped[value] = [];
    grouped[value].push(node.slug);
  }
  for (const slugs of Object.values(grouped)) slugs.sort();
  return Object.fromEntries(Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)));
}

function hashGraph(payload) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function isPathLikeGraphRef(ref) {
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

function addAlias(aliasEntries, alias, slug) {
  if (typeof alias !== 'string' || !alias.trim()) return;
  const key = alias.trim();
  if (!aliasEntries.has(key)) aliasEntries.set(key, new Set());
  aliasEntries.get(key).add(slug);
}
