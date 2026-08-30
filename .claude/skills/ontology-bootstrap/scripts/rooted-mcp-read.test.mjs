import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, posix, win32 } from 'node:path';
import { promisify } from 'node:util';
import { describe, test } from 'node:test';

import {
  EXIT,
  READ_ONLY_TOOLS,
  ROOTED_READ_SCHEMA,
  absolutePathPattern,
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

function inputFor({ serverPath = SCRIPT, vaultRoot, repoRoot, requests } = {}) {
  return {
    actorId: 'agent:rooted-reader',
    serverPath,
    vaultRoot,
    repoRoot,
    requests: requests ?? [{ id: 'read-1', name: 'list_kinds', args: {} }],
  };
}

async function writeFixtureServer(root) {
  const serverPath = join(root, 'fixture-mcp.mjs');
  await writeFile(serverPath, `
import readline from 'node:readline';
const lines = readline.createInterface({ input: process.stdin });
for await (const line of lines) {
  const message = JSON.parse(line);
  if (message.method === 'notifications/initialized') continue;
  if (message.method === 'initialize') {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: {
      protocolVersion: '2024-11-05', capabilities: {}, serverInfo: { name: 'fixture', version: '1' },
    } }) + '\\n');
    continue;
  }
  const name = message.params?.name;
  const structuredContent = name === 'connection_info'
    ? { vaultRoot: process.env.OATLAS_VAULT, repoRoot: process.env.OATLAS_REPO_ROOT }
    : { total: 0, byKind: {}, referencedOnlyTotal: 0, conceptsIncludingReferenced: 0 };
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: {
    content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent,
  } }) + '\\n');
}
`);
  return serverPath;
}

function schemaErrors(schema, value, path = '$') {
  const errors = [];
  const validate = (row, subject, currentPath) => {
    for (const child of row.allOf ?? []) validate(child, subject, currentPath);
    const typeMatches = row.type === undefined
      || (row.type === 'object' && subject !== null && typeof subject === 'object' && !Array.isArray(subject))
      || (row.type === 'array' && Array.isArray(subject))
      || (row.type === 'string' && typeof subject === 'string');
    if (!typeMatches) {
      errors.push(`${currentPath} type mismatch`);
      return;
    }
    if (typeof subject === 'string') {
      if (row.minLength !== undefined && subject.length < row.minLength) errors.push(`${currentPath} below minLength`);
      if (row.pattern && !new RegExp(row.pattern).test(subject)) errors.push(`${currentPath} pattern mismatch`);
      if (row.enum && !row.enum.includes(subject)) errors.push(`${currentPath} enum mismatch`);
    }
    if (Array.isArray(subject)) {
      if (row.minItems !== undefined && subject.length < row.minItems) errors.push(`${currentPath} below minItems`);
      if (row.maxItems !== undefined && subject.length > row.maxItems) errors.push(`${currentPath} above maxItems`);
      subject.forEach((item, index) => {
        if (row.items) validate(row.items, item, `${currentPath}[${index}]`);
      });
    }
    if (subject !== null && typeof subject === 'object' && !Array.isArray(subject)) {
      for (const key of row.required ?? []) {
        if (!Object.hasOwn(subject, key)) errors.push(`${currentPath}.${key} required`);
      }
      for (const [key, child] of Object.entries(row.properties ?? {})) {
        if (Object.hasOwn(subject, key)) validate(child, subject[key], `${currentPath}.${key}`);
      }
      if (row.additionalProperties === false) {
        for (const key of Object.keys(subject)) {
          if (!Object.hasOwn(row.properties ?? {}, key)) errors.push(`${currentPath}.${key} additional`);
        }
      }
    }
  };
  validate(schema, value, path);
  return errors;
}

describe('rooted MCP read runner', () => {
  test('schema exposes the exact one-shot CLI and non-empty read-only input contract', async () => {
    assert.equal(ROOTED_READ_SCHEMA.contract, 'rootedMcpReadCli:v1');
    assert.equal(ROOTED_READ_SCHEMA.invocation, 'rooted-mcp-read.mjs --input file --output absent-file');
    assert.deepEqual(ROOTED_READ_SCHEMA.inputJsonSchema.required, [
      'actorId',
      'serverPath',
      'vaultRoot',
      'repoRoot',
      'requests',
    ]);
    assert.deepEqual(ROOTED_READ_SCHEMA.inputJsonSchema.properties.requests.items.properties.name.enum, READ_ONLY_TOOLS);
    assert.deepEqual(Object.keys(ROOTED_READ_SCHEMA.requestExamples), [
      'list_kinds',
      'index_project',
      'infer_imports',
      'analyze_repo_structure',
    ]);
    assert.deepEqual(ROOTED_READ_SCHEMA.requestExamples.infer_imports.args, {
      rootPath: '/absolute/repository',
      maxFiles: 2000,
    });
    assert.deepEqual(ROOTED_READ_SCHEMA.requestExamples.analyze_repo_structure.args, {
      rootPath: '/absolute/repository',
      proposal: '<complete proposal object>',
    });
    assert.ok(ROOTED_READ_SCHEMA.example.requests.length > 0, 'schema example must not become an idle request list');
    assert.equal(ROOTED_READ_SCHEMA.example.requests.some(({ name }) => name === 'connection_info'), false);
    const { vaultRoot, repoRoot } = await roots('rooted-mcp-read-schema-');
    const validInput = {
      ...ROOTED_READ_SCHEMA.example,
      serverPath: SCRIPT,
      vaultRoot,
      repoRoot,
      requests: ROOTED_READ_SCHEMA.example.requests.map((request) => ({
        ...request,
        args: request.name === 'index_project' ? { ...request.args, rootPath: repoRoot } : request.args,
      })),
    };
    assert.deepEqual(schemaErrors(ROOTED_READ_SCHEMA.inputJsonSchema, validInput), []);
    assert.doesNotThrow(() => validateRootedReadInput(validInput));
    const representableRed = [
      { label: 'blank actor', mutate: (value) => { value.actorId = '  '; } },
      { label: 'blank request id', mutate: (value) => { value.requests[0].id = '\t'; } },
      { label: 'relative server', mutate: (value) => { value.serverPath = 'mcp.js'; } },
      { label: 'non-JavaScript server', mutate: (value) => { value.serverPath = '/bin/sh'; } },
      { label: 'relative vault', mutate: (value) => { value.vaultRoot = '.'; } },
      { label: 'empty requests', mutate: (value) => { value.requests = []; } },
      { label: 'write tool', mutate: (value) => { value.requests[0].name = 'patch_concept'; } },
    ];
    for (const { label, mutate } of representableRed) {
      const invalid = structuredClone(validInput);
      mutate(invalid);
      assert.notDeepEqual(schemaErrors(ROOTED_READ_SCHEMA.inputJsonSchema, invalid), [], `${label} stayed schema-green`);
      assert.throws(() => validateRootedReadInput(invalid), undefined, `${label} stayed runtime-green`);
    }
    const duplicateIds = structuredClone(validInput);
    duplicateIds.requests[1].id = duplicateIds.requests[0].id;
    assert.deepEqual(schemaErrors(ROOTED_READ_SCHEMA.inputJsonSchema, duplicateIds), []);
    assert.throws(() => validateRootedReadInput(duplicateIds), /unique/);
    const missingServer = { ...validInput, serverPath: join(repoRoot, 'missing.mjs') };
    assert.deepEqual(schemaErrors(ROOTED_READ_SCHEMA.inputJsonSchema, missingServer), []);
    assert.throws(() => validateRootedReadInput(missingServer), /existing absolute file/);
    assert.ok(ROOTED_READ_SCHEMA.runtimeOnlyChecks.some((row) => row.includes('request ids are unique')));
    assert.ok(ROOTED_READ_SCHEMA.runtimeOnlyChecks.some((row) => row.includes('serverPath exists')));
    const [{ stdout }, { stdout: helpStdout }] = await Promise.all([
      execFileAsync(process.execPath, [SCRIPT, 'schema']),
      execFileAsync(process.execPath, [SCRIPT, '--help']),
    ]);
    assert.deepEqual(JSON.parse(stdout), ROOTED_READ_SCHEMA);
    assert.equal(helpStdout, stdout);
  });

  test('platform path patterns match Node absolute-path semantics', () => {
    const cases = [
      '',
      '.',
      'relative/path',
      '/rooted/path',
      '\\rooted\\path',
      'C:\\rooted\\path',
      'C:/rooted/path',
      'C:relative\\path',
      '\\\\server\\share',
    ];
    const windowsPattern = new RegExp(absolutePathPattern('win32'));
    const posixPattern = new RegExp(absolutePathPattern('linux'));
    for (const value of cases) {
      assert.equal(windowsPattern.test(value), win32.isAbsolute(value), `win32 drift for ${JSON.stringify(value)}`);
      assert.equal(posixPattern.test(value), posix.isAbsolute(value), `posix drift for ${JSON.stringify(value)}`);
    }
  });

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

  test('CLI proves explicit roots against a dependency-free stdio fixture and writes one complete transcript', async () => {
    const { root, vaultRoot, repoRoot } = await roots('rooted-mcp-read-live-');
    const serverPath = await writeFixtureServer(root);
    const inputPath = join(root, 'input.json');
    const outputPath = join(root, 'output.json');
    await writeFile(inputPath, `${JSON.stringify(inputFor({ serverPath, vaultRoot, repoRoot }), null, 2)}\n`);
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
