import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  callMcpTool,
  formatMcpCallTimeoutError,
  formatMcpJsonRpcError,
  formatMcpMissingResponseError,
  formatMcpProcessExitError,
  formatMcpProcessSignalError,
  formatMcpSpawnError,
  formatMcpStdinError,
  mcpCallTimeoutMs,
  mcpKillGraceMs,
  parseMcpToolResponse,
} from './mcp-call.mjs';

const currentDir = dirname(fileURLToPath(import.meta.url));
const mcpCallSourcePath = join(currentDir, 'mcp-call.mjs');

describe('mcp-call response parsing', () => {
  it('spawns the MCP server with the current Node executable', () => {
    const source = readFileSync(mcpCallSourcePath, 'utf-8');

    assert.match(source, /spawn\(process\.execPath, \[entry\]/);
    assert.doesNotMatch(source, /spawn\('node', \[entry\]/);
  });

  it('handles MCP stdin write errors with an explicit stream listener', () => {
    const source = readFileSync(mcpCallSourcePath, 'utf-8');

    assert.match(source, /proc\.stdin\.on\('error'/);
    assert.match(source, /formatMcpStdinError/);
  });

  it('parses MCP responses after stdio streams close', () => {
    const source = readFileSync(mcpCallSourcePath, 'utf-8');

    assert.match(source, /proc\.on\('close'/);
    assert.doesNotMatch(source, /proc\.on\('exit'/);
  });

  it('formats MCP spawn errors with tool, vault, and entry context', () => {
    assert.equal(
      formatMcpSpawnError(new Error('spawn node ENOENT'), {
        entry: '/tmp/mcp/src/index.js',
        toolName: 'query_ontology',
        vaultRoot: '/tmp/vault',
      }).message,
      'failed to spawn MCP server while calling query_ontology (vault /tmp/vault, entry /tmp/mcp/src/index.js): spawn node ENOENT',
    );
  });

  it('formats MCP stdin errors with tool, vault, and entry context', () => {
    assert.equal(
      formatMcpStdinError(new Error('write EPIPE'), {
        entry: '/tmp/mcp/src/index.js',
        toolName: 'query_ontology',
        vaultRoot: '/tmp/vault',
      }).message,
      'failed to write MCP request while calling query_ontology (vault /tmp/vault, entry /tmp/mcp/src/index.js): write EPIPE',
    );
  });

  it('parses MCP call timeout configuration strictly', () => {
    assert.equal(mcpCallTimeoutMs({}), 15_000);
    assert.equal(mcpCallTimeoutMs({ OMOT_CLI_MCP_TIMEOUT_MS: '25' }), 25);
    assert.throws(
      () => mcpCallTimeoutMs({ OMOT_CLI_MCP_TIMEOUT_MS: '1000ms' }),
      /OMOT_CLI_MCP_TIMEOUT_MS must be a positive integer/,
    );
    assert.throws(
      () => mcpCallTimeoutMs({ OMOT_CLI_MCP_TIMEOUT_MS: '0' }),
      /OMOT_CLI_MCP_TIMEOUT_MS must be a positive integer/,
    );
  });

  it('parses MCP kill grace configuration strictly', () => {
    assert.equal(mcpKillGraceMs({}), 1_000);
    assert.equal(mcpKillGraceMs({ OMOT_CLI_MCP_KILL_GRACE_MS: '25' }), 25);
    assert.throws(
      () => mcpKillGraceMs({ OMOT_CLI_MCP_KILL_GRACE_MS: '250ms' }),
      /OMOT_CLI_MCP_KILL_GRACE_MS must be a positive integer/,
    );
    assert.throws(
      () => mcpKillGraceMs({ OMOT_CLI_MCP_KILL_GRACE_MS: '0' }),
      /OMOT_CLI_MCP_KILL_GRACE_MS must be a positive integer/,
    );
  });

  it('formats MCP call timeout errors with retry guidance and stderr context', () => {
    assert.equal(
      formatMcpCallTimeoutError(25, {
        toolName: 'compile_ontology',
        vaultRoot: '/tmp/vault',
        stderr: 'server starting',
      }).message,
      'mcp call timed out after 25ms while calling compile_ontology (vault /tmp/vault). Set OMOT_CLI_MCP_TIMEOUT_MS=N for large or slow vaults. stderr:\nserver starting',
    );
  });

  it('formats MCP process exit errors with actionable retry guidance', () => {
    assert.equal(
      formatMcpProcessExitError(7, {
        toolName: 'query_ontology',
        vaultRoot: '/tmp/vault',
        stderr: 'fake mcp boom',
      }).message,
      'mcp exited code 7 while calling query_ontology (vault /tmp/vault). Check OMOT_MCP_PATH, or set OMOT_CLI_MCP_TIMEOUT_MS=N for large or slow vaults. stderr:\nfake mcp boom',
    );
  });

  it('formats MCP process signal errors with actionable retry guidance', () => {
    assert.equal(
      formatMcpProcessSignalError('SIGTERM', {
        toolName: 'query_ontology',
        vaultRoot: '/tmp/vault',
        stderr: 'fake mcp signal',
      }).message,
      'mcp terminated by SIGTERM while calling query_ontology (vault /tmp/vault). Check OMOT_MCP_PATH, or set OMOT_CLI_MCP_TIMEOUT_MS=N for large or slow vaults. stderr:\nfake mcp signal',
    );
  });

  it('formats missing MCP response errors with stdout and stderr context', () => {
    assert.equal(
      formatMcpMissingResponseError({
        toolName: 'query_ontology',
        vaultRoot: '/tmp/vault',
        stdoutLines: ['{"id":1,"result":{}}'],
        stderr: 'server never answered',
      }).message,
      'mcp response missing tools/call result for query_ontology (vault /tmp/vault). Check OMOT_MCP_PATH, or set OMOT_CLI_MCP_TIMEOUT_MS=N if the server is still starting. stdout lines:\n{"id":1,"result":{}}\nstderr:\nserver never answered',
    );
  });

  it('formats JSON-RPC tool errors with code and data context', () => {
    assert.equal(
      formatMcpJsonRpcError(
        { code: -32602, message: 'Invalid params', data: { field: 'operation', received: 'overveiw' } },
        { toolName: 'query_ontology' },
      ).message,
      'mcp tool error (query_ontology): code=-32602 Invalid params data={"field":"operation","received":"overveiw"}',
    );
  });

  it('times out one-shot MCP calls that never answer', async () => {
    const root = mkdtempSync(join(tmpdir(), 'omot-mcp-call-timeout-'));
    const server = join(root, 'silent-mcp.mjs');
    const previousPath = process.env.OMOT_MCP_PATH;
    const previousTimeout = process.env.OMOT_CLI_MCP_TIMEOUT_MS;
    const previousKillGrace = process.env.OMOT_CLI_MCP_KILL_GRACE_MS;
    writeFileSync(
      server,
      [
        "process.stderr.write('silent server ready\\n');",
        'process.stdin.resume();',
        'setInterval(() => {}, 1000);',
      ].join('\n'),
      'utf-8',
    );
    process.env.OMOT_MCP_PATH = server;
    process.env.OMOT_CLI_MCP_TIMEOUT_MS = '100';
    process.env.OMOT_CLI_MCP_KILL_GRACE_MS = '25';
    try {
      await assert.rejects(
        () => callMcpTool(root, 'list_kinds'),
        /mcp call timed out after 100ms while calling list_kinds .*OMOT_CLI_MCP_TIMEOUT_MS=N[\s\S]*silent server ready/,
      );
    } finally {
      if (previousPath === undefined) delete process.env.OMOT_MCP_PATH;
      else process.env.OMOT_MCP_PATH = previousPath;
      if (previousTimeout === undefined) delete process.env.OMOT_CLI_MCP_TIMEOUT_MS;
      else process.env.OMOT_CLI_MCP_TIMEOUT_MS = previousTimeout;
      if (previousKillGrace === undefined) delete process.env.OMOT_CLI_MCP_KILL_GRACE_MS;
      else process.env.OMOT_CLI_MCP_KILL_GRACE_MS = previousKillGrace;
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('times out even when the MCP process ignores SIGTERM', async () => {
    const root = mkdtempSync(join(tmpdir(), 'omot-mcp-call-ignore-term-'));
    const server = join(root, 'ignore-term-mcp.mjs');
    const previousPath = process.env.OMOT_MCP_PATH;
    const previousTimeout = process.env.OMOT_CLI_MCP_TIMEOUT_MS;
    const previousKillGrace = process.env.OMOT_CLI_MCP_KILL_GRACE_MS;
    writeFileSync(
      server,
      [
        "process.stderr.write('ignore term server ready\\n');",
        "process.on('SIGTERM', () => process.stderr.write('ignored sigterm\\n'));",
        'process.stdin.resume();',
        'setInterval(() => {}, 1000);',
      ].join('\n'),
      'utf-8',
    );
    process.env.OMOT_MCP_PATH = server;
    process.env.OMOT_CLI_MCP_TIMEOUT_MS = '25';
    process.env.OMOT_CLI_MCP_KILL_GRACE_MS = '25';
    try {
      const started = Date.now();
      await assert.rejects(
        () => callMcpTool(root, 'list_kinds'),
        /mcp call timed out after 25ms while calling list_kinds/,
      );
      assert.ok(Date.now() - started < 750, 'timeout rejection should not wait for process exit');
    } finally {
      if (previousPath === undefined) delete process.env.OMOT_MCP_PATH;
      else process.env.OMOT_MCP_PATH = previousPath;
      if (previousTimeout === undefined) delete process.env.OMOT_CLI_MCP_TIMEOUT_MS;
      else process.env.OMOT_CLI_MCP_TIMEOUT_MS = previousTimeout;
      if (previousKillGrace === undefined) delete process.env.OMOT_CLI_MCP_KILL_GRACE_MS;
      else process.env.OMOT_CLI_MCP_KILL_GRACE_MS = previousKillGrace;
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects one-shot JSON-RPC tool errors instead of leaving the call unsettled', async () => {
    const root = mkdtempSync(join(tmpdir(), 'omot-mcp-call-json-rpc-error-'));
    const server = join(root, 'json-rpc-error-mcp.mjs');
    const previousPath = process.env.OMOT_MCP_PATH;
    const previousTimeout = process.env.OMOT_CLI_MCP_TIMEOUT_MS;
    const previousKillGrace = process.env.OMOT_CLI_MCP_KILL_GRACE_MS;
    writeFileSync(
      server,
      [
        "import readline from 'node:readline';",
        "const rl = readline.createInterface({ input: process.stdin });",
        "rl.on('line', (line) => {",
        "  const msg = JSON.parse(line);",
        "  if (msg.id === 1) console.log(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }));",
        "  if (msg.id === 2) {",
        "    console.log(JSON.stringify({ jsonrpc: '2.0', id: 2, error: { code: -32602, message: 'Invalid params', data: { field: 'operation' } } }));",
        "    rl.close();",
        "  }",
        "});",
      ].join('\n'),
      'utf-8',
    );
    process.env.OMOT_MCP_PATH = server;
    process.env.OMOT_CLI_MCP_TIMEOUT_MS = '1000';
    process.env.OMOT_CLI_MCP_KILL_GRACE_MS = '25';
    try {
      await assert.rejects(
        () => callMcpTool(root, 'query_ontology', { operation: 'overveiw' }),
        /mcp tool error \(query_ontology\): code=-32602 Invalid params data=\{"field":"operation"\}/,
      );
    } finally {
      if (previousPath === undefined) delete process.env.OMOT_MCP_PATH;
      else process.env.OMOT_MCP_PATH = previousPath;
      if (previousTimeout === undefined) delete process.env.OMOT_CLI_MCP_TIMEOUT_MS;
      else process.env.OMOT_CLI_MCP_TIMEOUT_MS = previousTimeout;
      if (previousKillGrace === undefined) delete process.env.OMOT_CLI_MCP_KILL_GRACE_MS;
      else process.env.OMOT_CLI_MCP_KILL_GRACE_MS = previousKillGrace;
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects MCP signal exits with signal context instead of missing-response fallback', async () => {
    const root = mkdtempSync(join(tmpdir(), 'omot-mcp-call-signal-'));
    const server = join(root, 'signal-mcp.mjs');
    const previousPath = process.env.OMOT_MCP_PATH;
    const previousTimeout = process.env.OMOT_CLI_MCP_TIMEOUT_MS;
    const previousKillGrace = process.env.OMOT_CLI_MCP_KILL_GRACE_MS;
    writeFileSync(
      server,
      [
        "process.stderr.write('signal server exiting\\n');",
        "process.kill(process.pid, 'SIGTERM');",
      ].join('\n'),
      'utf-8',
    );
    process.env.OMOT_MCP_PATH = server;
    process.env.OMOT_CLI_MCP_TIMEOUT_MS = '1000';
    process.env.OMOT_CLI_MCP_KILL_GRACE_MS = '25';
    try {
      await assert.rejects(
        () => callMcpTool(root, 'list_kinds'),
        /mcp terminated by SIGTERM while calling list_kinds[\s\S]*signal server exiting/,
      );
    } finally {
      if (previousPath === undefined) delete process.env.OMOT_MCP_PATH;
      else process.env.OMOT_MCP_PATH = previousPath;
      if (previousTimeout === undefined) delete process.env.OMOT_CLI_MCP_TIMEOUT_MS;
      else process.env.OMOT_CLI_MCP_TIMEOUT_MS = previousTimeout;
      if (previousKillGrace === undefined) delete process.env.OMOT_CLI_MCP_KILL_GRACE_MS;
      else process.env.OMOT_CLI_MCP_KILL_GRACE_MS = previousKillGrace;
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('returns structuredContent when text JSON matches with different key order', () => {
    assert.deepEqual(
      parseMcpToolResponse({
        result: {
          content: [{ text: JSON.stringify({ source: 'structured', ok: true }) }],
          structuredContent: { ok: true, source: 'structured' },
        },
      }),
      { ok: true, source: 'structured' },
    );
  });

  it('rejects successful responses when structuredContent drifts from text JSON', () => {
    assert.throws(
      () =>
        parseMcpToolResponse({
          result: {
            content: [{ text: JSON.stringify({ ok: true, source: 'text' }) }],
            structuredContent: { ok: true, source: 'structured' },
          },
        }),
      /mcp tool structuredContent mismatch — \$\.source: parsed "text", structuredContent "structured"/,
    );
  });

  it('reports nested structuredContent mismatch paths and previews missing values', () => {
    assert.throws(
      () =>
        parseMcpToolResponse({
          result: {
            content: [{ text: JSON.stringify({ rows: [{ slug: 'a', count: 1 }] }) }],
            structuredContent: { rows: [{ slug: 'a', count: 2 }] },
          },
        }),
      /mcp tool structuredContent mismatch — \$\.rows\[0\]\.count: parsed 1, structuredContent 2/,
    );

    assert.throws(
      () =>
        parseMcpToolResponse({
          result: {
            content: [{ text: JSON.stringify({ total: 1 }) }],
            structuredContent: { total: 1, extra: true },
          },
        }),
      /mcp tool structuredContent mismatch — \$\.extra: parsed undefined, structuredContent true/,
    );
  });

  it('includes the MCP tool name in wrapper-level parse failures', () => {
    assert.throws(
      () =>
        parseMcpToolResponse(
          {
            result: {
              content: [{ text: JSON.stringify({ ok: true }) }],
              structuredContent: { ok: false },
            },
          },
          { toolName: 'query_ontology' },
        ),
      /mcp tool structuredContent mismatch \(query_ontology\) — \$\.ok: parsed true, structuredContent false/,
    );

    assert.throws(
      () =>
        parseMcpToolResponse(
          {
            result: {
              content: [{ text: 'plain response' }],
              structuredContent: { ok: true },
            },
          },
          { toolName: 'query_ontology' },
        ),
      /mcp tool structuredContent text is not JSON \(query_ontology\): "plain response"/,
    );

    assert.throws(
      () => parseMcpToolResponse({ error: { code: -32603, message: 'tool exploded' } }, { toolName: 'query_ontology' }),
      /mcp tool error \(query_ontology\): code=-32603 tool exploded/,
    );
  });

  it('rejects successful structuredContent responses with non-JSON text content', () => {
    assert.throws(
      () =>
        parseMcpToolResponse({
          result: {
            content: [{ text: 'plain response' }],
            structuredContent: { ok: true, source: 'structured' },
          },
        }),
      /mcp tool structuredContent text is not JSON/,
    );
  });

  it('accepts successful structuredContent responses without text content', () => {
    assert.deepEqual(
      parseMcpToolResponse({
        result: {
          structuredContent: { ok: true, source: 'structured-only' },
        },
      }),
      { ok: true, source: 'structured-only' },
    );
  });

  it('falls back to text JSON when structuredContent is absent', () => {
    assert.deepEqual(
      parseMcpToolResponse({
        result: {
          content: [{ text: JSON.stringify({ ok: true, source: 'text' }) }],
        },
      }),
      { ok: true, source: 'text' },
    );
  });

  it('falls back to text JSON when structuredContent is null', () => {
    assert.deepEqual(
      parseMcpToolResponse({
        result: {
          content: [{ text: JSON.stringify({ ok: true, source: 'text' }) }],
          structuredContent: null,
        },
      }),
      { ok: true, source: 'text' },
    );
  });

  it('keeps plain text fallback and error handling stable', () => {
    assert.deepEqual(
      parseMcpToolResponse({ result: { content: [{ text: 'plain response' }] } }),
      { text: 'plain response' },
    );

    assert.throws(
      () => parseMcpToolResponse({ result: { isError: true, content: [{ text: 'bad input' }] } }),
      /bad input/,
    );
    assert.throws(
      () => parseMcpToolResponse({ error: { message: 'tool exploded' } }),
      /mcp tool error: tool exploded/,
    );
  });
});
