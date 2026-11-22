import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  codexConfigForVault,
  codexSetupCommand,
  mcpConfigForVault,
  writeCodexConfig,
  writeMcpJson,
} from './client-config.mjs';
import { shellQuote } from './shell-quote.mjs';

const serverCommand = { command: 'node', args: ['/opt/atlas mcp/index.js'] };

async function quietly(run) {
  const write = process.stdout.write;
  process.stdout.write = () => true;
  try {
    return await run();
  } finally {
    process.stdout.write = write;
  }
}

async function withTempDir(run) {
  const directory = mkdtempSync(join(tmpdir(), 'oatlas-init-config-'));
  try {
    return await run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('a value is quoted only when the shell would split or expand it', () => {
  assert.equal(shellQuote('/a/b-c.d'), '/a/b-c.d');
  assert.equal(shellQuote('a b'), "'a b'");
  assert.equal(shellQuote("it's"), "'it'\\''s'");
});

test('the MCP config names the server command and binds the vault and the repository', () => {
  assert.deepEqual(mcpConfigForVault(serverCommand, '.', './r'), {
    mcpServers: {
      'ontology-atlas': {
        command: 'node',
        args: ['/opt/atlas mcp/index.js'],
        env: { OATLAS_VAULT: '.', OATLAS_REPO_ROOT: './r' },
      },
    },
  });
});

test('the Codex config escapes quotes and backslashes in TOML strings', () => {
  const text = codexConfigForVault({ command: 'C:\\atlas\\node.exe', args: ['say "hi"'] }, '.', '.');
  assert.match(text, /command = "C:\\\\atlas\\\\node\.exe"/);
  assert.match(text, /args = \["say \\"hi\\""\]/);
  assert.match(text, /\[mcp_servers\.ontology-atlas\.env\]\nOATLAS_VAULT = "\."/);
});

test('the global Codex command breaks lines before each --env and before --, and quotes what needs it', () => {
  const command = codexSetupCommand({ target: '/v ault', cwdPath: '/repo', serverCommand });
  assert.equal(
    command,
    "codex mcp add ontology-atlas \\\n" +
      "         --env 'OATLAS_VAULT=/v ault' \\\n" +
      '         --env OATLAS_REPO_ROOT=/repo \\\n' +
      "         -- node '/opt/atlas mcp/index.js'",
  );
});

test('an existing parseable .mcp.json keeps its other servers and gains ours', async () => {
  await withTempDir(async (directory) => {
    writeFileSync(join(directory, '.mcp.json'), JSON.stringify({ mcpServers: { other: { command: 'x' } } }), 'utf-8');
    const binding = { serverCommand, clientBindingIssues: [] };
    await quietly(() => writeMcpJson(binding, directory, '.', '.', 'vault'));
    const written = JSON.parse(readFileSync(join(directory, '.mcp.json'), 'utf-8'));
    assert.deepEqual(Object.keys(written.mcpServers).sort(), ['ontology-atlas', 'other']);
    assert.deepEqual(binding.clientBindingIssues, []);
  });
});

test('a malformed .mcp.json is left untouched, reported, and gets a merge example', async () => {
  await withTempDir(async (directory) => {
    writeFileSync(join(directory, '.mcp.json'), '{ not json', 'utf-8');
    const binding = { serverCommand, clientBindingIssues: [] };
    await quietly(() => writeMcpJson(binding, directory, '.', '.', 'cwd'));
    assert.equal(readFileSync(join(directory, '.mcp.json'), 'utf-8'), '{ not json');
    assert.deepEqual(binding.clientBindingIssues, ['cwd/.mcp.json']);
    assert.match(readFileSync(join(directory, '.mcp.json.example'), 'utf-8'), /ontology-atlas/);
  });
});

test('a missing Codex config is created inside .codex', async () => {
  await withTempDir(async (directory) => {
    const binding = { serverCommand, clientBindingIssues: [] };
    await quietly(() => writeCodexConfig(binding, directory, '.', '.', 'vault'));
    assert.match(readFileSync(join(directory, '.codex', 'config.toml'), 'utf-8'), /\[mcp_servers\.ontology-atlas\]/);
  });
});

test('an ambiguous Codex config is preserved and reported', async () => {
  await withTempDir(async (directory) => {
    mkdirSync(join(directory, '.codex'));
    const original = '[mcp_servers.ontology-atlas]\ncommand = "a"\n[mcp_servers.ontology-atlas]\ncommand = "b"\n';
    writeFileSync(join(directory, '.codex', 'config.toml'), original, 'utf-8');
    const binding = { serverCommand, clientBindingIssues: [] };
    await quietly(() => writeCodexConfig(binding, directory, '.', '.', 'vault'));
    assert.equal(readFileSync(join(directory, '.codex', 'config.toml'), 'utf-8'), original);
    assert.deepEqual(binding.clientBindingIssues, ['vault/.codex/config.toml']);
  });
});
