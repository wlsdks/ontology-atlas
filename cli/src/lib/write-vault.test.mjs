// Wiring test for writeDoc slug flatness (decision 2026-08-01,
// 「A slug is a flat identifier」 — a slug is a flat identifier; docs/DECISIONS.md).
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

describe('write-vault writeDoc enforces flat slugs', () => {
  it('rejects a path-shaped slug under a schema folder', () => {
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

  it('accepts flat slugs and nesting outside schema folders', () => {
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
  it('does not write a stale patch after a person edits the document', () => {
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

  it('does not recreate a deleted document with a stale patch', () => {
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
