import assert from 'node:assert/strict';
import test from 'node:test';

import { runJsonRpcProcess } from './mcp-test-rpc.mjs';

const NODE = process.execPath;
const request = (id) => ({ jsonrpc: '2.0', id, method: 'probe' });

function fixture(source, requests, options = {}) {
  return runJsonRpcProcess({
    command: NODE,
    args: ['--input-type=module', '--eval', source],
    env: process.env,
    requests,
    timeoutMs: 1000,
    ...options,
  });
}

test('collects complete UTF-8 JSON-RPC responses and exits through stdin EOF', async () => {
  const source = `
    import { stdin, stdout } from 'node:process';
    let input = '';
    stdin.setEncoding('utf8');
    stdin.on('data', chunk => {
      input += chunk;
      const rows = input.split('\\n');
      input = rows.pop();
      for (const line of rows) {
        const row = JSON.parse(line);
        if ('id' in row) stdout.write(JSON.stringify({ jsonrpc: '2.0', id: row.id, result: { label: '한글' } }) + '\\n');
      }
    });
  `;
  const result = await fixture(source, [request(1), { jsonrpc: '2.0', method: 'notice' }, request('two')]);
  assert.deepEqual(result.responses.map((response) => response.id), [1, 'two']);
  assert.equal(result.responses[0].result.label, '한글');
});

test('counts duplicate request IDs conservatively', async () => {
  const source = `
    import { stdin, stdout } from 'node:process';
    let input = '';
    stdin.setEncoding('utf8');
    stdin.on('data', chunk => {
      input += chunk;
      const rows = input.split('\\n');
      input = rows.pop();
      for (const line of rows) {
        const row = JSON.parse(line);
        stdout.write(JSON.stringify({ jsonrpc: '2.0', id: row.id, result: true }) + '\\n');
      }
    });
  `;
  const result = await fixture(source, [request(1), request(1)]);
  assert.equal(result.responses.length, 2);
});

test('rejects a clean early exit that omitted a response', async () => {
  await assert.rejects(
    fixture('', [request(1)]),
    /exited before responses: number:1/,
  );
});

test('rejects a partial response set instead of treating cleanup as success', async () => {
  const source = `process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 1, result: true }) + '\\n');`;
  await assert.rejects(
    fixture(source, [request(1), request(2)]),
    /exited before responses: number:2/,
  );
});

test('terminates, reaps, and reports a nonresponsive child', async () => {
  const source = `process.stdin.resume(); setInterval(() => {}, 1000);`;
  await assert.rejects(
    fixture(source, [request(1)], { timeoutMs: 50, killGraceMs: 50 }),
    /timed out; missing responses: number:1/,
  );
});

test('does not mask a nonzero exit after a complete response', async () => {
  const source = `process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 1, result: true }) + '\\n', () => process.exit(7));`;
  await assert.rejects(
    fixture(source, [request(1)]),
    /exited code=7 signal=null/,
  );
});
