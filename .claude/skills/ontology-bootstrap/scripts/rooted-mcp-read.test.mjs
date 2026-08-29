import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, test } from 'node:test';

import {
  EXIT,
  READ_ONLY_TOOLS,
  runRootedRead,
  validateRootedReadInput,
} from './rooted-mcp-read.mjs';

const execFileAsync = promisify(execFile);
const SCRIPT = new URL('./rooted-mcp-read.mjs', import.meta.url).pathname;

async function roots(prefix = 'rooted-mcp-read-') {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const vaultRoot = join(root, 'vault');
  const repoRoot = join(root, 'repo');
  await Promise.all([mkdir(vaultRoot), mkdir(repoRoot)]);
  return { root, vaultRoot, repoRoot };
}

function inputFor({ vaultRoot, repoRoot, requests } = {}) {
  return {
    actorId: 'agent:rooted-reader',
    serverPath: join(process.cwd(), 'mcp', 'src', 'index.js'),
    vaultRoot,
    repoRoot,
    requests: requests ?? [{ id: 'read-1', name: 'list_kinds', args: {} }],
  };
}

describe('rooted MCP read runner', () => {
  test('inventory is non-empty and excludes every write-capable bootstrap operation', () => {
    assert.ok(READ_ONLY_TOOLS.length > 8, 'read-only inventory must not become an idle gate');
    for (const name of [
      'add_concept', 'add_concepts', 'add_relation', 'add_relations',
      'patch_concept', 'connect_project_source', 'finalize_project_meaning',
      'delete_concept', 'compile_ontology',
    ]) {
      assert.equal(READ_ONLY_TOOLS.includes(name), false, `${name} must stay unavailable`);
    }
  });

  test('rejects ambiguous roots, empty reads, duplicate ids, unknown fields, and write tools', async () => {
    const { vaultRoot, repoRoot } = await roots();
    assert.throws(() => validateRootedReadInput({ ...inputFor({ vaultRoot, repoRoot }), serverPath: './mcp.js' }), /absolute/);
    assert.throws(() => validateRootedReadInput({ ...inputFor({ vaultRoot, repoRoot }), serverPath: '/bin/sh' }), /JavaScript/);
    assert.throws(() => validateRootedReadInput({ ...inputFor({ vaultRoot, repoRoot }), repoRoot: '.' }), /absolute/);
    assert.throws(() => validateRootedReadInput(inputFor({ vaultRoot, repoRoot, requests: [] })), /at least one/);
    assert.throws(() => validateRootedReadInput(inputFor({ vaultRoot, repoRoot, requests: [
      { id: 'same', name: 'list_kinds', args: {} },
      { id: 'same', name: 'list_concepts', args: {} },
    ] })), /unique/);
    assert.throws(() => validateRootedReadInput(inputFor({ vaultRoot, repoRoot, requests: [
      { id: 'read-1', name: 'list_kinds', args: {}, extra: true },
    ] })), /unknown fields/);
    assert.throws(() => validateRootedReadInput(inputFor({ vaultRoot, repoRoot, requests: [
      { id: 'write-1', name: 'patch_concept', args: { slug: 'x' } },
    ] })), /read-only/);
  });

  test('checks connection_info before every requested read and preserves request order', async () => {
    const { vaultRoot, repoRoot } = await roots();
    const calls = [];
    const result = await runRootedRead({
      input: inputFor({
        vaultRoot,
        repoRoot,
        requests: [
          { id: 'read-1', name: 'list_kinds', args: {} },
          { id: 'read-2', name: 'index_project', args: { rootPath: repoRoot, maxFiles: 5 } },
        ],
      }),
      callTool: async ({ name, args }) => {
        calls.push({ name, args });
        if (name === 'connection_info') return { vaultRoot, repoRoot };
        return { ok: true, name };
      },
    });
    assert.deepEqual(calls.map(({ name }) => name), ['connection_info', 'list_kinds', 'index_project']);
    assert.equal(result.rootCheck.ok, true);
    assert.deepEqual(result.calls.map(({ id, name }) => [id, name]), [
      ['connection', 'connection_info'],
      ['read-1', 'list_kinds'],
      ['read-2', 'index_project'],
    ]);
  });

  test('fails on a root mismatch before any semantic read', async () => {
    const { root, vaultRoot, repoRoot } = await roots();
    const wrongVault = join(root, 'wrong-vault');
    const wrongRepo = join(root, 'wrong-repo');
    await Promise.all([mkdir(wrongVault), mkdir(wrongRepo)]);
    const calls = [];
    await assert.rejects(
      runRootedRead({
        input: inputFor({ vaultRoot, repoRoot }),
        callTool: async ({ name }) => {
          calls.push(name);
          return { vaultRoot: wrongVault, repoRoot: wrongRepo };
        },
      }),
      (error) => error.exitCode === EXIT.DATA && /root mismatch/.test(error.message),
    );
    assert.deepEqual(calls, ['connection_info']);
  });

  test('CLI proves actual source-checkout roots and writes one complete transcript', async () => {
    const { root, vaultRoot, repoRoot } = await roots('rooted-mcp-read-live-');
    const inputPath = join(root, 'input.json');
    const outputPath = join(root, 'output.json');
    await writeFile(inputPath, `${JSON.stringify(inputFor({ vaultRoot, repoRoot }), null, 2)}\n`);
    await execFileAsync(process.execPath, [SCRIPT, '--input', inputPath, '--output', outputPath]);
    const output = JSON.parse(await readFile(outputPath, 'utf8'));
    assert.equal((await stat(outputPath)).isFile(), true);
    assert.equal(output.rootCheck.ok, true);
    assert.deepEqual(output.calls.map(({ name }) => name), ['connection_info', 'list_kinds']);
    assert.equal(output.calls[1].response.total, 0);
  });

  test('CLI write-tool rejection is RED before MCP and leaves no output', async () => {
    const { root, vaultRoot, repoRoot } = await roots('rooted-mcp-read-red-');
    const inputPath = join(root, 'input.json');
    const outputPath = join(root, 'output.json');
    await writeFile(inputPath, `${JSON.stringify(inputFor({
      vaultRoot,
      repoRoot,
      requests: [{ id: 'write-1', name: 'patch_concept', args: { slug: 'x' } }],
    }), null, 2)}\n`);
    await assert.rejects(
      execFileAsync(process.execPath, [SCRIPT, '--input', inputPath, '--output', outputPath]),
      (error) => error.code === EXIT.DATA && /read-only/.test(error.stderr),
    );
    await assert.rejects(stat(outputPath), (error) => error.code === 'ENOENT');
  });
});
