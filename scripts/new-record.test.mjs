import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { createRecord, safeSlug } from './new-record.mjs';

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
});
