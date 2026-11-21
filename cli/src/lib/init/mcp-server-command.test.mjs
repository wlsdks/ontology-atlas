import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { resolveMcpServerCommand } from './mcp-server-command.mjs';

function withEnvPath(value, run) {
  const before = process.env.OATLAS_MCP_PATH;
  process.env.OATLAS_MCP_PATH = value;
  try {
    return run();
  } finally {
    if (before === undefined) delete process.env.OATLAS_MCP_PATH;
    else process.env.OATLAS_MCP_PATH = before;
  }
}

test('OATLAS_MCP_PATH names the server file and wins over every other location', () => {
  const dir = mkdtempSync(join(tmpdir(), 'oatlas-init-mcp-'));
  try {
    const file = join(dir, 'index.js');
    writeFileSync(file, '', 'utf-8');
    assert.deepEqual(withEnvPath(file, resolveMcpServerCommand), { command: 'node', args: [file] });
    assert.throws(() => withEnvPath(dir, resolveMcpServerCommand), /OATLAS_MCP_PATH is not a file/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('OATLAS_MCP_PATH pointing nowhere is an error, not a silent fallback', () => {
  assert.throws(() => withEnvPath('/nonexistent/atlas-mcp.js', resolveMcpServerCommand), /OATLAS_MCP_PATH does not exist/);
});

test('from a source checkout the server is found beside the CLI', () => {
  const before = process.env.OATLAS_MCP_PATH;
  delete process.env.OATLAS_MCP_PATH;
  try {
    const { command, args } = resolveMcpServerCommand();
    assert.equal(command, 'node');
    assert.match(args[0], /mcp[\\/]src[\\/]index\.js$/);
  } finally {
    if (before !== undefined) process.env.OATLAS_MCP_PATH = before;
  }
});
