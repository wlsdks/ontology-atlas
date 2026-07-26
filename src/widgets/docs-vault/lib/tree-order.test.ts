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

describe('정렬 기준 URL 계약', () => {
  it('빈 값·모르는 값은 에러가 아니라 기본값으로 떨어진다', () => {
    expect(parseDocsTreeSort(null)).toBe(DEFAULT_DOCS_TREE_SORT);
    expect(parseDocsTreeSort(undefined)).toBe(DEFAULT_DOCS_TREE_SORT);
    expect(parseDocsTreeSort('')).toBe(DEFAULT_DOCS_TREE_SORT);
    expect(parseDocsTreeSort('나중에-없앤-값')).toBe(DEFAULT_DOCS_TREE_SORT);
    expect(parseDocsTreeGroup('typo')).toBe(DEFAULT_DOCS_TREE_GROUP);
  });

  it('알려진 값은 그대로 읽는다', () => {
    expect(parseDocsTreeSort('recent')).toBe('recent');
    expect(parseDocsTreeSort('name')).toBe('name');
    expect(parseDocsTreeGroup('docs')).toBe('docs');
    expect(parseDocsTreeGroup('folders')).toBe('folders');
  });

  it('기본값은 URL 에 쓰지 않는다 — 공유 링크를 짧게 유지', () => {
    expect(serializeDocsTreeSort('name')).toBeNull();
    expect(serializeDocsTreeSort('recent')).toBe('recent');
    expect(serializeDocsTreeGroup('folders')).toBeNull();
    expect(serializeDocsTreeGroup('docs')).toBe('docs');
  });

  it('직렬화한 값을 다시 읽으면 같은 값이다', () => {
    for (const sort of ['name', 'recent'] as const) {
      expect(parseDocsTreeSort(serializeDocsTreeSort(sort))).toBe(sort);
    }
    for (const group of ['folders', 'docs'] as const) {
      expect(parseDocsTreeGroup(serializeDocsTreeGroup(group))).toBe(group);
    }
  });
});

describe('폴더/문서 묶음', () => {
  const nodes = [
    doc('architecture', 'architecture', 'Architecture'),
    dir('archive'),
    doc('backlog', 'backlog', 'Backlog'),
    dir('benchmark'),
  ];

  it('기본은 폴더 먼저 — 폴더가 문서 사이에 흩어지지 않는다', () => {
    expect(labels(sortDocsTreeNodes(nodes, { sort: 'name', group: 'folders' }))).toEqual([
      'archive',
      'benchmark',
      'Architecture',
      'Backlog',
    ]);
  });

  it('문서 먼저를 고르면 문서가 앞으로 온다', () => {
    expect(labels(sortDocsTreeNodes(nodes, { sort: 'name', group: 'docs' }))).toEqual([
      'Architecture',
      'Backlog',
      'archive',
      'benchmark',
    ]);
  });

  it('원본 배열을 건드리지 않는다', () => {
    const before = labels(nodes);
    sortDocsTreeNodes(nodes, { sort: 'name', group: 'folders' });
    expect(labels(nodes)).toEqual(before);
  });
});

describe('최근 수정순', () => {
  const older = doc('old', 'old', 'Old');
  const newer = doc('new', 'new', 'New');
  const middle = doc('mid', 'mid', 'Mid');
  const recency = new Map([
    [older.path, Date.parse('2026-01-01T00:00:00Z')],
    [middle.path, Date.parse('2026-05-01T00:00:00Z')],
    [newer.path, Date.parse('2026-07-01T00:00:00Z')],
  ]);

  it('최근에 고친 문서가 위로 온다', () => {
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

  it('수정 시각이 같으면 이름순으로 갈린다 — 순서가 흔들리지 않게', () => {
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

  it('최근 수정순에서도 폴더 묶음이 먼저 적용된다', () => {
    const folder = dir('archive');
    const withFolder = new Map(recency);
    // 폴더가 가장 오래됐어도 "폴더 먼저" 는 유지된다 — 두 축은 독립이다.
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

  it('수정 시각을 모르면 이름순으로 되돌아간다', () => {
    expect(
      labels(sortDocsTreeNodes([newer, older, middle], { sort: 'recent', group: 'folders' })),
    ).toEqual(['Mid', 'New', 'Old']);
  });
});

describe('폴더의 수정 시각', () => {
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

  it('폴더는 안에서 가장 최근에 고쳐진 문서의 시각을 쓴다', () => {
    const recency = buildDocsTreeRecencyIndex(tree, docsBySlug);
    expect(recency.get('archive')).toBe(Date.parse('2026-04-01T00:00:00Z'));
    expect(recency.get('launch')).toBe(Date.parse('2026-06-01T00:00:00Z'));
    expect(recency.get('readme.md')).toBe(Date.parse('2026-03-01T00:00:00Z'));
  });

  it('최근 문서를 품은 폴더가 이름순을 거슬러 위로 올라온다', () => {
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

  it('매니페스트에 없는 문서는 0 으로 둔다 — 목록이 비지 않게', () => {
    const recency = buildDocsTreeRecencyIndex(dir('root', [doc('ghost', 'ghost')]), new Map());
    expect(recency.get('ghost.md')).toBe(0);
  });
});
