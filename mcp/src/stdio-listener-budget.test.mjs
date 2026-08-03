import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { once } from 'node:events';
import test from 'node:test';

const SERVER = resolve('mcp/src/index.js');

test('stdio transport tolerates a bounded burst while stdout is backpressured', async () => {
  const vault = mkdtempSync(join(tmpdir(), 'ontology-atlas-stdio-budget-'));
  const child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, OATLAS_VAULT: vault },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  const requests = [
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'stdio-listener-budget-test', version: '1' },
      },
    },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    ...Array.from({ length: 60 }, (_, index) => ({
      jsonrpc: '2.0',
      id: index + 2,
      method: 'tools/list',
    })),
  ];

  child.stdin.end(`${requests.map((request) => JSON.stringify(request)).join('\n')}\n`);
  // Intentionally leave stdout unread so every tools/list response waits on
  // backpressure at once, matching the verifier/CI failure shape.
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 400));
  child.kill('SIGKILL');
  await once(child, 'close');

  try {
    assert.doesNotMatch(stderr, /MaxListenersExceededWarning/);
  } finally {
    rmSync(vault, { recursive: true, force: true });
  }
});
