import {
  resolveNodeAgentTarget,
  resolveNodeDocument,
  type KnowledgeGraphEdge,
  type KnowledgeGraphNode,
} from "@/entities/knowledge-graph";
import { buildContainmentParents, nearestDomainId } from "@/shared/lib/ontology-tree";

/**
 * 「비슷한 이름 — 같은 걸까요?」 카드의 계산.
 *
 * 중복 개념은 자라는 폴더의 1번 고장이다. 그 판정을 화면이 새로 정의하면
 * 사람은 화면에서, 에이전트는 `query_ontology({operation:"similar_nodes"})`
 * 에서 서로 다른 쌍을 보게 된다 — 그 순간 이 카드는 정비 근거가 아니라
 * 소음이다. 그래서 아래 세 함수는 MCP 엔진(`mcp/src/ontology-engine.mjs` 의
 * `textTokens` · `setJaccard` · `similarityScore`)을 **그대로 옮긴 미러**이고,
 * 어긋나면 `tests/contract/duplicate-pairs.contract.test.ts` 가 잡는다.
 *
 * 가중치도 엔진과 같다: slug 0.35 · title 0.35 · kind 0.1 · domain 0.1 ·
 * 이웃 0.1. 이름만 겹치는 쌍(0.7 상한)과 소속·이웃까지 겹치는 쌍을 갈라
 * 보려는 배분이라 임의로 재조정하지 않는다.
 */

/** 엔진 `textTokens` 미러 — 소문자화 후 영숫자 덩어리만, 2자 미만은 버린다. */
export function similarityTokens(value: string | null | undefined): string[] {
  return String(value ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2);
}

/** 엔진 `setJaccard` 미러 — 교집합 / 합집합. 한쪽이 비면 0. */
export function tokenSetJaccard(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): number {
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const value of left) {
    if (right.has(value)) intersection += 1;
  }
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
}

/** 엔진 `roundScore` 미러 — 부동소수 꼬리 때문에 두 엔진이 갈라지지 않게. */
function roundScore(value: number): number {
  return Number(value.toFixed(6));
}

/** 유사도 계산에 들어가는 노드 한 벌 — 엔진의 node 요약과 같은 필드. */
export interface SimilarityCandidate {
  slug: string;
  title: string;
  kind: string | null;
  /** 소속 도메인 식별자. 도메인 노드 자신은 소속이 없다(엔진과 동일). */
  domain: string | null;
  /** 무방향 이웃 식별자 집합. */
  neighbors: ReadonlySet<string>;
}

export interface SimilaritySignals {
  slug: number;
  title: number;
  kind: number;
  domain: number;
  neighbors: number;
  total: number;
}

/** 엔진 `similarityScore` 미러. */
export function scoreNodeSimilarity(
  left: SimilarityCandidate,
  right: SimilarityCandidate,
): SimilaritySignals {
  const slug =
    tokenSetJaccard(new Set(similarityTokens(left.slug)), new Set(similarityTokens(right.slug))) *
    0.35;
  const title =
    tokenSetJaccard(new Set(similarityTokens(left.title)), new Set(similarityTokens(right.title))) *
    0.35;
  const kind = left.kind && right.kind && left.kind === right.kind ? 0.1 : 0;
  const domain = left.domain && right.domain && left.domain === right.domain ? 0.1 : 0;
  const neighbors = tokenSetJaccard(left.neighbors, right.neighbors) * 0.1;
  return {
    slug: roundScore(slug),
    title: roundScore(title),
    kind: roundScore(kind),
    domain: roundScore(domain),
    neighbors: roundScore(neighbors),
    total: roundScore(slug + title + kind + domain + neighbors),
  };
}

/** 중복 의심 한 쌍. `keep` 은 남길 쪽, `dissolve` 는 접을 쪽(연결이 적은 쪽). */
export interface DuplicatePairRow {
  id: string;
  keepId: string;
  keepSlug: string;
  keepTitle: string;
  dissolveId: string;
  dissolveSlug: string;
  dissolveTitle: string;
  /** 두 노드의 kind 가 같으면 그 kind, 다르면 null. */
  kind: string | null;
  /** 0~1 유사도 — MCP `similar_nodes` 의 score 와 같은 수. */
  score: number;
  /** 사람이 읽을 근거 — 두 이름에 함께 나오는 낱말. */
  sharedTokens: string[];
}

export interface DuplicatePairs {
  rows: DuplicatePairRow[];
  /**
   * 접혀 있는 나머지 쌍 — 「더 보기」 펼침이 그리는 계층.
   *
   * 2026-07-27 실측: 배지는 10건이라 말하는데 화면에 3행만 있었고 더 보기도
   * 없었다. 나머지 7건은 이 화면에서 **발견될 방법 자체가 없었다** — 총계만
   * 크게 적고 나머지를 조용히 숨기는 건 절단이 아니라 은폐다.
   */
  restRows: DuplicatePairRow[];
  /** 임계값을 넘은 전체 쌍 수 — 「상위 N / 전체 M」 절단 문구의 M. */
  suspectCount: number;
}

/**
 * 중복으로 의심할 최소 유사도. 도그푸드 볼트(96개념) 실측에서 0.6 아래는
 * 이름 앞머리만 같은 서로 다른 개념(예: 같은 접두어를 쓰는 계약 문서들)이
 * 대부분이라, 사람이 확인할 값어치가 있는 구간의 바닥으로 잡았다.
 */
export const DUPLICATE_SUSPECT_MIN_SCORE = 0.6;

/**
 * 이름 낱말이 하나도 안 겹치는 쌍은 slug·title 신호가 0이라 최대 0.3 —
 * 임계값에 닿을 수 없다. 그래서 낱말 역색인으로 후보를 좁힌다(의미는 그대로,
 * n² 비교만 피한다).
 */
const MAX_SCORE_WITHOUT_SHARED_TOKEN = 0.3;

/**
 * 근거 낱말에서 빼는 폴더 이름 — `elements/foo` 와 `elements/bar` 는 같은
 * 폴더에 있다는 사실만 공유한다. 점수 계산(엔진 미러)에는 그대로 두고,
 * 사람에게 보여줄 근거에서만 뺀다.
 */
function slugFolders(slug: string): string[] {
  const segments = slug.split("/");
  return segments.slice(0, -1).flatMap((segment) => similarityTokens(segment));
}

/** 그래프 노드 하나를 엔진과 같은 필드로 환산한 것. */
export type GraphSimilarityCandidate = SimilarityCandidate & { node: KnowledgeGraphNode };

/**
 * 이 노드를 에이전트에게 가리켜 보일 이름. 화면이 복사해 주는
 * `merge_concepts` / `get_concept` 이 그대로 실행되려면 볼트 뿌리 기준
 * 이름이어야 한다 — `evidenceIds[0]` 을 그대로 쓰던 동안 번들 샘플의
 * `ontology/` 한 조각 때문에 복사한 호출이 즉시 실패했다(2026-07-26 실측).
 * 유사도 점수도 같은 값으로 낸다: 에이전트 쪽 `similar_nodes` 는 볼트 뿌리
 * 기준 slug 로 낱말을 자르므로, 접두사가 붙은 값으로 재면 두 순위가 갈린다.
 */
function slugOf(node: KnowledgeGraphNode): string {
  return resolveNodeAgentTarget(node).ref ?? node.id;
}

/**
 * 이 노드에 **자기 문서**가 있는가.
 *
 * 파생 그래프에는 문서 없이 참조에서 태어난 노드가 섞인다 — 다른 문서의
 * `elements:` 에 적힌 코드 경로 같은 것들이다. 그런 노드는 근거 slug 가
 * 자기 것이 아니라 자기를 부른 문서의 것이라, 합치기를 제안하면 엉뚱한
 * 파일을 가리킨다. 실제로 도그푸드에서 「Test Name Pattern ↔ Test Name
 * Pattern Test」(원본 파일과 그 테스트 파일)가 겹침 100%로 올라왔다 —
 * 중복이 아니라 이름이 닮은 두 파일이다.
 *
 * 판별은 `resolveNodeDocument` 한 곳에서만 한다 — derive 가 노드를 만들 때
 * 남긴 사실(`hasOwnDocument`)을 읽을 뿐 화면이 다시 추정하지 않는다. 예전의
 * "id 꼬리와 문서 slug 꼬리가 같은가" 추정은 **프로젝트 노드를 놓쳤다**:
 * 프로젝트 id 는 frontmatter `slug:` 로 만들어져(`ontology/project.md` →
 * `project:ontology-atlas`) 파일 이름 꼬리와 다르다. 같은 개념을 두 곳에서
 * 각자 판정하면 반드시 갈라진다.
 */
function hasOwnDocument(node: KnowledgeGraphNode): boolean {
  return resolveNodeDocument(node).ownSlug !== null;
}

/**
 * 그래프 노드를 엔진의 유사도 입력으로 환산한다 — 화면과 contract test 가
 * 같은 환산을 쓰도록 한 곳에서만 만든다. 자기 문서가 없는 노드는 후보에서도
 * 이웃 집합에서도 빠진다(컴파일러의 그래프와 같은 대상만 본다).
 *
 * `domain` 은 담기 관계를 거슬러 올라간 가장 가까운 도메인의 문서 slug 다.
 * 컴파일러는 같은 값을 frontmatter `domain:` 에서 바로 읽는다 — 스키마가
 * 그 키를 자식 쪽에 쓰기 때문에 두 경로가 같은 값에 닿는다. 도메인 노드
 * 자신은 소속이 없다(엔진의 domain 도 비어 있다).
 */
export function buildSimilarityCandidates(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
): Map<string, GraphSimilarityCandidate> {
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const));
  const parentOf = buildContainmentParents(edges, nodeById);
  const documented = new Map(
    nodes.filter(hasOwnDocument).map((node) => [node.id, node] as const),
  );

  // 이웃 집합은 엔진의 `traversalEdges(slug,'undirected')` 와 같은 뜻 —
  // 관계 방향을 가리지 않는 인접 문서 slug 집합.
  const neighborsOf = new Map<string, Set<string>>();
  const addNeighbor = (fromId: string, toId: string) => {
    const from = documented.get(fromId);
    const to = documented.get(toId);
    if (!from || !to || from.id === to.id) return;
    let set = neighborsOf.get(from.id);
    if (!set) {
      set = new Set();
      neighborsOf.set(from.id, set);
    }
    set.add(slugOf(to));
  };
  for (const edge of edges) {
    addNeighbor(edge.from, edge.to);
    addNeighbor(edge.to, edge.from);
  }

  const candidates = new Map<string, GraphSimilarityCandidate>();
  for (const node of documented.values()) {
    // 도메인 조상 탐색은 전체 그래프에서 한다 — 중간에 문서 없는 노드가
    // 끼어 있어도 소속은 그대로 도메인에 닿는다.
    const domainId = node.kind === "domain" ? null : nearestDomainId(node, parentOf, nodeById);
    const domainNode = domainId ? nodeById.get(domainId) : null;
    candidates.set(node.id, {
      node,
      slug: slugOf(node),
      // 점수는 검색/매칭의 진실원인 `title` 로 낸다 — `display` 는 렌더 전용.
      title: node.title,
      kind: node.kind || null,
      domain: domainNode ? slugOf(domainNode) : null,
      neighbors: neighborsOf.get(node.id) ?? new Set<string>(),
    });
  }
  return candidates;
}

export function buildDuplicatePairs(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  limit: number,
  minScore = DUPLICATE_SUSPECT_MIN_SCORE,
  /**
   * 펼침에 실을 나머지 행 수. 0 이면 접힌 계층이 없다(구 호출자 동작 유지).
   * 값의 근거는 소비처가 실측으로 정한다 — 여기서는 자르기만 한다.
   */
  restLimit = 0,
): DuplicatePairs {
  const empty: DuplicatePairs = { rows: [], restRows: [], suspectCount: 0 };
  if (nodes.length < 2) return empty;

  const candidates = buildSimilarityCandidates(nodes, edges);
  if (candidates.size < 2) return empty;

  // 낱말 → 노드 역색인. 임계값이 낱말 없이 도달 가능한 상한보다 낮으면
  // 좁히기가 결과를 바꿀 수 있으므로 전수 비교로 되돌린다.
  const useTokenIndex = minScore > MAX_SCORE_WITHOUT_SHARED_TOKEN;
  const nodesByToken = new Map<string, string[]>();
  if (useTokenIndex) {
    for (const [id, candidate] of candidates) {
      const tokens = new Set([
        ...similarityTokens(candidate.slug),
        ...similarityTokens(candidate.title),
      ]);
      for (const token of tokens) {
        const bucket = nodesByToken.get(token);
        if (bucket) bucket.push(id);
        else nodesByToken.set(token, [id]);
      }
    }
  }

  const degreeOf = (id: string): number => candidates.get(id)?.neighbors.size ?? 0;
  const seen = new Set<string>();
  const scored: DuplicatePairRow[] = [];

  const consider = (leftId: string, rightId: string) => {
    // 합성 키에 NUL 을 쓰면 그 파일이 git 에게 **바이너리**가 되어 PR 에서
    // diff 가 안 보이고 grep 이 파일을 건너뛴다 (2026-08-08 검수에서 실제로
    // 사고가 났다). JSON 배열은 인쇄 가능하면서 애매함이 없다.
    const pairKey =
      leftId < rightId
        ? JSON.stringify([leftId, rightId])
        : JSON.stringify([rightId, leftId]);
    if (seen.has(pairKey)) return;
    seen.add(pairKey);
    const left = candidates.get(leftId);
    const right = candidates.get(rightId);
    if (!left || !right) return;
    const score = scoreNodeSimilarity(left, right);
    if (score.total < minScore) return;

    // 남길 쪽 = 연결이 많은 쪽. 합치면 백링크가 그쪽으로 모이므로 다시 이을
    // 관계가 가장 적다. 동률이면 이름 순으로 고정해 매번 같은 제안을 준다.
    const leftKeeps =
      degreeOf(leftId) !== degreeOf(rightId)
        ? degreeOf(leftId) > degreeOf(rightId)
        : left.slug.localeCompare(right.slug) <= 0;
    const keep = leftKeeps ? left : right;
    const dissolve = leftKeeps ? right : left;

    const folders = new Set([...slugFolders(keep.slug), ...slugFolders(dissolve.slug)]);
    const keepTokens = new Set([
      ...similarityTokens(keep.slug),
      ...similarityTokens(keep.title),
    ]);
    const sharedTokens = [
      ...new Set([...similarityTokens(dissolve.slug), ...similarityTokens(dissolve.title)]),
    ]
      .filter((token) => keepTokens.has(token) && !folders.has(token))
      .sort((a, b) => b.length - a.length || a.localeCompare(b));

    scored.push({
      id: JSON.stringify([keep.slug, dissolve.slug]),
      keepId: keep.node.id,
      keepSlug: keep.slug,
      keepTitle: keep.node.display ?? keep.node.title,
      dissolveId: dissolve.node.id,
      dissolveSlug: dissolve.slug,
      dissolveTitle: dissolve.node.display ?? dissolve.node.title,
      kind: keep.kind === dissolve.kind ? keep.kind : null,
      score: score.total,
      sharedTokens,
    });
  };

  if (useTokenIndex) {
    for (const bucket of nodesByToken.values()) {
      for (let i = 0; i < bucket.length; i += 1) {
        for (let j = i + 1; j < bucket.length; j += 1) consider(bucket[i], bucket[j]);
      }
    }
  } else {
    const ids = [...candidates.keys()];
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) consider(ids[i], ids[j]);
    }
  }

  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  const shown = Math.max(0, limit);
  return {
    rows: scored.slice(0, shown),
    restRows: scored.slice(shown, shown + Math.max(0, restLimit)),
    suspectCount: scored.length,
  };
}
