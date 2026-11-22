#!/usr/bin/env node
/**
 * Prints what `tools/list` costs every connected agent, per tool and in total,
 * for the full and the construction profile. Each profile boots the stdio
 * server and reads its real `tools/list` response.
 *
 * Model-read bytes are a tool's name, description and input schema as one JSON
 * object; wire bytes are the whole tool entry, output schema and annotations
 * included.
 *
 * Usage: pnpm mcp:tools-list-bytes [-- --json]
 */

import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJsonRpcResponses } from '../../mcp/scripts/json-rpc-lines.mjs';

const SERVER = resolve(dirname(fileURLToPath(import.meta.url)), '../../mcp/src/index.js');
const PROFILES = ['full', 'construction'];

const bytes = (value) => Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value), 'utf8');

function listTools(profile) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [SERVER], {
      env: { ...process.env, OATLAS_TOOL_PROFILE: profile, OATLAS_READ_ONLY: '' },
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    let stdout = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`tools/list for the ${profile} profile did not answer within 30 s`));
    }, 30_000);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      const line = stdout.split('\n').find((text) => text.includes('"id":2'));
      if (!line) return;
      const response = parseJsonRpcResponses(line)[0];
      if (!response) return;
      clearTimeout(timer);
      child.kill();
      if (response.error) reject(new Error(response.error.message));
      else resolvePromise({ tools: response.result.tools, wire: bytes(line) });
    });
    child.on('error', reject);
    const send = (message) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
    send({ id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'tools-list-bytes', version: '1' } } });
    send({ method: 'notifications/initialized' });
    send({ id: 2, method: 'tools/list', params: {} });
  });
}

function measure(tools) {
  return tools.map((tool) => ({
    name: tool.name,
    description: bytes(tool.description ?? ''),
    input: bytes(tool.inputSchema ?? {}),
    output: tool.outputSchema ? bytes(tool.outputSchema) : 0,
    modelRead: bytes({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema }),
    wire: bytes(tool),
  }));
}

function total(rows, key) {
  return rows.reduce((sum, row) => sum + row[key], 0);
}

const report = {};
for (const profile of PROFILES) {
  const { tools, wire } = await listTools(profile);
  const rows = measure(tools);
  report[profile] = {
    tools: rows,
    totals: {
      count: rows.length,
      description: total(rows, 'description'),
      input: total(rows, 'input'),
      output: total(rows, 'output'),
      modelRead: total(rows, 'modelRead'),
      wire: total(rows, 'wire'),
      response: wire,
    },
  };
}

if (process.argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  for (const profile of PROFILES) {
    const { tools, totals } = report[profile];
    process.stdout.write(`\n${profile} profile: ${totals.count} tools\n`);
    process.stdout.write(`${'tool'.padEnd(28)}${'model-read'.padStart(12)}${'output'.padStart(10)}${'wire'.padStart(10)}\n`);
    for (const row of tools) {
      process.stdout.write(`${row.name.padEnd(28)}${String(row.modelRead).padStart(12)}${String(row.output).padStart(10)}${String(row.wire).padStart(10)}\n`);
    }
    process.stdout.write(`${'total'.padEnd(28)}${String(totals.modelRead).padStart(12)}${String(totals.output).padStart(10)}${String(totals.wire).padStart(10)}\n`);
    process.stdout.write(`description ${totals.description} B, input schemas ${totals.input} B, tools/list response ${totals.response} B\n`);
  }
}
