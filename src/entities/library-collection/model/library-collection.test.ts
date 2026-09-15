import { describe, expect, it } from 'vitest';
import { addLibraryCollectionItem, emptyLibraryCollections, moveLibraryCollectionFolder, moveLibraryCollectionItem, parseLibraryCollections, removeLibraryCollectionFolder, serializeLibraryCollections, type LibraryCollections } from './library-collection';

const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'];
const base = (): LibraryCollections => ({ ...emptyLibraryCollections(), folders: [
  { id: ids[0], name: 'Work', parentId: null, order: 0 },
  { id: ids[1], name: 'Evidence', parentId: ids[0], order: 0 },
], items: [] });

describe('library collection model', () => {
  it('round trips typed exact targets and permits one target in different folders', () => {
    let value = addLibraryCollectionItem(base(), { id: ids[2], folderId: ids[0], order: 0, label: 'Source', target: { kind: 'source', path: 'sources/report.pdf' } });
    value = addLibraryCollectionItem(value, { id: '44444444-4444-4444-8444-444444444444', folderId: ids[1], order: 0, label: 'Source again', target: { kind: 'source', path: 'sources/report.pdf' } });
    expect(parseLibraryCollections(serializeLibraryCollections(value))).toEqual({ status: 'ready', value });
  });

  it('rejects duplicate targets in one folder and cycle-forming moves', () => {
    const item = { id: ids[2], folderId: ids[0], order: 0, label: 'Capability', target: { kind: 'ontology' as const, uid: '55555555-5555-4555-8555-555555555555', lastKnownPath: 'capabilities/search.md' } };
    const value = addLibraryCollectionItem(base(), item);
    expect(() => addLibraryCollectionItem(value, { ...item, id: '66666666-6666-4666-8666-666666666666' })).toThrow(/already saved/);
    expect(() => moveLibraryCollectionFolder(value, ids[0], ids[1], 0)).toThrow(/descendant/);
  });

  it('supports unfiled bookmarks and moving them into a folder', () => {
    const item = { id: ids[2], folderId: null, order: 0, label: 'Wiki', target: { kind: 'wiki' as const, path: 'notes/review.md' } };
    const value = addLibraryCollectionItem(base(), item);
    expect(() => addLibraryCollectionItem(value, { ...item, id: '77777777-7777-4777-8777-777777777777' })).toThrow(/already saved/);
    expect(moveLibraryCollectionItem(value, ids[2], ids[1], 2).items[0]).toMatchObject({ folderId: ids[1], order: 2 });
  });

  it('rejects a non-v4 ontology identity even when it is otherwise UUID-shaped', () => {
    expect(() => addLibraryCollectionItem(base(), {
      id: ids[2],
      folderId: null,
      order: 0,
      label: 'Wrong identity version',
      target: {
        kind: 'ontology',
        uid: '55555555-5555-5555-8555-555555555555',
        lastKnownPath: 'capabilities/search.md',
      },
    })).toThrow(/target is invalid/);
  });

  it('preserves corrupt and unknown-version bytes for callers', () => {
    expect(parseLibraryCollections('{oops')).toMatchObject({ status: 'corrupt', raw: '{oops' });
    const raw = '{"schema":"ontology-atlas/library-collections/v2"}\n';
    expect(parseLibraryCollections(raw)).toEqual({ status: 'unsupported', raw, reason: 'The collection file uses an unsupported schema version.' });
  });

  it('refuses an oversized preferences payload without parsing it', () => {
    const raw = 'x'.repeat(1024 * 1024 + 1);
    expect(parseLibraryCollections(raw)).toMatchObject({ status: 'corrupt', raw, reason: 'The collection file exceeds the 1 MiB limit.' });
  });

  it('removes only folder metadata and its descendants', () => {
    const value = addLibraryCollectionItem(base(), { id: ids[2], folderId: ids[1], order: 0, label: 'Wiki', target: { kind: 'wiki', path: 'notes/review.md' } });
    expect(removeLibraryCollectionFolder(value, ids[0])).toEqual({ ...emptyLibraryCollections(), folders: [], items: [] });
  });

  it.each(['/absolute.md', 'C:/drive.md', 'notes//file.md', 'notes/./file.md', 'notes/../file.md', 'notes/file.md/', 'notes\\file.md', 'notes/\u0000file.md'])(
    'rejects non-canonical exact path %j',
    (path) => {
      expect(() => addLibraryCollectionItem(base(), { id: ids[2], folderId: ids[0], order: 0, label: 'Bad', target: { kind: 'wiki', path } })).toThrow(/target is invalid/);
    },
  );
});

it('keeps generic folders compatible while validating constellation metadata and members', () => {
  const constellationId = '88888888-8888-4888-8888-888888888888';
  const value: LibraryCollections = {
    ...base(),
    folders: [
      ...base().folders,
      {
        id: constellationId,
        name: 'Ontology write review',
        parentId: null,
        order: 1,
        presentation: 'constellation',
        purpose: 'Review the write boundary.',
        createdAt: '2026-09-15T00:00:00.000Z',
        updatedAt: '2026-09-15T00:00:00.000Z',
      },
    ],
    items: [{
      id: '99999999-9999-4999-8999-999999999999',
      folderId: constellationId,
      order: 0,
      label: 'MCP writing',
      target: { kind: 'ontology', uid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', lastKnownPath: 'capabilities/mcp-writing' },
    }],
  };
  expect(parseLibraryCollections(serializeLibraryCollections(value))).toEqual({ status: 'ready', value });
  expect(() => serializeLibraryCollections({
    ...value,
    folders: value.folders.map((folder) => folder.id === constellationId ? { ...folder, parentId: ids[0] } : folder),
  })).toThrow(/constellation folder/);
});
