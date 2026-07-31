// writeDoc 슬러그 평면성 배선 테스트 (2026-08-01 판정 「슬러그는 평평한
// 식별자다」 — docs/DECISIONS.md).
//
// 규칙 자체(어떤 슬러그가 걸리는가)는
// `tests/contract/vault-schema.contract.test.ts` 의 FLAT_SLUG_CASES 가
// mcp/cli 미러 동일성까지 잰다. 여기서 재는 것은 **배선** 하나다: CLI 의
// 쓰기 문(write-vault writeDoc — `add` / `import` 가 통과)이 그 규칙을
// 실제로 태우는가. mcp 쪽 배선은 `mcp/src/write-path-gate.test.mjs` 가 잰다.
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { writeDoc } from './write-vault.mjs';

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
            frontmatter: { slug: 'elements/src/views/home', kind: 'element', title: 'Home' },
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
        frontmatter: { slug: 'elements/jwt-token', kind: 'element', title: 'JWT Token' },
        body: '',
      });
      writeDoc(root, 'services/auth-api', {
        frontmatter: { slug: 'services/auth-api', kind: 'element', title: 'Auth API' },
        body: '',
      });
      assert.equal(existsSync(join(root, 'elements/jwt-token.md')), true);
      assert.equal(existsSync(join(root, 'services/auth-api.md')), true);
    });
  });
});
