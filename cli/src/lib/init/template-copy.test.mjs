import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { TEMPLATE_ROOTS, copyTree, resolveTemplateRoot } from './template-copy.mjs';

function withTemplate(files, run) {
  const directory = mkdtempSync(join(tmpdir(), 'oatlas-init-copy-'));
  const from = join(directory, 'from');
  const to = join(directory, 'to');
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(from, name, '..'), { recursive: true });
    writeFileSync(join(from, name), text, 'utf-8');
  }
  const write = process.stdout.write;
  process.stdout.write = () => true;
  try {
    return run(from, to);
  } finally {
    process.stdout.write = write;
    rmSync(directory, { recursive: true, force: true });
  }
}

test('a node template gets a fresh uid on its first line, and another file is copied as is', () => {
  withTemplate({ 'domains/a.md': '---\nkind: domain\n---\nbody\n', 'README.md': '# hi\n' }, (from, to) => {
    assert.deepEqual(copyTree(from, to), { created: 2, skipped: 0 });
    assert.match(readFileSync(join(to, 'domains/a.md'), 'utf-8'), /^---\nuid: [0-9a-f-]{36}\nkind: domain\n---\nbody\n$/);
    assert.equal(readFileSync(join(to, 'README.md'), 'utf-8'), '# hi\n');
  });
});

test('a template that ships a fixed uid is refused, since every vault would share it', () => {
  withTemplate({ 'a.md': '---\nuid: 1\nkind: domain\n---\n' }, (from, to) => {
    assert.throws(() => copyTree(from, to), /starter template must not contain a fixed uid: a\.md/);
  });
});

test('an existing file is preserved and counted, never overwritten', () => {
  withTemplate({ 'a.md': '---\nkind: domain\n---\n', 'b.md': 'b\n' }, (from, to) => {
    mkdirSync(to, { recursive: true });
    writeFileSync(join(to, 'b.md'), 'mine\n', 'utf-8');
    assert.deepEqual(copyTree(from, to), { created: 1, skipped: 1 });
    assert.equal(readFileSync(join(to, 'b.md'), 'utf-8'), 'mine\n');
  });
});

test('a skipped path is not copied', () => {
  withTemplate({ 'keep/a.md': 'a\n', 'drop/b.md': 'b\n' }, (from, to) => {
    copyTree(from, to, { skip: (rel) => rel === 'drop' });
    assert.equal(existsSync(join(to, 'keep/a.md')), true);
    assert.equal(existsSync(join(to, 'drop')), false);
  });
});

test('English and Korean each have a template, and an unknown locale falls back to English', () => {
  assert.deepEqual(Object.keys(TEMPLATE_ROOTS), ['en', 'ko']);
  assert.equal(resolveTemplateRoot('ko'), TEMPLATE_ROOTS.ko);
  assert.equal(resolveTemplateRoot('zz'), TEMPLATE_ROOTS.en);
  assert.equal(existsSync(TEMPLATE_ROOTS.en), true);
  assert.equal(existsSync(TEMPLATE_ROOTS.ko), true);
});
