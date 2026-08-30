#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { realpathSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const EXIT = Object.freeze({ OK: 0, USAGE: 64, DATA: 65, SOFTWARE: 70, IO: 74 });

export const READ_ONLY_TOOLS = Object.freeze([
  'git_status',
  'git_history',
  'list_kinds',
  'list_concepts',
  'get_concept',
  'get_concepts',
  'find_evidence',
  'find_backlinks',
  'find_neighbors',
  'find_path',
  'find_orphans',
  'query_concepts',
  'query_ontology',
  'validate_vault',
  'infer_imports',
  'index_project',
  'analyze_repo_structure',
]);

const TOOL_SET = new Set(READ_ONLY_TOOLS);
const ROOTED_INPUT_FIELDS = Object.freeze(['actorId', 'serverPath', 'vaultRoot', 'repoRoot', 'requests']);
const ROOTED_REQUEST_FIELDS = Object.freeze(['id', 'name', 'args']);
const NON_BLANK_PATTERN = '\\S';
export function absolutePathPattern(platform = process.platform) {
  return platform === 'win32' ? '^(?:[A-Za-z]:[\\\\/]|[\\\\/])' : '^/';
}
const ABSOLUTE_PATH_PATTERN = absolutePathPattern();
const JAVASCRIPT_ENTRY_PATTERN = '\\.[mM]?[jJ][sS]$';

export const ROOTED_READ_SCHEMA = Object.freeze({
  contract: 'rootedMcpReadCli:v1',
  purpose: 'Run an ordered Atlas MCP read packet against explicit source-checkout roots, after verifying connection_info, and write one transcript only when every read succeeds.',
  discovery: ['rooted-mcp-read.mjs schema', 'rooted-mcp-read.mjs --help'],
  invocation: 'rooted-mcp-read.mjs --input file --output absent-file',
  automaticRootCheck: 'The runner calls connection_info first and rejects any canonical vault/repository mismatch before the requested reads.',
  output: {
    contract: 'rootedMcpReadTranscript:v1',
    path: 'One absent JSON file whose parent already exists.',
    atomicity: 'No transcript is written unless root verification and every requested read succeed.',
  },
  exits: {
    0: 'success',
    64: 'command-line usage error',
    65: 'input contract, root mismatch, or MCP data error',
    70: 'unexpected software error',
    74: 'server or input/output filesystem error',
  },
  runtimeOnlyChecks: [
    'serverPath exists and is a regular file',
    'vaultRoot and repoRoot exist and are directories resolved through realpath',
    'request ids are unique within the packet',
    'connection_info canonical roots equal the requested canonical roots before any requested read',
  ],
  inputJsonSchema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    additionalProperties: false,
    required: [...ROOTED_INPUT_FIELDS],
    properties: {
      actorId: { type: 'string', minLength: 1, pattern: NON_BLANK_PATTERN },
      serverPath: {
        type: 'string',
        minLength: 1,
        allOf: [{ pattern: ABSOLUTE_PATH_PATTERN }, { pattern: JAVASCRIPT_ENTRY_PATTERN }],
        description: 'Existing absolute source-checkout JavaScript MCP entry path; existence and file type are runtime-only checks.',
      },
      vaultRoot: {
        type: 'string',
        minLength: 1,
        pattern: ABSOLUTE_PATH_PATTERN,
        description: 'Existing absolute vault directory; existence and realpath resolution are runtime-only checks.',
      },
      repoRoot: {
        type: 'string',
        minLength: 1,
        pattern: ABSOLUTE_PATH_PATTERN,
        description: 'Existing absolute repository directory; existence and realpath resolution are runtime-only checks.',
      },
      requests: {
        type: 'array',
        minItems: 1,
        maxItems: 50,
        items: {
          type: 'object',
          additionalProperties: false,
          required: [...ROOTED_REQUEST_FIELDS],
          properties: {
            id: { type: 'string', minLength: 1, pattern: NON_BLANK_PATTERN, description: 'Unique within this packet; uniqueness is a runtime-only check.' },
            name: { type: 'string', enum: [...READ_ONLY_TOOLS] },
            args: { type: 'object' },
          },
        },
      },
    },
  },
  requestExamples: {
    list_kinds: { id: 'kinds', name: 'list_kinds', args: {} },
    index_project: {
      id: 'index',
      name: 'index_project',
      args: { rootPath: '/absolute/repository', maxFiles: 2000 },
    },
    infer_imports: {
      id: 'imports',
      name: 'infer_imports',
      args: { rootPath: '/absolute/repository', maxFiles: 2000 },
    },
    analyze_repo_structure: {
      id: 'analyze',
      name: 'analyze_repo_structure',
      args: { rootPath: '/absolute/repository', proposal: '<complete proposal object>' },
    },
  },
  example: {
    actorId: 'agent:cold-start-builder',
    serverPath: '/absolute/source-checkout/mcp/src/index.js',
    vaultRoot: '/absolute/vault',
    repoRoot: '/absolute/repository',
    requests: [
      { id: 'kinds', name: 'list_kinds', args: {} },
      { id: 'index', name: 'index_project', args: { rootPath: '/absolute/repository', maxFiles: 2000 } },
    ],
  },
});

export class RootedReadError extends Error {
  constructor(message, { exitCode = EXIT.DATA, details } = {}) {
    super(message);
    this.name = 'RootedReadError';
    this.exitCode = exitCode;
    this.details = details;
  }
}

function assert(condition, message, options) {
  if (!condition) throw new RootedReadError(message, options);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonBlank(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function canonicalRoot(pathValue, label) {
  assert(nonBlank(pathValue) && isAbsolute(pathValue), `${label} must be an existing absolute directory.`);
  try {
    const info = statSync(pathValue);
    assert(info.isDirectory(), `${label} must be an existing absolute directory.`);
    return realpathSync(pathValue);
  } catch (error) {
    if (error instanceof RootedReadError) throw error;
    throw new RootedReadError(`${label} must be an existing absolute directory: ${error.message}`);
  }
}

export function validateRootedReadInput(input) {
  assert(isRecord(input), 'Input must be an object.');
  const allowedInputKeys = new Set(ROOTED_INPUT_FIELDS);
  assert(Object.keys(input).every((key) => allowedInputKeys.has(key)), 'Input has unknown fields.');
  assert(nonBlank(input.actorId), 'actorId is required.');
  assert(nonBlank(input.serverPath) && isAbsolute(input.serverPath), 'serverPath must be an existing absolute file.');
  assert(/\.m?js$/i.test(input.serverPath), 'serverPath must point to a source-checkout JavaScript MCP entry.');
  try {
    assert(statSync(input.serverPath).isFile(), 'serverPath must be an existing absolute file.');
  } catch (error) {
    if (error instanceof RootedReadError) throw error;
    throw new RootedReadError(`serverPath must be an existing absolute file: ${error.message}`);
  }
  canonicalRoot(input.vaultRoot, 'vaultRoot');
  canonicalRoot(input.repoRoot, 'repoRoot');
  assert(Array.isArray(input.requests) && input.requests.length > 0, 'requests needs at least one read.');
  assert(input.requests.length <= 50, 'requests supports at most 50 reads.');
  const ids = new Set();
  const allowedRequestKeys = new Set(ROOTED_REQUEST_FIELDS);
  for (const [index, request] of input.requests.entries()) {
    assert(isRecord(request), `requests[${index}] must be an object.`);
    assert(Object.keys(request).every((key) => allowedRequestKeys.has(key)), `requests[${index}] has unknown fields.`);
    assert(nonBlank(request.id), `requests[${index}].id is required.`);
    assert(!ids.has(request.id), 'request ids must be unique.');
    ids.add(request.id);
    assert(TOOL_SET.has(request.name), `requests[${index}].name must be a supported read-only tool.`);
    assert(isRecord(request.args), `requests[${index}].args must be an object.`);
  }
  return input;
}

function toolErrorText(result) {
  return result?.content?.find(({ type }) => type === 'text')?.text ?? 'unknown MCP error';
}

async function createStdioSession({ serverPath, vaultRoot, repoRoot, actorId }) {
  const child = spawn(process.execPath, [serverPath], {
    env: { ...process.env, OATLAS_VAULT: vaultRoot, OATLAS_REPO_ROOT: repoRoot },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  let buffer = '';
  let stderr = '';
  let nextId = 1;
  let closing = false;
  const pending = new Map();
  let resolveExit;
  const exited = new Promise((resolveExitPromise) => { resolveExit = resolveExitPromise; });

  const rejectPending = (error) => {
    for (const { reject, timer } of pending.values()) {
      clearTimeout(timer);
      reject(error);
    }
    pending.clear();
  };
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    while (buffer.includes('\n')) {
      const newline = buffer.indexOf('\n');
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }
      const waiter = pending.get(message.id);
      if (!waiter) continue;
      pending.delete(message.id);
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    }
  });
  child.on('error', (error) => rejectPending(new RootedReadError(`Cannot start MCP server: ${error.message}`, { exitCode: EXIT.IO })));
  child.on('exit', (code, signal) => {
    resolveExit({ code, signal });
    if (!closing && pending.size > 0) {
      rejectPending(new RootedReadError(`MCP server exited before replying (code ${code ?? 'none'}, signal ${signal ?? 'none'}): ${stderr.trim()}`, { exitCode: EXIT.IO }));
    }
  });

  const send = (method, params, timeoutMs = 120000) => new Promise((resolveMessage, rejectMessage) => {
    const id = nextId;
    nextId += 1;
    const timer = setTimeout(() => {
      pending.delete(id);
      rejectMessage(new RootedReadError(`MCP ${method} timed out after ${timeoutMs}ms.`, { exitCode: EXIT.IO }));
    }, timeoutMs);
    pending.set(id, { resolve: resolveMessage, reject: rejectMessage, timer });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`, (error) => {
      if (!error) return;
      const waiter = pending.get(id);
      if (!waiter) return;
      pending.delete(id);
      clearTimeout(waiter.timer);
      rejectMessage(new RootedReadError(`Cannot write MCP request: ${error.message}`, { exitCode: EXIT.IO }));
    });
  });

  const close = async () => {
    closing = true;
    child.stdin.end();
    let timeoutId;
    const timeout = new Promise((resolveTimeout) => {
      timeoutId = setTimeout(() => {
        child.kill('SIGTERM');
        resolveTimeout({ forced: true });
      }, 500);
    });
    await Promise.race([exited, timeout]);
    clearTimeout(timeoutId);
  };

  try {
    const initialize = await send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: actorId, version: '1' },
    });
    assert(!initialize.error, `MCP initialize failed: ${JSON.stringify(initialize.error)}`, { exitCode: EXIT.IO });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
  } catch (error) {
    await close();
    throw error;
  }

  return {
    async call(name, args) {
      const message = await send('tools/call', { name, arguments: args });
      assert(!message.error, `MCP ${name} failed: ${JSON.stringify(message.error)}`, { exitCode: EXIT.IO });
      const result = message.result;
      assert(!result?.isError, `MCP ${name} failed: ${toolErrorText(result)}`);
      if (isRecord(result?.structuredContent)) return result.structuredContent;
      const text = result?.content?.find(({ type }) => type === 'text')?.text;
      assert(nonBlank(text), `MCP ${name} returned no structured or JSON text result.`, { exitCode: EXIT.IO });
      try {
        return JSON.parse(text);
      } catch (error) {
        throw new RootedReadError(`MCP ${name} returned invalid JSON text: ${error.message}`, { exitCode: EXIT.IO });
      }
    },
    close,
  };
}

export async function runRootedRead({ input, callTool, now = () => new Date().toISOString() } = {}) {
  validateRootedReadInput(input);
  const expectedVaultRoot = canonicalRoot(input.vaultRoot, 'vaultRoot');
  const expectedRepoRoot = canonicalRoot(input.repoRoot, 'repoRoot');
  const calls = [];
  const startedAtUtc = now();
  const session = callTool ? null : await createStdioSession({
    serverPath: input.serverPath,
    vaultRoot: input.vaultRoot,
    repoRoot: input.repoRoot,
    actorId: input.actorId,
  });
  const effectiveCallTool = callTool ?? (({ name, args }) => session.call(name, args));
  const invoke = async (id, name, args) => {
    const startedAtUtc = now();
    const response = await effectiveCallTool({
      vaultRoot: input.vaultRoot,
      repoRoot: input.repoRoot,
      name,
      args,
    });
    const endedAtUtc = now();
    const row = { id, name, args: structuredClone(args), startedAtUtc, endedAtUtc, response };
    calls.push(row);
    return response;
  };

  try {
    const connection = await invoke('connection', 'connection_info', {});
    assert(isRecord(connection), 'connection_info returned no structured object.');
    const actualVaultRoot = canonicalRoot(connection.vaultRoot, 'connection_info.vaultRoot');
    const actualRepoRoot = canonicalRoot(connection.repoRoot, 'connection_info.repoRoot');
    assert(
      actualVaultRoot === expectedVaultRoot && actualRepoRoot === expectedRepoRoot,
      'connection_info root mismatch; no semantic read was attempted.',
      {
        details: {
          expected: { vaultRoot: expectedVaultRoot, repoRoot: expectedRepoRoot },
          actual: { vaultRoot: actualVaultRoot, repoRoot: actualRepoRoot },
        },
      },
    );

    for (const request of input.requests) {
      await invoke(request.id, request.name, request.args);
    }

    return {
      contract: 'rootedMcpReadTranscript:v1',
      actorId: input.actorId,
      startedAtUtc,
      endedAtUtc: now(),
      serverPath: input.serverPath,
      requestedRoots: { vaultRoot: input.vaultRoot, repoRoot: input.repoRoot },
      rootCheck: {
        ok: true,
        expected: { vaultRoot: expectedVaultRoot, repoRoot: expectedRepoRoot },
        actual: { vaultRoot: actualVaultRoot, repoRoot: actualRepoRoot },
      },
      readOnlyToolCount: READ_ONLY_TOOLS.length,
      calls,
    };
  } finally {
    await session?.close();
  }
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    assert(['--input', '--output'].includes(flag) && nonBlank(value), `Invalid argument ${flag ?? ''}.`, { exitCode: EXIT.USAGE });
    assert(!Object.hasOwn(options, flag), `Duplicate argument ${flag}.`, { exitCode: EXIT.USAGE });
    options[flag] = value;
  }
  assert(nonBlank(options['--input']) && nonBlank(options['--output']), '--input and --output are required.', { exitCode: EXIT.USAGE });
  return { inputPath: resolve(options['--input']), outputPath: resolve(options['--output']) };
}

async function atomicWrite(outputPath, value) {
  try {
    await stat(outputPath);
    throw new RootedReadError('Output path already exists.', { exitCode: EXIT.IO });
  } catch (error) {
    if (error instanceof RootedReadError) throw error;
    if (error.code !== 'ENOENT') throw new RootedReadError(`Cannot inspect output path: ${error.message}`, { exitCode: EXIT.IO });
  }
  const parent = dirname(outputPath);
  try {
    const info = await stat(parent);
    assert(info.isDirectory(), 'Output parent must be a directory.', { exitCode: EXIT.IO });
  } catch (error) {
    if (error instanceof RootedReadError) throw error;
    throw new RootedReadError(`Output parent must exist: ${error.message}`, { exitCode: EXIT.IO });
  }
  const temporary = join(parent, `.${basename(outputPath)}.${process.pid}.${Date.now()}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
    await rename(temporary, outputPath);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    if (error instanceof RootedReadError) throw error;
    throw new RootedReadError(`Cannot write output: ${error.message}`, { exitCode: EXIT.IO });
  }
}

export async function runCli(argv = process.argv.slice(2)) {
  if (argv.length === 1 && ['schema', '--help'].includes(argv[0])) {
    process.stdout.write(`${JSON.stringify(ROOTED_READ_SCHEMA, null, 2)}\n`);
    return EXIT.OK;
  }
  const { inputPath, outputPath } = parseArgs(argv);
  let input;
  try {
    input = JSON.parse(await readFile(inputPath, 'utf8'));
  } catch (error) {
    throw new RootedReadError(`Cannot read input JSON: ${error.message}`, {
      exitCode: error instanceof SyntaxError ? EXIT.DATA : EXIT.IO,
    });
  }
  const transcript = await runRootedRead({ input });
  await atomicWrite(outputPath, transcript);
  process.stdout.write(`${JSON.stringify({ output: outputPath, rootCheck: transcript.rootCheck, calls: transcript.calls.length }, null, 2)}\n`);
  return EXIT.OK;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  runCli().then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    const exitCode = error instanceof RootedReadError ? error.exitCode : EXIT.SOFTWARE;
    process.stderr.write(`${JSON.stringify({ error: error.message, exitCode, ...(error.details === undefined ? {} : { details: error.details }) }, null, 2)}\n`);
    process.exitCode = exitCode;
  });
}
