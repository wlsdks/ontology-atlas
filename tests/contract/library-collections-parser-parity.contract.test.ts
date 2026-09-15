import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  parseLibraryCollections as parseFrontend,
  resolveCollectionMembers,
} from '@/entities/library-collection';
import { parseLibraryCollections as parseMcp } from '../../mcp/src/constellations.mjs';

const fixture = readFileSync(
  resolve(process.cwd(), 'tests/contract/fixtures/library-collections/constellations-v1.json'),
  'utf8',
);
const identityNodes = JSON.parse(readFileSync(
  resolve(process.cwd(), 'tests/contract/fixtures/library-collections/identity-nodes.json'),
  'utf8',
)) as Array<{ slug: string; uid: string; merged_uids: string[] }>;

describe('library collections parser parity', () => {
  it.each([
    ['canonical constellation and generic collection fixture', fixture],
    ['missing file', null],
    ['malformed JSON', '{oops'],
    ['unsupported schema', '{"schema":"ontology-atlas/library-collections/v2","folders":[],"items":[]}'],
    ['constellation without timestamps', '{"schema":"ontology-atlas/library-collections/v1","folders":[{"id":"11111111-1111-4111-8111-111111111111","name":"Bad","parentId":null,"order":0,"presentation":"constellation"}],"items":[]}'],
  ])('matches for %s', (_label, raw) => {
    expect(parseMcp(raw)).toEqual(parseFrontend(raw));
  });

  it('uses the shared identity fixture for current, merged, missing, and ambiguous outcomes', () => {
    const parsed = parseFrontend(fixture);
    expect(parsed.status).toBe('ready');
    if (parsed.status !== 'ready') return;
    const members = parsed.value.items.filter((item) =>
      item.folderId === '33333333-3333-4333-8333-333333333333',
    );
    const documents = identityNodes.map((node) => ({
      slug: node.slug,
      title: node.slug,
      frontmatter: { uid: node.uid, merged_uids: node.merged_uids },
    }));

    expect(resolveCollectionMembers(members, documents).map((result) =>
      result.status === 'resolved'
        ? [result.item.target.kind === 'ontology' ? result.item.target.uid : '', result.identityResolution, result.currentUid]
        : [result.item.target.kind === 'ontology' ? result.item.target.uid : '', result.reason],
    )).toEqual([
      ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'current', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
      ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'merged', '12121212-1212-4212-8212-121212121212'],
      ['cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'missing'],
      ['eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'ambiguous'],
    ]);
  });
});
