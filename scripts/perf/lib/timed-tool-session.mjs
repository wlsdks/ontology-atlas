/**
 * One MCP server process kept open over stdio, so a script can time each `tools/call` as an agent
 * sees it (request written, answer line read) without counting the process start.
 */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { performance } from 'node:perf_hooks';

const ANSWER_TIMEOUT_MS = 60_000;

function toolValue(result) {
  if (result.structuredContent) return result.structuredContent;
  const text = result.content?.find((row) => row.type === 'text')?.text;
  return text ? JSON.parse(text) : result;
}

/** @returns {Promise<{ call: (name: string, args?: object) => Promise<{ ms: number, value: any }>, close: () => void }>} */
export async function openTimedToolSession({ command, args = [], vaultRoot }) {
  const child = spawn(command, args, {
    env: { ...process.env, OATLAS_VAULT: vaultRoot },
    cwd: vaultRoot,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const waiting = new Map();
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  let failure = null;
  child.on('error', (error) => { failure = error; for (const { reject } of waiting.values()) reject(error); });
  child.on('exit', (code) => {
    failure ??= new Error(`the server exited with code ${code}: ${stderr.trim().slice(-500)}`);
    for (const { reject } of waiting.values()) reject(failure);
  });
  createInterface({ input: child.stdout }).on('line', (line) => {
    let message;
    try { message = JSON.parse(line); } catch { return; }
    const entry = waiting.get(message.id);
    if (!entry) return;
    waiting.delete(message.id);
    if (message.error) entry.reject(new Error(`${message.error.code}: ${message.error.message}`));
    else entry.resolve(message.result);
  });

  let nextId = 1;
  function request(method, params) {
    if (failure) return Promise.reject(failure);
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${method} was not answered in ${ANSWER_TIMEOUT_MS} ms`)), ANSWER_TIMEOUT_MS);
      waiting.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      });
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  }

  await request('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'ontology-atlas-perf', version: '0' },
  });
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);

  return {
    async call(name, toolArguments = {}) {
      const start = performance.now();
      const result = await request('tools/call', { name, arguments: toolArguments });
      const ms = performance.now() - start;
      if (result.isError) throw new Error(`${name} failed: ${JSON.stringify(result.content)}`);
      return { ms, value: toolValue(result) };
    },
    close() {
      child.stdin.end();
      child.kill();
    },
  };
}
