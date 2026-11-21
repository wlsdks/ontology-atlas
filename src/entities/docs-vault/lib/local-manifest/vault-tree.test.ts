import { describe, expect, it } from 'vitest';
import type { VaultTreeNode } from '../../model/types';
import { compareTreeNodes, insertIntoTree, sortTree } from './vault-tree';

function treeOf(docs: Array<[slug: string, title: string]>): VaultTreeNode {
  const root: VaultTreeNode = { name: 'vault', path: '', type: 'dir' };
  const childIndex = new Map<VaultTreeNode, Map<string, VaultTreeNode>>();
  for (const [slug, title] of docs) insertIntoTree(root, slug, title, childIndex);
  sortTree(root);
  return root;
}

describe('compareTreeNodes', () => {
  it('puts folders before documents, then orders by collated name', () => {
    const nodes: VaultTreeNode[] = [
      { name: 'b', path: 'b', type: 'doc' },
      { name: '나', path: '나', type: 'dir' },
      { name: 'a', path: 'a', type: 'doc' },
      { name: '가', path: '가', type: 'dir' },
    ];
    expect(nodes.sort(compareTreeNodes).map((node) => node.name)).toEqual(['가', '나', 'a', 'b']);
  });
});

describe('insertIntoTree and sortTree', () => {
  it('builds the folder path of a slug and keeps the document title on the leaf', () => {
    const tree = treeOf([['domains/auth/login', 'Login']]);
    const leaf = tree.children![0].children![0].children![0];
    expect(leaf).toEqual({ name: 'login', path: 'domains/auth/login', type: 'doc', slug: 'domains/auth/login', title: 'Login' });
  });

  it('gives the same tree for any insertion order', () => {
    const docs: Array<[string, string]> = [
      ['domains/b', 'B'],
      ['domains/a', 'A'],
      ['capabilities/x/y', 'XY'],
      ['project', 'Project'],
    ];
    expect(treeOf([...docs].reverse())).toEqual(treeOf(docs));
  });

  it('lets a document that is also a folder keep its children and take the slug and title', () => {
    const folderFirst = treeOf([
      ['domains/a/child', 'Child'],
      ['domains/a', 'A'],
    ]);
    const docFirst = treeOf([
      ['domains/a', 'A'],
      ['domains/a/child', 'Child'],
    ]);
    const node = folderFirst.children![0].children![0];
    expect(node).toMatchObject({ type: 'doc', slug: 'domains/a', title: 'A' });
    expect(node.children).toHaveLength(1);
    expect(docFirst).toEqual(folderFirst);
  });
});
