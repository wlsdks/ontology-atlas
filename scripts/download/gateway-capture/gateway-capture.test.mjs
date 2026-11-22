import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';

import { FAKE_SOURCE_ROOT, FAKE_VAULT_ROOT, MTIME, REPO, VAULT_DIR, sha256 } from './capture-context.mjs';
import { listDirectory, realPath } from './fake-filesystem.mjs';
import { vaultTextFrames } from './native-bridge.mjs';
import { changeEntry, relativeTime } from './repo-history.mjs';
import { PAGES, wikiPage } from './sample-library.mjs';

describe('fake roots', () => {
  it('maps the fake vault root to docs/ontology and the fake source root to the repository', () => {
    assert.equal(realPath(FAKE_VAULT_ROOT, '/capabilities/').full, path.join(VAULT_DIR, 'capabilities'));
    assert.equal(realPath(FAKE_SOURCE_ROOT, 'AGENTS.md').full, path.join(REPO, 'AGENTS.md'));
  });

  it('refuses an unknown root and a path that climbs out of the repository', () => {
    assert.throws(() => realPath('/home/someone', 'x'), /unknown root/);
    assert.throws(() => realPath(FAKE_SOURCE_ROOT, '../../outside'), /outside the repository/);
    assert.throws(() => realPath(FAKE_SOURCE_ROOT, `../${path.basename(REPO)}-sibling/x`), /outside the repository/);
  });

  it('lists overlay files as entries of the vault root, with their folder as a directory', () => {
    const overlay = new Map([['wiki/page.md', 'text'], ['loose.md', 'text']]);
    const entries = new Map(listDirectory(FAKE_VAULT_ROOT, '', overlay).map(({ name, kind }) => [name, kind]));
    assert.equal(entries.get('wiki'), 'directory');
    assert.equal(entries.get('loose.md'), 'file');
    assert.deepEqual(listDirectory(FAKE_VAULT_ROOT, 'wiki', overlay), [{ name: 'page.md', kind: 'file' }]);
  });

  it('hides build and dependency folders of the checkout, and fails on a missing directory', () => {
    const names = listDirectory(FAKE_SOURCE_ROOT, '', new Map()).map(({ name }) => name);
    assert.equal(names.includes('node_modules'), false);
    assert.equal(names.includes('.git'), false);
    assert.equal(names.includes('package.json'), true);
    assert.throws(() => listDirectory(FAKE_SOURCE_ROOT, 'no-such-folder', new Map()), /missing directory/);
  });
});

describe('git history shaping', () => {
  it('maps git status codes and derives kind and slug from the vault path', () => {
    assert.deepEqual(changeEntry('docs/ontology/domains/a.md', 'A', null), {
      path: 'domains/a.md',
      status: 'added',
      kind: 'domain',
      slug: 'domains/a',
      renamedFrom: null,
    });
    assert.equal(changeEntry('docs/ontology/ontology-atlas.md', 'M', null).kind, 'project');
    assert.equal(changeEntry('docs/ontology/loose.md', 'D', null).kind, null);
    assert.equal(changeEntry('docs/ontology/x/y.md', 'T', null).status, 'modified');
  });

  it('keeps the old vault path of a rename', () => {
    const entry = changeEntry('docs/ontology/domains/b.md', 'R100', 'docs/ontology/capabilities/b.md');
    assert.equal(entry.status, 'renamed');
    assert.equal(entry.renamedFrom, 'capabilities/b.md');
  });

  it('words ages against the fixed picture day, in days then weeks', () => {
    assert.equal(relativeTime('2026-09-24T08:00:00Z'), 'today');
    assert.equal(relativeTime('2026-09-23T09:00:00Z'), 'yesterday');
    assert.equal(relativeTime('2026-09-21T09:00:00Z'), '3 days ago');
    assert.equal(relativeTime('2026-09-17T09:00:00Z'), '1 week ago');
    assert.equal(relativeTime('2026-09-03T09:00:00Z'), '3 weeks ago');
  });
});

describe('vault text frames', () => {
  const readU32 = (buffer, offset) => buffer.readUInt32LE(offset);

  it('lays out a count, then per file a flag, its path and either a stamped text or an error', () => {
    const frames = vaultTextFrames([
      { relativePath: 'a.md', text: 'hi', error: null },
      { relativePath: 'b.md', text: null, error: 'boom' },
    ]);
    assert.equal(readU32(frames, 0), 2);
    let offset = 4;
    assert.equal(frames[offset], 0);
    offset += 1;
    assert.equal(readU32(frames, offset), 4);
    assert.equal(frames.subarray(offset + 4, offset + 8).toString('utf8'), 'a.md');
    offset += 8;
    assert.equal(frames.readDoubleLE(offset), MTIME);
    offset += 8;
    assert.equal(readU32(frames, offset), 2);
    assert.equal(frames.subarray(offset + 4, offset + 6).toString('utf8'), 'hi');
    offset += 6;
    assert.equal(frames[offset], 1);
    offset += 1;
    assert.equal(frames.subarray(offset + 4, offset + 8).toString('utf8'), 'b.md');
    offset += 8;
    assert.equal(frames.subarray(offset + 4, offset + 8).toString('utf8'), 'boom');
    assert.equal(offset + 8, frames.length);
  });
});

describe('compiled sample pages', () => {
  it('records each cited source hash, and zeros for the page the shelf shows as drifted', () => {
    const fresh = wikiPage(PAGES.find((page) => !page.stale), 'en');
    const stale = wikiPage(PAGES.find((page) => page.stale), 'en');
    assert.match(fresh, /\.md: [0-9a-f]{64}|\.txt: [0-9a-f]{64}|\.csv: [0-9a-f]{64}/);
    assert.doesNotMatch(fresh, /: 0{64}/);
    assert.match(stale, /: 0{64}/);
    assert.equal(sha256('x').length, 64);
  });

  it('puts a line that cites no source in the summary, not in the facts', () => {
    const page = wikiPage(PAGES.find((candidate) => candidate.slug === 'release-overview'), 'en');
    const [, summary, facts] = page.split(/^## (?:Summary|Facts)$/m);
    assert.match(summary, /\[\[capabilities\/ontology-map\]\]/);
    assert.doesNotMatch(facts, /capabilities\/ontology-map/);
  });

  it('titles the Korean set from its fixture', () => {
    assert.match(wikiPage(PAGES[0], 'ko'), /^title: 릴리스 개요$/m);
    assert.match(wikiPage(PAGES[0], 'en'), /^title: Release overview$/m);
  });
});
