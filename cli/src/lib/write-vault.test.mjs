// Wiring test: the CLI write door (writeDoc, used by `add` and `import`) applies slug flatness
// (docs/DECISIONS.md, 2026-08-01). The rule is measured in `tests/contract/vault-schema.contract.test.ts`,
// the mcp wiring in `mcp/src/write-path-gate.test.mjs`.
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { readDocFrontmatter, writeDoc, writeFrontmatterKeys } from './write-vault.mjs';

function withVault(fn) {
  const root = mkdtempSync(join(tmpdir(), 'ontology-atlas-write-vault-test-'));
  try {
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

it('refuses unrelated malformed rewrites while allowing a complete field repair', () => {
  withVault((root) => {
    const path = join(root, 'node.md');
    const before = '---\nuid: 01890f3e-7b5d-4c0a-8f14-123456789abc\nkind: capability\ntitle: Before\nlabels: { good: yes, broken }\n---\n\nBody';
    writeFileSync(path, before);
    assert.throws(() => writeFrontmatterKeys(root, 'node', { title: 'Changed' }), /malformed frontmatter/i);
    assert.equal(readFileSync(path, 'utf8'), before);
    writeFrontmatterKeys(root, 'node', { labels: { good: '001' } });
    assert.equal(readDocFrontmatter(root, 'node').frontmatter.labels.good, '001');
    assert.ok(readFileSync(path, 'utf8').endsWith('Body'));
  });
});

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

describe('write-vault refuses agent instruction files and hidden folders like the MCP writers', () => {
  it('refuses to create or patch them and leaves their bytes alone', () => {
    withVault((root) => {
      const skill = join(root, '.claude', 'skills', 'grow', 'SKILL.md');
      mkdirSync(dirname(skill), { recursive: true });
      writeFileSync(skill, '---\nname: grow\n---\n', 'utf-8');
      writeFileSync(join(root, 'AGENTS.md'), '# Rules\n', 'utf-8');
      const frontmatter = { uid: '31890f3e-7b5d-4c0a-8f14-123456789abc', kind: 'document', title: 'Doc' };
      assert.throws(() => writeDoc(root, 'CLAUDE', { frontmatter, body: 'x' }), /write tool never/);
      assert.throws(() => writeDoc(root, 'domains/Gemini', { frontmatter, body: 'x' }), /write tool never/);
      assert.throws(() => writeFrontmatterKeys(root, 'AGENTS', { title: 'x' }), /write tool never/);
      assert.throws(() => writeFrontmatterKeys(root, '.claude/skills/grow/SKILL', { 'allowed-tools': 'Bash(*)' }), /write tool never/);
      assert.equal(existsSync(join(root, 'CLAUDE.md')), false);
      assert.equal(readFileSync(join(root, 'AGENTS.md'), 'utf-8'), '# Rules\n');
      assert.equal(readFileSync(skill, 'utf-8'), '---\nname: grow\n---\n');
    });
  });

  it('judges where a slug lands, so a linked folder cannot reach them', () => {
    withVault((root) => {
      const skill = join(root, '.claude', 'skills', 'grow', 'SKILL.md');
      mkdirSync(dirname(skill), { recursive: true });
      writeFileSync(skill, '---\nname: grow\n---\n', 'utf-8');
      symlinkSync('.claude', join(root, 'notes'));
      const frontmatter = { uid: '31890f3e-7b5d-4c0a-8f14-123456789abc', kind: 'document', title: 'Doc' };
      assert.throws(() => writeFrontmatterKeys(root, 'notes/skills/grow/SKILL', { 'allowed-tools': 'Bash(*)' }), /through a link/);
      assert.throws(() => writeDoc(root, 'notes/commands/marker', { frontmatter, body: 'x' }), /through a link/);
      assert.equal(readFileSync(skill, 'utf-8'), '---\nname: grow\n---\n');
      assert.equal(existsSync(join(root, '.claude', 'commands', 'marker.md')), false);
    });
  });
});
