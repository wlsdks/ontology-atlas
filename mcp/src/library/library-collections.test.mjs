import { strict as assert } from 'node:assert';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { parseLibraryCollections, readLibraryCollections } from './library-collections.mjs';

const SCHEMA = 'ontology-atlas/library-collections/v1';
const FOLDER_A = '11111111-1111-4111-8111-111111111111';
const FOLDER_B = '22222222-2222-4222-8222-222222222222';
const ITEM_A = '33333333-3333-4333-8333-333333333333';
const ITEM_B = '44444444-4444-4444-8444-444444444444';

function folder(id, parentId = null, order = 0) {
  return { id, name: `Folder ${order}`, parentId, order };
}

function sourceItem(id, folderId, path, order = 0) {
  return { id, folderId, label: path, order, target: { kind: 'source', path } };
}

function parse(folders, items) {
  return parseLibraryCollections(JSON.stringify({ schema: SCHEMA, folders, items }));
}

describe('library collections parser', () => {
  it('accepts a bookmark at the collection root and a nested folder', () => {
    const parsed = parse(
      [folder(FOLDER_A), folder(FOLDER_B, FOLDER_A, 1)],
      [sourceItem(ITEM_A, null, 'sources/a.md')],
    );
    assert.equal(parsed.status, 'ready');
  });

  it('refuses a folder cycle', () => {
    const parsed = parse([folder(FOLDER_A, FOLDER_B), folder(FOLDER_B, FOLDER_A, 1)], []);
    assert.equal(parsed.status, 'corrupt');
    assert.match(parsed.reason, /descendant|cycle/);
  });

  it('refuses a folder whose parent does not exist', () => {
    const parsed = parse([folder(FOLDER_A, FOLDER_B)], []);
    assert.equal(parsed.status, 'corrupt');
    assert.equal(parsed.reason, 'A collection folder has a missing parent.');
  });

  it('allows one target in two folders but not twice in one', () => {
    const folders = [folder(FOLDER_A), folder(FOLDER_B, null, 1)];
    const inTwo = parse(folders, [
      sourceItem(ITEM_A, FOLDER_A, 'sources/a.md'),
      sourceItem(ITEM_B, FOLDER_B, 'sources/a.md'),
    ]);
    assert.equal(inTwo.status, 'ready');
    const inOne = parse(folders, [
      sourceItem(ITEM_A, FOLDER_A, 'sources/a.md'),
      sourceItem(ITEM_B, FOLDER_A, 'sources/a.md', 1),
    ]);
    assert.equal(inOne.reason, 'The same target cannot appear twice in one folder.');
  });

  it('refuses target paths that leave the vault or are not portable', () => {
    const paths = ['/etc/passwd', '../outside.md', 'a/./b.md', 'a//b.md', 'C:/x.md', 'a\\b.md', 'a\u0007b.md'];
    for (const path of paths) {
      const parsed = parse([], [sourceItem(ITEM_A, null, path)]);
      assert.equal(parsed.reason, 'A collection target is invalid.', JSON.stringify(path));
    }
  });

  it('refuses constellation metadata on a plain folder and a nested constellation', () => {
    const plain = parse([{ ...folder(FOLDER_A), purpose: 'why' }], []);
    assert.equal(plain.reason, 'Constellation metadata requires the constellation presentation.');
    const nested = parse(
      [
        folder(FOLDER_A),
        {
          ...folder(FOLDER_B, FOLDER_A, 1),
          presentation: 'constellation',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      [],
    );
    assert.equal(nested.reason, 'A constellation folder is invalid.');
  });

  it('refuses a constellation whose timestamp is not an ISO instant', () => {
    const parsed = parse(
      [
        {
          ...folder(FOLDER_A),
          presentation: 'constellation',
          createdAt: '2026-02-30',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ],
      [],
    );
    assert.equal(parsed.reason, 'A constellation folder is invalid.');
  });

  it('refuses a file over 1 MiB without parsing it', () => {
    const parsed = parseLibraryCollections(`{"schema":"${SCHEMA}","pad":"${'x'.repeat(1024 * 1024)}"}`);
    assert.equal(parsed.status, 'corrupt');
    assert.equal(parsed.reason, 'The collection file exceeds the 1 MiB limit.');
  });
});

describe('library collections file read', () => {
  function withVault(prepare, check) {
    const vault = mkdtempSync(join(tmpdir(), 'ontology-atlas-collections-'));
    try {
      mkdirSync(join(vault, '.ontology-atlas'));
      prepare(join(vault, '.ontology-atlas/library-collections.json'));
      check(readLibraryCollections(vault));
    } finally {
      rmSync(vault, { recursive: true, force: true });
    }
  }

  it('reports a missing file as missing, not unavailable', () => {
    withVault(
      () => {},
      (read) => {
        assert.equal(read.source.status, 'missing');
        assert.equal(read.source.availability, 'missing');
        assert.equal(read.source.revision, null);
      },
    );
  });

  it('reports a directory at the file path as corrupt with its modified time', () => {
    withVault(
      (path) => mkdirSync(path),
      (read) => {
        assert.equal(read.source.status, 'corrupt');
        assert.equal(read.source.reason, 'The collection path is not a regular file.');
        assert.equal(typeof read.source.mtime, 'number');
      },
    );
  });

  it('hashes the bytes it read into the revision', () => {
    const text = JSON.stringify({ schema: SCHEMA, folders: [], items: [] });
    withVault(
      (path) => writeFileSync(path, text),
      (read) => {
        assert.equal(read.source.status, 'ready');
        assert.match(read.source.revision, /^[0-9a-f]{64}$/);
      },
    );
  });
});
