import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SERVER = join(REPO_ROOT, 'mcp', 'src', 'javascript-server.mjs');
// Bun and Node list one directory in different orders; reversing every listing
// stands in for the other runtime.
const REVERSED_DIRECTORY_LISTINGS = `data:text/javascript,${encodeURIComponent(`
  import fs from 'node:fs';
  import { syncBuiltinESMExports } from 'node:module';
  const readdirSync = fs.readdirSync;
  fs.readdirSync = function (...args) {
    const entries = readdirSync.apply(this, args);
    return Array.isArray(entries) ? [...entries].reverse() : entries;
  };
  syncBuiltinESMExports();
`)}`;
const CALLS = [
  ['validate_vault', {}],
  ['list_kinds', {}],
  ['find_backlinks', { slug: 'capabilities/vault-graph-query' }],
  ['query_ontology', { operation: 'agent_brief' }],
  ['index_project', {}],
];

function callTools(nodeArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [...nodeArgs, SERVER], {
      cwd: REPO_ROOT,
      env: { ...process.env, OATLAS_VAULT: join(REPO_ROOT, 'docs', 'ontology'), OATLAS_REPO_ROOT: REPO_ROOT },
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const responses = new Map();
    let pending = '';
    child.on('error', reject);
    child.stdout.on('data', (chunk) => {
      const lines = (pending + chunk).split('\n');
      pending = lines.pop();
      for (const line of lines) {
        const message = JSON.parse(line);
        if (message.id > 0) responses.set(message.id, JSON.stringify(message.result ?? message.error));
      }
      if (responses.size === CALLS.length) {
        child.kill();
        resolve(CALLS.map((_, index) => responses.get(index + 1)));
      }
    });
    const send = (id, method, params) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    send(0, 'initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'directory-order', version: '1' } });
    CALLS.forEach(([name, args], index) => send(index + 1, 'tools/call', { name, arguments: args }));
  });
}

test('tool responses do not depend on the order the runtime lists directories', async () => {
  const [listed, reversed] = await Promise.all([callTools([]), callTools(['--import', REVERSED_DIRECTORY_LISTINGS])]);
  CALLS.forEach(([name, args], index) => {
    assert.equal(reversed[index], listed[index], `${name} ${JSON.stringify(args)} changed with the directory order`);
  });
});
