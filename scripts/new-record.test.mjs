import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { createRecord, safeSlug } from './new-record.mjs';

const digest = (value) => createHash('sha256').update(value).digest('hex');
function ledgerRepo() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'new-record-repo-'));
  mkdirSync(path.join(root, 'docs/records/decisions'), { recursive: true });
  mkdirSync(path.join(root, 'docs/records/changes'), { recursive: true });
  mkdirSync(path.join(root, 'docs/records/releases'), { recursive: true });
  const decisions = '# DECISIONS\n\n## 2026-09-10 — legacy\n\n**Why**: w.\n**Prior**: none.\n**Decision**: d.\n**Dissent**: none.\n**Falsifier**: f.\n**Owner**: o.\n';
  const changelog = '# CHANGELOG\n\n## 2026-09-10 · v1.0.0: legacy\n\n**Added**: A.\n';
  writeFileSync(path.join(root, 'docs/DECISIONS.md'), decisions);
  writeFileSync(path.join(root, 'docs/CHANGELOG.md'), changelog);
  writeFileSync(path.join(root, 'docs/records/legacy.json'), JSON.stringify({ version: 1, documents: { 'docs/DECISIONS.md': { sha256: digest(decisions) }, 'docs/CHANGELOG.md': { sha256: digest(changelog) } } }));
  return root;
}

describe('new record writer', () => {
  it('creates a unique file exclusively', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'new-record-'));
    const id = '12345678-1234-4123-8123-123456789abc';
    const result = createRecord({ kind: 'change', date: '2026-09-13', slug: 'Fix Sync', body: 'Sync is correct.', category: 'Fixed', id, root });
    assert.equal(result.path, `docs/records/changes/2026-09-13-fix-sync-${id}.md`);
    assert.match(readFileSync(path.join(root, result.path), 'utf8'), /category: Fixed/);
    assert.throws(() => createRecord({ kind: 'change', date: '2026-09-13', slug: 'Fix Sync', body: 'Again.', category: 'Fixed', id, root }), /EEXIST/);
  });
  it('rejects unsafe empty slugs', () => assert.throws(() => safeSlug('한글'), /ASCII/));
  it('writes a release marker exclusively with explicit change ids', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'new-release-'));
    const changes = ['12345678-1234-4123-8123-123456789abc', 'abcdefab-cdef-4abc-8def-abcdefabcdef'];
    const result = createRecord({ kind: 'release', date: '2026-09-13', version: 'v2.0.0', title: 'two facts', changes, root });
    assert.equal(result.path, 'docs/records/releases/v2.0.0.md');
    assert.match(readFileSync(path.join(root, result.path), 'utf8'), new RegExp(`- ${changes[1]}`));
    assert.throws(() => createRecord({ kind: 'release', date: '2026-09-13', version: 'v2.0.0', title: 'again', changes, root }), /EEXIST/);
  });
  it('rejects invalid input before creating a directory or partial file', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'new-invalid-'));
    assert.throws(() => createRecord({ kind: 'release', date: '2026-02-30', version: 'v1.0.0', title: 'bad', changes: [], root }), /calendar/);
    assert.equal(existsSync(path.join(root, 'docs')), false);
    assert.throws(() => createRecord({ kind: 'change', date: '2026-09-13', slug: 'bad', category: 'Added', body: 'line one\nline two', root }), /one 900-byte line/);
    assert.equal(existsSync(path.join(root, 'docs')), false);
  });
  it('rejects a legacy release version before creating a marker', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'new-release-legacy-'));
    mkdirSync(path.join(root, 'docs'), { recursive: true });
    writeFileSync(path.join(root, 'docs/CHANGELOG.md'), '# CHANGELOG\n\n## 2026-09-01 · v1.0.0: shipped\n\n**Added**: A.\n');
    assert.throws(() => createRecord({ kind: 'release', date: '2026-09-13', version: 'v1.0.0', title: 'again', changes: ['12345678-1234-4123-8123-123456789abc'], root }), /already exists/);
    assert.equal(existsSync(path.join(root, 'docs/records/releases/v1.0.0.md')), false);
  });
  it('rejects duplicate ids, backdating, and invalid current state before writing', () => {
    const root = ledgerRepo();
    const id = '12345678-1234-4123-8123-123456789abc';
    createRecord({ kind: 'change', date: '2026-09-11', slug: 'first', category: 'Added', body: 'First.', id, root });
    assert.throws(() => createRecord({ kind: 'decision', date: '2026-09-12', slug: 'duplicate', id, body: '## 2026-09-12 — duplicate\n\n**Why**: w.\n**Prior**: none.\n**Decision**: d.\n**Dissent**: none.\n**Falsifier**: f.\n**Owner**: o.', root }), /duplicate id/);
    assert.equal(existsSync(path.join(root, `docs/records/decisions/2026-09-12-duplicate-${id}.md`)), false);
    assert.throws(() => createRecord({ kind: 'change', date: '2026-09-09', slug: 'old', category: 'Fixed', body: 'Old.', root }), /predates current newest/);
    assert.equal(readdirSync(path.join(root, 'docs/records/changes')).some((name) => name.includes('-old-')), false);
    writeFileSync(path.join(root, 'docs/records/changes/broken.md'), 'broken');
    assert.throws(() => createRecord({ kind: 'change', date: '2026-09-12', slug: 'blocked', category: 'Fixed', body: 'Blocked.', root }), /frontmatter is required/);
    assert.equal(readdirSync(path.join(root, 'docs/records/changes')).some((name) => name.includes('blocked')), false);
  });
});
