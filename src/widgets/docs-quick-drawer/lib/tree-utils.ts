// DocsQuickDrawer 가 사용하는 순수 트리 조작 헬퍼. React 독립이라 unit test
// 하기 쉽게 분리.

import type { VaultTreeNode } from "@/entities/docs-vault";

/** 트리를 pre-order 로 walk 하며 doc 타입 노드만 배열에 append. */
export function flattenDocs(
  node: VaultTreeNode,
  out: VaultTreeNode[] = [],
): VaultTreeNode[] {
  if (node.type === "doc") out.push(node);
  node.children?.forEach((child) => flattenDocs(child, out));
  return out;
}

/** pre-order 순회 중 처음 만나는 doc 의 slug. 트리가 비어 있으면 null. */
export function firstDocSlug(node: VaultTreeNode | null): string | null {
  if (!node) return null;
  if (node.type === "doc" && node.slug) return node.slug;
  if (!node.children?.length) return null;
  for (const child of node.children) {
    const slug = firstDocSlug(child);
    if (slug) return slug;
  }
  return null;
}

/** pre-order 순회하며 doc slug 만 평면 배열로. 키보드 nav 대상 리스트. */
export function flattenTreeSlugs(
  node: VaultTreeNode | null,
  out: string[] = [],
): string[] {
  if (!node) return out;
  if (node.type === "doc" && node.slug) out.push(node.slug);
  node.children?.forEach((c) => flattenTreeSlugs(c, out));
  return out;
}

/**
 * needle (소문자) 과 tagSlugs (null = 제한 없음) 로 트리를 필터.
 * - doc: tag 제한 실패 시 바로 null, 이후 needle 이 title 또는 path 에 포함되면 유지
 * - dir: 자식 중 하나라도 유지되면 dir 유지 (children 배열 교체)
 * 원본 노드는 mutate 하지 않는다.
 */
export function filterTree(
  node: VaultTreeNode,
  needle: string,
  tagSlugs: Set<string> | null,
): VaultTreeNode | null {
  if (node.type === "doc") {
    if (tagSlugs && node.slug && !tagSlugs.has(node.slug)) return null;
    if (!needle) return node;
    const hay = `${node.title ?? ""} ${node.path ?? ""}`.toLowerCase();
    return hay.includes(needle) ? node : null;
  }
  const kept: VaultTreeNode[] = [];
  node.children?.forEach((child) => {
    const filtered = filterTree(child, needle, tagSlugs);
    if (filtered) kept.push(filtered);
  });
  if (kept.length === 0) return null;
  return { ...node, children: kept };
}
