// Pure tree helpers used by DocsQuickDrawer. Split out from React so they are easy
// to unit test.

import type { VaultTreeNode } from "@/entities/docs-vault";

/** Walk the tree pre-order, appending only doc-type nodes. */
export function flattenDocs(
  node: VaultTreeNode,
  out: VaultTreeNode[] = [],
): VaultTreeNode[] {
  if (node.type === "doc") out.push(node);
  node.children?.forEach((child) => flattenDocs(child, out));
  return out;
}

/** The slug of the first doc met in pre-order. null for an empty tree. */
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

/** Doc slugs alone, flattened in pre-order — the list keyboard nav walks. */
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
 * Filter the tree by needle (lowercase) and tagSlugs (null = unrestricted).
 * - doc: null immediately if the tag restriction fails, otherwise kept when the
 *   needle is in the title or the path
 * - dir: kept if any child is kept (with the children array replaced)
 * The source nodes are never mutated.
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
