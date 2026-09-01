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

test('relate --dry-run은 preflight 뒤 source read 실패를 성공으로 바꾸지 않는다', { concurrency: false }, async () => {
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
    assert.equal(result.stdout, '', '읽기 실패인데 dry-run 성공 payload를 내보냈다');
    assert.equal(existsSync(source), false, 'dry-run이 삭제된 source를 되살렸다');
  });
});

test('relate는 관계 배열을 읽은 뒤 사람 수정이 생기면 conflict로 멈추고 바이트를 보존한다', { concurrency: false }, async () => {
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

    assert.equal(changedAfterRead, true, '관계 배열을 읽은 뒤 수정 경합을 주입하지 못했다');
    assert.equal(result.code, 1, `stdout: ${result.stdout}\nstderr: ${result.stderr}`);
    assert.match(stripAnsi(result.stderr), /changed or was deleted|conflict/i);
    assert.equal(result.stdout, '', 'conflict인데 성공 JSON을 내보냈다');
    assert.equal(readFileSync(source, 'utf-8'), humanBytes, '사람이 쓴 relation 바이트를 덮었다');
    assert.equal(existsSync(join(root, '.ontology-atlas', 'activity.jsonl')), false, '거절된 write를 활동 로그에 남겼다');
  });
});

test('relate는 관계 배열을 읽은 뒤 사람이 source를 삭제하면 conflict로 멈춘다', { concurrency: false }, async () => {
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

    assert.equal(deletedAfterRead, true, '관계 배열을 읽은 뒤 삭제 경합을 주입하지 못했다');
    assert.equal(result.code, 1, `stdout: ${result.stdout}\nstderr: ${result.stderr}`);
    assert.match(stripAnsi(result.stderr), /changed or was deleted|conflict/i);
    assert.equal(result.stdout, '', '삭제 conflict인데 성공 JSON을 내보냈다');
    assert.equal(existsSync(source), false, '사람이 지운 source를 다시 만들었다');
    assert.equal(existsSync(join(root, '.ontology-atlas', 'activity.jsonl')), false, '거절된 write를 활동 로그에 남겼다');
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

