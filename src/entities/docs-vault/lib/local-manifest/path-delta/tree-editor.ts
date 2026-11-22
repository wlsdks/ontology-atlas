import type { VaultTreeNode } from '../../../model/vault-manifest';
import { compareTreeNodes } from '../vault-tree';
import { findSorted, insertionIndex } from './patch-sorted';

/**
 * Edits a tree by copying only the nodes on each changed path; every other node is shared with
 * the previous manifest, which stays intact. O(depth · log siblings) per document.
 */
export class TreeEditor {
  readonly root: VaultTreeNode;
  private readonly fresh = new Set<VaultTreeNode>();

  constructor(root: VaultTreeNode) {
    this.root = this.copy(root);
  }

  private copy(node: VaultTreeNode): VaultTreeNode {
    const next = { ...node };
    if (node.children) next.children = node.children.slice();
    this.fresh.add(next);
    return next;
  }

  private childIndex(parent: VaultTreeNode, name: string): number {
    const children = parent.children ?? [];
    for (const type of ['dir', 'doc'] as const) {
      const at = findSorted(children, { name, path: '', type }, compareTreeNodes);
      if (at >= 0) return at;
    }
    return -1;
  }

  private child(parent: VaultTreeNode, name: string): VaultTreeNode | undefined {
    const at = this.childIndex(parent, name);
    if (at < 0) return undefined;
    const current = parent.children![at];
    if (this.fresh.has(current)) return current;
    const next = this.copy(current);
    parent.children![at] = next;
    return next;
  }

  private reposition(parent: VaultTreeNode, node: VaultTreeNode): void {
    const children = parent.children!;
    children.splice(children.indexOf(node), 1);
    children.splice(insertionIndex(children, node, compareTreeNodes), 0, node);
  }

  insert(slug: string, title: string): void {
    const parts = slug.split('/');
    let node = this.root;
    parts.forEach((name, at) => {
      const isLeaf = at === parts.length - 1;
      node.children ??= [];
      let child = this.child(node, name);
      if (!child) {
        child = { name, path: parts.slice(0, at + 1).join('/'), type: isLeaf ? 'doc' : 'dir' };
        if (isLeaf) {
          child.slug = slug;
          child.title = title;
        }
        this.fresh.add(child);
        node.children.splice(insertionIndex(node.children, child, compareTreeNodes), 0, child);
      } else if (isLeaf && !child.slug) {
        child.type = 'doc';
        child.slug = slug;
        child.title = title;
        this.reposition(node, child);
      }
      node = child;
    });
  }

  retitle(slug: string, title: string): void {
    let node: VaultTreeNode | undefined = this.root;
    for (const name of slug.split('/')) node = node && this.child(node, name);
    if (node) node.title = title;
  }

  remove(slug: string): void {
    const parts = slug.split('/');
    const path: VaultTreeNode[] = [this.root];
    for (const name of parts) {
      const next = this.child(path[path.length - 1], name);
      if (!next) return;
      path.push(next);
    }
    const leaf = path[path.length - 1];
    if (leaf.children?.length) {
      // A document that is also a folder stays as the folder.
      leaf.type = 'dir';
      delete leaf.slug;
      delete leaf.title;
      this.reposition(path[path.length - 2], leaf);
      return;
    }
    // Drop the leaf, then every folder it leaves empty; a document keeps no empty `children`.
    for (let at = path.length - 1; at > 0; at -= 1) {
      const node = path[at];
      const parent = path[at - 1];
      if (node.children?.length) break;
      if (node.type === 'doc' && at !== path.length - 1) {
        delete node.children;
        break;
      }
      parent.children!.splice(parent.children!.indexOf(node), 1);
    }
    if (this.root.children?.length === 0) delete this.root.children;
  }
}
