import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { migrateNodeUids } from './migrate-node-uids.mjs';

const UID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('dry-run reports candidates without writing random identities', () => {
  const root = mkdtempSync(join(tmpdir(), 'oat-uid-migrate-'));
  try {
    const file = join(root, 'node.md');
    const before = '---\nkind: project\ntitle: Demo\n---\n';
    writeFileSync(file, before);
    const result = migrateNodeUids([root], { write: false });
    assert.equal(result.candidates.length, 1);
    assert.equal(readFileSync(file, 'utf-8'), before);
    assert.equal(result.assigned.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('--write assigns fresh UID once and is idempotent', () => {
  const root = mkdtempSync(join(tmpdir(), 'oat-uid-migrate-'));
  try {
    const first = join(root, 'first.md');
    const second = join(root, 'second.md');
    writeFileSync(first, '---\nkind: project\ntitle: First\n---\n');
    writeFileSync(second, '---\nkind: domain\ntitle: Second\n---\n');
    const result = migrateNodeUids([root], { write: true });
    assert.equal(result.assigned.length, 2);
    assert.ok(result.assigned.every(({ uid }) => UID_RE.test(uid)));
    assert.notEqual(result.assigned[0].uid, result.assigned[1].uid);
    const again = migrateNodeUids([root], { write: true });
    assert.equal(again.assigned.length, 0);
    assert.equal(again.preserved.length, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('malformed or duplicate existing identities fail without writes', () => {
  const root = mkdtempSync(join(tmpdir(), 'oat-uid-migrate-'));
  try {
    writeFileSync(join(root, 'first.md'), '---\nuid: node-12\nkind: project\n---\n');
    assert.throws(() => migrateNodeUids([root], { write: true }), /invalid uid/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
