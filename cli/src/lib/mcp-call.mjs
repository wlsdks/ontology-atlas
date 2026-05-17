// R15 follow-up — graph-level write commands (backlinks / rename / merge /
// delete / query) thin-wrap MCP server. mcp/src/index.js 의 logic 이 single
// source of truth — cli 는 child_process spawn + JSON-RPC 로 호출.
//
// Why spawn vs duplicate logic:
//   - rename_concept / merge_concepts 의 atomic backlink redirect 는 100+ LOC.
//     중복하면 5-way drift surface (이미 4-way schema/parser/validator).
//   - spawn overhead ~50-100ms — 사용자 한 번씩 호출이라 acceptable.
//   - mcp 가 published 되면 npm install 로 같이 install (cli/package.json
//     dependencies). dev 에선 monorepo relative path fallback.
//
// Resolution order for the mcp entry:
//   1. OMOT_MCP_PATH env (explicit override)
//   2. relative ../../../mcp/src/index.js (monorepo dev)
//   3. node:require.resolve('oh-my-ontology-mcp/src/index.js')

import { spawn } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require_ = createRequire(import.meta.url);
const CLI_PKG = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf-8'));

export const CLI_CLIENT_INFO = Object.freeze({
  name: 'oh-my-ontology-cli',
  version: CLI_PKG.version,
});

function resolveMcpEntry() {
  if (process.env.OMOT_MCP_PATH) {
    const envPath = process.env.OMOT_MCP_PATH;
    if (isFile(envPath)) return envPath;
    if (existsSync(envPath)) throw new Error(`OMOT_MCP_PATH is not a file: ${envPath}`);
    throw new Error(`OMOT_MCP_PATH does not exist: ${envPath}`);
  }
  const monoDev = resolve(__dirname, '../../../mcp/src/index.js');
  if (existsSync(monoDev)) return monoDev;
  try {
    return require_.resolve('oh-my-ontology-mcp/src/index.js');
  } catch {
    throw new Error(
      'oh-my-ontology-mcp not found. Install it (`npm install oh-my-ontology-mcp`) ' +
        'or set OMOT_MCP_PATH to mcp/src/index.js.',
    );
  }
}

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * One-shot MCP tool call. Spawns the server, sends initialize +
 * notifications/initialized + tools/call, parses the JSON-RPC response,
 * resolves with `structuredContent` first, then the JSON in `content[0].text`.
 *
 * @param {string} vaultRoot — passed as OMOT_VAULT env
 * @param {string} toolName — e.g. 'find_backlinks'
 * @param {Record<string, unknown>} args — tool arguments
 * @returns {Promise<unknown>}
 */
export function callMcpTool(vaultRoot, toolName, args = {}) {
  return new Promise((resolveP, rejectP) => {
    const entry = resolveMcpEntry();
    const proc = spawn('node', [entry], {
      env: { ...process.env, OMOT_VAULT: vaultRoot },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdoutBuf = '';
    let stderrBuf = '';
    proc.stdout.on('data', (chunk) => {
      stdoutBuf += chunk.toString();
    });
    proc.stderr.on('data', (chunk) => {
      stderrBuf += chunk.toString();
    });

    proc.on('error', (err) => rejectP(err));
    proc.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        rejectP(
          new Error(
            `mcp exited code ${code}. stderr:\n${stderrBuf.trim() || '(empty)'}`,
          ),
        );
        return;
      }
      try {
        const lines = stdoutBuf.split('\n').filter(Boolean);
        // tools/call response has id=2 in our request sequence.
        let toolResp = null;
        for (const line of lines) {
          try {
            const msg = JSON.parse(line);
            if (msg.id === 2) {
              toolResp = msg;
              break;
            }
          } catch {
            // skip non-JSON lines (debug logs from mcp would go to stderr,
            // but be defensive).
          }
        }
        if (!toolResp) {
          rejectP(
            new Error(
              `mcp response missing tools/call result. stdout lines:\n${lines.slice(0, 5).join('\n')}`,
            ),
          );
          return;
        }
        resolveP(parseMcpToolResponse(toolResp));
      } catch (err) {
        rejectP(err);
      }
    });

    const requests = [
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: CLI_CLIENT_INFO,
        },
      },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: toolName, arguments: args },
      },
    ];
    for (const req of requests) {
      proc.stdin.write(JSON.stringify(req) + '\n');
    }
    proc.stdin.end();
  });
}

export function parseMcpToolResponse(toolResp) {
  if (toolResp?.error) {
    throw new Error(`mcp tool error: ${toolResp.error.message}`);
  }
  const text = toolResp?.result?.content?.[0]?.text;
  if (typeof text !== 'string') {
    throw new Error('mcp tool response has no text content');
  }
  if (toolResp.result?.isError) {
    throw new Error(text);
  }
  if (toolResp.result && Object.prototype.hasOwnProperty.call(toolResp.result, 'structuredContent')) {
    return toolResp.result.structuredContent;
  }
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}
