// Wiring test for writeDoc slug flatness (decision 2026-08-01,
// 「슬러그는 평평한 식별자다」 — a slug is a flat identifier; docs/DECISIONS.md).
//
// The rule itself — which slugs are rejected — is measured by FLAT_SLUG_CASES in
// `tests/contract/vault-schema.contract.test.ts`, including mcp/cli mirror
// equality. What is measured here is one thing: the **wiring**, i.e. whether the
// CLI's write door (write-vault writeDoc, which `add` and `import` pass through)
// actually applies that rule. The mcp side's wiring is measured by
// `mcp/src/write-path-gate.test.mjs`.
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readDocFrontmatter, writeDoc, writeFrontmatterKeys } from './write-vault.mjs';

function withVault(fn) {
  const root = mkdtempSync(join(tmpdir(), 'ontology-atlas-write-vault-test-'));
  try {
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('write-vault writeDoc — 슬러그 평면성 게이트 배선', () => {
  it('스키마 폴더 아래 경로형 슬러그를 거부한다', () => {
    withVault((root) => {
      assert.throws(
        () =>
          writeDoc(root, 'elements/src/views/home', {
            frontmatter: { uid: '01890f3e-7b5d-4c0a-8f14-123456789abc', slug: 'elements/src/views/home', kind: 'element', title: 'Home' },
            body: '',
          }),
        /nests a path under elements\//,
      );
      assert.equal(existsSync(join(root, 'elements')), false);
    });
  });

  it('평평한 슬러그와 스키마 폴더 밖 중첩은 그대로 통과한다', () => {
    withVault((root) => {
      writeDoc(root, 'elements/jwt-token', {
        frontmatter: { uid: '11890f3e-7b5d-4c0a-8f14-123456789abc', slug: 'elements/jwt-token', kind: 'element', title: 'JWT Token' },
        body: '',
      });
      writeDoc(root, 'services/auth-api', {
        frontmatter: { uid: '21890f3e-7b5d-4c0a-8f14-123456789abc', slug: 'services/auth-api', kind: 'element', title: 'Auth API' },
        body: '',
      });
      assert.equal(existsSync(join(root, 'elements/jwt-token.md')), true);
      assert.equal(existsSync(join(root, 'services/auth-api.md')), true);
    });
  });
});

describe('write-vault writeDoc — UID identity gate', () => {
  it('known-kind create requires a unique lowercase UUIDv4', () => {
    withVault((root) => {
      assert.throws(
        () => writeDoc(root, 'missing', {
          frontmatter: { slug: 'missing', kind: 'project', title: 'Missing' },
        }),
        /uid/i,
      );
      const uid = '01890f3e-7b5d-4c0a-8f14-123456789abc';
      writeDoc(root, 'first', {
        frontmatter: { uid, slug: 'first', kind: 'project', title: 'First' },
      });
      assert.throws(
        () => writeDoc(root, 'second', {
          frontmatter: { uid, slug: 'second', kind: 'project', title: 'Second' },
        }),
        /already belongs|collision|UID/i,
      );
    });
  });

  it('generic frontmatter writer cannot mutate UID or merge-owned history', () => {
    withVault((root) => {
      writeDoc(root, 'first', {
        frontmatter: {
          uid: '01890f3e-7b5d-4c0a-8f14-123456789abc',
          slug: 'first',
          kind: 'project',
          title: 'First',
        },
      });
      assert.throws(
        () => writeFrontmatterKeys(root, 'first', { uid: '11890f3e-7b5d-4c0a-8f14-123456789abc' }),
        /immutable|uid/i,
      );
      assert.throws(
        () => writeFrontmatterKeys(root, 'first', { merged_uids: ['21890f3e-7b5d-4c0a-8f14-123456789abc'] }),
        /merge_concepts|merged_uids/i,
      );
    });
  });
});

describe('write-vault snapshot write', () => {
  it('읽은 문서가 사람이 수정한 뒤에는 stale patch를 쓰지 않는다', () => {
    withVault((root) => {
      writeDoc(root, 'first', {
        frontmatter: {
          uid: '01890f3e-7b5d-4c0a-8f14-123456789abc',
          slug: 'first',
          kind: 'project',
          title: 'Before',
        },
      });
      const before = readDocFrontmatter(root, 'first');
      const humanBytes = '---\nuid: 01890f3e-7b5d-4c0a-8f14-123456789abc\nslug: first\nkind: project\ntitle: Human edit\n---\n\n# Human edit\n';
      writeFileSync(before.filePath, humanBytes, 'utf-8');

      assert.throws(
        () => writeFrontmatterKeys(root, 'first', { title: 'Stale agent patch' }, { expectedRevision: before.revision }),
        /changed or was deleted|conflict/i,
      );
      assert.equal(readFileSync(before.filePath, 'utf-8'), humanBytes);
    });
  });

  it('읽은 문서가 삭제된 뒤에는 stale patch로 되살리지 않는다', () => {
    withVault((root) => {
      writeDoc(root, 'first', {
        frontmatter: {
          uid: '01890f3e-7b5d-4c0a-8f14-123456789abc',
          slug: 'first',
          kind: 'project',
          title: 'Before',
        },
      });
      const before = readDocFrontmatter(root, 'first');
      unlinkSync(before.filePath);

      assert.throws(
        () => writeFrontmatterKeys(root, 'first', { title: 'Stale agent patch' }, { expectedRevision: before.revision }),
        /changed or was deleted|conflict/i,
      );
      assert.equal(existsSync(before.filePath), false);
    });
  });
});
