import { describe, expect, it } from 'vitest';
import type { LibraryCollectionItem } from './library-collection';
import { resolveCollectionMembers } from './resolve-collection-members';

const item = (uid: string): LibraryCollectionItem => ({
  id: crypto.randomUUID(), folderId: null, order: 0, label: uid,
  target: { kind: 'ontology', uid, lastKnownPath: 'capabilities/old-path' },
});

const CURRENT = '11111111-1111-4111-8111-111111111111';
const MERGED = '22222222-2222-4222-8222-222222222222';

describe('collection member identity resolution', () => {
  it('resolves a unique primary or merged UID without consulting the stored path', () => {
    const documents = [{ slug: 'capabilities/current', title: 'Current', frontmatter: { uid: CURRENT, merged_uids: [MERGED] } }];
    expect(resolveCollectionMembers([item(CURRENT), item(MERGED)], documents).map((result) =>
      result.status === 'resolved' ? [result.identityResolution, result.document.slug] : result.reason,
    )).toEqual([['current', 'capabilities/current'], ['merged', 'capabilities/current']]);
  });

  it('leaves missing and multiply claimed UIDs unresolved even when the old path exists', () => {
    const documents = [
      { slug: 'capabilities/old-path', title: 'Path reused', frontmatter: { uid: CURRENT, merged_uids: [MERGED] } },
      { slug: 'capabilities/other', title: 'Other', frontmatter: { uid: '33333333-3333-4333-8333-333333333333', merged_uids: [MERGED] } },
    ];
    expect(resolveCollectionMembers([item('44444444-4444-4444-8444-444444444444'), item(MERGED)], documents)).toMatchObject([
      { status: 'unresolved', reason: 'missing' },
      { status: 'unresolved', reason: 'ambiguous' },
    ]);
  });
});

it('counts duplicate UID claims within one document only once and keeps input order', () => {
  const documents = [{ slug: 'capabilities/결제', title: '결제', frontmatter: { uid: CURRENT, merged_uids: [CURRENT, MERGED, MERGED, 42, null] } }];
  const targets = [item(MERGED), item(CURRENT), item(MERGED)];
  const results = resolveCollectionMembers(targets, documents);
  expect(results.map((result) => result.item)).toEqual(targets);
  expect(results.map((result) => result.status === 'resolved' ? result.identityResolution : result.reason))
    .toEqual(['merged', 'current', 'merged']);
});

it('leaves merged-only documents unresolved when their current UID is invalid', () => {
  const documents = [{ slug: 'capabilities/broken', title: 'Broken', frontmatter: { uid: 42, merged_uids: [MERGED] } }];
  expect(resolveCollectionMembers([item(MERGED)], documents)).toMatchObject([{ status: 'unresolved', reason: 'ambiguous' }]);
});

it('treats repeated document rows as multiple claimants', () => {
  const document = { slug: 'capabilities/a', title: 'A', frontmatter: { uid: CURRENT } };
  expect(resolveCollectionMembers([item(CURRENT)], [document, document]))
    .toMatchObject([{ status: 'unresolved', reason: 'ambiguous' }]);
});

it('omits source and wiki members and handles an empty document set', () => {
  const ontologyItem = item(CURRENT);
  const otherItems: LibraryCollectionItem[] = [
    { ...item(CURRENT), target: { kind: 'source', path: 'sources/a.txt' } },
    { ...item(CURRENT), target: { kind: 'wiki', path: 'wiki/a' } },
  ];
  expect(resolveCollectionMembers(otherItems, [])).toEqual([]);
  expect(resolveCollectionMembers([ontologyItem, ...otherItems], []))
    .toEqual([{ status: 'unresolved', reason: 'missing', item: ontologyItem }]);
  expect(resolveCollectionMembers([], [])).toEqual([]);
});
