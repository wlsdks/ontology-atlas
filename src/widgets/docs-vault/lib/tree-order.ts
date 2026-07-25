import type { VaultDoc, VaultTreeNode } from '@/entities/docs-vault';

/**
 * 문서 목록(문서함 사이드바 트리)의 순서 계약.
 *
 * ## 왜 두 축인가
 *
 * 소유자 관찰: *"폴더별 분리 정렬, 문서 우선 정렬 등 이런 정렬 조건도 좀
 * 있으면 좋을듯?"*
 *
 * dogfood vault(문서 158개) 실측이 이유를 보여준다. 최상위 `docs` 폴더는
 * 폴더 6개와 문서 30개를 **이름순 한 줄로 섞어** 그린다. 그래서 96개 노드가
 * 든 `ontology` 폴더가 36행 중 23번째, "npm publish" 와 "제품 계획 v9"
 * 사이에 파묻힌다. 폴더를 찾으려면 문서 30개를 눈으로 걸러야 한다.
 *
 * 그래서 축을 둘로 나눈다. 서로 답하는 질문이 다르다:
 *
 * - **묶음(group)** — 폴더와 문서 중 *무엇을 먼저* 보여줄까
 * - **정렬(sort)** — 같은 묶음 안에서 *어떤 순서로* 놓을까
 *
 * 한 드롭다운에 섞으면 "폴더 먼저 + 최근 수정순" 같은 조합이 표현되지 않아
 * 값이 4개로 불어나고, 사용자가 두 결정을 한 번에 내려야 한다.
 *
 * ## 왜 URL 인가
 *
 * 이 앱은 세션 상태를 URL 에 둔다(`?slug=` · `?view=` · `?tab=`). 공유
 * 가능하고 에이전트가 읽어 재현할 수 있어서다. 정렬이 숨은 상태면 "무슨
 * 순서로 보던 중" 이 핸드오프에서 빠진다.
 *
 * 기본값은 파라미터를 **생략**한다 — 짧은 링크가 붙여넣기 쉽다. 모르는
 * 값은 에러가 아니라 기본값이다(공유 링크는 남의 손에서 편집된다).
 */

export const DOCS_TREE_SORTS = ['name', 'recent'] as const;

export type DocsTreeSort = (typeof DOCS_TREE_SORTS)[number];

export const DEFAULT_DOCS_TREE_SORT: DocsTreeSort = 'name';

export const DOCS_TREE_GROUPS = ['folders', 'docs'] as const;

export type DocsTreeGroup = (typeof DOCS_TREE_GROUPS)[number];

/**
 * 기본은 폴더 먼저 — 파인더·VS Code·옵시디언이 모두 그렇게 하고, 섞어
 * 그리던 지금까지가 결함에 가깝다. "섞어서" 는 값으로 두지 않는다.
 */
export const DEFAULT_DOCS_TREE_GROUP: DocsTreeGroup = 'folders';

export function parseDocsTreeSort(raw: string | null | undefined): DocsTreeSort {
  if (!raw) return DEFAULT_DOCS_TREE_SORT;
  return DOCS_TREE_SORTS.find((sort) => sort === raw) ?? DEFAULT_DOCS_TREE_SORT;
}

export function serializeDocsTreeSort(sort: DocsTreeSort): string | null {
  return sort === DEFAULT_DOCS_TREE_SORT ? null : sort;
}

export function parseDocsTreeGroup(raw: string | null | undefined): DocsTreeGroup {
  if (!raw) return DEFAULT_DOCS_TREE_GROUP;
  return DOCS_TREE_GROUPS.find((group) => group === raw) ?? DEFAULT_DOCS_TREE_GROUP;
}

export function serializeDocsTreeGroup(group: DocsTreeGroup): string | null {
  return group === DEFAULT_DOCS_TREE_GROUP ? null : group;
}

/** 트리 노드 경로 → 마지막 수정 시각(ms). 폴더는 품고 있는 문서 중 최신값. */
export type DocsTreeRecencyIndex = ReadonlyMap<string, number>;

function parseUpdatedAt(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * 트리 전체의 수정 시각을 한 번에 계산한다.
 *
 * `VaultTreeNode` 는 수정 시각을 갖고 있지 않아 매니페스트(`docsBySlug`)를
 * 봐야 한다. 비교 함수 안에서 매번 조회하면 정렬마다 O(n log n) 번의 맵
 * 조회 + 날짜 파싱이 반복되므로, 트리를 한 번 훑어 경로별로 접어 둔다.
 *
 * 폴더는 **품고 있는 문서 중 가장 최근 값**을 쓴다. 폴더 자체의 mtime 은
 * 매니페스트에 없고, 있더라도 "안에서 무슨 일이 있었나" 를 더 정확히
 * 말해 주는 쪽은 문서다.
 */
export function buildDocsTreeRecencyIndex(
  tree: VaultTreeNode,
  docsBySlug: ReadonlyMap<string, Pick<VaultDoc, 'updatedAt'>>,
): Map<string, number> {
  const recency = new Map<string, number>();

  const visit = (node: VaultTreeNode): number => {
    if (node.type === 'doc') {
      const updatedAt = node.slug ? docsBySlug.get(node.slug)?.updatedAt : undefined;
      const value = parseUpdatedAt(updatedAt);
      recency.set(node.path, value);
      return value;
    }
    let newest = 0;
    for (const child of node.children ?? []) {
      newest = Math.max(newest, visit(child));
    }
    recency.set(node.path, newest);
    return newest;
  };

  visit(tree);
  return recency;
}

function label(node: VaultTreeNode): string {
  return node.title ?? node.name;
}

export interface DocsTreeOrder {
  sort: DocsTreeSort;
  group: DocsTreeGroup;
  /** 없으면 최근 수정순을 요청해도 이름순으로 되돌아간다(빈 목록보다 낫다). */
  recency?: DocsTreeRecencyIndex;
}

/**
 * 한 폴더 안의 자식들을 정렬한다. 원본 배열은 건드리지 않는다 —
 * `manifest.tree` 는 여러 화면이 공유하는 읽기 전용 데이터다.
 *
 * 묶음이 정렬보다 항상 먼저다. "최근 수정순 + 폴더 먼저" 를 골랐을 때
 * 오래된 폴더가 최신 문서 아래로 내려가면 두 축이 하나로 뭉개진다.
 */
export function sortDocsTreeNodes(
  nodes: readonly VaultTreeNode[],
  { sort, group, recency }: DocsTreeOrder,
): VaultTreeNode[] {
  return [...nodes].sort((a, b) => {
    if (a.type !== b.type) {
      const foldersFirst = group === 'folders';
      const aIsDir = a.type === 'dir';
      return aIsDir === foldersFirst ? -1 : 1;
    }
    if (sort === 'recent' && recency) {
      const delta = (recency.get(b.path) ?? 0) - (recency.get(a.path) ?? 0);
      if (delta !== 0) return delta;
    }
    return label(a).localeCompare(label(b), 'ko');
  });
}
