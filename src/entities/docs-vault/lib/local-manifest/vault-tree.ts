import type { VaultTreeNode } from '../../model/vault-manifest';
import { compareCollated } from './collated-order';

export function compareTreeNodes(a: VaultTreeNode, b: VaultTreeNode): number {
  if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
  return compareCollated(a.name, b.name);
}

/** `childIndex` finds a child by name; a linear search made a flat folder quadratic. */
export function insertIntoTree(
  root: VaultTreeNode,
  slug: string,
  title: string,
  childIndex: Map<VaultTreeNode, Map<string, VaultTreeNode>>,
) {
  const parts = slug.split('/');
  let node = root;
  for (let i = 0; i < parts.length; i += 1) {
    const name = parts[i];
    const isLeaf = i === parts.length - 1;
    if (!node.children) node.children = [];
    let index = childIndex.get(node);
    if (!index) {
      index = new Map();
      childIndex.set(node, index);
    }
    let child = index.get(name);
    if (!child) {
      child = {
        name,
        path: parts.slice(0, i + 1).join('/'),
        type: isLeaf ? 'doc' : 'dir',
      };
      if (isLeaf) {
        child.slug = slug;
        child.title = title;
      }
      node.children.push(child);
      index.set(name, child);
    } else if (isLeaf && !child.slug) {
      child.type = 'doc';
      child.slug = slug;
      child.title = title;
    }
    node = child;
  }
}

export function sortTree(node: VaultTreeNode) {
  if (!node.children) return;
  node.children.sort(compareTreeNodes);
  for (const c of node.children) sortTree(c);
}
