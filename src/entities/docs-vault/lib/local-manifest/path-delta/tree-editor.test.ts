import { describe, expect, it } from 'vitest';
import type { VaultTreeNode } from '../../../model/types';
import { insertIntoTree, sortTree } from '../vault-tree';
import { TreeEditor } from './tree-editor';

type Docs = Record<string, string>;

/** What a full build produces for these documents. */
function builtTree(docs: Docs): VaultTreeNode {
  const root: VaultTreeNode = { name: 'vault', path: '', type: 'dir' };
  const childIndex = new Map<VaultTreeNode, Map<string, VaultTreeNode>>();
  for (const [slug, title] of Object.entries(docs)) insertIntoTree(root, slug, title, childIndex);
  sortTree(root);
  return root;
}

const start: Docs = {
  'domains/auth': 'Auth',
  'domains/auth/login': 'Login',
  'domains/billing': 'Billing',
  'capabilities/pay': 'Pay',
  project: 'Project',
};

describe('TreeEditor equals a full build of the same documents', () => {
  it('after documents are inserted, in any order', () => {
    const added: Docs = { 'domains/search': 'Search', 'elements/x/y/z': 'XYZ', 'domains/auth/logout': 'Logout' };
    const editor = new TreeEditor(builtTree(start));
    for (const [slug, title] of Object.entries(added).reverse()) editor.insert(slug, title);
    expect(editor.root).toEqual(builtTree({ ...start, ...added }));
  });

  it('after documents are removed, dropping the folders they leave empty', () => {
    const editor = new TreeEditor(builtTree({ ...start, 'elements/x/y/z': 'XYZ' }));
    editor.remove('elements/x/y/z');
    editor.remove('domains/billing');
    const { 'domains/billing': _billing, ...rest } = start;
    expect(editor.root).toEqual(builtTree(rest));
  });

  it('after a document that is also a folder is removed, keeping the folder and its children', () => {
    const editor = new TreeEditor(builtTree(start));
    editor.remove('domains/auth');
    const { 'domains/auth': _auth, ...rest } = start;
    expect(editor.root).toEqual(builtTree(rest));
  });

  it('after a folder takes a document of its own name, and after a retitle', () => {
    const before: Docs = { 'domains/auth/login': 'Login', 'domains/alpha': 'Alpha' };
    const editor = new TreeEditor(builtTree(before));
    editor.insert('domains/auth', 'Auth');
    editor.retitle('domains/auth/login', 'Sign in');
    expect(editor.root).toEqual(
      builtTree({ 'domains/auth/login': 'Sign in', 'domains/alpha': 'Alpha', 'domains/auth': 'Auth' }),
    );
  });

  it('after removing the last document, leaving a root with no children', () => {
    const editor = new TreeEditor(builtTree({ project: 'Project' }));
    editor.remove('project');
    expect(editor.root).toEqual(builtTree({}));
    expect(editor.root.children).toBeUndefined();
  });
});

describe('TreeEditor leaves the tree it started from untouched', () => {
  it('copying only the nodes on the changed paths', () => {
    const original = builtTree(start);
    const snapshot = structuredClone(original);
    const editor = new TreeEditor(original);
    editor.insert('domains/search', 'Search');
    editor.remove('capabilities/pay');
    editor.retitle('project', 'Renamed');
    expect(original).toEqual(snapshot);
    const kept = original.children!.find((node) => node.name === 'domains')!.children!.find((node) => node.name === 'billing')!;
    const shared = editor.root.children!.find((node) => node.name === 'domains')!.children!.find((node) => node.name === 'billing')!;
    expect(shared).toBe(kept);
  });
});
