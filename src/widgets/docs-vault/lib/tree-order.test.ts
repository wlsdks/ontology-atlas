import { describe, expect, it } from 'vitest';
import type { VaultDoc, VaultTreeNode } from '@/entities/docs-vault';
import {
  DEFAULT_DOCS_TREE_GROUP,
  DEFAULT_DOCS_TREE_SORT,
  buildDocsTreeRecencyIndex,
  parseDocsTreeGroup,
  parseDocsTreeSort,
  serializeDocsTreeGroup,
  serializeDocsTreeSort,
  sortDocsTreeNodes,
} from './tree-order';

function doc(name: string, slug: string, title?: string): VaultTreeNode {
  return { name, path: `${slug}.md`, type: 'doc', slug, title };
}

function dir(name: string, children: VaultTreeNode[] = []): VaultTreeNode {
  return { name, path: name, type: 'dir', children };
}

function vaultDoc(slug: string, updatedAt: string): VaultDoc {
  return {
    slug,
    path: `${slug}.md`,
    title: slug,
    tags: [],
    frontmatter: {},
    headings: [],
    excerpt: '',
    wordCount: 0,
    updatedAt,
    linksOut: [],
  };
}

const labels = (nodes: VaultTreeNode[]) => nodes.map((n) => n.title ?? n.name);

describe('sort order URL contract', () => {
  it('falls back to the default for empty or unknown values', () => {
    expect(parseDocsTreeSort(null)).toBe(DEFAULT_DOCS_TREE_SORT);
    expect(parseDocsTreeSort(undefined)).toBe(DEFAULT_DOCS_TREE_SORT);
    expect(parseDocsTreeSort('')).toBe(DEFAULT_DOCS_TREE_SORT);
    expect(parseDocsTreeSort('나중에-없앤-값')).toBe(DEFAULT_DOCS_TREE_SORT);
    expect(parseDocsTreeGroup('typo')).toBe(DEFAULT_DOCS_TREE_GROUP);
  });

  it('reads known values as they are', () => {
    expect(parseDocsTreeSort('recent')).toBe('recent');
    expect(parseDocsTreeSort('name')).toBe('name');
    expect(parseDocsTreeGroup('docs')).toBe('docs');
    expect(parseDocsTreeGroup('folders')).toBe('folders');
  });

  it('omits the default from the URL to keep shared links short', () => {
    expect(serializeDocsTreeSort('name')).toBeNull();
    expect(serializeDocsTreeSort('recent')).toBe('recent');
    expect(serializeDocsTreeGroup('folders')).toBeNull();
    expect(serializeDocsTreeGroup('docs')).toBe('docs');
  });

  it('round-trips serialized values', () => {
    for (const sort of ['name', 'recent'] as const) {
      expect(parseDocsTreeSort(serializeDocsTreeSort(sort))).toBe(sort);
    }
    for (const group of ['folders', 'docs'] as const) {
      expect(parseDocsTreeGroup(serializeDocsTreeGroup(group))).toBe(group);
    }
  });
});

describe('folder and doc grouping', () => {
  const nodes = [
    doc('architecture', 'architecture', 'Architecture'),
    dir('archive'),
    doc('backlog', 'backlog', 'Backlog'),
    dir('benchmark'),
  ];

  it('puts folders first by default', () => {
    expect(labels(sortDocsTreeNodes(nodes, { sort: 'name', group: 'folders' }))).toEqual([
      'archive',
      'benchmark',
      'Architecture',
      'Backlog',
    ]);
  });

  it('puts docs first when chosen', () => {
    expect(labels(sortDocsTreeNodes(nodes, { sort: 'name', group: 'docs' }))).toEqual([
      'Architecture',
      'Backlog',
      'archive',
      'benchmark',
    ]);
  });

  it('does not mutate the input array', () => {
    const before = labels(nodes);
    sortDocsTreeNodes(nodes, { sort: 'name', group: 'folders' });
    expect(labels(nodes)).toEqual(before);
  });
});

describe('recently modified order', () => {
  const older = doc('old', 'old', 'Old');
  const newer = doc('new', 'new', 'New');
  const middle = doc('mid', 'mid', 'Mid');
  const recency = new Map([
    [older.path, Date.parse('2026-01-01T00:00:00Z')],
    [middle.path, Date.parse('2026-05-01T00:00:00Z')],
    [newer.path, Date.parse('2026-07-01T00:00:00Z')],
  ]);

  it('puts the most recently edited doc on top', () => {
    expect(
      labels(
        sortDocsTreeNodes([older, newer, middle], {
          sort: 'recent',
          group: 'folders',
          recency,
        }),
      ),
    ).toEqual(['New', 'Mid', 'Old']);
  });

  it('breaks equal modification times by name for a stable order', () => {
    const a = doc('a', 'a', 'Alpha');
    const b = doc('b', 'b', 'Beta');
    const same = new Map([
      [a.path, 1000],
      [b.path, 1000],
    ]);
    expect(
      labels(sortDocsTreeNodes([b, a], { sort: 'recent', group: 'folders', recency: same })),
    ).toEqual(['Alpha', 'Beta']);
  });

  it('applies folder grouping before recency', () => {
    const folder = dir('archive');
    const withFolder = new Map(recency);
    // "Folders first" holds even when the folder is the oldest — the two axes are independent.
    withFolder.set(folder.path, Date.parse('2020-01-01T00:00:00Z'));
    expect(
      labels(
        sortDocsTreeNodes([newer, folder, older], {
          sort: 'recent',
          group: 'folders',
          recency: withFolder,
        }),
      ),
    ).toEqual(['archive', 'New', 'Old']);
  });

  it('falls back to name order when modification time is unknown', () => {
    expect(
      labels(sortDocsTreeNodes([newer, older, middle], { sort: 'recent', group: 'folders' })),
    ).toEqual(['Mid', 'New', 'Old']);
  });
});

describe('folder modification time', () => {
  const tree = dir('root', [
    dir('archive', [doc('a', 'archive/a'), doc('b', 'archive/b')]),
    dir('launch', [doc('c', 'launch/c')]),
    doc('readme', 'readme'),
  ]);
  const docsBySlug = new Map<string, VaultDoc>([
    ['archive/a', vaultDoc('archive/a', '2026-02-01T00:00:00Z')],
    ['archive/b', vaultDoc('archive/b', '2026-04-01T00:00:00Z')],
    ['launch/c', vaultDoc('launch/c', '2026-06-01T00:00:00Z')],
    ['readme', vaultDoc('readme', '2026-03-01T00:00:00Z')],
  ]);

  it('uses the newest doc time inside the folder', () => {
    const recency = buildDocsTreeRecencyIndex(tree, docsBySlug);
    expect(recency.get('archive')).toBe(Date.parse('2026-04-01T00:00:00Z'));
    expect(recency.get('launch')).toBe(Date.parse('2026-06-01T00:00:00Z'));
    expect(recency.get('readme.md')).toBe(Date.parse('2026-03-01T00:00:00Z'));
  });

  it('lifts a folder holding a recent doc above name order', () => {
    const recency = buildDocsTreeRecencyIndex(tree, docsBySlug);
    expect(
      labels(
        sortDocsTreeNodes(tree.children ?? [], {
          sort: 'recent',
          group: 'folders',
          recency,
        }),
      ),
    ).toEqual(['launch', 'archive', 'readme']);
  });

  it('treats a doc missing from the manifest as time 0', () => {
    const recency = buildDocsTreeRecencyIndex(dir('root', [doc('ghost', 'ghost')]), new Map());
    expect(recency.get('ghost.md')).toBe(0);
  });
});
