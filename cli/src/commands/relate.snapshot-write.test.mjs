import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runRelate } from './relate.mjs';
import { readDocFrontmatter } from '../lib/write-vault.mjs';

const SOURCE_UID = '00000000-0000-4000-8000-000000000001';
const TARGET_UID = '00000000-0000-4000-8000-000000000002';

function documentFor({ uid, slug, title, relates = [] }) {
  const relations = relates.length > 0 ? `relates: [${relates.join(', ')}]\n` : '';
  return (
    `---\nuid: ${uid}\nslug: ${slug}\nkind: capability\ntitle: ${title}\n${relations}---\n\n` +
    `# ${title}\n`
  );
}

function relationCheck() {
  return {
    operation: 'relation_check',
    from: 'a',
    to: 'b',
    relation: 'relates',
    fromKind: 'capability',
    toKind: 'capability',
    verdict: 'matches_existing_schema',
    exists: false,
    recommendation: {
      decision: 'safe_to_add',
      severity: 'info',
      reason: 'The relation matches the fixture schema.',
    },
    matchingEdges: [],
    inverseEdges: [],
    schemaPattern: null,
    nearbyPatterns: [],
    proposedAction: {
      tool: 'add_relation',
      args: { from: 'a', to: 'b', type: 'relates' },
    },
  };
}

async function withVault(run) {
  const root = mkdtempSync(join(tmpdir(), 'oatlas-relate-snapshot-'));
  const source = join(root, 'a.md');
  try {
    writeFileSync(
      source,
      documentFor({ uid: SOURCE_UID, slug: 'a', title: 'Agent source', relates: ['before'] }),
      'utf-8',
    );
    writeFileSync(
      join(root, 'b.md'),
      documentFor({ uid: TARGET_UID, slug: 'b', title: 'Target' }),
      'utf-8',
    );
    await run({ root, source });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function captureCommand(run) {
  const originalStdout = process.stdout.write;
  const originalStderr = process.stderr.write;
  let stdout = '';
  let stderr = '';
  process.stdout.write = (chunk) => {
    stdout += String(chunk);
    return true;
  };
  process.stderr.write = (chunk) => {
    stderr += String(chunk);
    return true;
  };
  try {
    return { code: await run(), stdout, stderr };
  } finally {
    process.stdout.write = originalStdout;
    process.stderr.write = originalStderr;
  }
}

function stripAnsi(value) {
  return value.replace(/\x1b\[[0-9;]*m/g, '');
}

test('relate --dry-run reports a source read failure after preflight as a failure', { concurrency: false }, async () => {
  await withVault(async ({ root, source }) => {
    const result = await captureCommand(() =>
      runRelate(['a', 'b', 'relates', root, '--dry-run', '--json'], {
        runRelationCheckQuery: async () => {
          unlinkSync(source);
          return relationCheck();
        },
      }),
    );

    assert.equal(result.code, 1, `stdout: ${result.stdout}\nstderr: ${result.stderr}`);
    assert.match(stripAnsi(result.stderr), /Doc not found/i);
    assert.equal(result.stdout, '', 'a read failure emitted a dry-run success payload');
    assert.equal(existsSync(source), false, 'dry-run recreated the deleted source');
  });
});

test('relate stops with a conflict and keeps the bytes when a person edits the source after the read', { concurrency: false }, async () => {
  await withVault(async ({ root, source }) => {
    const humanBytes = documentFor({
      uid: SOURCE_UID,
      slug: 'a',
      title: 'Human edited source',
      relates: ['human-edge'],
    });
    let changedAfterRead = false;
    const result = await captureCommand(() =>
      runRelate(['a', 'b', 'relates', root, '--json'], {
        runRelationCheckQuery: async () => relationCheck(),
        readDocFrontmatter(...args) {
          const document = readDocFrontmatter(...args);
          if (!changedAfterRead) {
            changedAfterRead = true;
            writeFileSync(source, humanBytes, 'utf-8');
          }
          return document;
        },
      }),
    );

    assert.equal(changedAfterRead, true, 'the edit race was not injected after the read');
    assert.equal(result.code, 1, `stdout: ${result.stdout}\nstderr: ${result.stderr}`);
    assert.match(stripAnsi(result.stderr), /changed or was deleted|conflict/i);
    assert.equal(result.stdout, '', 'a conflict emitted success JSON');
    assert.equal(readFileSync(source, 'utf-8'), humanBytes, 'the relation bytes a person wrote were overwritten');
    assert.equal(existsSync(join(root, '.ontology-atlas', 'activity.jsonl')), false, 'a rejected write was logged as activity');
  });
});

test('relate stops with a conflict when a person deletes the source after the read', { concurrency: false }, async () => {
  await withVault(async ({ root, source }) => {
    let deletedAfterRead = false;
    const result = await captureCommand(() =>
      runRelate(['a', 'b', 'relates', root, '--json'], {
        runRelationCheckQuery: async () => relationCheck(),
        readDocFrontmatter(...args) {
          const document = readDocFrontmatter(...args);
          if (!deletedAfterRead) {
            deletedAfterRead = true;
            unlinkSync(source);
          }
          return document;
        },
      }),
    );

    assert.equal(deletedAfterRead, true, 'the delete race was not injected after the read');
    assert.equal(result.code, 1, `stdout: ${result.stdout}\nstderr: ${result.stderr}`);
    assert.match(stripAnsi(result.stderr), /changed or was deleted|conflict/i);
    assert.equal(result.stdout, '', 'a delete conflict emitted success JSON');
    assert.equal(existsSync(source), false, 'the source the person deleted was recreated');
    assert.equal(existsSync(join(root, '.ontology-atlas', 'activity.jsonl')), false, 'a rejected write was logged as activity');
  });
});

test('relate consolidates a hand-authored depends_on: alias instead of splitting the edge family', { concurrency: false }, async () => {
  // Bug sweep 2026-09-01: reading only the canonical key appended a second
  // `dependencies:` array beside `depends_on:` — one edge type split across two
  // keys that MCP would have folded.
  await withVault(async ({ root, source }) => {
    writeFileSync(
      source,
      `---\nuid: ${SOURCE_UID}\nslug: a\nkind: capability\ntitle: Agent source\ndepends_on: [c]\n---\n\n# Agent source\n`,
      'utf-8',
    );
    writeFileSync(
      join(root, 'c.md'),
      documentFor({ uid: '00000000-0000-4000-8000-000000000003', slug: 'c', title: 'C' }),
      'utf-8',
    );
    const check = {
      ...relationCheck(),
      relation: 'depends_on',
      proposedAction: { tool: 'add_relation', args: { from: 'a', to: 'b', type: 'depends_on' } },
    };
    const result = await captureCommand(() =>
      runRelate(['a', 'b', 'depends_on', root, '--json', '--why', 'a needs b'], {
        runRelationCheckQuery: async () => check,
      }),
    );
    assert.equal(result.code, 0, `stdout: ${result.stdout}\nstderr: ${result.stderr}`);
    const { frontmatter } = readDocFrontmatter(root, 'a');
    assert.deepEqual(frontmatter.dependencies, ['b', 'c']);
    assert.equal(frontmatter.depends_on, undefined, 'the alias key must be consolidated away');
  });
});

test('relate --why refuses a flag-like value — a preview must never become a write', { concurrency: false }, async () => {
  // `--why --dry-run` used to consume `--dry-run` as the rationale: the user
  // asked for a preview and got a real vault write with that literal persisted.
  await withVault(async ({ root, source }) => {
    const before = readFileSync(source, 'utf-8');
    const result = await captureCommand(() =>
      runRelate(['a', 'b', 'depends_on', root, '--why', '--dry-run'], {
        runRelationCheckQuery: async () => relationCheck(),
      }),
    );
    assert.notEqual(result.code, 0, 'flag-like --why value must be rejected');
    assert.match(stripAnsi(result.stderr), /--why requires a value/i);
    assert.equal(readFileSync(source, 'utf-8'), before, 'nothing may be written');
  });
});
