import { afterEach, beforeEach, describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { findPath, vaultSlugExists } from './vault.mjs';

let root;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'omot-vault-test-'));
  mkdirSync(join(root, 'capabilities'), { recursive: true });
  writeFileSync(join(root, 'README.md'), '---\nslug: README\n---\n');
  writeFileSync(
    join(root, 'capabilities', 'auth.md'),
    '---\nslug: capabilities/auth\nkind: capability\n---\n',
  );
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('vaultSlugExists', () => {
  it('실재하는 top-level slug 는 true', () => {
    assert.equal(vaultSlugExists(root, 'README'), true);
  });

  it('실재하는 subdir slug 는 true', () => {
    assert.equal(vaultSlugExists(root, 'capabilities/auth'), true);
  });

  it('없는 slug 는 false', () => {
    assert.equal(vaultSlugExists(root, 'capabilities/nope'), false);
    assert.equal(vaultSlugExists(root, 'phantom'), false);
  });

  it('빈 / null / undefined slug 는 false (throw 안 함)', () => {
    assert.equal(vaultSlugExists(root, ''), false);
    assert.equal(vaultSlugExists(root, null), false);
    assert.equal(vaultSlugExists(root, undefined), false);
  });

  it('vault 외부로 escape 시도하는 slug 는 false (throw 안 함)', () => {
    assert.equal(vaultSlugExists(root, '../etc/passwd'), false);
    assert.equal(vaultSlugExists(root, '../../README'), false);
  });

  it('null byte injection 시도는 false', () => {
    assert.equal(vaultSlugExists(root, 'README\0evil'), false);
  });
});

describe('findPath — edge metadata (R+)', () => {
  let pathRoot;
  beforeEach(() => {
    pathRoot = mkdtempSync(join(tmpdir(), 'omot-vault-path-'));
    mkdirSync(join(pathRoot, 'capabilities'), { recursive: true });
    mkdirSync(join(pathRoot, 'elements'), { recursive: true });
    // domain → contains → capability → elements (1 hop = capability, 2 hop = element)
    writeFileSync(
      join(pathRoot, 'project.md'),
      '---\nslug: project\nkind: project\ncapabilities: [auth]\n---\n',
    );
    writeFileSync(
      join(pathRoot, 'capabilities', 'auth.md'),
      '---\nslug: capabilities/auth\nkind: capability\nelements: [token]\n---\n',
    );
    writeFileSync(
      join(pathRoot, 'elements', 'token.md'),
      '---\nslug: elements/token\nkind: element\n---\n',
    );
  });
  afterEach(() => {
    rmSync(pathRoot, { recursive: true, force: true });
  });

  it('hops 와 edges 는 길이가 1 차이 — 매 hop 사이 via 가 명시', () => {
    const r = findPath(pathRoot, 'project', 'elements/token');
    assert.ok(r, 'path 가 존재해야 한다');
    assert.deepEqual(r.hops, ['project', 'capabilities/auth', 'elements/token']);
    assert.equal(r.edges.length, r.hops.length - 1);
    assert.deepEqual(r.edges[0], {
      from: 'project',
      to: 'capabilities/auth',
      via: 'capabilities',
    });
    assert.deepEqual(r.edges[1], {
      from: 'capabilities/auth',
      to: 'elements/token',
      via: 'elements',
    });
  });

  it('trivial path (from === to) 는 edges 가 빈 배열', () => {
    const r = findPath(pathRoot, 'project', 'project');
    assert.deepEqual(r.hops, ['project']);
    assert.deepEqual(r.edges, []);
  });
});
